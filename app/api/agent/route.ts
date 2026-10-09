import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq, gte, inArray, lt, lte, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, ensurePanelSchema, pool } from '@/lib/db'
import { emitDiscordEvent, integrationEventFromCommand, integrationEventFromConsoleLine } from '@/lib/integrations'
import { agentCommands, alertRules, backups, consoleLogs, lostItems, managedDatabases, nodes, notifications, operationLogs, serverMetrics, serverPlayers, serverWebsiteData, serverSchedules, serverSettings, serverSftp, servers, worlds } from '@/lib/db/schema'

const hash=(v:string)=>createHash('sha256').update(v).digest('hex')
const serverMetricSchema=z.object({serverId:z.string().uuid(),cpuPercent:z.number().min(0).max(100).default(0),memoryUsedMb:z.number().int().min(0).default(0),memoryTotalMb:z.number().int().min(0).default(0),diskUsedGb:z.number().min(0).default(0),diskTotalGb:z.number().min(0).default(0),tps:z.number().min(0).max(100).nullable().optional(),mspt:z.number().min(0).nullable().optional(),players:z.number().int().min(0).default(0),uptimeSeconds:z.number().int().min(0).default(0)})
const publicWebsiteItemSchema=z.object({title:z.string().max(80),description:z.string().max(500),value:z.string().max(120),image:z.string().url().nullable().optional(),href:z.string().url().nullable().optional()})
const serverPublicSnapshotSchema=z.object({serverId:z.string().uuid(),source:z.enum(['bans','leaderboard-kills','leaderboard-money','leaderboard-health','leaderboard-playtime','support','store','wiki']),data:z.object({items:z.array(publicWebsiteItemSchema).max(25)})})
const alertMetricKeys=new Set(['cpuPercent','memoryUsedMb','memoryTotalMb','diskUsedGb','diskTotalGb','tps','mspt','players','uptimeSeconds'])
const playerPresenceSchema=z.object({serverId:z.string().uuid(),playerName:z.string().trim().regex(/^[A-Za-z0-9_]{1,16}$/),playerUuid:z.string().max(40).nullable().optional(),event:z.enum(['join','leave']),occurredAt:z.coerce.date().optional()})
const playerListSchema=z.object({serverId:z.string().uuid(),names:z.array(z.string().trim().regex(/^[A-Za-z0-9_]{1,16}$/)).max(500),playerCount:z.number().int().min(0).max(5000).optional(),maxPlayers:z.number().int().min(0).max(5000).optional(),observedAt:z.coerce.date().optional()})
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
async function serverForNode(serverId:string,nodeId:string){return (await db.select({id:servers.id,userId:servers.userId}).from(servers).where(and(eq(servers.id,serverId),eq(servers.nodeId,nodeId))).limit(1))[0]??null}
function sessionSeconds(start:Date|null|undefined,end:Date){return start?Math.max(0,Math.min(31_536_000,Math.floor((end.getTime()-start.getTime())/1000))):0}
async function persistPlayerPresence(nodeId:string,input:z.infer<typeof playerPresenceSchema>){
  const server=await serverForNode(input.serverId,nodeId);if(!server||!(await playerStorageReady()))return
  const at=input.occurredAt??new Date();const key=input.playerName.toLowerCase();const existing=(await db.select().from(serverPlayers).where(and(eq(serverPlayers.serverId,server.id),eq(serverPlayers.playerNameKey,key))).limit(1))[0]
  if(input.event==='join'){
    if(existing)await db.update(serverPlayers).set({playerName:input.playerName,playerUuid:input.playerUuid??existing.playerUuid,isOnline:true,lastSeenAt:at,lastJoinAt:existing.isOnline?(existing.lastJoinAt??at):at,sessionStartedAt:existing.sessionStartedAt??at,lastSyncAt:at,updatedAt:new Date()}).where(eq(serverPlayers.id,existing.id))
    else await db.insert(serverPlayers).values({userId:server.userId,serverId:server.id,playerUuid:input.playerUuid??null,playerName:input.playerName,playerNameKey:key,firstSeenAt:at,lastSeenAt:at,lastJoinAt:at,sessionStartedAt:at,isOnline:true,lastSyncAt:at})
  }else{
    if(existing){const added=existing.isOnline?sessionSeconds(existing.sessionStartedAt,at):0;await db.update(serverPlayers).set({playerName:input.playerName,playerUuid:input.playerUuid??existing.playerUuid,isOnline:false,lastSeenAt:at,lastLeaveAt:at,sessionStartedAt:null,totalPlaySeconds:existing.totalPlaySeconds+added,lastSyncAt:at,updatedAt:new Date()}).where(eq(serverPlayers.id,existing.id))}
    else await db.insert(serverPlayers).values({userId:server.userId,serverId:server.id,playerUuid:input.playerUuid??null,playerName:input.playerName,playerNameKey:key,firstSeenAt:at,lastSeenAt:at,lastLeaveAt:at,isOnline:false,lastSyncAt:at})
  }
}
async function persistPlayerList(nodeId:string,input:z.infer<typeof playerListSchema>){
  const server=await serverForNode(input.serverId,nodeId);if(!server)return
  if(input.playerCount!==undefined)await db.update(servers).set({playerCount:input.playerCount,updatedAt:new Date()}).where(eq(servers.id,server.id))
  // A server may report a count while its console omits the names. That is not
  // evidence that every previously known player has disconnected.
  if(input.playerCount!==undefined&&input.names.length!==input.playerCount)return
  if(!(await playerStorageReady()))return
  const at=input.observedAt??new Date();const uniqueNames=[...new Map(input.names.map(name=>[name.toLowerCase(),name])).values()];const onlineKeys=new Set(uniqueNames.map(name=>name.toLowerCase()))
  const existing=await db.select().from(serverPlayers).where(eq(serverPlayers.serverId,server.id));const byKey=new Map(existing.map(row=>[row.playerNameKey,row]))
  for(const name of uniqueNames){const key=name.toLowerCase();const row=byKey.get(key);if(row){await db.update(serverPlayers).set({playerName:name,isOnline:true,lastSeenAt:at,lastJoinAt:row.isOnline?(row.lastJoinAt??at):at,sessionStartedAt:row.sessionStartedAt??at,lastSyncAt:at,updatedAt:new Date()}).where(eq(serverPlayers.id,row.id))}else await db.insert(serverPlayers).values({userId:server.userId,serverId:server.id,playerName:name,playerNameKey:key,firstSeenAt:at,lastSeenAt:at,lastJoinAt:at,sessionStartedAt:at,isOnline:true,lastSyncAt:at})}
  for(const row of existing){if(!row.isOnline||onlineKeys.has(row.playerNameKey))continue;const added=sessionSeconds(row.sessionStartedAt,at);await db.update(serverPlayers).set({isOnline:false,lastSeenAt:at,lastLeaveAt:at,sessionStartedAt:null,totalPlaySeconds:row.totalPlaySeconds+added,lastSyncAt:at,updatedAt:new Date()}).where(eq(serverPlayers.id,row.id))}
}
async function closePlayerSessions(serverId:string,at=new Date()){
  if(!(await playerStorageReady()))return
  const rows=await db.select().from(serverPlayers).where(and(eq(serverPlayers.serverId,serverId),eq(serverPlayers.isOnline,true)))
  for(const row of rows){const added=sessionSeconds(row.sessionStartedAt,at);await db.update(serverPlayers).set({isOnline:false,lastSeenAt:at,lastLeaveAt:at,sessionStartedAt:null,totalPlaySeconds:row.totalPlaySeconds+added,lastSyncAt:at,updatedAt:new Date()}).where(eq(serverPlayers.id,row.id))}
}
function alertMatches(operator:string,value:number,threshold:number){switch(operator.toLowerCase()){case '>':case 'gt':return value>threshold;case '>=':case 'gte':return value>=threshold;case '<':case 'lt':return value<threshold;case '<=':case 'lte':return value<=threshold;case '=':case '==':case 'eq':return value===threshold;case '!=':case 'ne':return value!==threshold;default:return false}}
async function evaluateMetricAlerts(metric:Record<string,unknown>,server:{id:string;userId:string}){
  const rules=await db.select().from(alertRules).where(and(eq(alertRules.serverId,server.id),eq(alertRules.enabled,true)))
  for(const rule of rules){
    const key=String(rule.metric);if(!alertMetricKeys.has(key))continue;const raw=metric[key];if(raw==null)continue;const value=Number(raw);if(!Number.isFinite(value)||!alertMatches(String(rule.operator),value,Number(rule.threshold)))continue
    const type=`metric-alert:${rule.id}`;const cutoff=new Date(Date.now()-10*60_000);const recent=(await db.select({id:notifications.id}).from(notifications).where(and(eq(notifications.userId,rule.userId),eq(notifications.serverId,server.id),eq(notifications.type,type),gte(notifications.createdAt,cutoff))).orderBy(desc(notifications.createdAt)).limit(1))[0]
    if(recent)continue
    await db.insert(notifications).values({userId:rule.userId,serverId:server.id,type,title:`Sunucu metriği uyarısı: ${key}`,body:`${key} ${value} ${rule.operator} ${rule.threshold} eşiğini tetikledi.`})
  }
}

