import { headers } from 'next/headers'
import { del, list } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { and, count, eq, gt, lte } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { websiteAuthSettings, websiteFormSubmissions, websiteMembers, websiteMemberSessions, websites } from '@/lib/db/schema'
import { resolvePanelUser } from '@/lib/db/identity'
import { blobTokenConfigured, DB_MEDIA_MAX_BYTES, dbMediaPublicUrl, deleteDbMediaByPath, deleteDbMediaPaths, listDbMedia } from '@/lib/media-store'

function normalizeRole(role:unknown){const value=String(role??'').toLowerCase();return value==='manager'||value==='admin'||value==='guide'||value==='member'?value:'member'}
async function actor(){const session=await auth.api.getSession({headers:await headers()});if(!session?.user)return null;return resolvePanelUser(session.user)}
async function access(websiteId:string){const a=await actor();if(!a)return {error:NextResponse.json({error:'Unauthorized'},{status:401})};const site=(await db.select().from(websites).where(eq(websites.id,websiteId)).limit(1))[0];if(!site)return {error:NextResponse.json({error:'Website bulunamadı.'},{status:404})};if(normalizeRole(a.role)!=='manager'&&site.userId!==a.id)return {error:NextResponse.json({error:'Yetkiniz yok.'},{status:403})};return {a,site}}
async function scalar(table:any,where:any){const row=(await db.select({value:count()}).from(table).where(where))[0];return Number(row?.value||0)}
const MEDIA_QUOTA_BYTES=Math.max(50*1024*1024,Number(process.env.WEBSITE_MEDIA_QUOTA_BYTES)||1024*1024*1024)
async function listWebsiteBlobs(websiteId:string){const prefix=`websites/${websiteId}/`;const blobs:Array<{pathname:string;url:string;downloadUrl:string;size:number;uploadedAt:Date;etag:string}>=[];let cursor:string|undefined;for(let page=0;page<20;page++){const result=await list({prefix,limit:1000,cursor});blobs.push(...result.blobs);if(!result.hasMore||!result.cursor)break;cursor=result.cursor}return blobs}
export async function GET(request:NextRequest){
  await ensurePanelSchema();const websiteId=String(request.nextUrl.searchParams.get('websiteId')||'');const x=await access(websiteId);if(x.error)return x.error;const now=new Date()
  const [members,activeSessions,expiredSessions,formSubmissions,authRow]=await Promise.all([
    scalar(websiteMembers,eq(websiteMembers.websiteId,websiteId)),
    scalar(websiteMemberSessions,and(eq(websiteMemberSessions.websiteId,websiteId),gt(websiteMemberSessions.expiresAt,now))),
    scalar(websiteMemberSessions,and(eq(websiteMemberSessions.websiteId,websiteId),lte(websiteMemberSessions.expiresAt,now))),
    scalar(websiteFormSubmissions,eq(websiteFormSubmissions.websiteId,websiteId)),
    db.select({websiteId:websiteAuthSettings.websiteId}).from(websiteAuthSettings).where(eq(websiteAuthSettings.websiteId,websiteId)).limit(1),
  ])
  const dbItems=await listDbMedia('website',websiteId)
  let blobConfigured=blobTokenConfigured(),blobError:string|null=null,blobs:Array<{pathname:string;url:string;downloadUrl:string;size:number;uploadedAt:Date;etag:string}>=[]
  if(blobConfigured){try{blobs=await listWebsiteBlobs(websiteId)}catch(error){blobConfigured=false;blobError=error instanceof Error?error.message:'Blob listesi alınamadı'}}
  const dbRows=dbItems.map(item=>({pathname:item.pathname,url:dbMediaPublicUrl(item.id),size:Number(item.sizeBytes||0),uploadedAt:item.createdAt,storage:'database' as const}))
  const blobRows=blobs.map(item=>({pathname:item.pathname,url:item.url,size:Number(item.size||0),uploadedAt:item.uploadedAt,storage:'blob' as const}))
  const mediaRows=[...blobRows,...dbRows].sort((a,b)=>new Date(b.uploadedAt).getTime()-new Date(a.uploadedAt).getTime())
  const mediaBytes=mediaRows.reduce((sum,item)=>sum+item.size,0);const referenced=JSON.stringify(x.site.builderData??{});const orphanRows=mediaRows.filter(item=>!referenced.includes(item.url)&&!referenced.includes(item.pathname))
  return NextResponse.json({databaseConfigured:Boolean(process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL),blobConfigured,blobError:blobConfigured?null:(blobError||'Blob bağlı değil; PostgreSQL medya fallback aktif.'),mediaStorageMode:blobConfigured?'hybrid':'database',databaseMediaFallback:true,databaseMediaMaxBytes:DB_MEDIA_MAX_BYTES,members,activeSessions,expiredSessions,formSubmissions,authSettings:Boolean(authRow[0]),blobBytes:mediaBytes,blobFiles:mediaRows.length,quotaBytes:MEDIA_QUOTA_BYTES,orphanCount:orphanRows.length,blobItems:mediaRows.slice(0,200)},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(request:NextRequest){
  await ensurePanelSchema();const body=await request.json().catch(()=>({})) as Record<string,unknown>;const websiteId=String(body.websiteId||''),action=String(body.action||'');const x=await access(websiteId);if(x.error)return x.error
  if(action==='cleanup-expired-sessions'){await db.delete(websiteMemberSessions).where(and(eq(websiteMemberSessions.websiteId,websiteId),lte(websiteMemberSessions.expiresAt,new Date())));return NextResponse.json({ok:true})}
  if(action==='delete-media'){const pathname=String(body.pathname||'');if(!pathname.startsWith(`websites/${websiteId}/`)||pathname.includes('..'))return NextResponse.json({error:'Geçersiz medya yolu.'},{status:400});const dbDeleted=await deleteDbMediaByPath(pathname);if(!dbDeleted&&blobTokenConfigured())await del(pathname);return NextResponse.json({ok:true,storage:dbDeleted?'database':'blob'})}
  if(action==='cleanup-orphan-media'){const referenced=JSON.stringify(x.site.builderData??{});const dbItems=await listDbMedia('website',websiteId);const dbOrphaned=dbItems.filter(item=>!referenced.includes(dbMediaPublicUrl(item.id))&&!referenced.includes(item.pathname)).slice(0,500);let deleted=await deleteDbMediaPaths(dbOrphaned.map(item=>item.pathname));if(blobTokenConfigured()){const blobs=await listWebsiteBlobs(websiteId);const orphaned=blobs.filter(item=>!referenced.includes(item.url)&&!referenced.includes(item.pathname)).slice(0,500);if(orphaned.length){await del(orphaned.map(item=>item.url));deleted+=orphaned.length}}return NextResponse.json({ok:true,deleted})}
  return NextResponse.json({error:'Geçersiz işlem.'},{status:400})
}
