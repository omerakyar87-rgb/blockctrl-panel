import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, ilike } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { auditLog, consoleLogs, playerModerationNotes, serverPermissions, servers } from '@/lib/db/schema'
import { resolvePanelUser } from '@/lib/db/identity'

const playerSchema = z.string().trim().regex(/^[A-Za-z0-9_]{1,16}$/)
const addSchema = z.object({ serverId:z.string().uuid(), playerName:playerSchema, note:z.string().trim().min(1).max(2000) })
const deleteSchema = z.object({ serverId:z.string().uuid(), noteId:z.string().uuid() })

async function actor(){
  const session=await auth.api.getSession({headers:await headers()})
  return session?.user?resolvePanelUser(session.user):null
}
async function access(serverId:string,current:NonNullable<Awaited<ReturnType<typeof actor>>>){
  const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0]
  if(!server||server.status==='deleted')return null
  const manager=String(current.role).toLowerCase()==='manager'
  if(manager||server.userId===current.id)return{server,canRead:true,canManage:true}
  const permission=(await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId,serverId),eq(serverPermissions.userId,current.id))).limit(1))[0]
  if(!permission)return null
  const sections=Array.isArray(permission.sections)?permission.sections.map(String):[]
  const canRead=sections.includes('players')||sections.includes('console')||sections.includes('logs')||!!permission.canConsole
  return canRead?{server,canRead,canManage:!!permission.canConsole}:null
}
function noStore(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})}

export async function GET(request:NextRequest){
  await ensurePanelSchema();const current=await actor();if(!current)return noStore({error:'Unauthorized'},401);if(!current.approved)return noStore({error:'Approval required'},403)
  const serverId=request.nextUrl.searchParams.get('serverId')??'';const playerRaw=request.nextUrl.searchParams.get('player')??'';const parsedPlayer=playerSchema.safeParse(playerRaw)
  if(!/^[0-9a-f-]{36}$/i.test(serverId)||!parsedPlayer.success)return noStore({error:'Geçersiz sunucu veya oyuncu adı'},400)
  const permission=await access(serverId,current);if(!permission?.canRead)return noStore({error:'Bu oyuncu verisini görüntüleme yetkiniz yok'},403)
  const playerName=parsedPlayer.data
  const [notes,history]=await Promise.all([
    db.select().from(playerModerationNotes).where(and(eq(playerModerationNotes.serverId,serverId),ilike(playerModerationNotes.playerName,playerName))).orderBy(desc(playerModerationNotes.createdAt)).limit(100),
    db.select({id:consoleLogs.id,stream:consoleLogs.stream,line:consoleLogs.line,createdAt:consoleLogs.createdAt}).from(consoleLogs).where(and(eq(consoleLogs.serverId,serverId),ilike(consoleLogs.line,`%${playerName}%`))).orderBy(desc(consoleLogs.createdAt)).limit(100),
  ])
  return noStore({playerName,canManage:permission.canManage,notes,history})
}

export async function POST(request:NextRequest){
  await ensurePanelSchema();const current=await actor();if(!current)return noStore({error:'Unauthorized'},401);if(!current.approved)return noStore({error:'Approval required'},403)
  const input=addSchema.safeParse(await request.json().catch(()=>({})));if(!input.success)return noStore({error:'Oyuncu adı veya not geçersiz'},400)
  const permission=await access(input.data.serverId,current);if(!permission?.canManage)return noStore({error:'Moderasyon notu ekleme yetkiniz yok'},403)
  const [note]=await db.insert(playerModerationNotes).values({serverId:input.data.serverId,playerName:input.data.playerName,note:input.data.note,authorUserId:current.id,authorName:current.name}).returning()
  await db.insert(auditLog).values({userId:current.id,action:'player.moderation.note.create',resourceType:'server',resourceId:input.data.serverId,details:{playerName:input.data.playerName,noteId:note.id}})
  return noStore({note},201)
}

export async function DELETE(request:NextRequest){
  await ensurePanelSchema();const current=await actor();if(!current)return noStore({error:'Unauthorized'},401);if(!current.approved)return noStore({error:'Approval required'},403)
  const input=deleteSchema.safeParse(await request.json().catch(()=>({})));if(!input.success)return noStore({error:'Geçersiz istek'},400)
  const permission=await access(input.data.serverId,current);if(!permission?.canManage)return noStore({error:'Moderasyon notu silme yetkiniz yok'},403)
  const row=(await db.select().from(playerModerationNotes).where(and(eq(playerModerationNotes.id,input.data.noteId),eq(playerModerationNotes.serverId,input.data.serverId))).limit(1))[0]
  if(!row)return noStore({error:'Not bulunamadı'},404)
  await db.delete(playerModerationNotes).where(eq(playerModerationNotes.id,row.id))
  await db.insert(auditLog).values({userId:current.id,action:'player.moderation.note.delete',resourceType:'server',resourceId:input.data.serverId,details:{playerName:row.playerName,noteId:row.id}})
  return noStore({ok:true})
}