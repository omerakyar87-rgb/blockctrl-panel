import { NextRequest, NextResponse } from 'next/server'
import { getPanelActor } from '@/lib/api-auth'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, ensurePanelSchema } from '@/lib/db'
import { agentCommands, auditLog, nodes, serverPermissions, serverSettings, serverMetrics, servers } from '@/lib/db/schema'
import { nodeDiagnosticMessage, nodeFetch } from '@/lib/node-bridge'

const SETTINGS_COMMAND_TYPES = ['set-properties', 'change-port', 'performance-apply', 'performance-restore', 'runtime-enable', 'runtime-disable', 'optimization-mod-install', 'optimization-mod-remove']

const LIVE_CAPABILITIES = ['properties', 'port', 'panel-metadata', 'runtime-memory', 'logs', 'console-diagnostics', 'file-browser', 'bulk-download', 'firewall']

const PROPERTY_KEYS: Record<string, string> = {
  motd: 'motd',
  maxPlayers: 'max-players',
  gamemode: 'gamemode',
  difficulty: 'difficulty',
  hardcore: 'hardcore',
  pvp: 'pvp',
  allowFlight: 'allow-flight',
  whitelist: 'white-list',
  onlineMode: 'online-mode',
  forceGamemode: 'force-gamemode',
  spawnProtection: 'spawn-protection',
  commandBlocks: 'enable-command-block',
  allowNether: 'allow-nether',
  spawnAnimals: 'spawn-animals',
  spawnMonsters: 'spawn-monsters',
  spawnNpc: 'spawn-npcs',
  generateStructures: 'generate-structures',
  viewDistance: 'view-distance',
  simulationDistance: 'simulation-distance',
  playerIdleTimeout: 'player-idle-timeout',
  maxWorldSize: 'max-world-size',
  entityBroadcastRange: 'entity-broadcast-range-percentage',
  functionPermissionLevel: 'function-permission-level',
  operatorPermissionLevel: 'op-permission-level',
  hideOnlinePlayers: 'hide-online-players',
  enforceWhitelist: 'enforce-whitelist',
  enforceSecureProfile: 'enforce-secure-profile',
  acceptTransfers: 'accepts-transfers',
  enableStatus: 'enable-status',
  resourcePackUrl: 'resource-pack',
  resourcePackSha1: 'resource-pack-sha1',
  resourcePackRequired: 'require-resource-pack',
  resourcePackPrompt: 'resource-pack-prompt',
  serverIp: 'server-ip',
  queryPort: 'query.port',
  enableQuery: 'enable-query',
  enableRcon: 'enable-rcon',
  rconPort: 'rcon.port',
  broadcastRcon: 'broadcast-rcon-to-ops',
  networkCompressionThreshold: 'network-compression-threshold',
  rateLimit: 'rate-limit',
  worldName: 'level-name',
  seed: 'level-seed',
  worldType: 'level-type',
  worldGenerateStructures: 'generate-structures',
  worldAllowNether: 'allow-nether',
  spawnRadius: 'spawn-radius',
  playerWhitelist: 'white-list',
  maxOpLevel: 'op-permission-level',
  afkTimeout: 'player-idle-timeout',
  maxTickTime: 'max-tick-time',
}

