import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { alertRules, notifications, serverMetrics, servers } from '@/lib/db/schema'
import { resolvePanelUser } from '@/lib/db/identity'

async function actor() { const session = await auth.api.getSession({ headers: await headers() }); return session?.user ? resolvePanelUser(session.user) : null }
async function ownedServer(serverId: string, userId: string) { return (await db.select({ id: servers.id }).from(servers).where(and(eq(servers.id, serverId), eq(servers.userId, userId))).limit(1))[0] }
const metricSchema = z.object({ serverId: z.string().uuid(), cpuPercent: z.number().min(0).max(100).optional(), memoryUsedMb: z.number().int().min(0).optional(), memoryTotalMb: z.number().int().min(0).optional(), diskUsedGb: z.number().min(0).optional(), diskTotalGb: z.number().min(0).optional(), tps: z.number().min(0).max(100).nullable().optional(), mspt: z.number().min(0).nullable().optional(), players: z.number().int().min(0).optional(), uptimeSeconds: z.number().int().min(0).optional() })

export async function GET(request: NextRequest) {
  const user = await actor(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const serverId = request.nextUrl.searchParams.get('serverId') ?? ''
  if (!(await ownedServer(serverId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [metrics, rules, alerts] = await Promise.all([
    db.select().from(serverMetrics).where(eq(serverMetrics.serverId, serverId)).orderBy(desc(serverMetrics.createdAt)).limit(240),
    db.select().from(alertRules).where(eq(alertRules.serverId, serverId)).orderBy(desc(alertRules.createdAt)),
    db.select().from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.serverId, serverId))).orderBy(desc(notifications.createdAt)).limit(100),
  ])
  return NextResponse.json({ metrics, rules, notifications: alerts }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  const user = await actor(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({})); const input = metricSchema.safeParse(body)
  if (!input.success || !(await ownedServer(input.data.serverId, user.id))) return NextResponse.json({ error: 'Geçersiz metrik veya sunucu yetkisi' }, { status: 400 })
  const [metric] = await db.insert(serverMetrics).values({ ...input.data, userId: user.id }).returning()
  return NextResponse.json({ metric }, { status: 201 })
}