const APPLIED_PROPERTY_TO_SETTING:Record<string,string>={
  motd:'motd','max-players':'maxPlayers',gamemode:'gamemode',difficulty:'difficulty',hardcore:'hardcore',pvp:'pvp','allow-flight':'allowFlight','white-list':'whitelist','online-mode':'onlineMode','force-gamemode':'forceGamemode','spawn-protection':'spawnProtection','enable-command-block':'commandBlocks','allow-nether':'allowNether','spawn-animals':'spawnAnimals','spawn-monsters':'spawnMonsters','spawn-npcs':'spawnNpc','generate-structures':'generateStructures','view-distance':'viewDistance','simulation-distance':'simulationDistance','player-idle-timeout':'playerIdleTimeout','max-world-size':'maxWorldSize','entity-broadcast-range-percentage':'entityBroadcastRange','function-permission-level':'functionPermissionLevel','op-permission-level':'operatorPermissionLevel','hide-online-players':'hideOnlinePlayers','enforce-whitelist':'enforceWhitelist','enforce-secure-profile':'enforceSecureProfile','accepts-transfers':'acceptTransfers','enable-status':'enableStatus','resource-pack':'resourcePackUrl','resource-pack-sha1':'resourcePackSha1','require-resource-pack':'resourcePackRequired','resource-pack-prompt':'resourcePackPrompt','server-ip':'serverIp','query.port':'queryPort','enable-query':'enableQuery','enable-rcon':'enableRcon','rcon.port':'rconPort','broadcast-rcon-to-ops':'broadcastRcon','network-compression-threshold':'networkCompressionThreshold','rate-limit':'rateLimit','level-name':'worldName','level-seed':'seed','level-type':'worldType','spawn-radius':'spawnRadius','max-tick-time':'maxTickTime'
}
const APPLIED_BOOLEAN_SETTINGS=new Set(['hardcore','pvp','allowFlight','whitelist','onlineMode','forceGamemode','commandBlocks','allowNether','spawnAnimals','spawnMonsters','spawnNpc','generateStructures','hideOnlinePlayers','enforceWhitelist','enforceSecureProfile','acceptTransfers','enableStatus','resourcePackRequired','enableQuery','enableRcon','broadcastRcon'])
const APPLIED_NUMBER_SETTINGS=new Set(['maxPlayers','spawnProtection','viewDistance','simulationDistance','playerIdleTimeout','maxWorldSize','entityBroadcastRange','functionPermissionLevel','operatorPermissionLevel','queryPort','rconPort','networkCompressionThreshold','rateLimit','spawnRadius','maxTickTime'])
function normalizeAppliedSetting(key:string,value:unknown):string|number|boolean{const raw=String(value??'');if(key==='worldType'){const map:Record<string,string>={'minecraft:normal':'default','minecraft:flat':'flat','minecraft:large_biomes':'largeBiomes','minecraft:amplified':'amplified'};return map[raw]??raw.replace(/^minecraft:/,'')}if(APPLIED_BOOLEAN_SETTINGS.has(key))return raw==='true';if(APPLIED_NUMBER_SETTINGS.has(key)){const n=Number(raw);return Number.isFinite(n)?n:0}return raw}
async function persistAppliedServerSettings(serverId:string,userId:string,payload:Record<string,unknown>){const patch:Record<string,string|number|boolean>={};for(const[propertyKey,value]of Object.entries(payload)){const key=APPLIED_PROPERTY_TO_SETTING[propertyKey];if(key)patch[key]=normalizeAppliedSetting(key,value)}if(!Object.keys(patch).length)return;const existing=(await db.select().from(serverSettings).where(eq(serverSettings.serverId,serverId)).limit(1))[0];const merged={...(existing?.settings??{}),...patch};if(existing)await db.update(serverSettings).set({settings:merged,updatedBy:userId,updatedAt:new Date()}).where(eq(serverSettings.serverId,serverId));else await db.insert(serverSettings).values({serverId,userId,settings:merged,capabilities:['properties','port','panel-metadata','runtime-memory'],updatedBy:userId});const worldName=typeof patch.worldName==='string'?patch.worldName.replace(/[^A-Za-z0-9_-]/g,'_'):'';if(worldName)await db.update(servers).set({worldName,updatedAt:new Date()}).where(eq(servers.id,serverId))}

