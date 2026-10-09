import { eq, or } from 'drizzle-orm'
import type { User } from '@supabase/supabase-js'
import { resolve, sep } from 'node:path'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'

export type AuthUser = Pick<User, 'id' | 'email'> & { user_metadata?: Record<string, unknown> }

function bootstrapManagerEmails() {
  return new Set(
    String(process.env.BLOCKCTRL_BOOTSTRAP_MANAGER_EMAILS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

function displayName(authUser: AuthUser, email: string | undefined) {
  const metadataName = typeof authUser.user_metadata?.name === 'string'
    ? authUser.user_metadata.name.trim()
    : ''
  return metadataName || email || 'Kullanıcı'
}

export async function resolvePanelUser(authUser: AuthUser) {
  const email = authUser.email?.trim().toLowerCase()
  const matches = await db.select().from(user).where(email ? or(eq(user.id, authUser.id), eq(user.email, email)) : eq(user.id, authUser.id)).limit(2)
  const existing = matches[0]
  const isBootstrapManager = Boolean(email && bootstrapManagerEmails().has(email))

  if (!existing) {
    const [created] = await db.insert(user).values({
      id: authUser.id,
      name: displayName(authUser, email),
      email: email || `${authUser.id}@local.invalid`,
      role: isBootstrapManager ? 'manager' : 'member',
      approved: isBootstrapManager,
    }).onConflictDoNothing().returning()
    return created ?? null
  }

  if (isBootstrapManager && (existing.role !== 'manager' || !existing.approved)) {
    const [promoted] = await db.update(user).set({ role: 'manager', approved: true, updatedAt: new Date() }).where(eq(user.id, existing.id)).returning()
    return promoted ?? existing
  }

  if (existing.id === authUser.id && existing.email === email) return existing
  if (email && existing.email === email) return existing
  return existing
}

export async function resolvePanelUserBySession(sessionUser: AuthUser) {
  return resolvePanelUser(sessionUser)
}

export function isApprovedPanelUser(actor: { approved: boolean }) {
  return actor.approved === true
}

export function safeRelativePath(root: string, requested: string) {
  if (requested.includes('\0')) throw new Error('Invalid path')
  const normalized = requested.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) throw new Error('Absolute paths are not allowed')
  const target = resolve(root, normalized)
  const base = resolve(root)
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error('Path traversal blocked')
  return target
}
