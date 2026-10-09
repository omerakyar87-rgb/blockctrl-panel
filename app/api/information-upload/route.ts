import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { auth } from '@/lib/auth'
import { ensurePanelSchema } from '@/lib/db'
import { resolvePanelUser } from '@/lib/db/identity'
import { blobTokenConfigured, DB_MEDIA_MAX_BYTES, saveDbMedia } from '@/lib/media-store'

export const runtime='nodejs'

const MAX_BYTES=200*1024*1024
const STAFF_ROLES=new Set(['manager','admin','guide'])
const TYPES=[
  'image/jpeg','image/png','image/webp','image/gif','image/avif',
  'video/mp4','video/webm','video/quicktime','video/x-m4v',
  'application/pdf',
]

async function actor(){
  const session=await auth.api.getSession({headers:await headers()})
  if(!session?.user)return null
  return resolvePanelUser(session.user)
}
function requireStaff(current:NonNullable<Awaited<ReturnType<typeof actor>>>){
  if(!current.approved)throw new Error('Approval required')
  if(!STAFF_ROLES.has(String(current.role||'').toLowerCase()))throw new Error('Bilgilendirme medyası için yetkiniz yok')
}
function validPath(pathname:string){return pathname.startsWith('information/')&&!pathname.includes('..')&&!pathname.startsWith('/')}

export async function GET(){
  await ensurePanelSchema()
  const current=await actor()
  if(!current)return Response.json({error:'Unauthorized'},{status:401})
  try{
    requireStaff(current)
    const blob=blobTokenConfigured()
    return Response.json({mode:blob?'blob':'database',maxBytes:blob?MAX_BYTES:DB_MEDIA_MAX_BYTES},{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Yetki doğrulanamadı'},{status:403})}
}

export async function POST(request:NextRequest){
  await ensurePanelSchema()
  const current=await actor()
  if(!current)return Response.json({error:'Unauthorized'},{status:401})
  try{requireStaff(current)}catch(error){return Response.json({error:error instanceof Error?error.message:'Yetkiniz yok'},{status:403})}

  if((request.headers.get('content-type')||'').includes('multipart/form-data')){
    try{
      const form=await request.formData()
      const pathname=String(form.get('pathname')||'')
      const file=form.get('file')
      if(!(file instanceof File))throw new Error('Dosya bulunamadı')
      if(!validPath(pathname))throw new Error('Geçersiz medya yolu')
      if(!TYPES.includes(file.type))throw new Error('Desteklenmeyen medya türü')
      if(file.size<=0||file.size>DB_MEDIA_MAX_BYTES)throw new Error(`Blob bağlı değilken bilgi medyası sınırı ${Math.round(DB_MEDIA_MAX_BYTES/1048576)} MB.`)
      const media=await saveDbMedia({ownerUserId:current.id,scope:'information',scopeId:'global',pathname,contentType:file.type,visibility:'private',bytes:Buffer.from(await file.arrayBuffer())})
      return Response.json({pathname:media.pathname,url:'',size:media.sizeBytes,storage:'database'})
    }catch(error){return Response.json({error:error instanceof Error?error.message:'Medya yüklenemedi'},{status:400})}
  }

  if(!blobTokenConfigured())return Response.json({error:'Blob bağlı değil. Küçük medya için DB fallback yüklemesini kullanın.'},{status:503})
  const body=await request.json() as HandleUploadBody
  try{
    const response=await handleUpload({
      request,body,
      onBeforeGenerateToken:async(pathname)=>{
        if(!validPath(pathname))throw new Error('Geçersiz medya yolu')
        return {allowedContentTypes:TYPES,maximumSizeInBytes:MAX_BYTES,tokenPayload:JSON.stringify({userId:current.id})}
      },
      onUploadCompleted:async()=>{},
    })
    return Response.json(response)
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Medya yüklenemedi'},{status:400})}
}