async function getNode(request:NextRequest){const id=request.headers.get('x-node-id');const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!id||!token)return null;const node=(await db.select().from(nodes).where(eq(nodes.id,id)).limit(1))[0];if(!node)return null;const actual=Buffer.from(hash(token));const expected=Buffer.from(node.agentTokenHash);return actual.length===expected.length&&timingSafeEqual(actual,expected)?node:null}

function nextScheduleAt(input:{cadence:string;timeOfDay?:string|null;weekday?:number|null;intervalMinutes?:number|null;timezoneOffsetMinutes?:number|null}, from=new Date()){
  const offset=Math.max(-840,Math.min(840,Number(input.timezoneOffsetMinutes??0)))
  if(input.cadence==='interval')return new Date(from.getTime()+Math.max(5,Math.min(10080,Number(input.intervalMinutes??60)))*60_000)
  const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(input.timeOfDay??'04:00'))
  const hour=Number(match?.[1]??4),minute=Number(match?.[2]??0)
  const localNow=new Date(from.getTime()-offset*60_000)
  let targetMs=Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),localNow.getUTCDate(),hour,minute)+offset*60_000
  if(input.cadence==='weekly'){
    const wanted=Math.max(0,Math.min(6,Number(input.weekday??0)))
    let diff=(wanted-localNow.getUTCDay()+7)%7
    if(diff===0&&targetMs<=from.getTime())diff=7
    targetMs+=diff*86_400_000
  }else if(targetMs<=from.getTime())targetMs+=86_400_000
  return new Date(targetMs)
}

