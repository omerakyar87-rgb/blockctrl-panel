import { createHash, randomUUID } from 'node:crypto'
import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getPanelActor } from '@/lib/api-auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { agentCommands, auditLog, serverPermissions, servers } from '@/lib/db/schema'

export const runtime='nodejs'
export const maxDuration=60

type InstallFile={fileName:string;url:string;kind:'mods'|'plugins';size?:number;sha1?:string|null;source?:string;projectId?:string;versionId?:string}

async function access(serverId:string,actor:NonNullable<Awaited<ReturnType<typeof getPanelActor>>>){
  const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0]
  if(!server||server.status==='deleted')return null
  const role=String(actor.role??'member').toLowerCase()
  if(['founder','manager','admin'].includes(role)||server.userId===actor.id)return{server,canInstall:true}
  const permission=(await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId,serverId),eq(serverPermissions.userId,actor.id))).limit(1))[0]
  return permission?{server,canInstall:!!permission.canFiles&&!!permission.canReset}:null
}

function safeFilename(value:unknown){
  const name=String(value??'').trim().replace(/[^A-Za-z0-9._-]/g,'_')
  return name&&name.toLowerCase().endsWith('.jar')?name:null
}

export async function POST(request:NextRequest){
  await ensurePanelSchema()
  const actor=await getPanelActor()
  if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!actor.approved)return NextResponse.json({error:'Approval required'},{status:403})
  const body=await request.json().catch(()=>({})) as {serverId?:string;files?:InstallFile[];restartAfter?:boolean}
  const serverId=String(body.serverId??'')
  const x=await access(serverId,actor)
  if(!x?.canInstall)return NextResponse.json({error:'Mod/plugin kurma yetkiniz yok'},{status:403})
  const files=Array.isArray(body.files)?body.files.slice(0,24):[]
  if(!files.length)return NextResponse.json({error:'Kurulum dosyası bulunamadı'},{status:400})

  const prepared:Array<{file:InstallFile;pathname:string;target:string;bytes:number}>=[]
  try{
    for(const file of files){
      const filename=safeFilename(file.fileName)
      if(!filename||!['mods','plugins'].includes(String(file.kind))||!/^https:\/\//i.test(String(file.url??'')))throw new Error('Geçersiz mod/plugin kurulum dosyası')
      const response=await fetch(file.url,{redirect:'follow',signal:AbortSignal.timeout(45_000)})
      if(!response.ok)throw new Error(filename+' indirilemedi (HTTP '+response.status+')')
      const buffer=Buffer.from(await response.arrayBuffer())
      if(!buffer.length||buffer.length>512*1024*1024)throw new Error(filename+' boyut sınırını aşıyor')
      const expected=String(file.sha1??'').trim().toLowerCase()
      if(expected&&createHash('sha1').update(buffer).digest('hex')!==expected)throw new Error(filename+' SHA-1 doğrulaması başarısız')
      const pathname=x.server.userId+'/servers/'+serverId+'/marketplace/'+randomUUID()+'-'+filename
      const blob=await put(pathname,buffer,{access:'private',addRandomSuffix:false,contentType:'application/java-archive'})
      prepared.push({file,pathname:blob.pathname,target:String(file.kind)+'/'+filename,bytes:buffer.length})
    }
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Kurulum dosyaları hazırlanamadı'},{status:502})
  }

  const ids:string[]=[]
  const baseCreatedAt=Date.now()
  let sequence=0
  const nextCreatedAt=()=>new Date(baseCreatedAt+(sequence++*50))
  if(x.server.status==='running'){
    const [stop]=await db.insert(agentCommands).values({userId:x.server.userId,nodeId:x.server.nodeId,serverId,type:'stop',payload:{reason:'marketplace-install',requestedBy:actor.id},status:'queued',createdAt:nextCreatedAt()}).returning({id:agentCommands.id})
    ids.push(stop.id)
  }
  for(const item of prepared){
    const [write]=await db.insert(agentCommands).values({userId:x.server.userId,nodeId:x.server.nodeId,serverId,type:'write-file',payload:{path:item.target,pathname:item.pathname,filename:item.file.fileName,source:item.file.source??null,projectId:item.file.projectId??null,versionId:item.file.versionId??null,requestedBy:actor.id},status:'queued',createdAt:nextCreatedAt()}).returning({id:agentCommands.id})
    ids.push(write.id)
  }
  if(x.server.status==='running'&&body.restartAfter!==false){
    const [start]=await db.insert(agentCommands).values({userId:x.server.userId,nodeId:x.server.nodeId,serverId,type:'start',payload:{memoryMb:x.server.memoryMb,loader:x.server.loader,mcVersion:x.server.mcVersion,loaderVersion:x.server.loaderVersion,port:x.server.port,worldName:x.server.worldName,itemTrackingEnabled:x.server.itemTrackingEnabled,reason:'marketplace-install',requestedBy:actor.id},status:'queued',createdAt:nextCreatedAt()}).returning({id:agentCommands.id})
    ids.push(start.id)
  }
  await db.insert(auditLog).values({userId:actor.id,action:'addon.install.compat',resourceType:'server',resourceId:serverId,details:{files:prepared.map(item=>({target:item.target,bytes:item.bytes,source:item.file.source,projectId:item.file.projectId})),commandIds:ids,restartAfter:x.server.status==='running'&&body.restartAfter!==false}})
  return NextResponse.json({ok:true,queued:prepared.length,commands:ids,restarted:x.server.status==='running'&&body.restartAfter!==false},{status:202})
}
