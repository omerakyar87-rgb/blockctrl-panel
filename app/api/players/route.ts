import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getPanelActor } from '@/lib/api-auth'
import { db, ensurePanelSchema, pool } from '@/lib/db'
import { auditLog, nodes, serverPermissions, serverPlayers, servers } from '@/lib/db/schema'
import { nodeDiagnosticMessage, nodeFetch } from '@/lib/node-bridge'

const playerSchema=z.string().trim().regex(/^[A-Za-z0-9_]{1,16}$/)
const actionSchema=z.object({
  serverId:z.string().uuid(),
  action:z.enum(['refresh','message','kick','whitelist-add','whitelist-remove','op','deop','ban','unban']),
  playerName:playerSchema.optional(),
  message:z.string().trim().max(256).optional(),
  reason:z.string().trim().max(160).optional(),
})

type RuntimePlayer={
  playerName:string
  playerUuid?:string|null
  isOnline?:boolean
  isOp?:boolean
  opLevel?:number|null
  bypassesPlayerLimit?:boolean
  whitelisted?:boolean
  banned?:boolean
  banReason?:string|null
  banExpiresAt?:string|null
  banSource?:string|null
}
type RuntimeSnapshot={
  running?:boolean
  onlineVerified?:boolean
  onlineSource?:string
  onlineNames?:string[]
  playerCount?:number|null
  maxPlayers?:number|null
  whitelistEnabled?:boolean
  players?:RuntimePlayer[]
  syncedAt?:string
}