async function dispatchDueSchedules(nodeId:string,nodeUserId:string){
  const serverRows=await db.select({id:servers.id,status:servers.status,memoryMb:servers.memoryMb,loader:servers.loader,mcVersion:servers.mcVersion,loaderVersion:servers.loaderVersion,port:servers.port,worldName:servers.worldName}).from(servers).where(and(eq(servers.nodeId,nodeId),inArray(servers.status,['ready','stopped','running','crashed','failed'])))
  if(!serverRows.length)return
  const byId=new Map(serverRows.map(row=>[row.id,row]))
  const now=new Date()
  const due=await db.select().from(serverSchedules).where(and(eq(serverSchedules.enabled,true),inArray(serverSchedules.serverId,serverRows.map(row=>row.id)),lte(serverSchedules.nextRunAt,now))).orderBy(asc(serverSchedules.nextRunAt)).limit(10)
  for(const schedule of due){
    const server=byId.get(schedule.serverId)
    if(!server)continue
    const nextRunAt=nextScheduleAt(schedule,new Date(now.getTime()+1000))
    const claimed=await db.update(serverSchedules).set({lastRunAt:now,nextRunAt,updatedAt:new Date()}).where(and(eq(serverSchedules.id,schedule.id),lte(serverSchedules.nextRunAt,now))).returning({id:serverSchedules.id})
    if(!claimed[0])continue
    if(schedule.taskType==='log-cleanup'){
      const payload=(schedule.payload??{}) as Record<string,unknown>
      const retentionDays=Math.max(1,Math.min(365,Number(payload.retentionDays??30)))
      const cutoff=new Date(Date.now()-retentionDays*86_400_000)
      await db.delete(consoleLogs).where(and(eq(consoleLogs.serverId,server.id),lt(consoleLogs.createdAt,cutoff)))
      await db.insert(operationLogs).values({userId:nodeUserId,serverId:server.id,operation:'scheduled-log-cleanup',status:'completed',message:`${retentionDays} günden eski günlükler temizlendi`})
      continue
    }
    const securityTask=['security-scan','file-integrity','port-scan'].includes(schedule.taskType)
    const type=securityTask?schedule.taskType:schedule.taskType==='backup'?'backup':'restart'
    if(type==='restart'&&server.status!=='running'){
      await db.insert(operationLogs).values({userId:nodeUserId,serverId:server.id,operation:'scheduled-restart',status:'completed',message:'Sunucu çalışmadığı için zamanlanmış restart atlandı'})
      continue
    }
    const existing=await db.select({id:agentCommands.id}).from(agentCommands).where(and(eq(agentCommands.nodeId,nodeId),eq(agentCommands.serverId,server.id),eq(agentCommands.type,type),inArray(agentCommands.status,['queued','processing']))).limit(1)
    if(existing.length)continue
    let previousHashes:Record<string,string>={}
    if(securityTask&&type!=='port-scan'){try{const q=await pool.query(`SELECT "lastSnapshot" FROM server_security WHERE "serverId"=$1 LIMIT 1`,[server.id]);const hashes=q.rows[0]?.lastSnapshot?.hashes;if(hashes&&typeof hashes==='object')previousHashes=hashes}catch{}}
    const payload=securityTask?{serverPort:server.port,previousHashes,scheduleId:schedule.id}:{memoryMb:server.memoryMb,loader:server.loader,mcVersion:server.mcVersion,loaderVersion:server.loaderVersion,port:server.port,worldName:server.worldName,label:'scheduled',kind:'full',scheduleId:schedule.id}
    if(type==='backup'&&server.status==='running'){
      const base=Date.now()
      await db.insert(agentCommands).values([
        {userId:nodeUserId,nodeId,serverId:server.id,type:'stop',payload:{reason:'scheduled-backup-auto-stop',scheduleId:schedule.id},createdAt:new Date(base)},
        {userId:nodeUserId,nodeId,serverId:server.id,type:'backup',payload:{...payload,autoRestart:true},createdAt:new Date(base+50)},
        {userId:nodeUserId,nodeId,serverId:server.id,type:'start',payload:{...payload,reason:'scheduled-backup-auto-restart'},createdAt:new Date(base+100)},
      ])
      await db.insert(operationLogs).values({userId:nodeUserId,serverId:server.id,operation:'scheduled-backup',status:'queued',message:'Sunucu güvenli biçimde durdurulacak, otomatik yedek alınacak ve yeniden başlatılacak.'})
    }else{
      await db.insert(agentCommands).values({userId:nodeUserId,nodeId,serverId:server.id,type,payload})
      await db.insert(operationLogs).values({userId:nodeUserId,serverId:server.id,operation:`scheduled-${type}`,status:'queued'})
    }
  }
}

function routeError(request: NextRequest, error: unknown) {
  const e = error as { code?: string; table?: string; column?: string; constraint?: string; message?: string }
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  console.error('[agent-api:error]', { requestId, path: request.nextUrl.pathname, code: e.code ?? 'UNKNOWN', table: e.table ?? null, column: e.column ?? null, constraint: e.constraint ?? null, message: e.message ?? 'database error' })
  return NextResponse.json({ error: 'Agent işlemi başarısız', code: 'AGENT_API_ERROR', requestId }, { status: 500 })
}

