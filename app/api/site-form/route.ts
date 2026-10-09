import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { db, ensurePanelSchema, pool } from '@/lib/db'
import { websiteFormSubmissions, websiteMemberSessions, websites } from '@/lib/db/schema'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'no-store'}
function response(data:unknown,status=200,extraHeaders:Record<string,string>={}){return NextResponse.json(data,{status,headers:{...cors,...extraHeaders}})}
export function OPTIONS(){return new NextResponse(null,{status:204,headers:cors})}
function tokenHash(token:string){return createHash('sha256').update(token).digest('hex')}
function requestIp(request:NextRequest){return String(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||(request.headers.get('x-forwarded-for')||'').split(',')[0]||'unknown').trim().slice(0,120)||'unknown'}
function rateKey(value:string){return createHash('sha256').update(value.toLowerCase()).digest('hex')}
async function consumeRateLimit(websiteId:string,bucket:string,key:string,limit:number,windowMs:number){
  const expiresAt=new Date(Date.now()+windowMs)
  const result=await pool.query<{count:number;expiresAt:Date}>(`INSERT INTO website_auth_rate_limits ("websiteId","bucket","keyHash","count","windowStart","expiresAt","updatedAt") VALUES ($1,$2,$3,1,now(),$4,now()) ON CONFLICT ("websiteId","bucket","keyHash") DO UPDATE SET "count"=CASE WHEN website_auth_rate_limits."expiresAt"<=now() THEN 1 ELSE website_auth_rate_limits."count"+1 END,"windowStart"=CASE WHEN website_auth_rate_limits."expiresAt"<=now() THEN now() ELSE website_auth_rate_limits."windowStart" END,"expiresAt"=CASE WHEN website_auth_rate_limits."expiresAt"<=now() THEN EXCLUDED."expiresAt" ELSE website_auth_rate_limits."expiresAt" END,"updatedAt"=now() RETURNING "count","expiresAt"`,[websiteId,bucket,rateKey(key),expiresAt])
  const row=result.rows[0];const count=Number(row?.count||1);const retryAfter=Math.max(1,Math.ceil((new Date(row?.expiresAt||expiresAt).getTime()-Date.now())/1000))
  return {allowed:count<=limit,retryAfter}
}
export async function POST(request:NextRequest){
  await ensurePanelSchema()
  const declared=Number(request.headers.get('content-length')||0);if(Number.isFinite(declared)&&declared>64*1024)return response({error:'Form isteği çok büyük.'},413)
  const raw=await request.text();if(raw.length>64*1024)return response({error:'Form isteği çok büyük.'},413)
  let body:Record<string,unknown>={};try{body=raw?JSON.parse(raw) as Record<string,unknown>:{} }catch{return response({error:'Geçersiz form isteği.'},400)}
  const slug=String(body.site||'');const site=(await db.select().from(websites).where(eq(websites.slug,slug)).limit(1))[0];if(!site)return response({error:'Website bulunamadı.'},404)
  // Honeypot: normal yayınlanan form bu alanı boş gönderir. Bot doldurursa sessizce kabul edilmiş gibi davranırız.
  if(String(body.website||body.company||'').trim())return response({ok:true},201)
  const ip=requestIp(request);const minute=await consumeRateLimit(site.id,'form-ip-minute',ip,5,60*1000);if(!minute.allowed)return response({error:'Çok fazla form gönderildi. Lütfen biraz sonra tekrar deneyin.'},429,{'Retry-After':String(minute.retryAfter)})
  const hour=await consumeRateLimit(site.id,'form-ip-hour',ip,20,60*60*1000);if(!hour.allowed)return response({error:'Saatlik form gönderim sınırına ulaşıldı.'},429,{'Retry-After':String(hour.retryAfter)})
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();let memberId:string|null=null;if(token){const session=(await db.select().from(websiteMemberSessions).where(and(eq(websiteMemberSessions.websiteId,site.id),eq(websiteMemberSessions.tokenHash,tokenHash(token)),gt(websiteMemberSessions.expiresAt,new Date()))).limit(1))[0];memberId=session?.memberId||null}
  const formType=String(body.formType||'contact').slice(0,50),pageSlug=String(body.pageSlug||'').slice(0,80),senderName=String(body.name||'').trim().slice(0,120),senderEmail=String(body.email||'').trim().toLowerCase().slice(0,180),subject=String(body.subject||'').trim().slice(0,180),message=String(body.message||'').trim().slice(0,5000)
  if(senderEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail))return response({error:'E-posta adresi geçersiz.'},400)
  if(!message&&formType!=='newsletter')return response({error:'Mesaj alanı boş olamaz.'},400)
  const payload=body.payload&&typeof body.payload==='object'&&!Array.isArray(body.payload)?body.payload as Record<string,unknown>:{}
  if(JSON.stringify(payload).length>12_000)return response({error:'Form ek verisi çok büyük.'},413)
  const [created]=await db.insert(websiteFormSubmissions).values({websiteId:site.id,serverId:site.serverId||null,memberId,formType,pageSlug,senderName:senderName||null,senderEmail:senderEmail||null,subject:subject||null,message,payload}).returning({id:websiteFormSubmissions.id,createdAt:websiteFormSubmissions.createdAt})
  return response({ok:true,submission:created},201)
}
