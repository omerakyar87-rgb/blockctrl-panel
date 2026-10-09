import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { list } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { websites } from '@/lib/db/schema'
import { resolvePanelUser } from '@/lib/db/identity'
import { blobTokenConfigured, DB_MEDIA_MAX_BYTES, dbMediaPublicUrl, saveDbMedia } from '@/lib/media-store'

export const runtime='nodejs'
const MAX_BYTES=200*1024*1024
const MEDIA_QUOTA_BYTES=Math.max(MAX_BYTES,Number(process.env.WEBSITE_MEDIA_QUOTA_BYTES)||1024*1024*1024)
async function websiteBlobUsage(websiteId:string){let total=0,cursor:string|undefined;for(let page=0;page<20;page++){const result=await list({prefix:`websites/${websiteId}/`,limit:1000,cursor});for(const blob of result.blobs)total+=Number(blob.size||0);if(!result.hasMore||!result.cursor)break;cursor=result.cursor}return total}
const TYPES=['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime','video/x-m4v']
async function actor(){const session=await auth.api.getSession({headers:await headers()});if(!session?.user)return null;return resolvePanelUser(session.user)}
async function websiteAccess(websiteId:string,current:NonNullable<Awaited<ReturnType<typeof actor>>>){
  if(!/^[0-9a-f-]{36}$/i.test(websiteId))return {error:'Geçersiz website kimliği'} as const
  const site=(await db.select({id:websites.id,userId:websites.userId}).from(websites).where(eq(websites.id,websiteId)).limit(1))[0]
  if(!site)return {error:'Website bulunamadı'} as const
  if(current.role!=='manager'&&site.userId!==current.id)return {error:'Bu website için medya yükleme yetkiniz yok'} as const
  return {site} as const
}

export async function GET(request:NextRequest){
  await ensurePanelSchema()
  const current=await actor()
  if(!current)return Response.json({error:'Unauthorized'},{status:401})
  if(!current.approved)return Response.json({error:'Approval required'},{status:403})
  const websiteId=String(request.nextUrl.searchParams.get('websiteId')||'')
  const access=await websiteAccess(websiteId,current)
  if('error' in access)return Response.json({error:access.error},{status:403})
  const blob=blobTokenConfigured()
  return Response.json({mode:blob?'blob':'database',maxBytes:blob?MAX_BYTES:DB_MEDIA_MAX_BYTES,quotaBytes:blob?MEDIA_QUOTA_BYTES:50*1024*1024},{headers:{'Cache-Control':'private, no-store'}})
}

export async function POST(request:NextRequest){
  await ensurePanelSchema()
  const current=await actor()
  if(!current)return Response.json({error:'Unauthorized'},{status:401})
  if(!current.approved)return Response.json({error:'Approval required'},{status:403})

  if((request.headers.get('content-type')||'').includes('multipart/form-data')){
    try{
      const form=await request.formData()
      const websiteId=String(form.get('websiteId')||'')
      const pathname=String(form.get('pathname')||'')
      const file=form.get('file')
      const access=await websiteAccess(websiteId,current)
      if('error' in access)throw new Error(access.error)
      if(!(file instanceof File))throw new Error('Dosya bulunamadı')
      if(!pathname.startsWith(`websites/${websiteId}/`)||pathname.includes('..'))throw new Error('Geçersiz medya yolu')
      if(!TYPES.includes(file.type))throw new Error('Desteklenmeyen medya türü')
      if(file.size<=0||file.size>DB_MEDIA_MAX_BYTES)throw new Error(`Blob bağlı değilken dosya sınırı ${Math.round(DB_MEDIA_MAX_BYTES/1048576)} MB.`)
      const media=await saveDbMedia({ownerUserId:current.id,scope:'website',scopeId:websiteId,pathname,contentType:file.type,visibility:'public',bytes:Buffer.from(await file.arrayBuffer())})
      return Response.json({pathname:media.pathname,url:dbMediaPublicUrl(media.id),size:media.sizeBytes,uploadedAt:media.createdAt,storage:'database'})
    }catch(error){return Response.json({error:error instanceof Error?error.message:'Medya yüklenemedi'},{status:400})}
  }

  if(!blobTokenConfigured())return Response.json({error:'Blob bağlı değil. Küçük medya için doğrudan DB fallback yüklemesini kullanın.'},{status:503})
  const body=await request.json() as HandleUploadBody
  try{
    const response=await handleUpload({
      request,body,
      onBeforeGenerateToken:async(pathname,clientPayload)=>{
        let payload:{websiteId?:string}={}
        try{payload=clientPayload?JSON.parse(clientPayload):{}}catch{throw new Error('Geçersiz medya yükleme isteği')}
        const websiteId=String(payload.websiteId||'')
        if(!/^[0-9a-f-]{36}$/i.test(websiteId))throw new Error('Geçersiz website kimliği')
        const access=await websiteAccess(websiteId,current)
        if('error' in access)throw new Error(access.error)
        if(!pathname.startsWith(`websites/${websiteId}/`)||pathname.includes('..'))throw new Error('Geçersiz medya yolu')
        const used=await websiteBlobUsage(websiteId);const remaining=Math.max(0,MEDIA_QUOTA_BYTES-used);if(remaining<=0)throw new Error('Website medya kotası dolu');
        return {allowedContentTypes:TYPES,maximumSizeInBytes:Math.min(MAX_BYTES,remaining),tokenPayload:JSON.stringify({websiteId,userId:current.id})}
      },
      onUploadCompleted:async()=>{},
    })
    return Response.json(response)
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Medya yüklenemedi'},{status:400})}
}
