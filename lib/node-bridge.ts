import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentCommands, consoleLogs, servers, worlds as worldsTable } from '@/lib/db/schema'

const REQUEST_TIMEOUT_MS = 8_000
const BRIDGE_TIMEOUT_MS = 20_000

function isPrivateOrMetadataHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === 'metadata.google.internal' || host === '169.254.169.254' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
}

type NodeConfig = { baseUrl: string; token: string }

function parseMap(name: string): Record<string, string> {
  const raw = process.env[name]?.trim()
  if (!raw) return {}
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string' && item.trim())) as Record<string, string>
  } catch {
    const entries = raw.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean).map((entry) => { const separator = entry.indexOf('=') >= 0 ? entry.indexOf('=') : entry.indexOf(':'); return separator > 0 ? [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()] : ['', ''] }).filter(([key, value]) => key && value)
    if (entries.length) return Object.fromEntries(entries)
  }
  throw new Error(`${name} JSON veya nodeId=değer biçiminde olmalı`)
}

function nodeToken(nodeId: string): string {
  const direct = process.env.NODE_TOKEN?.trim()
  const raw = process.env.NODE_TOKENS?.trim()
  if (!raw) return direct ?? ''

  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const mapped = (value as Record<string, unknown>)[nodeId]
      if (typeof mapped === 'string' && mapped.trim()) return mapped.trim()
      return direct ?? ''
    }
  } catch {
    const entries = raw.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean)
    for (const entry of entries) {
      const equal = entry.indexOf('=')
      const colon = entry.indexOf(':')
      const separator = equal >= 0 ? equal : colon
      if (separator <= 0) continue
      const key = entry.slice(0, separator).trim()
      const value = entry.slice(separator + 1).trim()
      if (key === nodeId && value) return value
    }

    // Backwards compatibility for single-node Vercel setups where NODE_TOKENS
    // was configured with the token itself instead of a JSON/map value.
    if (entries.length === 1 && !raw.startsWith('{') && !raw.startsWith('[')) return raw
  }

  return direct ?? ''
}

export function getNodeConfig(nodeId: string): NodeConfig {
  const urls = parseMap('NODE_AGENT_URLS')
  const legacyUrl = process.env.NODE_UPLOAD_URL ?? process.env.NODE_DOWNLOAD_URL
  const configuredUrl = process.env.NODE_AGENT_BASE_URL ?? legacyUrl
  const baseUrl = (urls[nodeId] ?? configuredUrl ?? '').trim().replace(/\/$/, '')
  const token = nodeToken(nodeId)
  if (!baseUrl) throw new Error(`Node ${nodeId} için NODE_AGENT_URLS veya NODE_AGENT_BASE_URL tanımlı değil`)
  if (!token) throw new Error(`Node ${nodeId} için NODE_TOKENS veya NODE_TOKEN tanımlı değil`)
  let parsed: URL
  try { parsed = new URL(baseUrl) } catch { throw new Error(`Node ${nodeId} adresi geçersiz`) }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Node adresi HTTP veya HTTPS olmalı')
  if (isPrivateOrMetadataHost(parsed.hostname)) throw new Error('Node adresi private veya metadata ağına ait olamaz')
  return { baseUrl, token }
}

function placeholderAgentUrl(baseUrl: string) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return host === 'agent.example.com' || host === 'example.com' || host.endsWith('.example.com') || host.endsWith('.invalid')
  } catch {
    return true
  }
}

function bridgeBody(init: RequestInit) {
  if (init.body == null) return {} as Record<string, unknown>
  if (typeof init.body !== 'string') throw new Error('Bu agent işlemi polling köprüsü üzerinden taşınamıyor.')
  try {
    const parsed = JSON.parse(init.body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    throw new Error('Agent polling köprüsü yalnız JSON gövdeli işlemleri destekliyor.')
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data ?? {}), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

const SAFE_SETTING_PROPERTIES = new Set([
  'motd','max-players','gamemode','difficulty','hardcore','pvp','allow-flight','white-list','online-mode','force-gamemode',
  'spawn-protection','enable-command-block','allow-nether','spawn-animals','spawn-monsters','spawn-npcs','generate-structures',
  'view-distance','simulation-distance','player-idle-timeout','max-world-size','entity-broadcast-range-percentage',
  'function-permission-level','op-permission-level','hide-online-players','enforce-whitelist','enforce-secure-profile',
  'accepts-transfers','enable-status','resource-pack','resource-pack-sha1','require-resource-pack','resource-pack-prompt',
  'server-ip','query.port','enable-query','enable-rcon','rcon.port','broadcast-rcon-to-ops','network-compression-threshold',
  'rate-limit','level-name','level-seed','level-type','spawn-radius','max-tick-time',
])

function safeProperties(raw: string) {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i <= 0) continue
    const key = trimmed.slice(0, i)
    if (SAFE_SETTING_PROPERTIES.has(key)) out[key] = trimmed.slice(i + 1)
  }
  return out
}

