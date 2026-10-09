import { NextRequest, NextResponse } from 'next/server'
import { getPanelActor } from '@/lib/api-auth'
import { and, eq } from 'drizzle-orm'
import { db, ensurePanelSchema } from '@/lib/db'
import { auditLog, serverPermissions, servers } from '@/lib/db/schema'
import { nodeDiagnosticMessage, nodeFetch } from '@/lib/node-bridge'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_TEXT_SIZE = 2_000_000

async function currentActor(){return getPanelActor()}

async function authorizedServer(actor: NonNullable<Awaited<ReturnType<typeof currentActor>>>, serverId: string) {
  const server = (await db.select().from(servers).where(eq(servers.id, serverId)).limit(1))[0]
  if (!server) return null
  if (actor.role === 'manager' || actor.role === 'admin' || server.userId === actor.id) return server
  const permission = (await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId, serverId), eq(serverPermissions.userId, actor.id))).limit(1))[0]
  return permission?.canFiles ? server : null
}

function safeRelativePath(value: unknown) {
  const path = String(value ?? '').replace(/\\/g, '/').trim()
  if (!path || path.startsWith('/') || path.includes('\0') || path.split('/').some(part => part === '..')) return null
  return path.split('/').filter(part => part && part !== '.').join('/')
}

function normalizeInventory(data: Record<string, unknown>, scopedWorld = '') {
  const raw = Array.isArray(data.items) ? data.items : []
  const rows = raw.map(item => item && typeof item === 'object' ? item as Record<string, unknown> : {}).filter(item => item.path)
  const worldRoots = new Set<string>()
  for (const item of rows) {
    const path=String(item.path??'').replace(/\\/g,'/'); const parts=path.split('/').filter(Boolean); if(parts.length===2&&parts[1].toLowerCase()==='level.dat')worldRoots.add(parts[0])
  }
  if(scopedWorld)worldRoots.add(scopedWorld)
  const items=[] as Array<Record<string,unknown>>
  for(const item of rows){
    const path=String(item.path??'').replace(/\\/g,'/');const parts=path.split('/').filter(Boolean);if(!parts.length)continue;const first=parts[0].toLowerCase();const directory=item.directory===true||String(item.type??'').toLowerCase()==='folder';let category=''
    if(first==='mods')category='mods';else if(first==='plugins')category=!directory&&parts.length===2&&path.toLowerCase().endsWith('.jar')?'plugins':'plugin-config';else if(first==='config'||first==='configs')category='config';else if(first==='resourcepacks'||first==='resource-packs')category='resource-packs';else if(worldRoots.has(parts[0]))category=parts.length===1?'worlds':'world-file';else continue
    if(scopedWorld&&category!=='mods'&&category!=='plugins'&&category!=='plugin-config'&&category!=='config'&&category!=='resource-packs'&&parts[0]!==scopedWorld)continue
    items.push({name:String(item.name??parts.at(-1)??''),path,category,directory,size:Number(item.size??item.sizeBytes??0)||0,updatedAt:String(item.updatedAt??item.modifiedAt??new Date().toISOString()),editable:item.editable===true,source:'disk'})
  }
  return {...data,items}
}
async function nodeJson(nodeId: string, path: string, init: RequestInit = {}) {
  const response = await nodeFetch(nodeId, path, init)
  const text = await response.text()
  let data: Record<string, unknown> = {}
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {} } catch { data = { error: text.slice(0, 500) } }
  if (!response.ok) throw new Error(String(data.error ?? `Node içerik işlemi başarısız (${response.status})`))
  return data
}