export async function GET(request:NextRequest){try{
  await ensurePanelSchema()
  const node=await getNode(request)
  if(!node)return NextResponse.json({error:'Unauthorized'},{status:401})
  await dispatchDueSchedules(node.id,node.userId)
  const uploadIdleCutoff = new Date(Date.now() - 30 * 60_000)
  const commandTimeoutCutoff = new Date(Date.now() - 120_000)
  const securityTimeoutCutoff = new Date(Date.now() - 10 * 60_000)
  const worldCreateTimeoutCutoff = new Date(Date.now() - 30 * 60_000)
  await db.update(agentCommands).set({status:'failed',result:{error:'Agent command timed out after 2 minutes'},completedAt:new Date()}).where(and(eq(agentCommands.nodeId,node.id),eq(agentCommands.status,'processing'),lt(agentCommands.createdAt,commandTimeoutCutoff),notInArray(agentCommands.type,['upload-file','upload-archive','security-scan','file-integrity','port-scan','create-world-profile'])))
  await db.update(agentCommands).set({status:'failed',result:{error:'Security scan timed out after 10 minutes'},completedAt:new Date()}).where(and(eq(agentCommands.nodeId,node.id),eq(agentCommands.status,'processing'),lt(agentCommands.createdAt,securityTimeoutCutoff),inArray(agentCommands.type,['security-scan','file-integrity','port-scan'])))
  await db.update(agentCommands).set({status:'failed',result:{error:'World template creation timed out after 30 minutes'},completedAt:new Date()}).where(and(eq(agentCommands.nodeId,node.id),eq(agentCommands.status,'processing'),lt(agentCommands.createdAt,worldCreateTimeoutCutoff),eq(agentCommands.type,'create-world-profile')))
  const uploadRows = await db.select({id:agentCommands.id,payload:agentCommands.payload}).from(agentCommands).where(and(eq(agentCommands.nodeId,node.id),eq(agentCommands.status,'processing'),inArray(agentCommands.type,['upload-file','upload-archive'])))
  for (const upload of uploadRows) {
    const activity = String((upload.payload as Record<string, unknown> | null)?.lastActivityAt ?? '')
    if (activity && new Date(activity).getTime() < uploadIdleCutoff.getTime()) await db.update(agentCommands).set({status:'failed',result:{error:'UPLOAD_COMMAND_EXPIRED'},completedAt:new Date()}).where(eq(agentCommands.id,upload.id))
  }
  const candidates=await db.select().from(agentCommands).where(and(eq(agentCommands.nodeId,node.id),eq(agentCommands.status,'queued'))).orderBy(asc(agentCommands.createdAt)).limit(1)
  const commands=[]
  for(const candidate of candidates){
    const claimed=await db.update(agentCommands).set({status:'processing'}).where(and(eq(agentCommands.id,candidate.id),eq(agentCommands.status,'queued'))).returning()
    if(claimed[0])commands.push(claimed[0])
  }
  return NextResponse.json({commands})
}catch(error){return routeError(request,error)}}
const itemSchema=z.object({
  eventId:z.string().min(1).max(100),serverId:z.string().uuid(),playerUuid:z.string().max(40).nullable().optional(),playerName:z.string().max(40).nullable().optional(),
  itemId:z.string().max(150),itemName:z.string().max(200),amount:z.number().int().min(1).max(100000),reason:z.string().max(40),world:z.string().max(100),
  x:z.number().int(),y:z.number().int(),z:z.number().int(),metadata:z.record(z.string(),z.unknown()).default({}),occurredAt:z.coerce.date()
})

async function persistScheduledSecurityResult(nodeUserId:string,serverId:string,type:string,result:Record<string,unknown>){
  const current=await pool.query(`SELECT "lastSnapshot" FROM server_security WHERE "serverId"=$1 LIMIT 1`,[serverId])
  const previous=(current.rows[0]?.lastSnapshot&&typeof current.rows[0].lastSnapshot==='object'?current.rows[0].lastSnapshot:{}) as Record<string,unknown>
  const merged=type==='security-scan'?result:{...previous,...result}
  await pool.query(`INSERT INTO server_security ("serverId","userId",config,"lastSnapshot","lastScanAt","lastScanStatus") VALUES ($1,$2,'{}'::jsonb,$3::jsonb,now(),'completed') ON CONFLICT ("serverId") DO UPDATE SET "lastSnapshot"=EXCLUDED."lastSnapshot","lastScanAt"=EXCLUDED."lastScanAt","lastScanStatus"='completed',"updatedAt"=now()`,[serverId,nodeUserId,JSON.stringify(merged)])
  const findings=Array.isArray((result as any).findings)?(result as any).findings:[]
  for(const finding of findings.filter((f:any)=>['critical','high'].includes(String(f?.severity))).slice(0,20)){
    const title=String(finding.title||'Zamanlanmış güvenlik bulgusu').slice(0,300)
    const source=String(finding.source||'security').slice(0,80)
    const recent=await pool.query(`SELECT id FROM security_events WHERE "serverId"=$1 AND source=$2 AND event=$3 AND status='open' AND "createdAt">now()-interval '30 minutes' LIMIT 1`,[serverId,source,title])
    if(!recent.rowCount)await pool.query(`INSERT INTO security_events ("userId","serverId",severity,source,event,status,details) VALUES ($1,$2,$3,$4,$5,'open',$6::jsonb)`,[nodeUserId,serverId,String(finding.severity).slice(0,20),source,title,JSON.stringify({message:String(finding.message||'')})])
  }
}