async function actor(){return getPanelActor()}
async function access(serverId:string,current:NonNullable<Awaited<ReturnType<typeof actor>>>){
  const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0]
  if(!server||server.status==='deleted')return null
  const role=String(current.role??'member').toLowerCase()
  if(role==='manager'||role==='owner'||server.userId===current.id)return{server,canRead:true,canManage:true}
  const permission=(await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId,serverId),eq(serverPermissions.userId,current.id))).limit(1))[0]
  if(!permission)return null
  const sections=Array.isArray(permission.sections)?permission.sections.map(String):[]
  const canRead=sections.includes('players')||sections.includes('console')||!!permission.canConsole
  return canRead?{server,canRead:true,canManage:!!permission.canConsole}:null
}
function nodeFresh(node:{status:string;lastHeartbeat:Date|null}|undefined){return !!node&&node.status==='online'&&!!node.lastHeartbeat&&Date.now()-node.lastHeartbeat.getTime()<90_000}
function noStore(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})}
let playerStorageCheckedAt=0
let playerStorageCached=false
async function playerStorageReady(){
  if(Date.now()-playerStorageCheckedAt<15_000)return playerStorageCached
  try{
    const result=await pool.query<{table_name:string|null}>(`SELECT to_regclass('public.server_players')::text AS table_name`)
    playerStorageCached=Boolean(result.rows[0]?.table_name)
  }catch{playerStorageCached=false}
  playerStorageCheckedAt=Date.now()
  return playerStorageCached
}
function parseDate(value:unknown){if(!value)return null;const d=new Date(String(value));return Number.isNaN(d.getTime())?null:d}
function sessionSeconds(start:Date|null|undefined,end:Date){return start?Math.max(0,Math.min(31_536_000,Math.floor((end.getTime()-start.getTime())/1000))):0}
function cleanRuntimePlayer(input:unknown):RuntimePlayer|null{
  if(!input||typeof input!=='object')return null
  const raw=input as Record<string,unknown>;const parsed=playerSchema.safeParse(String(raw.playerName??''));if(!parsed.success)return null
  const uuid=String(raw.playerUuid??'').trim()
  return{
    playerName:parsed.data,
    playerUuid:/^[0-9a-f-]{32,36}$/i.test(uuid)?uuid:null,
    isOnline:raw.isOnline===true,
    isOp:raw.isOp===true,
    opLevel:Number.isFinite(Number(raw.opLevel))?Number(raw.opLevel):null,
    bypassesPlayerLimit:raw.bypassesPlayerLimit===true,
    whitelisted:raw.whitelisted===true,
    banned:raw.banned===true,
    banReason:String(raw.banReason??'').trim().slice(0,300)||null,
    banExpiresAt:parseDate(raw.banExpiresAt)?.toISOString()??null,
    banSource:String(raw.banSource??'').trim().slice(0,120)||null,
  }
}
async function directJson(nodeId:string,path:string,init:RequestInit={}){
  const response=await nodeFetch(nodeId,path,{...init,cache:'no-store',signal:AbortSignal.timeout(8000)})
  const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={error:text.slice(0,500)}}
  if(!response.ok)throw new Error(String(data.error??`Node HTTP ${response.status}`))
  return data
}
async function syncSnapshot(server:{id:string;userId:string},snapshot:RuntimeSnapshot){
  const at=parseDate(snapshot.syncedAt)??new Date();const verified=snapshot.onlineVerified===true&&(
    snapshot.playerCount==null||snapshot.onlineNames?.length===snapshot.playerCount
  )
  const runtime=(Array.isArray(snapshot.players)?snapshot.players:[]).map(cleanRuntimePlayer).filter((row):row is RuntimePlayer=>!!row)
  const existing=await db.select().from(serverPlayers).where(eq(serverPlayers.serverId,server.id));const byKey=new Map(existing.map(row=>[row.playerNameKey,row]));const present=new Set<string>()
  for(const player of runtime){
    const key=player.playerName.toLowerCase();present.add(key);const row=byKey.get(key);const nextOnline=verified?player.isOnline===true:(row?.isOnline??false)
    if(row){
      let total=row.totalPlaySeconds;let sessionStarted=row.sessionStartedAt;let lastJoin=row.lastJoinAt;let lastLeave=row.lastLeaveAt
      if(verified&&nextOnline&&!row.isOnline){sessionStarted=at;lastJoin=at}
      if(verified&&!nextOnline&&row.isOnline){total+=sessionSeconds(row.sessionStartedAt,at);sessionStarted=null;lastLeave=at}
      await db.update(serverPlayers).set({playerName:player.playerName,playerUuid:player.playerUuid??row.playerUuid,isOnline:nextOnline,isOp:player.isOp===true,whitelisted:player.whitelisted===true,banned:player.banned===true,banReason:player.banReason??null,banExpiresAt:parseDate(player.banExpiresAt),lastSeenAt:nextOnline?at:row.lastSeenAt,lastJoinAt:lastJoin,lastLeaveAt:lastLeave,sessionStartedAt:sessionStarted,totalPlaySeconds:total,lastSyncAt:at,updatedAt:new Date()}).where(eq(serverPlayers.id,row.id))
    }else{
      await db.insert(serverPlayers).values({userId:server.userId,serverId:server.id,playerUuid:player.playerUuid??null,playerName:player.playerName,playerNameKey:key,firstSeenAt:at,lastSeenAt:nextOnline?at:null,lastJoinAt:nextOnline?at:null,sessionStartedAt:nextOnline?at:null,totalPlaySeconds:0,isOnline:nextOnline,isOp:player.isOp===true,whitelisted:player.whitelisted===true,banned:player.banned===true,banReason:player.banReason??null,banExpiresAt:parseDate(player.banExpiresAt),lastSyncAt:at})
    }
  }
  if(verified){
    for(const row of existing){if(!row.isOnline||present.has(row.playerNameKey))continue;const total=row.totalPlaySeconds+sessionSeconds(row.sessionStartedAt,at);await db.update(serverPlayers).set({isOnline:false,lastSeenAt:at,lastLeaveAt:at,sessionStartedAt:null,totalPlaySeconds:total,lastSyncAt:at,updatedAt:new Date()}).where(eq(serverPlayers.id,row.id))}
  }
}
async function fetchRuntime(server:{id:string;nodeId:string;userId:string}){
  return await directJson(server.nodeId,`/internal/players/status?serverId=${encodeURIComponent(server.id)}`) as RuntimeSnapshot
}
function incompleteOnlineNames(snapshot:RuntimeSnapshot|null){
  return !!snapshot?.running&&typeof snapshot.playerCount==='number'&&snapshot.playerCount>0&&
    snapshot.onlineNames?.length!==snapshot.playerCount
}
function transientPlayers(snapshot:RuntimeSnapshot|null){
  const at=parseDate(snapshot?.syncedAt)??new Date()
  return (Array.isArray(snapshot?.players)?snapshot!.players!:[]).map(cleanRuntimePlayer).filter((row):row is RuntimePlayer=>!!row).map(player=>({
    id:`runtime:${player.playerName.toLowerCase()}`,
    playerUuid:player.playerUuid??null,
    playerName:player.playerName,
    firstSeenAt:null,
    lastSeenAt:player.isOnline?at.toISOString():null,
    lastJoinAt:player.isOnline?at.toISOString():null,
    lastLeaveAt:null,
    sessionStartedAt:player.isOnline?at.toISOString():null,
    totalPlaySeconds:0,
    isOnline:player.isOnline===true,
    isOp:player.isOp===true,
    whitelisted:player.whitelisted===true,
    banned:player.banned===true,
    banReason:player.banReason??null,
    banExpiresAt:player.banExpiresAt??null,
    lastSyncAt:at.toISOString(),
  }))
}
function presentRow(row:typeof serverPlayers.$inferSelect){
  const now=new Date();const current=row.isOnline?sessionSeconds(row.sessionStartedAt,now):0
  return{...row,totalPlaySeconds:row.totalPlaySeconds+current}
}