const WORLD_TYPE_TO_PROPERTY: Record<string, string> = {
  default: 'minecraft:normal',
  flat: 'minecraft:flat',
  largeBiomes: 'minecraft:large_biomes',
  amplified: 'minecraft:amplified',
}
const PROPERTY_TO_WORLD_TYPE = Object.fromEntries(Object.entries(WORLD_TYPE_TO_PROPERTY).map(([key, value]) => [value, key])) as Record<string, string>
const PROPERTY_TO_SETTING = Object.fromEntries(Object.entries(PROPERTY_KEYS).map(([key, value]) => [value, key])) as Record<string, string>
const PANEL_ONLY_KEYS = new Set(['serverName', 'maxRam', 'xmx', 'coverImageUrl', 'coverVideoUrl', 'coverGifUrl', 'serverSubtitle', 'cardTheme', 'cardTransition', 'hostname', 'srvRecord'])
const SPECIAL_AGENT_KEYS = new Set(['serverPort'])
const WRITABLE_KEYS = new Set([...Object.keys(PROPERTY_KEYS), ...PANEL_ONLY_KEYS, ...SPECIAL_AGENT_KEYS])
const OFFLINE_REQUIRED_KEYS = new Set([...Object.keys(PROPERTY_KEYS), ...SPECIAL_AGENT_KEYS])
const BOOLEAN_KEYS = new Set([
  'hardcore', 'pvp', 'allowFlight', 'whitelist', 'onlineMode', 'forceGamemode', 'commandBlocks', 'allowNether',
  'spawnAnimals', 'spawnMonsters', 'spawnNpc', 'generateStructures', 'hideOnlinePlayers', 'enforceWhitelist',
  'enforceSecureProfile', 'acceptTransfers', 'enableStatus', 'resourcePackRequired', 'enableQuery', 'enableRcon',
  'broadcastRcon', 'worldGenerateStructures', 'worldAllowNether', 'playerWhitelist',
])
const NUMBER_KEYS = new Set([
  'maxPlayers', 'spawnProtection', 'viewDistance', 'simulationDistance', 'playerIdleTimeout', 'maxWorldSize',
  'entityBroadcastRange', 'functionPermissionLevel', 'operatorPermissionLevel', 'queryPort', 'rconPort',
  'networkCompressionThreshold', 'rateLimit', 'spawnRadius', 'maxOpLevel', 'afkTimeout', 'maxTickTime',
])
const SECRET_KEY = /(password|secret|token|api.?key|credential)/i
const KEY = /^[a-zA-Z][a-zA-Z0-9_-]{1,80}$/

function normalizeRole(role: unknown) {
  const value = String(role ?? '').toLowerCase()
  if (value === 'manager' || value === 'admin' || value === 'guide' || value === 'member') return value
  return 'member'
}
function isManager(role: unknown) { return normalizeRole(role) === 'manager' }
function scalar(v: unknown): v is string | number | boolean { return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' }
function parsePropertyValue(key: string, value: unknown): string | number | boolean {
  const raw = String(value ?? '')
  if (key === 'worldType') return PROPERTY_TO_WORLD_TYPE[raw] ?? raw.replace(/^minecraft:/, '')
  if (BOOLEAN_KEYS.has(key)) return raw === 'true'
  if (NUMBER_KEYS.has(key)) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return raw
}
function propertyValueForAgent(key: string, value: string | number | boolean) {
  if (key === 'worldType') return WORLD_TYPE_TO_PROPERTY[String(value)] ?? String(value)
  return value
}
function validServerName(value: string) { return value.length >= 2 && value.length <= 80 && !value.includes('..') && !/[\\/\0\x00-\x1F\x7F]/.test(value) }
function validHostname(value: string) {
  if (!value) return true
  if (value.length > 253 || value.startsWith('.') || value.endsWith('.')) return false
  return value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}

function validPanelMediaUrl(value: string) {
  if (!value) return true
  if (value.startsWith('/')) return true
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return process.env.NODE_ENV !== 'production' && url.protocol === 'http:'
  } catch {
    return false
  }
}
const CARD_TRANSITIONS = new Set(['fade', 'slide', 'zoom', 'none'])

function nodeIsFresh(lastHeartbeat: Date | null | undefined, status: string | null | undefined) {
  return status === 'online' && !!lastHeartbeat && Date.now() - new Date(lastHeartbeat).getTime() < 60_000
}
const SETTINGS_OFFLINE_STATUSES = new Set(['stopped', 'crashed', 'ready', 'failed'])

async function actor(){return getPanelActor()}

async function access(serverId: string, a: NonNullable<Awaited<ReturnType<typeof actor>>>) {
  const server = (await db.select().from(servers).where(eq(servers.id, serverId)).limit(1))[0]
  if (!server || server.status === 'deleted') return null
  const role=normalizeRole(a.role)
  const owner=server.userId===a.id
  if (isManager(role)) return { server, full:true, owner, permission:null, canView:true }
  const permission=(await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId,serverId),eq(serverPermissions.userId,a.id))).limit(1))[0]
  if(permission){const sections=Array.isArray(permission.sections)?permission.sections.map(String):[];return {server,full:false,owner,permission,canView:sections.includes('overview')||sections.includes('settings')}}
  if(role==='member'&&owner)return {server,full:false,owner:true,permission:null,canView:true}
  return null
}

function canEdit(x: NonNullable<Awaited<ReturnType<typeof access>>>) {
  if (x.full) return true
  return !!x.permission?.canReset
}

