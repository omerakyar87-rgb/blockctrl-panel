import { NextRequest, NextResponse } from 'next/server'

export const runtime='nodejs'

export async function POST(request:NextRequest){
  const raw=await request.text().catch(()=> '')
  const body=raw.slice(0,64*1024)
  let payload:unknown=body
  try{payload=body?JSON.parse(body):{}}catch{}
  console.warn('[csp-report]',JSON.stringify({at:new Date().toISOString(),userAgent:(request.headers.get('user-agent')||'').slice(0,300),payload}).slice(0,16*1024))
  return new NextResponse(null,{status:204,headers:{'Cache-Control':'no-store'}})
}