export async function GET(request: NextRequest) {
  await ensurePanelSchema()
  const actor = await currentActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.approved) return NextResponse.json({ error: 'Approval required' }, { status: 403 })
  const serverId = request.nextUrl.searchParams.get('serverId') ?? ''
  const server = await authorizedServer(actor, serverId)
  if (!server) return NextResponse.json({ error: 'Sunucu bulunamadı veya dosya izniniz yok' }, { status: 404 })
  const requestedPath = request.nextUrl.searchParams.get('path')
  try {
    if (requestedPath) {
      const path = safeRelativePath(requestedPath)
      if (!path) return NextResponse.json({ error: 'Geçersiz dosya yolu' }, { status: 400 })
      const data = await nodeJson(server.nodeId, `/internal/content/read?serverId=${encodeURIComponent(server.id)}&path=${encodeURIComponent(path)}`)
      return NextResponse.json(data)
    }
    const world=request.nextUrl.searchParams.get('world')??''
    const data = await nodeJson(server.nodeId, `/internal/content/inventory?serverId=${encodeURIComponent(server.id)}${world?`&world=${encodeURIComponent(world)}`:''}`)
    return NextResponse.json({ ...normalizeInventory(data,world), serverRunning: server.status === 'running' })
  } catch (error) {
    return NextResponse.json({ error: nodeDiagnosticMessage(error), items: [] }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  await ensurePanelSchema()
  const actor = await currentActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.approved) return NextResponse.json({ error: 'Approval required' }, { status: 403 })
  const body = await request.json() as { serverId?: string; action?: 'create-file'|'create-folder'; path?: string; content?: unknown }
  const server = body.serverId ? await authorizedServer(actor, body.serverId) : null
  if (!server) return NextResponse.json({ error: 'Sunucu bulunamadı veya dosya izniniz yok' }, { status: 404 })
  const path = safeRelativePath(body.path)
  if (!path || !body.action || !['create-file','create-folder'].includes(body.action)) {
    return NextResponse.json({ error: 'Geçersiz dosya/klasör oluşturma isteği' }, { status: 400 })
  }
  if (body.action === 'create-file' && typeof body.content === 'string' && Buffer.byteLength(body.content, 'utf8') > MAX_TEXT_SIZE) {
    return NextResponse.json({ error: 'Yeni dosya 2 MB sınırını aşıyor' }, { status: 400 })
  }
  try {
    const endpoint = body.action === 'create-file' ? '/internal/content/create-file' : '/internal/content/create-folder'
    const data = await nodeJson(server.nodeId, endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverId: server.id, path, ...(body.action === 'create-file' ? { content: typeof body.content === 'string' ? body.content : '' } : {}) }),
      cache: 'no-store',
    })
    await db.insert(auditLog).values({ userId: actor.id, action: body.action === 'create-file' ? 'content.create-file' : 'content.create-folder', resourceType: 'server', resourceId: server.id, details: { path, live: server.status === 'running' } })
    return NextResponse.json({ ...data, serverRunning: server.status === 'running' }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: nodeDiagnosticMessage(error) }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest) {
  await ensurePanelSchema()
  const actor = await currentActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.approved) return NextResponse.json({ error: 'Approval required' }, { status: 403 })
  const body = await request.json() as { serverId?: string; path?: string; content?: unknown }
  const server = body.serverId ? await authorizedServer(actor, body.serverId) : null
  if (!server) return NextResponse.json({ error: 'Sunucu bulunamadı veya dosya izniniz yok' }, { status: 404 })
  if (server.status === 'running') return NextResponse.json({ error: 'Plugin/config düzenlemek için sunucuyu durdurun' }, { status: 409 })
  const path = safeRelativePath(body.path)
  if (!path || typeof body.content !== 'string' || Buffer.byteLength(body.content, 'utf8') > MAX_TEXT_SIZE) {
    return NextResponse.json({ error: 'Geçersiz dosya düzenleme isteği veya dosya 2 MB sınırını aşıyor' }, { status: 400 })
  }
  try {
    const data = await nodeJson(server.nodeId, '/internal/content/write', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId: server.id, path, content: body.content }), cache: 'no-store',
    })
    await db.insert(auditLog).values({ userId: actor.id, action: 'content.write', resourceType: 'server', resourceId: server.id, details: { path } })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: nodeDiagnosticMessage(error) }, { status: 502 })
  }
}

export async function DELETE(request: NextRequest) {
  await ensurePanelSchema()
  const actor = await currentActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.approved) return NextResponse.json({ error: 'Approval required' }, { status: 403 })
  const body = await request.json() as { serverId?: string; path?: string; confirm?: boolean }
  const server = body.serverId ? await authorizedServer(actor, body.serverId) : null
  if (!server) return NextResponse.json({ error: 'Sunucu bulunamadı veya dosya izniniz yok' }, { status: 404 })
  if (server.status === 'running') return NextResponse.json({ error: 'İçerik silmek için sunucuyu durdurun' }, { status: 409 })
  const path = safeRelativePath(body.path)
  if (!path || body.confirm !== true) return NextResponse.json({ error: 'Silme işlemi için geçerli yol ve onay gerekli' }, { status: 400 })
  try {
    const data = await nodeJson(server.nodeId, '/internal/content/delete', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId: server.id, path }), cache: 'no-store',
    })
    await db.insert(auditLog).values({ userId: actor.id, action: 'content.delete', resourceType: 'server', resourceId: server.id, details: { path } })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: nodeDiagnosticMessage(error) }, { status: 502 })
  }
}
