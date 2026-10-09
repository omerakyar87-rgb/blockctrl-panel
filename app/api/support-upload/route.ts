import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { auth } from '@/lib/auth'
import { ensurePanelSchema, pool } from '@/lib/db'
import { resolvePanelUser } from '@/lib/db/identity'
import { blobTokenConfigured, DB_MEDIA_MAX_BYTES, saveDbMedia } from '@/lib/media-store'

export const runtime = 'nodejs'

const SUPPORT_RULES_VERSION = '2026-09-10-v1'
const STAFF_ROLES = new Set(['manager', 'admin', 'guide'])
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
]

function roleOf(value: unknown) { const role = String(value ?? '').toLowerCase(); return ['manager','admin','guide','member'].includes(role) ? role : 'member' }
function isStaff(value: unknown) { return STAFF_ROLES.has(roleOf(value)) }
async function actor() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) return null; return resolvePanelUser(session.user) }

async function validateUploadActor(current:NonNullable<Awaited<ReturnType<typeof actor>>>,threadId:string){
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw new Error('Geçersiz sohbet kimliği')
  if (!isStaff(current.role)) {
    const consent = await pool.query<{version:string}>(`SELECT version FROM support_consents WHERE "userId"=$1 LIMIT 1`, [current.id])
    if (consent.rows[0]?.version !== SUPPORT_RULES_VERSION) throw new Error('Önce destek bilgilendirmesini kabul edin')
  }
  if (!await canAccessThread(current.id, roleOf(current.role), threadId)) throw new Error('Bu sohbete dosya yükleme yetkiniz yok')
}

async function canAccessThread(userId:string, role:string, threadId:string) {
  const result = await pool.query<{type:string;status:string;creatorUserId:string;targetUserId:string|null;assignedUserId:string|null}>(`SELECT type,status,"creatorUserId","targetUserId","assignedUserId" FROM support_threads WHERE id=$1 LIMIT 1`, [threadId])
  const thread = result.rows[0]
  if (!thread || thread.status === 'closed' || thread.status === 'declined') return false
  if (thread.type === 'private') return thread.status === 'open' && (thread.creatorUserId === userId || thread.targetUserId === userId)
  if (thread.creatorUserId === userId) return thread.status === 'pending' || thread.status === 'open'
  return isStaff(role) && thread.status === 'open' && thread.assignedUserId === userId
}

export async function GET(request:NextRequest){
  await ensurePanelSchema()
  const current=await actor()
  if(!current)return Response.json({error:'Unauthorized'},{status:401})
  if(!current.approved)return Response.json({error:'Approval required'},{status:403})
  const threadId=String(request.nextUrl.searchParams.get('threadId')||'')
  try{
    await validateUploadActor(current,threadId)
    const blob=blobTokenConfigured()
    return Response.json({mode:blob?'blob':'database',maxBytes:blob?MAX_ATTACHMENT_BYTES:DB_MEDIA_MAX_BYTES},{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Yükleme yetkisi doğrulanamadı'},{status:403})}
}

export async function POST(request: NextRequest) {
  await ensurePanelSchema()
  const current = await actor()
  if (!current) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.approved) return Response.json({ error: 'Approval required' }, { status: 403 })
  if ((request.headers.get('content-type')||'').includes('multipart/form-data')) {
    try{
      const form=await request.formData()
      const threadId=String(form.get('threadId')||'')
      const pathname=String(form.get('pathname')||'')
      const file=form.get('file')
      await validateUploadActor(current,threadId)
      if(!(file instanceof File))throw new Error('Dosya bulunamadı')
      if(!pathname.startsWith(`support/${threadId}/`)||pathname.includes('..'))throw new Error('Geçersiz dosya yolu')
      if(!ALLOWED_CONTENT_TYPES.includes(file.type))throw new Error('Desteklenmeyen dosya türü')
      if(file.size<=0||file.size>DB_MEDIA_MAX_BYTES)throw new Error(`Blob bağlı değilken destek eki sınırı ${Math.round(DB_MEDIA_MAX_BYTES/1048576)} MB.`)
      const media=await saveDbMedia({ownerUserId:current.id,scope:'support',scopeId:threadId,pathname,contentType:file.type,visibility:'private',bytes:Buffer.from(await file.arrayBuffer())})
      return Response.json({pathname:media.pathname,url:'',size:media.sizeBytes,storage:'database'})
    }catch(error){return Response.json({error:error instanceof Error?error.message:'Dosya yüklenemedi'},{status:400})}
  }

  if (!blobTokenConfigured()) return Response.json({ error: 'Blob bağlı değil. Küçük destek eki için DB fallback yüklemesini kullanın.' }, { status: 503 })
  if (!isStaff(current.role)) {
    const consent = await pool.query<{version:string}>(`SELECT version FROM support_consents WHERE "userId"=$1 LIMIT 1`, [current.id])
    if (consent.rows[0]?.version !== SUPPORT_RULES_VERSION) return Response.json({ error: 'Önce destek bilgilendirmesini kabul edin' }, { status: 428 })
  }
  const body = await request.json() as HandleUploadBody
  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { threadId?: string } = {}
        try { payload = clientPayload ? JSON.parse(clientPayload) : {} } catch { throw new Error('Geçersiz yükleme isteği') }
        const threadId = String(payload.threadId ?? '')
        await validateUploadActor(current,threadId)
        if (!pathname.startsWith(`support/${threadId}/`)) throw new Error('Geçersiz dosya yolu')
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
          tokenPayload: JSON.stringify({ userId: current.id, threadId }),
        }
      },
      onUploadCompleted: async () => {
        // Mesaj API'si dosyayı ilgili mesaja bağlar. Burada hassas veri loglanmaz.
      },
    })
    return Response.json(response)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Dosya yüklenemedi' }, { status: 400 })
  }
}
