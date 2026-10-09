import { pool } from '@/lib/db/postgres'

export const DB_MEDIA_MAX_BYTES=Math.max(512*1024,Math.min(8*1024*1024,Number(process.env.BLOCKCTRL_DB_MEDIA_MAX_BYTES)||3*1024*1024))
export const DB_MEDIA_SCOPE_QUOTA_BYTES=Math.max(DB_MEDIA_MAX_BYTES,Math.min(250*1024*1024,Number(process.env.BLOCKCTRL_DB_MEDIA_SCOPE_QUOTA_BYTES)||50*1024*1024))

export type DbMediaObject={
  id:string
  ownerUserId:string
  scope:string
  scopeId:string
  pathname:string
  contentType:string
  sizeBytes:number
  visibility:'public'|'private'
  data:Buffer
  createdAt:Date
}

function safeToken(value:unknown,max=160){return String(value??'').trim().slice(0,max)}
function safeScope(value:unknown){const scope=safeToken(value,40).toLowerCase();return /^[a-z0-9-]+$/.test(scope)?scope:''}
function safeScopeId(value:unknown){const id=safeToken(value,120);return /^[a-zA-Z0-9:_-]+$/.test(id)?id:''}
function safePath(value:unknown){const pathname=safeToken(value,1000);if(!pathname||pathname.includes('..')||pathname.startsWith('/'))return '';return pathname}

export function blobTokenConfigured(){return Boolean(String(process.env.BLOB_READ_WRITE_TOKEN||'').trim())}
export function dbMediaPublicUrl(id:string){return `/api/media/${encodeURIComponent(id)}`}

export async function dbMediaUsage(scope:string,scopeId:string){
  const result=await pool.query<{bytes:string}>(`SELECT COALESCE(sum("sizeBytes"),0)::text AS bytes FROM panel_media_objects WHERE scope=$1 AND "scopeId"=$2`,[scope,scopeId])
  return Number(result.rows[0]?.bytes||0)
}

export async function saveDbMedia(input:{
  ownerUserId:string
  scope:string
  scopeId:string
  pathname:string
  contentType:string
  visibility:'public'|'private'
  bytes:Buffer
}){
  const ownerUserId=safeToken(input.ownerUserId,180)
  const scope=safeScope(input.scope)
  const scopeId=safeScopeId(input.scopeId)
  const pathname=safePath(input.pathname)
  const contentType=safeToken(input.contentType,160).toLowerCase()
  if(!ownerUserId||!scope||!scopeId||!pathname||!contentType)throw new Error('Geçersiz medya kaydı.')
  if(!input.bytes.length||input.bytes.length>DB_MEDIA_MAX_BYTES)throw new Error(`DB medya fallback sınırı ${Math.round(DB_MEDIA_MAX_BYTES/1048576)} MB.`)
  const used=await dbMediaUsage(scope,scopeId)
  if(used+input.bytes.length>DB_MEDIA_SCOPE_QUOTA_BYTES)throw new Error('DB medya fallback kotası dolu.')
  const result=await pool.query<DbMediaObject>(`
    INSERT INTO panel_media_objects ("ownerUserId",scope,"scopeId",pathname,"contentType","sizeBytes",visibility,data)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (pathname) DO UPDATE SET
      "ownerUserId"=EXCLUDED."ownerUserId",
      scope=EXCLUDED.scope,
      "scopeId"=EXCLUDED."scopeId",
      "contentType"=EXCLUDED."contentType",
      "sizeBytes"=EXCLUDED."sizeBytes",
      visibility=EXCLUDED.visibility,
      data=EXCLUDED.data,
      "createdAt"=now()
    RETURNING id,"ownerUserId",scope,"scopeId",pathname,"contentType","sizeBytes",visibility,data,"createdAt"
  `,[ownerUserId,scope,scopeId,pathname,contentType,input.bytes.length,input.visibility,input.bytes])
  return result.rows[0]
}

export async function getDbMediaById(id:string){
  if(!/^[0-9a-f-]{36}$/i.test(id))return null
  const result=await pool.query<DbMediaObject>(`SELECT id,"ownerUserId",scope,"scopeId",pathname,"contentType","sizeBytes",visibility,data,"createdAt" FROM panel_media_objects WHERE id=$1 LIMIT 1`,[id])
  return result.rows[0]??null
}

export async function getDbMediaByPath(pathname:string){
  const safe=safePath(pathname);if(!safe)return null
  const result=await pool.query<DbMediaObject>(`SELECT id,"ownerUserId",scope,"scopeId",pathname,"contentType","sizeBytes",visibility,data,"createdAt" FROM panel_media_objects WHERE pathname=$1 LIMIT 1`,[safe])
  return result.rows[0]??null
}

export async function listDbMedia(scope:string,scopeId:string){
  const safeS=safeScope(scope),safeId=safeScopeId(scopeId)
  if(!safeS||!safeId)return []
  const result=await pool.query<Omit<DbMediaObject,'data'>>(`SELECT id,"ownerUserId",scope,"scopeId",pathname,"contentType","sizeBytes",visibility,"createdAt" FROM panel_media_objects WHERE scope=$1 AND "scopeId"=$2 ORDER BY "createdAt" DESC LIMIT 500`,[safeS,safeId])
  return result.rows
}

export async function deleteDbMediaByPath(pathname:string){
  const safe=safePath(pathname);if(!safe)return 0
  const result=await pool.query(`DELETE FROM panel_media_objects WHERE pathname=$1 RETURNING id`,[safe])
  return result.rows.length
}

export async function deleteDbMediaPaths(pathnames:string[]){
  const safe=[...new Set(pathnames.map(safePath).filter(Boolean))]
  if(!safe.length)return 0
  const result=await pool.query(`DELETE FROM panel_media_objects WHERE pathname = ANY($1::text[]) RETURNING id`,[safe])
  return result.rows.length
}