async function runPolledCommand(
  server: { id: string; userId: string; nodeId: string },
  type: string,
  payload: Record<string, unknown> = {},
  timeoutMs = BRIDGE_TIMEOUT_MS,
  bridgeRead = true,
) {
  const [command] = await db.insert(agentCommands).values({
    userId: server.userId,
    nodeId: server.nodeId,
    serverId: server.id,
    type,
    payload: { ...payload, _bridgeRead: bridgeRead },
  }).returning({ id: agentCommands.id })
  if (!command) throw new Error('Agent polling komutu oluşturulamadı.')

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = (await db.select({ status: agentCommands.status, result: agentCommands.result }).from(agentCommands).where(eq(agentCommands.id, command.id)).limit(1))[0]
    if (!row) break
    if (row.status === 'completed') return row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : {}
    if (row.status === 'failed') {
      const result = row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : {}
      throw new Error(String(result.error ?? `Agent komutu başarısız: ${type}`))
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`Agent polling komutu zaman aşımına uğradı: ${type}`)
}

type PollServer = { id: string; userId: string; nodeId: string; worldName: string; playerCount: number; status: string }

function unsupportedCommand(error: unknown) {
  return /unsupported command|desteklenmeyen.*(komut|işlem)|henüz.*desteklenmiyor/i.test(error instanceof Error ? error.message : String(error ?? ''))
}

async function legacyReadFile(server: PollServer, path: string) {
  try {
    const result = await runPolledCommand(server, 'read-file', { path }, 12_000)
    return typeof result.content === 'string' ? result.content : ''
  } catch { return '' }
}

async function legacyJsonList(server: PollServer, path: string) {
  const raw = await legacyReadFile(server, path)
  if (!raw) return [] as Array<Record<string, unknown>>
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : []
  } catch { return [] as Array<Record<string, unknown>> }
}

type LegacyFile = { name: string; path: string; directory: boolean; size: number; updatedAt?: string | null }

async function legacyListFiles(server: PollServer, path = '.') {
  try {
    const result = await runPolledCommand(server, 'list-files', { path }, 12_000)
    return (Array.isArray(result.files) ? result.files : []).map(raw => {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      return { name: String(item.name ?? ''), path: String(item.path ?? ''), directory: item.directory === true, size: Math.max(0, Number(item.size ?? 0) || 0), updatedAt: item.updatedAt ? String(item.updatedAt) : null }
    }).filter(item => item.name && item.path) as LegacyFile[]
  } catch { return [] as LegacyFile[] }
}

function legacyFileType(path: string, directory: boolean) {
  if (directory) return 'Folder'
  const dot = path.lastIndexOf('.')
  const ext = dot >= 0 ? path.slice(dot + 1).toUpperCase() : ''
  return ext && ext.length <= 8 ? ext : 'File'
}

