import { randomBytes, scrypt as scryptCallback } from 'crypto'
import { promisify } from 'util'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, ilike } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { serverPermissions, servers, websiteMembers, websiteMemberSessions, websites } from '@/lib/db/schema'
import { resolvePanelUser } from '@/lib/db/identity'
const scrypt=promisify(scryptCallback)
function normalizeRole(role:unknown){const value=String(role??'').toLowerCase();return value==='manager'||value==='admin'||value==='guide'||value==='member'?value:'member'}
async function actor(){const session=await auth.api.getSession({headers:await headers()});if(!session?.user)return null;return resolvePanelUser(session.user)}
async function access(websiteId:string){const a=await actor();if(!a)return {error:NextResponse.json({error:'Unauthorized'},{status:401})};const site=(await db.select().from(websites).where(eq(websites.id,websiteId)).limit(1))[0];if(!site)return {error:NextResponse.json({error:'Website bulunamadı.'},{status:404})};if(normalizeRole(a.role)!=='manager'&&site.userId!==a.id)return {error:NextResponse.json({error:'Yetkiniz yok.'},{status:403})};return {a,site}}
async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const derived=await scrypt(password,salt,64) as Buffer;return `scrypt$${salt}$${derived.toString('hex')}`}
function cleanRole(value:unknown){return String(value||'member').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,32)||'member'}
function cleanPages(value:unknown){return Array.isArray(value)?[...new Set(value.map(x=>String(x||'').trim().replace(/^\/+|\/+$/g,'')).filter(x=>x.length<=80))].slice(0,100):[]}
export async function GET(request:NextRequest){await ensurePanelSchema();const websiteId=String(request.nextUrl.searchParams.get('websiteId')||'');const x=await access(websiteId);if(x.error)return x.error;const members=await db.select({id:websiteMembers.id,name:websiteMembers.name,email:websiteMembers.email,minecraftUsername:websiteMembers.minecraftUsername,playerUuid:websiteMembers.playerUuid,serverId:websiteMembers.serverId,authSource:websiteMembers.authSource,role:websiteMembers.role,allowedPages:websiteMembers.allowedPages,status:websiteMembers.status,lastLoginAt:websiteMembers.lastLoginAt,createdAt:websiteMembers.createdAt,updatedAt:websiteMembers.updatedAt}).from(websiteMembers).where(eq(websiteMembers.websiteId,websiteId)).orderBy(desc(websiteMembers.createdAt)).limit(500);return NextResponse.json({members},{headers:{'Cache-Control':'private, no-store'}})}
export async function POST(request:NextRequest){
  await ensurePanelSchema();const body=await request.json().catch(()=>({})) as Record<string,unknown>;const websiteId=String(body.websiteId||''),id=String(body.id||''),action=String(body.action||'');const x=await access(websiteId);if(x.error)return x.error
  if(action==='status'){const status=String(body.status||'active');if(!['active','blocked'].includes(status))return NextResponse.json({error:'Geçersiz durum.'},{status:400});const [updated]=await db.update(websiteMembers).set({status,updatedAt:new Date()}).where(and(eq(websiteMembers.id,id),eq(websiteMembers.websiteId,websiteId))).returning({id:websiteMembers.id,status:websiteMembers.status});return NextResponse.json({ok:true,member:updated})}
  if(action==='access'){const role=cleanRole(body.role),allowedPages=cleanPages(body.allowedPages);const [updated]=await db.update(websiteMembers).set({role,allowedPages,updatedAt:new Date()}).where(and(eq(websiteMembers.id,id),eq(websiteMembers.websiteId,websiteId))).returning({id:websiteMembers.id,role:websiteMembers.role,allowedPages:websiteMembers.allowedPages});if(!updated)return NextResponse.json({error:'Üye bulunamadı.'},{status:404});return NextResponse.json({ok:true,member:updated})}
  if(action==='create'){
    const name=String(body.name||'').trim().slice(0,80),email=String(body.email||'').trim().toLowerCase().slice(0,180),minecraftUsername=String(body.minecraftUsername||'').trim().slice(0,32),password=String(body.password||''),requestedServerId=String(body.serverId||x.site.serverId||''),authSource=String(body.authSource||'panel')==='server'?'server':'panel',role=cleanRole(body.role),allowedPages=cleanPages(body.allowedPages)
    let serverId:string|null=requestedServerId||null
    if(serverId){
      const server=(await db.select({id:servers.id,userId:servers.userId}).from(servers).where(eq(servers.id,serverId)).limit(1))[0]
      if(!server)return NextResponse.json({error:'Seçilen Minecraft sunucusu bulunamadı.'},{status:404})
      if(normalizeRole(x.a.role)!=='manager'&&server.userId!==x.a.id){
        const grant=(await db.select({id:serverPermissions.id}).from(serverPermissions).where(and(eq(serverPermissions.userId,x.a.id),eq(serverPermissions.serverId,serverId),eq(serverPermissions.canWebsiteData,true))).limit(1))[0]
        if(!grant)return NextResponse.json({error:'Bu sunucunun website verilerini kullanma yetkiniz yok.'},{status:403})
      }
    }
    if(authSource==='server'&&!serverId)return NextResponse.json({error:'Minecraft sunucusu kaynaklı üyelik için website ana sunucusu veya erişilebilir bir sunucu seçilmelidir.'},{status:400})
    if(name.length<2||password.length<8||(!email&&!minecraftUsername))return NextResponse.json({error:'Ad, en az bir giriş kimliği ve en az 8 karakter şifre gerekli.'},{status:400})
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:'E-posta geçersiz.'},{status:400})
    if(minecraftUsername&&!/^[A-Za-z0-9_]{3,32}$/.test(minecraftUsername))return NextResponse.json({error:'Minecraft kullanıcı adı geçersiz.'},{status:400})
    if(email){const exists=(await db.select({id:websiteMembers.id}).from(websiteMembers).where(and(eq(websiteMembers.websiteId,websiteId),ilike(websiteMembers.email,email))).limit(1))[0];if(exists)return NextResponse.json({error:'E-posta zaten kayıtlı.'},{status:409})}
    if(minecraftUsername){const exists=(await db.select({id:websiteMembers.id}).from(websiteMembers).where(and(eq(websiteMembers.websiteId,websiteId),ilike(websiteMembers.minecraftUsername,minecraftUsername))).limit(1))[0];if(exists)return NextResponse.json({error:'Minecraft kullanıcı adı zaten kayıtlı.'},{status:409})}
    let member:any;try{[member]=await db.insert(websiteMembers).values({websiteId,email:email||null,name,passwordHash:await hashPassword(password),minecraftUsername:minecraftUsername||null,serverId,authSource,role,allowedPages}).returning({id:websiteMembers.id,name:websiteMembers.name,email:websiteMembers.email,minecraftUsername:websiteMembers.minecraftUsername,serverId:websiteMembers.serverId,authSource:websiteMembers.authSource,role:websiteMembers.role,allowedPages:websiteMembers.allowedPages,status:websiteMembers.status,createdAt:websiteMembers.createdAt,updatedAt:websiteMembers.updatedAt})}catch(error){if((error as {code?:string})?.code==='23505')return NextResponse.json({error:'E-posta veya Minecraft kullanıcı adı zaten kayıtlı.'},{status:409});throw error}return NextResponse.json({ok:true,member},{status:201})
  }
  if(action==='delete'){await db.delete(websiteMemberSessions).where(and(eq(websiteMemberSessions.websiteId,websiteId),eq(websiteMemberSessions.memberId,id)));await db.delete(websiteMembers).where(and(eq(websiteMembers.id,id),eq(websiteMembers.websiteId,websiteId)));return NextResponse.json({ok:true})}
  return NextResponse.json({error:'Geçersiz işlem.'},{status:400})
}
