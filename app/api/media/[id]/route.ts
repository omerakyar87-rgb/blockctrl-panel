import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { resolvePanelUser } from '@/lib/db/identity'
import { getDbMediaById } from '@/lib/media-store'

export const runtime='nodejs'
export const dynamic='force-dynamic'

async function approvedActor(){
  const session=await auth.api.getSession({headers:await headers()})
  if(!session?.user)return null
  const actor=await resolvePanelUser(session.user)
  return actor?.approved?actor:null
}

export async function GET(
  _request:Request,
  {params}:{params:Promise<{id:string}>},
){
  const {id}=await params
  const media=await getDbMediaById(String(id||''))
  if(!media)return Response.json({error:'Medya bulunamadı.'},{status:404})

  if(media.visibility!=='public'){
    if(media.scope==='support')return Response.json({error:'Destek eki doğrudan açılamaz.'},{status:403})
    const actor=await approvedActor()
    if(!actor)return Response.json({error:'Unauthorized'},{status:401})
  }

  const body=new Uint8Array(media.data)
  return new Response(body,{
    status:200,
    headers:{
      'content-type':media.contentType||'application/octet-stream',
      'content-length':String(media.sizeBytes),
      'cache-control':media.visibility==='public'?'public, max-age=31536000, immutable':'private, no-store',
      'x-content-type-options':'nosniff',
      'content-disposition':'inline',
    },
  })
}