export async function GET(request:NextRequest){
  await ensurePanelSchema();const current=await actor();if(!current)return noStore({error:'Unauthorized'},401);if(!current.approved)return noStore({error:'Approval required'},403)
  const serverId=request.nextUrl.searchParams.get('serverId')??'';const x=await access(serverId,current);if(!x?.canRead)return noStore({error:'Oyuncular bölümüne erişiminiz yok'},403)
  const node=(await db.select({status:nodes.status,lastHeartbeat:nodes.lastHeartbeat}).from(nodes).where(eq(nodes.id,x.server.nodeId)).limit(1))[0]
  const storageReady=await playerStorageReady()
  let runtime:RuntimeSnapshot|null=null;let runtimeError:string|null=null
  const refresh=request.nextUrl.searchParams.get('refresh')==='1'

  if(!storageReady){
    if(nodeFresh(node)){
      try{runtime=await fetchRuntime(x.server);if(incompleteOnlineNames(runtime))runtimeError='Minecraft oyuncu sayısını bildirdi ancak isim listesini doğrulamadı. Agent konsol bağlantısını kontrol edin.'}catch(error){runtimeError=nodeDiagnosticMessage(error)}
    }else runtimeError='Node çevrimdışı veya heartbeat güncel değil.'
    const players=transientPlayers(runtime)
    const migrationMessage='Kalıcı oyuncu geçmişi için 0015_server_players migrationı henüz uygulanmamış.'
    return noStore({
      players,
      summary:{total:players.length,online:runtime?.onlineVerified===false&&runtime.playerCount!=null?Math.max(0,Number(runtime.playerCount)||0):players.filter(row=>row.isOnline).length,banned:players.filter(row=>row.banned).length,ops:players.filter(row=>row.isOp).length,whitelisted:players.filter(row=>row.whitelisted).length,lastSyncAt:runtime?.syncedAt??null,maxPlayers:runtime?.maxPlayers??null,whitelistEnabled:runtime?.whitelistEnabled??null},
      nodeOnline:nodeFresh(node),runtimeSynced:!!runtime,runtimeError:[migrationMessage,runtimeError].filter(Boolean).join(' '),canManage:x.canManage,storageReady:false,expectedMigration:'0015_server_players',
    })
  }

  if(nodeFresh(node)){
    try{runtime=await fetchRuntime(x.server);await syncSnapshot(x.server,runtime);if(incompleteOnlineNames(runtime))runtimeError='Minecraft oyuncu sayısını bildirdi ancak isim listesini doğrulamadı. Agent konsol bağlantısını kontrol edin.'}catch(error){runtimeError=nodeDiagnosticMessage(error)}
  }else if(!nodeFresh(node))runtimeError='Node çevrimdışı veya heartbeat güncel değil.'
  const rows=await db.select().from(serverPlayers).where(eq(serverPlayers.serverId,serverId)).orderBy(desc(serverPlayers.isOnline),desc(serverPlayers.lastSeenAt),desc(serverPlayers.updatedAt)).limit(1000)
  const players=rows.map(presentRow);const latestSync=rows.reduce<Date|null>((latest,row)=>!row.lastSyncAt?latest:!latest||row.lastSyncAt>latest?row.lastSyncAt:latest,null)
  return noStore({
    players,
    summary:{total:players.length,online:runtime?.onlineVerified===false&&runtime.playerCount!=null?Math.max(0,Number(runtime.playerCount)||0):players.filter(row=>row.isOnline).length,banned:players.filter(row=>row.banned).length,ops:players.filter(row=>row.isOp).length,whitelisted:players.filter(row=>row.whitelisted).length,lastSyncAt:latestSync?.toISOString()??runtime?.syncedAt??null,maxPlayers:runtime?.maxPlayers??null,whitelistEnabled:runtime?.whitelistEnabled??null},
    nodeOnline:nodeFresh(node),runtimeSynced:!!runtime,runtimeError,canManage:x.canManage,storageReady:true,expectedMigration:'0015_server_players',
  })
}
export async function POST(request:NextRequest){
  await ensurePanelSchema();const current=await actor();if(!current)return noStore({error:'Unauthorized'},401);if(!current.approved)return noStore({error:'Approval required'},403)
  const input=actionSchema.safeParse(await request.json().catch(()=>({})));if(!input.success)return noStore({error:'Geçersiz oyuncu işlemi'},400)
  const x=await access(input.data.serverId,current);if(!x?.canRead)return noStore({error:'Oyuncular bölümüne erişiminiz yok'},403)
  const node=(await db.select({status:nodes.status,lastHeartbeat:nodes.lastHeartbeat}).from(nodes).where(eq(nodes.id,x.server.nodeId)).limit(1))[0]
  const storageReady=await playerStorageReady()
  if(!nodeFresh(node))return noStore({error:'Node çevrimdışı veya agent heartbeat güncel değil.'},409)
  if(input.data.action==='refresh'){
    try{const runtime=await fetchRuntime(x.server);if(storageReady)await syncSnapshot(x.server,runtime);return noStore({ok:true,message:storageReady?`Oyuncu verileri sunucudan yenilendi${runtime.onlineVerified===false?' (canlı isim listesi doğrulanamadı)':''}.`:'Canlı oyuncu verileri alındı; kalıcı geçmiş 0015_server_players migrationı sonrasında kaydedilecek.',runtime,storageReady})}
    catch(error){return noStore({error:`Oyuncu verileri yenilenemedi: ${nodeDiagnosticMessage(error)}`},503)}
  }
  if(!x.canManage)return noStore({error:'Oyuncu yönetme yetkiniz yok'},403)
  if(!input.data.playerName)return noStore({error:'Oyuncu adı gerekli'},400)
  if(input.data.action==='message'&&!input.data.message?.trim())return noStore({error:'Mesaj boş olamaz'},400)
  try{
    await directJson(x.server.nodeId,'/internal/players/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId:x.server.id,action:input.data.action,playerName:input.data.playerName,message:input.data.message?.trim(),reason:input.data.reason?.trim()})})
  }catch(error){return noStore({error:`Oyuncu işlemi uygulanamadı: ${nodeDiagnosticMessage(error)}`},503)}
  if(!storageReady){await db.insert(auditLog).values({userId:current.id,action:`player.${input.data.action}`,resourceType:'player',resourceId:`${x.server.id}:${input.data.playerName}`,details:{serverId:x.server.id,playerName:input.data.playerName,reason:input.data.reason?.trim()||null,messageLength:input.data.message?.length??0,storageReady:false}});return noStore({ok:true,message:'Oyuncu işlemi uygulandı. Kalıcı oyuncu geçmişi 0015_server_players migrationı sonrasında kaydedilecek.',storageReady:false})}
  const key=input.data.playerName.toLowerCase();const existing=(await db.select().from(serverPlayers).where(and(eq(serverPlayers.serverId,x.server.id),eq(serverPlayers.playerNameKey,key))).limit(1))[0];const patch:Partial<typeof serverPlayers.$inferInsert>={lastSyncAt:new Date(),updatedAt:new Date()}
  if(input.data.action==='whitelist-add')patch.whitelisted=true
  if(input.data.action==='whitelist-remove')patch.whitelisted=false
  if(input.data.action==='op')patch.isOp=true
  if(input.data.action==='deop')patch.isOp=false
  if(input.data.action==='ban'){patch.banned=true;patch.banReason=input.data.reason?.trim()||'Panel üzerinden yasaklandı'}
  if(input.data.action==='unban'){patch.banned=false;patch.banReason=null;patch.banExpiresAt=null}
  if(existing)await db.update(serverPlayers).set(patch).where(eq(serverPlayers.id,existing.id))
  else await db.insert(serverPlayers).values({userId:x.server.userId,serverId:x.server.id,playerName:input.data.playerName,playerNameKey:key,isOnline:false,isOp:input.data.action==='op',whitelisted:input.data.action==='whitelist-add',banned:input.data.action==='ban',banReason:input.data.action==='ban'?(input.data.reason?.trim()||'Panel üzerinden yasaklandı'):null,lastSyncAt:new Date()})
  await db.insert(auditLog).values({userId:current.id,action:`player.${input.data.action}`,resourceType:'player',resourceId:`${x.server.id}:${input.data.playerName}`,details:{serverId:x.server.id,playerName:input.data.playerName,reason:input.data.reason?.trim()||null,messageLength:input.data.message?.length??0}})
  const labels:Record<string,string>={message:'Mesaj gönderildi.',kick:'Oyuncu sunucudan çıkarıldı.','whitelist-add':'Oyuncu whitelist listesine eklendi.','whitelist-remove':'Oyuncu whitelist listesinden çıkarıldı.',op:'Oyuncuya OP yetkisi verildi.',deop:'Oyuncunun OP yetkisi kaldırıldı.',ban:'Oyuncu yasaklandı.',unban:'Oyuncunun yasağı kaldırıldı.'}
  return noStore({ok:true,message:labels[input.data.action]??'Oyuncu işlemi uygulandı.'})
}