export async function POST(request:NextRequest){
  try{
    await ensurePanelSchema()
    const node=await getNode(request)
    if(!node)return NextResponse.json({error:'Unauthorized'},{status:401})
    const body=await request.json()

    if(body.type==='heartbeat'){
      await db.update(nodes).set({status:'online',lastHeartbeat:new Date(),cpuPercent:body.cpuPercent??0,memoryUsedMb:body.memoryUsedMb??0,memoryTotalMb:body.memoryTotalMb??0,diskUsedGb:body.diskUsedGb??0,diskTotalGb:body.diskTotalGb??0,updatedAt:new Date()}).where(and(eq(nodes.id,node.id),eq(nodes.userId,node.userId)))
    }else if(body.type==='server-metrics'){
      const metrics=z.array(serverMetricSchema).max(100).parse(body.metrics??[])
      if(metrics.length){
        const serverRows=await db.select({id:servers.id,userId:servers.userId}).from(servers).where(and(eq(servers.nodeId,node.id),inArray(servers.id,metrics.map(item=>item.serverId))))
        const byId=new Map(serverRows.map(server=>[server.id,server]))
        for(const metric of metrics){
          const server=byId.get(metric.serverId);if(!server)continue
          const values={...metric,userId:server.userId,tps:metric.tps??null,mspt:metric.mspt??null}
          await db.insert(serverMetrics).values(values)
          await db.update(servers).set({playerCount:metric.players,updatedAt:new Date()}).where(and(eq(servers.id,server.id),eq(servers.nodeId,node.id)))
          await evaluateMetricAlerts(values as Record<string,unknown>,server)
        }
      }
    }else if(body.type==='server-public-data'){
      const snapshots=z.array(serverPublicSnapshotSchema).max(250).parse(body.snapshots??[])
      if(snapshots.length){
        const serverRows=await db.select({id:servers.id,userId:servers.userId}).from(servers).where(and(eq(servers.nodeId,node.id),inArray(servers.id,[...new Set(snapshots.map(item=>item.serverId))])))
        const byId=new Map(serverRows.map(server=>[server.id,server]))
        for(const snapshot of snapshots){const server=byId.get(snapshot.serverId);if(!server)continue;await db.insert(serverWebsiteData).values({userId:server.userId,serverId:server.id,source:snapshot.source,data:snapshot.data,updatedAt:new Date()}).onConflictDoUpdate({target:[serverWebsiteData.serverId,serverWebsiteData.source],set:{userId:server.userId,data:snapshot.data,updatedAt:new Date()}})}
      }
    }else if(body.type==='result'){
      const command=(await db.select().from(agentCommands).where(and(eq(agentCommands.id,body.commandId),eq(agentCommands.userId,node.userId))).limit(1))[0]
      if(command){
        await db.update(agentCommands).set({status:body.ok?'completed':'failed',result:body.result??{},completedAt:new Date()}).where(and(eq(agentCommands.id,command.id),eq(agentCommands.nodeId,node.id)))
        if(command.serverId){
          const nextStatus = body.ok
            ? command.type === 'start' ? 'running'
            : command.type === 'stop' ? 'stopped'
            : command.type === 'restart' ? 'running'
            : command.type === 'install' ? 'stopped'
            : null
            : command.type === 'start' || command.type === 'restart' ? 'crashed' : command.type === 'stop' ? 'stopped' : null
          if(nextStatus) await db.update(servers).set({status: nextStatus, installError: body.ok ? null : String(body.result?.error ?? 'Agent işlemi başarısız').slice(0, 500), updatedAt: new Date()}).where(and(eq(servers.id,command.serverId),eq(servers.nodeId,node.id)))
          const commandPayload=(command.payload&&typeof command.payload==='object'?command.payload:{}) as Record<string,unknown>
          if(commandPayload._bridgeRead!==true)await db.insert(operationLogs).values({userId:node.userId,serverId:command.serverId,operation:command.type,status:body.ok?'completed':'failed',message:body.result?.error??null})
        }

        if(body.ok&&command.serverId&&command.type==='restart'){
          await emitDiscordEvent(command.serverId,'server_restart',{detail:'Panel üzerinden yeniden başlatma komutu tamamlandı.'})
        }
        if(body.ok&&command.serverId&&['console','send-command'].includes(command.type)){
          const line=String((command.payload as Record<string,unknown>|null)?.line??'')
          const integrationEvent=integrationEventFromCommand(line)
          if(integrationEvent)await emitDiscordEvent(command.serverId,integrationEvent.event,integrationEvent.payload)
        }

        if(command.serverId&&body.ok&&['security-scan','file-integrity','port-scan'].includes(command.type)){
          await persistScheduledSecurityResult(node.userId,command.serverId,command.type,(body.result??{}) as Record<string,unknown>)
        }
        if(command.serverId&&!body.ok&&['security-scan','file-integrity','port-scan'].includes(command.type)){
          await pool.query(`INSERT INTO server_security ("serverId","userId",config,"lastScanAt","lastScanStatus") VALUES ($1,$2,'{}'::jsonb,now(),'failed') ON CONFLICT ("serverId") DO UPDATE SET "lastScanAt"=now(),"lastScanStatus"='failed',"updatedAt"=now()`,[command.serverId,node.userId])
        }

        if(body.ok&&command.serverId&&['backup','CREATE_BACKUP','CREATE_WORLD_BACKUP'].includes(command.type)&&body.result?.path){
          const world=(await db.select({id:worlds.id}).from(worlds).where(and(eq(worlds.serverId,command.serverId),eq(worlds.isActive,true))).limit(1))[0]
          if(world)await db.insert(backups).values({userId:node.userId,worldId:world.id,blobPathname:String(body.result.path).slice(0,500),sizeMb:Number(body.result.sizeBytes??0)/1048576,sizeBytes:Number(body.result.sizeBytes??0),createdBy:node.userId})
        }
        if(!body.ok&&command.type==='install'&&command.serverId)await db.update(servers).set({status:'failed',installError:String(body.result?.error??'Kurulum başarısız'),updatedAt:new Date()}).where(eq(servers.id,command.serverId))
        if(body.ok&&command.type==='delete-server'&&command.serverId){
          await db.update(servers).set({status:'deleted',updatedAt:new Date()}).where(and(eq(servers.id,command.serverId),eq(servers.userId,node.userId)))
          await db.update(serverSftp).set({status:'deleted',disabledAt:new Date(),updatedAt:new Date()}).where(and(eq(serverSftp.serverId,command.serverId),eq(serverSftp.nodeId,node.id)))
        }
        if(body.ok&&command.serverId&&command.type==='set-properties'){
          await persistAppliedServerSettings(command.serverId,node.userId,(command.payload??{}) as Record<string,unknown>)
        }
        if(body.ok&&command.serverId&&['create-world','create-world-profile'].includes(command.type)){
          const payload=(command.payload??{}) as Record<string,unknown>
          const result=(body.result??{}) as Record<string,unknown>
          const worldName=String(result.world??payload.worldName??'').replace(/[^A-Za-z0-9_-]/g,'_')
          if(worldName){
            const seed=String(result.seed??payload.seed??'').slice(0,100)||null
            const active=result.active===true||payload.activateAfterCreate===true||command.type==='create-world'
            const existing=(await db.select().from(worlds).where(and(eq(worlds.serverId,command.serverId),eq(worlds.name,worldName))).limit(1))[0]
            if(active)await db.update(worlds).set({isActive:false}).where(eq(worlds.serverId,command.serverId))
            if(existing)await db.update(worlds).set({seed,isActive:active,sizeMb:0}).where(eq(worlds.id,existing.id))
            else await db.insert(worlds).values({userId:node.userId,serverId:command.serverId,name:worldName,seed,isActive:active,sizeMb:0})
            if(active)await db.update(servers).set({worldName,updatedAt:new Date()}).where(and(eq(servers.id,command.serverId),eq(servers.userId,node.userId)))
          }
        }
        if(body.ok&&command.serverId&&command.type==='change-port'){
          const port=Number((command.payload as Record<string,unknown>|null)?.port)
          if(Number.isInteger(port)&&port>=1024&&port<=65535){
            await db.update(servers).set({port,updatedAt:new Date()}).where(and(eq(servers.id,command.serverId),eq(servers.userId,node.userId)))
            const existing=(await db.select().from(serverSettings).where(eq(serverSettings.serverId,command.serverId)).limit(1))[0]
            const merged={...(existing?.settings??{}),serverPort:port}
            if(existing)await db.update(serverSettings).set({settings:merged,updatedBy:node.userId,updatedAt:new Date()}).where(eq(serverSettings.serverId,command.serverId))
            else await db.insert(serverSettings).values({serverId:command.serverId,userId:node.userId,settings:merged,capabilities:['properties','port','panel-metadata','runtime-memory'],updatedBy:node.userId})
          }
        }
        if(body.ok&&command.serverId&&command.type==='CHANGE_WORLD'){
          const worldName=String((command.payload as Record<string,unknown>|null)?.worldName??'').replace(/[^A-Za-z0-9_-]/g,'_')
          if(worldName){
            await db.update(servers).set({worldName,updatedAt:new Date()}).where(and(eq(servers.id,command.serverId),eq(servers.userId,node.userId)))
            await db.update(worlds).set({isActive:false}).where(eq(worlds.serverId,command.serverId))
            await db.update(worlds).set({isActive:true}).where(and(eq(worlds.serverId,command.serverId),eq(worlds.name,worldName)))
          }
        }
        if(body.ok&&command.serverId&&command.type==='DELETE_WORLD'){
          const worldName=String((command.payload as Record<string,unknown>|null)?.worldName??'').replace(/[^A-Za-z0-9_-]/g,'_')
          if(worldName)await db.delete(worlds).where(and(eq(worlds.serverId,command.serverId),eq(worlds.name,worldName)))
        }
        if(body.ok&&command.serverId&&command.type==='change-software'){
          const payload=(command.payload??{}) as Record<string,unknown>;const loader=String(payload.loader??'');const mcVersion=String(payload.mcVersion??'');const loaderVersion=payload.loaderVersion?String(payload.loaderVersion):null
          if(['vanilla','paper','fabric','forge','neoforge'].includes(loader)&&/^\d+\.\d+(\.\d+)?$/.test(mcVersion))await db.update(servers).set({loader,mcVersion,loaderVersion,updatedAt:new Date()}).where(and(eq(servers.id,command.serverId),eq(servers.userId,node.userId)))
        }
        if(command.serverId&&command.type.startsWith('sftp-')){
          const result=(body.result??{}) as Record<string,unknown>
          if(command.type==='sftp-test'){
            const ready=body.ok&&result.ready===true
            await db.update(serverSftp).set({status:ready?'ready':'failed',port:Number.isInteger(Number(result.port))?Number(result.port):undefined,lastError:ready?null:String(result.error??'SFTP doğrulaması başarısız').slice(0,500),lastTestAt:new Date(),updatedAt:new Date()}).where(and(eq(serverSftp.serverId,command.serverId),eq(serverSftp.nodeId,node.id)))
          }else if(command.type==='sftp-disable'&&body.ok){
            await db.update(serverSftp).set({status:'disabled',lastError:null,disabledAt:new Date(),updatedAt:new Date()}).where(and(eq(serverSftp.serverId,command.serverId),eq(serverSftp.nodeId,node.id)))
          }else if(command.type==='sftp-enable'){
            await db.update(serverSftp).set({status:body.ok?'ready':'failed',lastError:body.ok?null:String(result.error??'SFTP etkinleştirilemedi').slice(0,500),lastTestAt:new Date(),disabledAt:body.ok?null:undefined,updatedAt:new Date()}).where(and(eq(serverSftp.serverId,command.serverId),eq(serverSftp.nodeId,node.id)))
          }
        }
        if(command.type.startsWith('database-')){
          const payload=(command.payload??{}) as Record<string,unknown>;const databaseId=String(payload.databaseId??'')
          if(databaseId){
            if(body.ok&&command.type==='database-delete')await db.delete(managedDatabases).where(eq(managedDatabases.id,databaseId))
            else{
              const result=(body.result??{}) as Record<string,unknown>
              await db.update(managedDatabases).set({status:body.ok?'ready':'failed',credentialsPath:body.ok?String(result.credentialsPath??'')||null:undefined,lastError:body.ok?null:String(result.error??'Veritabanı işlemi başarısız').slice(0,1000),updatedAt:new Date()}).where(eq(managedDatabases.id,databaseId))
            }
          }
        }
      }
    }else if(body.type==='progress'&&body.serverId){
      const failed=String(body.status??'')==='failed'
      await db.update(servers).set({status:String(body.status??'installing'),installProgress:Math.max(0,Math.min(100,Number(body.progress)||0)),installError:failed?String(body.error??'Kurulum başarısız').slice(0,500):null,updatedAt:new Date()}).where(and(eq(servers.id,body.serverId),eq(servers.userId,node.userId)))
      await db.insert(operationLogs).values({userId:node.userId,serverId:body.serverId,operation:'install',status:failed?'failed':String(body.status??'installing'),message:failed?String(body.error??'Kurulum başarısız').slice(0,500):null})
    }else if(body.type==='backup-progress'&&body.serverId){
      const command=(await db.select({id:agentCommands.id}).from(agentCommands).where(and(eq(agentCommands.serverId,body.serverId),eq(agentCommands.nodeId,node.id),inArray(agentCommands.type,['backup','CREATE_BACKUP','CREATE_WORLD_BACKUP']),inArray(agentCommands.status,['processing','queued']))).limit(1))[0]
      if(command)await db.update(agentCommands).set({result:{status:body.status,progress:body.progress,path:body.path??null}}).where(eq(agentCommands.id,command.id))
    }else if(body.type==='player-presence'){
      const presence=playerPresenceSchema.parse(body);await persistPlayerPresence(node.id,presence)
    }else if(body.type==='player-list'){
      const snapshot=playerListSchema.parse(body);await persistPlayerList(node.id,snapshot)
    }else if(body.type==='log'&&body.serverId&&typeof body.line==='string'){
      await db.insert(consoleLogs).values({userId:node.userId,serverId:body.serverId,stream:body.stream==='stderr'?'stderr':'stdout',line:body.line.slice(0,8000)})
      for(const logLine of String(body.line).split(/\r?\n/).filter(Boolean).slice(0,100)){
        const integrationEvent=integrationEventFromConsoleLine(logLine)
        if(integrationEvent)await emitDiscordEvent(body.serverId,integrationEvent.event,integrationEvent.payload)
      }
    }else if(body.type==='server-status'&&body.serverId){
      const previous=(await db.select({status:servers.status}).from(servers).where(and(eq(servers.id,body.serverId),eq(servers.userId,node.userId))).limit(1))[0]
      await db.update(servers).set({status:body.status,pid:body.pid??null,playerCount:body.playerCount??0,installProgress:body.status==='ready'||body.status==='stopped'?100:undefined,updatedAt:new Date()}).where(and(eq(servers.id,body.serverId),eq(servers.userId,node.userId)))
      if(String(body.status??'')!=='running')await closePlayerSessions(String(body.serverId))
      if(previous&&previous.status!==String(body.status??'')){
        const next=String(body.status??'')
        if(next==='running')await emitDiscordEvent(body.serverId,'server_start')
        else if(next==='stopped')await emitDiscordEvent(body.serverId,'server_stop')
        else if(next==='crashed'||next==='failed')await emitDiscordEvent(body.serverId,'server_crash',{detail:body.error?String(body.error).slice(0,500):undefined})
      }
    }else if(body.type==='sftp-status'&&body.serverId){
      await db.update(serverSftp).set({status:String(body.status??'failed'),lastError:body.error?String(body.error).slice(0,500):null,lastTestAt:body.status==='ready'||body.status==='failed'?new Date():undefined,disabledAt:body.status==='disabled'?new Date():body.status==='ready'?null:undefined,updatedAt:new Date()}).where(and(eq(serverSftp.serverId,body.serverId),eq(serverSftp.nodeId,node.id)))
    }else if(body.type==='lost-items'){
      const items=z.array(itemSchema).max(200).parse(body.items)
      for(const item of items){
        const server=(await db.select().from(servers).where(and(eq(servers.id,item.serverId),eq(servers.nodeId,node.id),eq(servers.itemTrackingEnabled,true))).limit(1))[0]
        if(server)await db.insert(lostItems).values({userId:server.userId,...item}).onConflictDoNothing()
      }
    }
    return NextResponse.json({ok:true})
  }catch(error){return routeError(request,error)}
}
