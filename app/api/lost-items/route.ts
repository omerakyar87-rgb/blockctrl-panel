import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { getPanelActor } from '@/lib/api-auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { agentCommands, lostItems, operationLogs, serverPermissions, servers } from '@/lib/db/schema'
import { nodeFetch } from '@/lib/node-bridge'

async function access(serverId:string, userId:string, role:string){const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0];if(!server)return null;if(['founder','manager'].includes(String(role).toLowerCase())||server.userId===userId)return {server,manage:true};const permission=(await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId,serverId),eq(serverPermissions.userId,userId))).limit(1))[0];return permission?{server,manage:Boolean(permission.canManageLostItems)}:null}

export async function GET(request:NextRequest){
  try{
    await ensurePanelSchema()
    const actor=await getPanelActor()
    if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401})
    if(!actor.approved)return NextResponse.json({error:'Approval required'},{status:403})
    const serverId=request.nextUrl.searchParams.get('serverId')??''
    const result=await access(serverId,actor.id,actor.role)
    if(!result)return NextResponse.json({error:'Forbidden'},{status:403})
    const items=await db.select().from(lostItems).where(eq(lostItems.serverId,serverId)).orderBy(desc(lostItems.occurredAt)).limit(500)
    let runtime:Record<string,unknown>|null=null
    let runtimeError:string|null=null
    try{
      const response=await nodeFetch(result.server.nodeId,`/internal/settings/status?serverId=${encodeURIComponent(serverId)}`)
      const text=await response.text();const data=text?JSON.parse(text) as Record<string,unknown>:{}
      runtime=data.runtime&&typeof data.runtime==='object'?data.runtime as Record<string,unknown>:null
      if(!response.ok)runtimeError=String(data.error??`HTTP ${response.status}`)
    }catch(error){runtimeError=error instanceof Error?error.message:'Tracker durumu okunamadı'}
    const runtimeEnabled=runtime?.itemTrackingEnabled===true
    const mode=String(runtime?.itemTrackingMode??'')
    const dbEnabled=Boolean(result.server.itemTrackingEnabled)
    const diagnosticState=!dbEnabled?'disabled':runtimeError?'unverified':runtimeEnabled&&mode&&mode!=='disabled'?'ready':'restart-required'
    const diagnosticMessage=diagnosticState==='disabled'
      ?'Kayıp eşya takibi bu sunucu için kapalı. Takibi açtıktan sonra gerçekleşen kayıplar kaydedilebilir; geçmişte izlenmemiş kayıplar geriye dönük oluşturulamaz.'
      :diagnosticState==='ready'
        ?`Tracker etkin · ${mode}`
        :diagnosticState==='restart-required'
          ?'Takip ayarı açık ancak çalışan agent/Minecraft sürecinde tracker etkin görünmüyor. Onarım ve yeniden başlatma gerekli.'
          :`Tracker canlı durumu doğrulanamadı: ${runtimeError}`
    return NextResponse.json({
      items,
      source:'tracker-agent',
      trackingEnabled:dbEnabled,
      diagnostics:{state:diagnosticState,message:diagnosticMessage,runtimeEnabled,mode:mode||null,adapter:runtime?.trackerAdapter??null,runtimeError},
    },{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Kayıp eşyalar okunamadı'},{status:500})
  }
}

export async function POST(request:NextRequest){try{await ensurePanelSchema();const actor=await getPanelActor();if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401});const body=await request.json();const itemId=String(body.itemId??'');const serverId=String(body.serverId??'');const result=await access(serverId,actor.id,actor.role);if(!result||!result.manage)return NextResponse.json({error:'Kayıp eşya yönetimi için yetkiniz yok'},{status:403});
  if(String(body.action??'')==='repair-tracker'){
    let meta:Record<string,unknown>={}
    try{
      const response=await nodeFetch(result.server.nodeId,`/internal/settings/status?serverId=${encodeURIComponent(serverId)}`)
      const text=await response.text();const data=text?JSON.parse(text) as Record<string,unknown>:{}
      if(data.meta&&typeof data.meta==='object')meta=data.meta as Record<string,unknown>
    }catch{}
    const nextMeta={...meta,itemTrackingEnabled:true,itemTrackingMode:String(meta.itemTrackingMode??'death-snapshot')==='disabled'?'death-snapshot':String(meta.itemTrackingMode??'death-snapshot'),trackerAdapter:meta.trackerAdapter??'agent-fallback'}
    const baseCreatedAt=Date.now()
    const [write]=await db.insert(agentCommands).values({userId:result.server.userId,nodeId:result.server.nodeId,serverId,type:'write-file',payload:{path:'blockctrl.json',content:JSON.stringify(nextMeta,null,2),requestedBy:actor.id},status:'queued',createdAt:new Date(baseCreatedAt)}).returning({id:agentCommands.id})
    await db.update(servers).set({itemTrackingEnabled:true,updatedAt:new Date()}).where(eq(servers.id,serverId))
    let restartId:string|null=null
    if(result.server.status==='running'){
      const [restart]=await db.insert(agentCommands).values({userId:result.server.userId,nodeId:result.server.nodeId,serverId,type:'restart',payload:{memoryMb:result.server.memoryMb,loader:result.server.loader,mcVersion:result.server.mcVersion,loaderVersion:result.server.loaderVersion,port:result.server.port,worldName:result.server.worldName,itemTrackingEnabled:true,reason:'repair-item-tracker',requestedBy:actor.id},status:'queued',createdAt:new Date(baseCreatedAt+100)}).returning({id:agentCommands.id})
      restartId=restart.id
    }
    await db.insert(operationLogs).values({userId:result.server.userId,serverId,operation:'repair-item-tracker',status:'queued',message:restartId?'Tracker ayarı yazılıyor ve sunucu yeniden başlatılacak':'Tracker ayarı yazılıyor'})
    return NextResponse.json({ok:true,writeCommandId:write.id,restartCommandId:restartId},{status:202})
  }const item=(await db.select().from(lostItems).where(and(eq(lostItems.id,itemId),eq(lostItems.serverId,serverId))).limit(1))[0];if(!item)return NextResponse.json({error:'Kayıt bulunamadı'},{status:404});if(item.status==='restored')return NextResponse.json({error:'Bu kayıt zaten geri yüklendi'},{status:409});const [command]=await db.insert(agentCommands).values({userId:result.server.userId,nodeId:result.server.nodeId,serverId,type:'restore-lost-item',payload:{lostItemId:item.id,playerUuid:item.playerUuid,playerName:item.playerName,itemId:item.itemId,itemName:item.itemName,amount:item.amount,world:item.world,x:item.x,y:item.y,z:item.z},status:'queued'}).returning({id:agentCommands.id});await db.update(lostItems).set({status:'restore-requested',restoreCommandId:command.id,restoreRequestedAt:new Date(),restoredByUserId:actor.id}).where(eq(lostItems.id,item.id));return NextResponse.json({ok:true,commandId:command.id},{status:202})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Geri yükleme başlatılamadı'},{status:500})}}