async function liveSettings(nodeId: string, serverId: string, includeMods = false) {
  try {
    const response = await nodeFetch(nodeId, `/internal/settings/status?serverId=${encodeURIComponent(serverId)}${includeMods ? "&optimizationMods=1" : ""}`, includeMods ? { signal: AbortSignal.timeout(25_000) } : {})
    const text = await response.text()
    let payload: Record<string, unknown> = {}
    try { payload = text ? JSON.parse(text) as Record<string, unknown> : {} } catch { payload = {} }
    if (!response.ok) return { ok: false as const, error: String(payload.error ?? `HTTP ${response.status}`), data: null }
    return { ok: true as const, error: null, data: payload }
  } catch (error) {
    return { ok: false as const, error: nodeDiagnosticMessage(error), data: null }
  }
}

export async function GET(request: NextRequest) {
  await ensurePanelSchema()
  const a = await actor()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!a.approved) return NextResponse.json({ error: 'Approval required' }, { status: 403 })
  const serverId = request.nextUrl.searchParams.get('serverId') || ''
  const x = await access(serverId, a)
  if (!x || !x.canView) return NextResponse.json({ error: 'Ayar görünümüne erişiminiz yok' }, { status: 403 })

  const [row, node, recent, metrics] = await Promise.all([
    db.select().from(serverSettings).where(eq(serverSettings.serverId, serverId)).limit(1).then(rows => rows[0]),
    db.select().from(nodes).where(eq(nodes.id, x.server.nodeId)).limit(1).then(rows => rows[0]),
    db.select().from(agentCommands).where(and(eq(agentCommands.serverId, serverId), inArray(agentCommands.type, SETTINGS_COMMAND_TYPES))).orderBy(desc(agentCommands.createdAt)).limit(40),
    db.select().from(serverMetrics).where(eq(serverMetrics.serverId, serverId)).orderBy(desc(serverMetrics.createdAt)).limit(1),
  ])

  const effective: Record<string, string | number | boolean> = {
    ...(row?.settings ?? {}),
    serverName: x.server.name,
    serverPort: x.server.port,
    maxRam: x.server.memoryMb,
    xmx: x.server.memoryMb,
    worldName: x.server.worldName,
  }
  const nodeOnline = nodeIsFresh(node?.lastHeartbeat, node?.status)
  let performance: Record<string, unknown> | null = null
  let runtimeOptimization: Record<string, unknown> | null = null
  let optimizationMods: Record<string, unknown> | null = null
  let liveSync = false
  let liveSyncError: string | null = null
  if (nodeOnline) {
    const live = await liveSettings(x.server.nodeId, serverId, request.nextUrl.searchParams.get('optimizationMods') === '1')
    liveSync = live.ok
    liveSyncError = live.error
    if (live.ok && live.data) {
      performance = live.data.performance as Record<string, unknown> | null ?? null
      runtimeOptimization = live.data.runtimeOptimization as Record<string, unknown> | null ?? null
      optimizationMods = live.data.optimizationMods as Record<string, unknown> | null ?? null
      const properties = live.data.properties && typeof live.data.properties === 'object' && !Array.isArray(live.data.properties)
        ? live.data.properties as Record<string, unknown>
        : {}
      for (const [propertyKey, rawValue] of Object.entries(properties)) {
        const settingKey = PROPERTY_TO_SETTING[propertyKey]
        if (!settingKey) continue
        effective[settingKey] = parsePropertyValue(settingKey, rawValue)
      }
    }
  }

  const settingsCommands = recent
  const pendingApply = settingsCommands.some(command => ['queued', 'processing', 'running'].includes(command.status))
  const latestSettingsCommand = settingsCommands[0]
  const lastFailure = latestSettingsCommand?.status === 'failed' ? latestSettingsCommand : null
  const canEditSettings = canEdit(x)
  const agentSettingsWritable = nodeOnline && SETTINGS_OFFLINE_STATUSES.has(x.server.status)
  const supportedKeys = [...WRITABLE_KEYS]
  const writableKeys = canEditSettings
    ? supportedKeys.filter(key => !OFFLINE_REQUIRED_KEYS.has(key) || agentSettingsWritable)
    : []

  return NextResponse.json({
    settings: effective,
    performance,
    runtimeOptimization,
    optimizationTarget: { loader: x.server.loader, minecraft: x.server.mcVersion },
    optimizationMods,
    canInstallOptimizationMods: x.full || !!(x.permission?.canReset && x.permission?.canFiles),
    latestMetric: metrics[0] ?? null,
    capabilities: LIVE_CAPABILITIES,
    supportedKeys,
    writableKeys,
    offlineRequiredKeys: [...OFFLINE_REQUIRED_KEYS],
    canEdit: canEditSettings,
    nodeOnline,
    serverStatus: x.server.status,
    agentSettingsWritable,
    liveSync,
    liveSyncError,
    pendingApply,
    nodeLastHeartbeat: node?.lastHeartbeat?.toISOString?.() ?? null,
    lastApply: latestSettingsCommand ? {
      id: latestSettingsCommand.id,
      status: latestSettingsCommand.status,
      type: latestSettingsCommand.type,
      createdAt: latestSettingsCommand.createdAt?.toISOString?.() ?? null,
      error: latestSettingsCommand.status === 'failed' ? String((latestSettingsCommand.result as Record<string, unknown> | null)?.error ?? 'Agent ayarı uygulayamadı') : null,
    } : null,
    lastApplyError: lastFailure ? String((lastFailure.result as Record<string, unknown> | null)?.error ?? 'Agent ayarı uygulayamadı') : null,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: NextRequest) {
  await ensurePanelSchema()
  const a = await actor()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!a.approved) return NextResponse.json({ error: 'Approval required' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const serverId = String(body.serverId || '')
  const x = await access(serverId, a)
  if (!x || !canEdit(x)) return NextResponse.json({ error: 'Ayarları değiştirme yetkiniz yok' }, { status: 403 })

  if (body.performanceAction !== undefined) {
    const action = String(body.performanceAction)
    const types: Record<string, string> = { 'runtime-enable': 'runtime-enable', 'runtime-disable': 'runtime-disable', 'mod-install': 'optimization-mod-install', 'mod-remove': 'optimization-mod-remove', restore: 'performance-restore' }
    if (!Object.hasOwn(types, action)) return NextResponse.json({ error: 'Geçersiz işlem. Mesafe azaltma profilleri kaldırıldı.' }, { status: 400 })
    const modAction = action.startsWith('mod-')
    if (modAction && !x.full && !(x.permission?.canReset && x.permission?.canFiles)) return NextResponse.json({ error: 'Mod kurulumu için dosya ve sıfırlama yetkisi gerekiyor.' }, { status: 403 })
    const profile = String(body.profile ?? '')
    if (action === 'runtime-enable' && !['balanced', 'memory'].includes(profile)) return NextResponse.json({ error: 'Geçersiz çalışma profili' }, { status: 400 })
    const key = String(body.key ?? ''), versionId = String(body.versionId ?? '')
    if (modAction && !['lithium', 'ferritecore', 'modernfix'].includes(key)) return NextResponse.json({ error: 'Geçersiz optimizasyon modu' }, { status: 400 })
    if (action === 'mod-install' && !/^[a-zA-Z0-9]{1,32}$/.test(versionId)) return NextResponse.json({ error: 'Geçerli mod sürümünü seçin' }, { status: 400 })
    const node = (await db.select().from(nodes).where(eq(nodes.id, x.server.nodeId)).limit(1))[0]
    if (!nodeIsFresh(node?.lastHeartbeat, node?.status) || !SETTINGS_OFFLINE_STATUSES.has(x.server.status)) return NextResponse.json({ error: 'Agent bağlı ve Minecraft sunucusu tamamen kapalı olmalı.' }, { status: 409 })
    const live = await liveSettings(x.server.nodeId, serverId)
    const runtime = live.data?.runtimeOptimization as Record<string, unknown> | undefined
    if (!live.ok || live.data?.running !== false || (action !== 'restore' && (runtime?.version !== 2 || runtime.error))) return NextResponse.json({ error: 'CPU/RAM optimizasyonu için agent güncellemesini tamamlayın ve sunucuyu durdurun.' }, { status: 409 })
    if (action === 'runtime-enable' && (runtime?.enabled || !runtime?.supported)) return NextResponse.json({ error: runtime?.enabled ? 'Önce etkin çalışma profilini geri alın.' : String(runtime?.reason ?? 'Başlatıcı desteklenmiyor') }, { status: 409 })
    const payload = action === 'runtime-enable' ? { profile, memoryMb: x.server.memoryMb } : modAction ? { key, versionId } : {}
    const [command] = await db.insert(agentCommands).values({ userId: x.server.userId, nodeId: x.server.nodeId, serverId, type: types[action], payload, status: 'queued' }).returning()
    await db.insert(auditLog).values({ userId: a.id, action: `server.performance.${action}`, resourceType: 'server', resourceId: serverId, details: { profile, key, versionId, commandId: command.id } })
    return NextResponse.json({ queued: true, commandId: command.id, message: 'İşlem agent kuyruğuna alındı; sonucu doğrulanınca gösterilecek.' }, { status: 202 })
  }

  const changes = body.changes && typeof body.changes === 'object' && !Array.isArray(body.changes)
    ? body.changes as Record<string, unknown>
    : {}
  const clean: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(changes)) {
    if (!KEY.test(key) || !scalar(value)) continue
    if (SECRET_KEY.test(key)) return NextResponse.json({ error: `${key} gibi gizli değerler panel veritabanında düz metin saklanmaz.` }, { status: 400 })
    if (!WRITABLE_KEYS.has(key)) return NextResponse.json({ error: `${key} bu ekrandan uygulanmıyor. İlgili yönetim sayfasını kullanın veya agent entegrasyonunu tamamlayın.` }, { status: 409 })
    if (typeof value === 'string' && value.length > 4000) return NextResponse.json({ error: `${key} değeri çok uzun` }, { status: 400 })
    if (typeof value === 'number' && !Number.isFinite(value)) return NextResponse.json({ error: `${key} geçersiz sayı` }, { status: 400 })
    clean[key] = value
  }
  if (!Object.keys(clean).length) return NextResponse.json({ error: 'Geçerli değişiklik yok' }, { status: 400 })

  const node = (await db.select().from(nodes).where(eq(nodes.id, x.server.nodeId)).limit(1))[0]
  const nodeOnline = nodeIsFresh(node?.lastHeartbeat, node?.status)
  const agentKeys = Object.keys(clean).filter(key => OFFLINE_REQUIRED_KEYS.has(key))
  if (agentKeys.length && !nodeOnline) {
    return NextResponse.json({ error: `Node çevrimdışı veya agent heartbeat alınamıyor. Bu ayarlar sunucuya uygulanmadan kaydedilmez: ${agentKeys.join(', ')}` }, { status: 409 })
  }
  if (agentKeys.length && !SETTINGS_OFFLINE_STATUSES.has(x.server.status)) {
    return NextResponse.json({ error: `Sunucuya yazılan ayarlar yalnız sunucu tamamen kapalıyken değiştirilebilir. Mevcut durum: ${x.server.status}.` }, { status: 409 })
  }

  for (const key of ['viewDistance', 'simulationDistance']) {
    if (key in clean && (!Number.isInteger(Number(clean[key])) || Number(clean[key]) < 2 || Number(clean[key]) > 32)) return NextResponse.json({ error: `${key} 2-32 arasında tam sayı olmalı.` }, { status: 400 })
  }

  if ('serverName' in clean) {
    const name = String(clean.serverName).trim()
    if (!validServerName(name)) return NextResponse.json({ error: 'Sunucu adı 2-80 karakter olmalı ve yol/kontrol karakteri içermemeli.' }, { status: 400 })
    clean.serverName = name
  }

  let memoryMb: number | null = null
  if ('maxRam' in clean || 'xmx' in clean) {
    const maxRam = 'maxRam' in clean ? Number(clean.maxRam) : null
    const xmx = 'xmx' in clean ? Number(clean.xmx) : null
    if (maxRam !== null && xmx !== null && maxRam !== xmx) return NextResponse.json({ error: 'Maksimum RAM ve Xmx aynı değeri temsil ediyor; iki değer farklı olamaz.' }, { status: 400 })
    memoryMb = Number(xmx ?? maxRam)
    if (!Number.isInteger(memoryMb) || memoryMb < 1024 || memoryMb > 65536) return NextResponse.json({ error: 'RAM 1024-65536 MB arasında tam sayı olmalı.' }, { status: 400 })
    clean.maxRam = memoryMb
    clean.xmx = memoryMb
  }

  if ('serverPort' in clean) {
    const port = Number(clean.serverPort)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return NextResponse.json({ error: 'Minecraft portu 1024-65535 arasında olmalı.' }, { status: 400 })
    const collisions = await db.select({ id: servers.id }).from(servers).where(and(eq(servers.nodeId, x.server.nodeId), eq(servers.port, port)))
    if (collisions.some(row => row.id !== serverId)) return NextResponse.json({ error: 'Bu port aynı node üzerinde başka bir sunucu tarafından kullanılıyor.' }, { status: 409 })
    clean.serverPort = port
  }

  if ('hostname' in clean) {
    const hostname = String(clean.hostname).trim().toLowerCase()
    if (!validHostname(hostname)) return NextResponse.json({ error: 'Domain/hostname geçersiz. Örnek: play.example.com' }, { status: 400 })
    clean.hostname = hostname
  }
  if ('srvRecord' in clean) {
    const srvRecord = String(clean.srvRecord).trim()
    if (srvRecord.length > 255) return NextResponse.json({ error: 'SRV kaydı en fazla 255 karakter olabilir.' }, { status: 400 })
    clean.srvRecord = srvRecord
  }

  for (const key of ['coverImageUrl', 'coverVideoUrl', 'coverGifUrl'] as const) {
    if (!(key in clean)) continue
    const value = String(clean[key]).trim()
    if (!validPanelMediaUrl(value)) return NextResponse.json({ error: `${key} için güvenli bir HTTPS URL veya uygulama içi yol kullanın.` }, { status: 400 })
    clean[key] = value
  }
  if ('serverSubtitle' in clean) {
    const value = String(clean.serverSubtitle).trim()
    if (value.length > 180) return NextResponse.json({ error: 'Sunucu açıklaması en fazla 180 karakter olabilir.' }, { status: 400 })
    clean.serverSubtitle = value
  }
  if ('cardTheme' in clean) {
    const value = String(clean.cardTheme).trim()
    if (value.length > 40) return NextResponse.json({ error: 'Kart teması en fazla 40 karakter olabilir.' }, { status: 400 })
    clean.cardTheme = value
  }
  if ('cardTransition' in clean) {
    const value = String(clean.cardTransition).trim().toLowerCase()
    if (!CARD_TRANSITIONS.has(value)) return NextResponse.json({ error: 'Kart geçişi fade, slide, zoom veya none olmalı.' }, { status: 400 })
    clean.cardTransition = value
  }

  const old = (await db.select().from(serverSettings).where(eq(serverSettings.serverId, serverId)).limit(1))[0]
  const panelApplied: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(clean)) {
    if (PANEL_ONLY_KEYS.has(key)) panelApplied[key] = value
  }
  if ('serverName' in clean) panelApplied.serverName = String(clean.serverName)
  if (memoryMb !== null) { panelApplied.maxRam = memoryMb; panelApplied.xmx = memoryMb }
  const merged: Record<string, string | number | boolean> = { ...(old?.settings ?? {}), ...panelApplied }

  if ('serverName' in clean) await db.update(servers).set({ name: String(clean.serverName), updatedAt: new Date() }).where(eq(servers.id, serverId))
  if (memoryMb !== null) await db.update(servers).set({ memoryMb, updatedAt: new Date() }).where(eq(servers.id, serverId))

  if (old) {
    await db.update(serverSettings).set({ settings: merged, capabilities: LIVE_CAPABILITIES, updatedBy: a.id, updatedAt: new Date() }).where(eq(serverSettings.serverId, serverId))
  } else {
    await db.insert(serverSettings).values({ serverId, userId: x.server.userId, settings: merged, capabilities: LIVE_CAPABILITIES, updatedBy: a.id })
  }

  const propertyPayload: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(clean)) {
    const propertyKey = PROPERTY_KEYS[key]
    if (propertyKey) propertyPayload[propertyKey] = propertyValueForAgent(key, value)
  }

  const commands: { id: string; type: string }[] = []
  if (Object.keys(propertyPayload).length) {
    const [command] = await db.insert(agentCommands).values({ userId: x.server.userId, nodeId: x.server.nodeId, serverId, type: 'set-properties', payload: propertyPayload, status: 'queued' }).returning()
    commands.push({ id: command.id, type: command.type })
  }
  if ('serverPort' in clean && Number(clean.serverPort) !== x.server.port) {
    const [command] = await db.insert(agentCommands).values({ userId: x.server.userId, nodeId: x.server.nodeId, serverId, type: 'change-port', payload: { port: Number(clean.serverPort) }, status: 'queued' }).returning()
    commands.push({ id: command.id, type: command.type })
  }

  await db.insert(auditLog).values({
    userId: a.id,
    action: 'server.settings.update',
    resourceType: 'server',
    resourceId: serverId,
    details: {
      keys: Object.keys(clean),
      before: Object.fromEntries(Object.keys(clean).map(key => [key, old?.settings?.[key]])),
      after: clean,
      commands,
    },
  })

  return NextResponse.json({
    ok: true,
    queued: commands.length > 0,
    commands,
    settings: merged,
    integrationPending: [],
    message: commands.length ? 'Sunucu ayarları agent kuyruğuna alındı; agent başarıyla uygulayana kadar uygulanmış sayılmaz.' : 'Panel ayarları kaydedildi.',
  }, { status: commands.length ? 202 : 200 })
}