function legacyCategory(path: string, directory: boolean) {
  const normalized = path.replaceAll('\\\\', '/').replace(/^\.?\//, '')
  const parts = normalized.toLowerCase().split('/').filter(Boolean)
  const first = parts[0] ?? ''
  if (first === 'mods') return 'mods'
  if (first === 'plugins') return !directory && parts.length === 2 && normalized.toLowerCase().endsWith('.jar') ? 'plugins' : 'plugin-config'
  if (first === 'config' || first === 'configs') return 'config'
  if (first === 'resourcepacks' || first === 'resource-packs') return 'resource-packs'
  if (first === 'backups' || first === 'backup') return 'backups'
  if (first === 'logs') return 'logs'
  if (first === 'world' || first.endsWith('_nether') || first.endsWith('_the_end')) return 'worlds'
  return 'server-files'
}

function legacyEditable(path: string, directory: boolean, size: number) {
  return !directory && size <= 512 * 1024 && /\.(yml|yaml|json|properties|toml|ini|cfg|conf|txt|md|log|xml|mcmeta|mcfunction)$/i.test(path)
}

async function legacyInventory(server: PollServer) {
  const found = new Map<string, LegacyFile>()
  const add = (items: LegacyFile[]) => { for (const item of items) if (item.path && !item.path.startsWith('.blockctrl-')) found.set(item.path.replaceAll('\\\\', '/'), item) }
  const root = await legacyListFiles(server, '.')
  add(root)
  const skipped = new Set(['libraries','versions','.cache','.downloads','.direct-uploads','.blockctrl-quarantine'])
  const firstDirs = root.filter(item => item.directory && !skipped.has(item.name.toLowerCase())).slice(0, 40)
  const firstRows = await Promise.all(firstDirs.map(dir => legacyListFiles(server, dir.path)))
  firstRows.forEach(add)
  const worldRoots = new Set<string>()
  firstDirs.forEach((dir, index) => {
    const children = firstRows[index] ?? []
    const lower = dir.name.toLowerCase()
    if (children.some(child => child.name.toLowerCase() === 'level.dat') || lower === server.worldName.toLowerCase() || lower.endsWith('_nether') || lower.endsWith('_the_end')) worldRoots.add(dir.path)
  })
  const deepTargets: string[] = []
  for (const rows of firstRows) for (const child of rows) {
    if (!child.directory) continue
    const first = child.path.split('/')[0]?.toLowerCase()
    if (worldRoots.has(child.path.split('/')[0]) || first === 'plugins' || first === 'config' || first === 'configs') deepTargets.push(child.path)
  }
  const uniqueDeep = [...new Set(deepTargets)].slice(0, 80)
  const deepRows = await Promise.all(uniqueDeep.map(target => legacyListFiles(server, target)))
  deepRows.forEach(add)
  const items = [...found.values()].map(item => ({
    path: item.path.replaceAll('\\\\', '/'), name: item.name, type: legacyFileType(item.path, item.directory), category: legacyCategory(item.path, item.directory), directory: item.directory,
    sizeBytes: item.directory ? 0 : item.size, modifiedAt: item.updatedAt ?? null, permissions: null, editable: legacyEditable(item.path, item.directory, item.size), source: 'legacy-agent-disk',
  })).sort((a,b) => a.path.localeCompare(b.path, 'tr'))
  return { items, scannedAt: new Date().toISOString(), truncated: uniqueDeep.length >= 80, source: 'legacy-polling-disk' }
}

function safePlayerNameFallback(value: unknown) {
  const name = String(value ?? '').trim()
  return /^[A-Za-z0-9_]{1,16}$/.test(name) ? name : null
}

async function legacyPlayers(server: PollServer) {
  const [cache, ops, whitelist, bans, properties] = await Promise.all([legacyJsonList(server, 'usercache.json'), legacyJsonList(server, 'ops.json'), legacyJsonList(server, 'whitelist.json'), legacyJsonList(server, 'banned-players.json'), legacyReadFile(server, 'server.properties')])
  const props: Record<string,string> = {}
  for (const line of properties.split(/\r?\n/)) { const trimmed=line.trim(); const at=trimmed.indexOf('='); if(trimmed && !trimmed.startsWith('#') && at>0) props[trimmed.slice(0,at)]=trimmed.slice(at+1) }
  const rows = new Map<string, Record<string, unknown>>()
  const ensure = (rawName: unknown, rawUuid?: unknown) => {
    const playerName=safePlayerNameFallback(rawName); if(!playerName) return null; const key=playerName.toLowerCase()
    const row=rows.get(key) ?? {playerName,playerUuid:null,isOnline:false,isOp:false,whitelisted:false,banned:false,banReason:null,banExpiresAt:null}
    const uuid=String(rawUuid ?? '').trim(); if(uuid && !row.playerUuid) row.playerUuid=uuid; rows.set(key,row); return row
  }
  for(const item of cache) ensure(item.name,item.uuid)
  for(const item of whitelist){const row=ensure(item.name,item.uuid);if(row)row.whitelisted=true}
  for(const item of ops){const row=ensure(item.name,item.uuid);if(row){row.isOp=true;row.opLevel=Number(item.level)||null;row.bypassesPlayerLimit=item.bypassesPlayerLimit===true}}
  for(const item of bans){const row=ensure(item.name,item.uuid);if(row){row.banned=true;row.banReason=String(item.reason??'').slice(0,300)||null;const expires=String(item.expires??'');row.banExpiresAt=expires&&expires.toLowerCase()!=='forever'&&!Number.isNaN(Date.parse(expires))?new Date(expires).toISOString():null}}

  let onlineNames:string[]=[]
  let verified=false
  let liveCount=Math.max(0,server.playerCount||0)
  let liveMax=Math.max(0,Number(props['max-players']??0)||0)||null
  if(server.status==='running'){
    try{
      const requestedAt=new Date()
      await runPolledCommand(server,'list-players',{},8_000)
      const deadline=Date.now()+3_000
      while(Date.now()<deadline&&!verified){
        const logs=await db.select({line:consoleLogs.line,createdAt:consoleLogs.createdAt}).from(consoleLogs).where(eq(consoleLogs.serverId,server.id)).orderBy(desc(consoleLogs.createdAt)).limit(40)
        for(const log of logs){
          if(log.createdAt.getTime()<requestedAt.getTime()-2_000)continue
          const line=String(log.line??'')
          const match=line.match(/There are\s+(\d+)\s+of a max of\s+(\d+)\s+players online:\s*(.*)$/i)??line.match(/There are\s+(\d+)\s*\/\s*(\d+)\s+players online:?\s*(.*)$/i)
          if(!match)continue
          liveCount=Math.max(0,Number(match[1])||0)
          liveMax=Math.max(0,Number(match[2])||0)||liveMax
          onlineNames=match[3].split(',').map(name=>name.trim()).map(safePlayerNameFallback).filter((name):name is string=>!!name)
          verified=true
          break
        }
        if(!verified)await new Promise(resolve=>setTimeout(resolve,250))
      }
    }catch{}
  }
  for(const name of onlineNames){const row=ensure(name);if(row)row.isOnline=true}
  return { running:server.status==='running', onlineVerified:verified, onlineSource:verified?'minecraft-list-command':'panel-player-count-fallback', onlineNames, playerCount:liveCount, maxPlayers:liveMax, whitelistEnabled:String(props['white-list']??'false')==='true', players:[...rows.values()].sort((a,b)=>Number(Boolean(b.isOnline))-Number(Boolean(a.isOnline))||String(a.playerName).localeCompare(String(b.playerName),'tr')), syncedAt:new Date().toISOString(), source:'legacy-player-files' }
}

function legacyWorldsFromInventory(server: PollServer, inventory: Awaited<ReturnType<typeof legacyInventory>>) {
  const items=Array.isArray(inventory.items)?inventory.items:[]
  const roots=new Map<string,{hasLevel:boolean;bytes:number;modifiedAt:string|null}>()
  for(const item of items){const path=String(item.path??'');const first=path.split('/')[0];if(!first)continue;const state=roots.get(first)??{hasLevel:false,bytes:0,modifiedAt:null};if(path.toLowerCase()===(first.toLowerCase()+'/level.dat'))state.hasLevel=true;if(!item.directory)state.bytes+=Math.max(0,Number(item.sizeBytes??0)||0);if(item.modifiedAt&&(!state.modifiedAt||Date.parse(String(item.modifiedAt))>Date.parse(state.modifiedAt)))state.modifiedAt=String(item.modifiedAt);roots.set(first,state)}
  const worlds=[...roots.entries()].filter(([name,state])=>state.hasLevel||name===server.worldName||name.endsWith('_nether')||name.endsWith('_the_end')).map(([name,state])=>{const lower=name.toLowerCase();const environment=lower.endsWith('_nether')||lower==='nether'?'the_nether':lower.endsWith('_the_end')||lower==='end'?'the_end':'overworld';return{name,folderName:name,environment,sizeMb:Number((state.bytes/1048576).toFixed(2)),sizeBytes:state.bytes,seed:null,isActive:name===server.worldName,defaultWorld:name===server.worldName,prepared:false,hasLevelDat:state.hasLevel,modifiedAt:state.modifiedAt,source:'legacy-polling-disk'}}).sort((a,b)=>Number(b.isActive)-Number(a.isActive)||a.name.localeCompare(b.name,'tr'))
  return {worlds,defaultWorld:server.worldName,activeWorld:server.worldName,scannedAt:new Date().toISOString(),source:'legacy-polling-disk'}
}

async function legacyBackupRows(server: PollServer) {
  const [commands,serverBackups,serverBackupSingular]=await Promise.all([
    db.select({type:agentCommands.type,result:agentCommands.result,createdAt:agentCommands.createdAt}).from(agentCommands).where(and(eq(agentCommands.serverId,server.id),eq(agentCommands.status,'completed'))).orderBy(desc(agentCommands.createdAt)).limit(250),
    legacyListFiles(server,'backups'),
    legacyListFiles(server,'backup'),
  ])
  const rows:Array<Record<string,unknown>>=[]
  try{
    const legacyList=await runPolledCommand(server,'LIST_BACKUPS',{},15_000)
    const discovered=Array.isArray(legacyList.backups)?legacyList.backups:Array.isArray(legacyList.items)?legacyList.items:[]
    for(const raw of discovered){
      if(!raw||typeof raw!=='object')continue
      const item=raw as Record<string,unknown>
      const path=String(item.path??item.filename??item.name??'').trim()
      if(!path)continue
      const name=String(item.name??item.filename??path.split(/[\\/]/).pop()??path)
      rows.push({
        name,path,
        sizeBytes:Math.max(0,Number(item.sizeBytes??item.size??0)||0),
        createdAt:String(item.createdAt??item.modifiedAt??new Date().toISOString()),
        source:String(item.source??'legacy-node-backups'),
        type:String(item.type??(name.toLowerCase().includes('scheduled')?'scheduled':'external')),
        status:String(item.status??'completed'),
        restorable:item.restorable!==false,
      })
    }
  }catch{}
  for(const command of commands){
    if(!['backup','CREATE_BACKUP','CREATE_WORLD_BACKUP','backup-copy'].includes(command.type))continue
    const result=command.result&&typeof command.result==='object'?command.result as Record<string,unknown>:{}
    const path=String(result.path??result.filename??'')
    if(path)rows.push({name:path.split(/[\\/]/).pop()||path,path,sizeBytes:Number(result.sizeBytes??0)||0,createdAt:command.createdAt.toISOString(),source:'command-history',status:'completed',restorable:true})
  }
  for(const item of [...serverBackups,...serverBackupSingular]){
    if(item.directory||!(/\.(zip|tar|tar\.gz|tgz|gz)$/i.test(item.name)))continue
    rows.push({name:item.name,path:item.path,sizeBytes:item.size,createdAt:item.updatedAt,source:'server-disk',status:'completed',restorable:false})
  }

  // Older Oracle agents store panel backups under DATA_DIR/backups, outside the
  // managed Minecraft server root. They cannot enumerate that directory through
  // list-files, but backup-verify with no path resolves the newest physical
  // archive belonging to this server. Surface it so the panel does not show an
  // empty backup list when a real archive already exists on the node.
  try{
    const latest=await runPolledCommand(server,'backup-verify',{},15_000)
    if(latest.verified===true){
      const filename=String(latest.filename??'').trim()
      if(filename)rows.push({
        name:filename,
        path:filename,
        sizeBytes:Math.max(0,Number(latest.sizeBytes??0)||0),
        createdAt:String(latest.modifiedAt??new Date().toISOString()),
        source:'node-backup-root',
        type:filename.toLowerCase().includes('scheduled')?'scheduled':'external',
        status:'completed',
        restorable:true,
        verified:true,
        sha256:String(latest.sha256??'')||null,
      })
    }
  }catch{}

  const seen=new Set<string>()
  return rows.filter(row=>{
    const key=String(row.path??row.name??'')
    if(!key||seen.has(key))return false
    seen.add(key)
    return true
  }).sort((a,b)=>Date.parse(String(b.createdAt??''))-Date.parse(String(a.createdAt??'')))
}

async function commandBridgeFetch(nodeId: string, path: string, init: RequestInit = {}) {
  const method = String(init.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new Error(`Agent polling köprüsü ${method} isteğini desteklemiyor.`)
  const url = new URL(path.startsWith('/') ? path : `/${path}`, 'http://blockctrl-agent.local')
  if (!url.pathname.startsWith('/internal/')) throw new Error('Agent polling köprüsü yalnız internal agent yollarını destekliyor.')
  const body = bridgeBody(init)
  const serverId = String(url.searchParams.get('serverId') ?? body.serverId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) throw new Error('Agent polling köprüsü için geçerli serverId gerekli.')

  const server = (await db.select({ id: servers.id, userId: servers.userId, nodeId: servers.nodeId, worldName: servers.worldName, playerCount: servers.playerCount, status: servers.status }).from(servers).where(and(eq(servers.id, serverId), eq(servers.nodeId, nodeId))).limit(1))[0]
  if (!server) throw new Error('Agent polling köprüsü için sunucu/node eşleşmesi bulunamadı.')

  const pathname = url.pathname

  if (pathname === '/internal/settings/status' && method === 'GET') {
    try { return jsonResponse(await runPolledCommand(server, 'settings-status', { includeOptimizationMods: url.searchParams.get('optimizationMods') === '1' }, 35_000)) }
    catch (error) { if (!unsupportedCommand(error)) throw error }
    const [result,metaRaw] = await Promise.all([
      runPolledCommand(server, 'read-file', { path: 'server.properties' }),
      legacyReadFile(server, 'blockctrl.json'),
    ])
    const content = String(result.content ?? '')
    let meta:Record<string,unknown>={};try{meta=metaRaw?JSON.parse(metaRaw) as Record<string,unknown>:{} }catch{meta={}}
    return jsonResponse({ ready: true, properties: safeProperties(content), meta, runtime:{itemTrackingEnabled:meta.itemTrackingEnabled===true,itemTrackingMode:String(meta.itemTrackingMode??'disabled'),trackerAdapter:String(meta.trackerAdapter??'legacy-agent')}, running: server.status==='running', readAt: new Date().toISOString(), source: 'polling-bridge' })
  }

  if (pathname === '/internal/worlds/templates' && method === 'GET') {
    return jsonResponse({ root: null, packages: [], source: 'polling-bridge' })
  }

  if (pathname === '/internal/worlds/status' && method === 'GET') {
    try { const polled=await runPolledCommand(server,'worlds-status'); if(Array.isArray(polled.worlds))return jsonResponse(polled) } catch (error) { if(!unsupportedCommand(error)) console.warn('[node-bridge] worlds-status polling failed; legacy disk discovery will be used') }
    const inventory=await legacyInventory(server); const discovered=legacyWorldsFromInventory(server,inventory); if(discovered.worlds.length)return jsonResponse(discovered)
    const rows = await db.select().from(worldsTable).where(eq(worldsTable.serverId, server.id))
    return jsonResponse({ worlds: rows.map(row => ({ name: row.name, folderName:row.name, environment:row.name.endsWith('_nether')?'the_nether':row.name.endsWith('_the_end')?'the_end':'overworld', isActive: row.isActive, sizeMb: row.sizeMb, sizeBytes:Math.round(row.sizeMb*1048576), seed: row.seed ?? null, prepared:false, updatedAt:row.createdAt?.toISOString?.()??null, source:'database-last-resort' })), activeWorld:server.worldName, defaultWorld:server.worldName, scannedAt:new Date().toISOString(), source:'database-last-resort' })
  }

  if (pathname === '/internal/players/status' && method === 'GET') {
    try { return jsonResponse(await runPolledCommand(server, 'player-details')) }
    catch (error) { if (!unsupportedCommand(error)) throw error; return jsonResponse(await legacyPlayers(server)) }
  }
  if (pathname === '/internal/players/action' && method === 'POST') {
    return jsonResponse(await runPolledCommand(server, 'player-action', body, BRIDGE_TIMEOUT_MS, false))
  }

  if (pathname === '/internal/security/status' && method === 'GET') {
    return jsonResponse(await runPolledCommand(server, 'security-scan', { serverPort: body.serverPort }, 35_000))
  }
  if (pathname === '/internal/security/scan' && method === 'POST') {
    return jsonResponse(await runPolledCommand(server, 'security-scan', { serverPort: body.serverPort, previousHashes: body.previousHashes }, 45_000, false))
  }

  if (pathname === '/internal/content/inventory' && method === 'GET') {
    try { return jsonResponse(await runPolledCommand(server,'file-inventory')) }
    catch (error) { if(!unsupportedCommand(error))throw error; return jsonResponse(await legacyInventory(server)) }
  }
  if (pathname === '/internal/content/create-file' && method === 'POST') {
    try { return jsonResponse(await runPolledCommand(server,'file-create',{path:body.path,content:String(body.content??'')},BRIDGE_TIMEOUT_MS,false),201) }
    catch (error) { if(!unsupportedCommand(error))throw error; return jsonResponse(await runPolledCommand(server,'write-file',{path:body.path,content:String(body.content??'')},BRIDGE_TIMEOUT_MS,false),201) }
  }
  if (pathname === '/internal/content/create-folder' && method === 'POST') {
    try { return jsonResponse(await runPolledCommand(server,'folder-create',{path:body.path},BRIDGE_TIMEOUT_MS,false),201) }
    catch (error) { if(!unsupportedCommand(error))throw error; return jsonResponse(await runPolledCommand(server,'create-folder',{path:body.path},BRIDGE_TIMEOUT_MS,false),201) }
  }
  if (pathname === '/internal/content/read' && method === 'GET') {
    const target=String(url.searchParams.get('path')??'')
    try { const result=await runPolledCommand(server,'file-read',{path:target}); return jsonResponse({...result,size:Number(result.sizeBytes??0)}) }
    catch (error) { if(!unsupportedCommand(error))throw error; return jsonResponse(await runPolledCommand(server,'read-file',{path:target})) }
  }
  if (pathname === '/internal/content/write' && method === 'POST') {
    try { return jsonResponse(await runPolledCommand(server,'file-write',{path:body.path,content:body.content},BRIDGE_TIMEOUT_MS,false)) }
    catch (error) { if(!unsupportedCommand(error))throw error; return jsonResponse(await runPolledCommand(server,'write-file',{path:body.path,content:body.content},BRIDGE_TIMEOUT_MS,false)) }
  }
  if (pathname === '/internal/content/delete' && method === 'POST') {
    try { return jsonResponse(await runPolledCommand(server,'file-delete',{path:body.path},BRIDGE_TIMEOUT_MS,false)) }
    catch (error) { if(!unsupportedCommand(error))throw error; return jsonResponse(await runPolledCommand(server,'delete-file',{path:body.path},BRIDGE_TIMEOUT_MS,false)) }
  }

  if (pathname === '/internal/console/status' && method === 'GET') {
    const [live, startup] = await Promise.all([
      runPolledCommand(server, 'agent-logs'),
      runPolledCommand(server, 'server-startup-logs'),
    ])
    return jsonResponse({ ...live, startup: startup.startup ?? { stdout: [], stderr: [] } })
  }

  if (pathname === '/internal/backups/list' && method === 'GET') {
    try { return jsonResponse(await runPolledCommand(server,'backup-list')) }
    catch (error) { if(!unsupportedCommand(error))console.warn('[node-bridge] backup-list failed; using history fallback'); return jsonResponse({backups:await legacyBackupRows(server),source:'polling-history-fallback'}) }
  }
  if (pathname === '/internal/backups/create' && method === 'POST') {
    const payload={label:String(body.label??'manual'),kind:String(body.kind??'full')}
    try { return jsonResponse(await runPolledCommand(server,'backup',payload,45_000,false),201) }
    catch (error) { if(!unsupportedCommand(error))throw error; return jsonResponse(await runPolledCommand(server,'CREATE_BACKUP',payload,45_000,false),201) }
  }
  if (pathname === '/internal/sftp/status' && method === 'GET') return jsonResponse(await runPolledCommand(server, 'sftp-test'))
  if (pathname === '/internal/sftp/provision' && method === 'POST') return jsonResponse(await runPolledCommand(server, 'provision-sftp', {}, BRIDGE_TIMEOUT_MS, false), 201)
  if (pathname === '/internal/sftp/enable' && method === 'POST') return jsonResponse(await runPolledCommand(server, 'sftp-enable', {}, BRIDGE_TIMEOUT_MS, false))
  if (pathname === '/internal/sftp/disable' && method === 'POST') return jsonResponse(await runPolledCommand(server, 'sftp-disable', {}, BRIDGE_TIMEOUT_MS, false))
  if (pathname === '/internal/sftp/delete' && method === 'POST') return jsonResponse(await runPolledCommand(server, 'sftp-delete', {}, BRIDGE_TIMEOUT_MS, false))
  if (pathname === '/internal/sftp/sessions' && method === 'GET') return jsonResponse(await runPolledCommand(server, 'sftp-session-list'))
  if (pathname === '/internal/sftp/sessions/terminate' && method === 'POST') return jsonResponse(await runPolledCommand(server, 'sftp-session-terminate', { pid: body.pid }, BRIDGE_TIMEOUT_MS, false))

  if (pathname === '/internal/security/module' && method === 'POST') {
    const key = String(body.key ?? '')
    const enabled = Boolean(body.enabled)
    if (key === 'premium-auth') return jsonResponse(await runPolledCommand(server, 'set-properties', { 'online-mode': enabled }, BRIDGE_TIMEOUT_MS, false))
    if (key === 'whitelist') return jsonResponse(await runPolledCommand(server, 'set-properties', { 'white-list': enabled, 'enforce-whitelist': enabled }, BRIDGE_TIMEOUT_MS, false))
    if (key === 'rcon-protection' && enabled) return jsonResponse(await runPolledCommand(server, 'set-properties', { 'enable-rcon': false }, BRIDGE_TIMEOUT_MS, false))
    if (key === 'sftp-protection') return jsonResponse(await runPolledCommand(server, enabled ? 'sftp-enable' : 'sftp-disable', {}, BRIDGE_TIMEOUT_MS, false))
  }

  throw new Error(`Bu agent işlemi için direct URL gerekli: ${method} ${pathname}`)
}

export async function nodeFetch(nodeId: string, path: string, init: RequestInit = {}) {
  let config: NodeConfig | null = null
  let directError: unknown = null
  try {
    config = getNodeConfig(nodeId)
  } catch (error) {
    directError = error
  }

  if (config && !placeholderAgentUrl(config.baseUrl)) {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${config.token}`)
    headers.set('x-node-id', nodeId)
    headers.set('accept', 'application/json')
    const endpoint = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    try {
      const response = await fetch(endpoint, { ...init, headers, cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!response.ok) {
        console.warn(`[node-bridge] ${new URL(config.baseUrl).hostname} ${response.status} ${path}`)
        if (response.status === 404 && (path.startsWith('/internal/content/create-file') || path.startsWith('/internal/content/create-folder'))) return await commandBridgeFetch(nodeId, path, init)
      }
      return response
    } catch (error) {
      directError = error
      console.warn(`[node-bridge] direct agent unavailable; polling bridge fallback: ${path}`)
    }
  }

  try {
    return await commandBridgeFetch(nodeId, path, init)
  } catch (bridgeError) {
    if (directError instanceof Error) throw new Error(`${directError.message}; polling bridge: ${bridgeError instanceof Error ? bridgeError.message : 'başarısız'}`, { cause: bridgeError })
    throw bridgeError
  }
}

export function nodePublicHost(nodeId: string): string | null {
  const hosts = parseMap('NODE_PUBLIC_HOSTS')
  const explicit = hosts[nodeId] ?? process.env.NODE_PUBLIC_HOST ?? process.env.NODE_PUBLIC_IP ?? process.env.HOSTING_PUBLIC_IP ?? process.env.PUBLIC_IP ?? ''
  const configured = parseMap('NODE_AGENT_URLS')[nodeId] ?? process.env.NODE_AGENT_BASE_URL ?? process.env.NODE_UPLOAD_URL ?? process.env.NODE_DOWNLOAD_URL ?? ''
  const value = explicit.trim() || configured.trim()
  if (!value) return null
  try {
    const parsed = new URL(value.includes('://') ? value : `http://${value}`)
    return placeholderAgentUrl(parsed.toString()) ? null : parsed.hostname
  } catch { return null }
}

export function nodeDiagnosticMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Node bağlantısı kurulamadı'
}
