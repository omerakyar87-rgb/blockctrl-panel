import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { resolvePanelUser } from '@/lib/db/identity'

export async function getPanelActor(){
  const session=await auth.api.getSession({headers:await headers()})
  if(!session?.user)return null
  return resolvePanelUser(session.user)
}

export function apiError(message:string,status=400,details?:Record<string,unknown>){
  return NextResponse.json({error:message,...(details?{details}:{})},{status,headers:{'Cache-Control':'private, no-store'}})
}

export function apiOk<T extends Record<string,unknown>>(data:T,status=200){
  return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
}
