import { NextRequest, NextResponse } from 'next/server'
import { getPanelActor } from '@/lib/api-auth'
import { and, desc, eq } from 'drizzle-orm'
import { db, ensurePanelSchema } from '@/lib/db'
import { agentCommands, backups, operationLogs, serverPermissions, servers, worlds } from '@/lib/db/schema'
import { nodeFetch } from '@/lib/node-bridge'
import { nodeDiagnosticMessage } from '@/lib/node-bridge'

async function diskBackups(serverId:string,nodeId:string):Promise<{backups:Array<Record<string,unknown>>;error?:string}>{try{const response=await nodeFetch(nodeId,`/internal/backups/list?serverId=${encodeURIComponent(serverId)}`);if(!response.ok)return {backups:[],error:`Node HTTP ${response.status}`};const data=await response.json() as {backups?:Array<Record<string,unknown>>};return {backups:data.backups??[]}}catch(error){return {backups:[],error:nodeDiagnosticMessage(error)}}}



async function actor(){return getPanelActor()}
async function access(serverId:string,a:NonNullable<Awaited<ReturnType<typeof actor>>>){const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0];if(!server)return null;if(a.role==='manager'||server.userId===a.id)return {server,permission:null,manager:true};const permission=(await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId,serverId),eq(serverPermissions.userId,a.id))).limit(1))[0];return permission?{server,permission,manager:false}:null}
function canViewBackups(result:NonNullable<Awaited<ReturnType<typeof access>>>){if(result.manager)return true;const sections=Array.isArray(result.permission?.sections)?result.permission.sections:[];return !!result.permission?.canBackup||sections.includes('backups')}


export async function GET(request:NextRequest){await ensurePanelSchema();const a=await actor();if(!a)return NextResponse.json({error:'Unauthorized'},{status:401});if(!a.approved)return NextResponse.json({error:'Approval required'},{status:403});const serverId=request.nextUrl.searchParams.get('serverId');if(!serverId)return NextResponse.json({error:'serverId gerekli'},{status:400});const result=await access(serverId,a);if(!result||!canViewBackups(result))return NextResponse.json({error:'Forbidden'},{status:403});const [rows,disk]=await Promise.all([db.select({id:backups.id,worldId:backups.worldId,blobPathname:backups.blobPathname,sizeMb:backups.sizeMb,sizeBytes:backups.sizeBytes,createdAt:backups.createdAt,worldName:worlds.name,source:backups.createdBy}).from(backups).innerJoin(worlds,eq(backups.worldId,worlds.id)).where(and(eq(worlds.serverId,serverId),eq(backups.userId,result.server.userId))).orderBy(desc(backups.createdAt)).limit(100),diskBackups(serverId,result.server.nodeId)]);const dbRows=rows.map(row=>({...row,source:row.source?'panel':'panel',status:'completed',type:'panel'}));const diskRows=(disk.backups??[]).map((row,index)=>({...row,id:`disk-${index}-${String(row.name??'')}`,worldId:null,worldName:null,sizeMb:Number(row.sizeBytes??0)/1048576,blobPathname:String(row.path??row.name??''),createdAt:row.createdAt??row.modifiedAt,source:String(row.source??'disk'),type:String(row.type??'disk'),restorable:row.restorable!==false,status:row.status??'completed'}));const seen=new Set(dbRows.map(row=>row.blobPathname));const merged=[...dbRows,...diskRows.filter(row=>!seen.has(row.blobPathname))].sort((x,y)=>Date.parse(String(y.createdAt??''))-Date.parse(String(x.createdAt??''))).slice(0,200);return NextResponse.json({backups:merged,source:{database:true,disk:true,diskError:disk.error??null}},{headers:{'Cache-Control':'private, no-store'}})}


export async function POST(request:NextRequest){await ensurePanelSchema();const a=await actor();if(!a)return NextResponse.json({error:'Unauthorized'},{status:401});if(!a.approved)return NextResponse.json({error:'Approval required'},{status:403});const body=await request.json();const serverId=String(body.serverId||'');const result=await access(serverId,a);if(!result||( !result.manager&&!result.permission?.canBackup))return NextResponse.json({error:'Yedek işlemi için yetkiniz yok'},{status:403});const type=String(body.type||'backup');const allowed=['backup','backup-verify','backup-copy','restore-backup','delete-backup'];if(!allowed.includes(type))return NextResponse.json({error:'Geçersiz backup işlemi'},{status:400});if(type==='backup'){
  const label=String(body.label||'manual').slice(0,40)
  const kind=String(body.kind||'full').slice(0,40)
  if(result.server.status==='running'){
    const base=Date.now()
    const payload={label,kind,requestedBy:a.id,autoRestart:true}
    const [stop]=await db.insert(agentCommands).values({userId:result.server.userId,nodeId:result.server.nodeId,serverId,type:'stop',payload:{reason:'backup-auto-stop',requestedBy:a.id},createdAt:new Date(base)}).returning()
    const [backup]=await db.insert(agentCommands).values({userId:result.server.userId,nodeId:result.server.nodeId,serverId,type:'backup',payload,createdAt:new Date(base+50)}).returning()
    const [start]=await db.insert(agentCommands).values({userId:result.server.userId,nodeId:result.server.nodeId,serverId,type:'start',payload:{memoryMb:result.server.memoryMb,loader:result.server.loader,mcVersion:result.server.mcVersion,loaderVersion:result.server.loaderVersion,port:result.server.port,worldName:result.server.worldName,reason:'backup-auto-restart',requestedBy:a.id},createdAt:new Date(base+100)}).returning()
    await db.insert(operationLogs).values({userId:result.server.userId,serverId,operation:'manual-backup-auto-restart',status:'queued',message:'Sunucu güvenli biçimde durdurulacak, yedek alınacak ve yeniden başlatılacak.'})
    return NextResponse.json({ok:true,queuedSequence:true,message:'Sunucu durdurulup yedek alındıktan sonra otomatik olarak yeniden başlatılacak.',commands:[stop,backup,start]},{status:202,headers:{'Cache-Control':'private, no-store'}})
  }
  try{
    const response=await nodeFetch(result.server.nodeId,'/internal/backups/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,label,kind})})
    const data=await response.json().catch(()=>({}))
    return NextResponse.json(data,{status:response.status,headers:{'Cache-Control':'private, no-store'}})
  }catch(error){return NextResponse.json({error:nodeDiagnosticMessage(error)},{status:502})}
}if((type==='restore-backup'||type==='delete-backup')&&body.confirm!==true)return NextResponse.json({error:'Onay gerekli'},{status:400});const [command]=await db.insert(agentCommands).values({userId:result.server.userId,nodeId:result.server.nodeId,serverId,type,payload:{path:body.path,label:body.label||'manual',kind:body.kind||'full',confirm:body.confirm===true},status:'queued'}).returning();return NextResponse.json({ok:true,command},{status:202})}
