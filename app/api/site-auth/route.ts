import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gt, ilike, or } from 'drizzle-orm'
import { db, ensurePanelSchema, pool } from '@/lib/db'
import { nodes, servers, websiteAuthSettings, websiteMembers, websiteMemberSessions, websites } from '@/lib/db/schema'


const scrypt=promisify(scryptCallback)
type Config={enabled:boolean;allowRegistration:boolean;registrationMode:'website'|'server'|'both'|'closed';loginMode:'email'|'minecraft'|'both';serverId:string;sessionDays:number;defaultRole:string;serverBridgeEnabled:boolean;loginPageSlug:string;registerPageSlug:string;afterLoginPageSlug:string}
function originOf(value:unknown){try{return new URL(String(value||'')).origin}catch{return ''}}
function allowedOrigins(site:any){const vercelUrl=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;const values=[site?.productionUrl,site?.deploymentUrl,site?.projectName?`https://${site.projectName}.vercel.app`:'',process.env.BLOCKCTRL_PUBLIC_URL,process.env.NEXT_PUBLIC_APP_URL,vercelUrl?`https://${vercelUrl}`:''];return new Set(values.map(originOf).filter(Boolean))}
function corsFor(request:NextRequest,site:any){const origin=originOf(request.headers.get('origin'));const headers:Record<string,string>={'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-BlockCtrl-Server-Bridge,X-Node-Id','Cache-Control':'no-store','Vary':'Origin'};if(origin&&allowedOrigins(site).has(origin))headers['Access-Control-Allow-Origin']=origin;return headers}
function response(request:NextRequest,site:any,data:unknown,status=200,extraHeaders:Record<string,string>={}){return NextResponse.json(data,{status,headers:{...corsFor(request,site),...extraHeaders}})}
export async function OPTIONS(request:NextRequest){await ensurePanelSchema();const slug=String(request.nextUrl.searchParams.get('site')||'');const site=slug?await getSite(slug):undefined;return new NextResponse(null,{status:204,headers:corsFor(request,site)})}
function tokenHash(token:string){return createHash('sha256').update(token).digest('hex')}
function requestIp(request:NextRequest){return String(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||(request.headers.get('x-forwarded-for')||'').split(',')[0]||'unknown').trim().slice(0,120)||'unknown'}
function rateKey(value:string){return createHash('sha256').update(value.toLowerCase()).digest('hex')}
type LimitResult={allowed:boolean;retryAfter:number;count:number;limit:number}
async function consumeRateLimit(websiteId:string,bucket:string,key:string,limit:number,windowMs:number):Promise<LimitResult>{
  const expiresAt=new Date(Date.now()+windowMs)
  const result=await pool.query<{count:number;expiresAt:Date}>(`INSERT INTO website_auth_rate_limits ("websiteId","bucket","keyHash","count","windowStart","expiresAt","updatedAt") VALUES ($1,$2,$3,1,now(),$4,now()) ON CONFLICT ("websiteId","bucket","keyHash") DO UPDATE SET "count"=CASE WHEN website_auth_rate_limits."expiresAt"<=now() THEN 1 ELSE website_auth_rate_limits."count"+1 END,"windowStart"=CASE WHEN website_auth_rate_limits."expiresAt"<=now() THEN now() ELSE website_auth_rate_limits."windowStart" END,"expiresAt"=CASE WHEN website_auth_rate_limits."expiresAt"<=now() THEN EXCLUDED."expiresAt" ELSE website_auth_rate_limits."expiresAt" END,"updatedAt"=now() RETURNING "count","expiresAt"`,[websiteId,bucket,rateKey(key),expiresAt])
  const row=result.rows[0];const count=Number(row?.count||1);const retryAfter=Math.max(1,Math.ceil((new Date(row?.expiresAt||expiresAt).getTime()-Date.now())/1000))
  return {allowed:count<=limit,retryAfter,count,limit}
}
async function clearRateLimit(websiteId:string,bucket:string,key:string){await pool.query('DELETE FROM website_auth_rate_limits WHERE "websiteId"=$1 AND "bucket"=$2 AND "keyHash"=$3',[websiteId,bucket,rateKey(key)])}
function rateLimited(request:NextRequest,site:any,result:LimitResult){return response(request,site,{error:'Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.',retryAfter:result.retryAfter},429,{'Retry-After':String(result.retryAfter)})}
async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const derived=await scrypt(password,salt,64) as Buffer;return `scrypt$${salt}$${derived.toString('hex')}`}
async function verifyPassword(password:string,stored:string){const [kind,salt,hex]=stored.split('$');if(kind!=='scrypt'||!salt||!hex)return false;const derived=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(hex,'hex');return expected.length===derived.length&&timingSafeEqual(expected,derived)}
async function getSite(slug:string){return (await db.select().from(websites).where(eq(websites.slug,slug)).limit(1))[0]}
async function getSiteForProvision(slug:string,serverId:string){
  if(slug)return getSite(slug)
  if(!serverId)return undefined
  const matches=await db.select({websiteId:websiteAuthSettings.websiteId}).from(websiteAuthSettings).where(and(eq(websiteAuthSettings.serverId,serverId),eq(websiteAuthSettings.serverBridgeEnabled,true))).limit(2)
  if(matches.length===1)return (await db.select().from(websites).where(eq(websites.id,matches[0].websiteId)).limit(1))[0]
  if(matches.length>1)return undefined
  const bound=await db.select().from(websites).where(eq(websites.serverId,serverId)).limit(2)
  if(bound.length!==1)return undefined
  const cfg=await authConfig(bound[0])
  return cfg.serverBridgeEnabled?bound[0]:undefined
}
function builderConfig(site:any){const data=site?.builderData&&typeof site.builderData==='object'?site.builderData as any:{};const cfg=data.auth&&typeof data.auth==='object'?data.auth:{};const binding=data.binding&&typeof data.binding==='object'?data.binding:{};const registrationMode=['website','server','both','closed'].includes(String(cfg.registrationMode))?cfg.registrationMode:(cfg.allowRegistration===false?'closed':'website');const loginMode=['email','minecraft','both'].includes(String(cfg.loginMode))?cfg.loginMode:'email';return {enabled:cfg.enabled===true,allowRegistration:registrationMode==='website'||registrationMode==='both',registrationMode,loginMode,serverId:String(cfg.serverId||binding.serverId||site?.serverId||''),sessionDays:Math.max(1,Math.min(90,Number(cfg.sessionDays)||30)),defaultRole:String(cfg.defaultRole||'member'),serverBridgeEnabled:registrationMode==='server'||registrationMode==='both',loginPageSlug:String(cfg.loginPageSlug||'giris'),registerPageSlug:String(cfg.registerPageSlug||'kayit'),afterLoginPageSlug:String(cfg.afterLoginPageSlug||'hesabim')} as Config}
async function authConfig(site:any):Promise<Config>{const fallback=builderConfig(site);const row=(await db.select().from(websiteAuthSettings).where(eq(websiteAuthSettings.websiteId,site.id)).limit(1))[0];if(!row)return fallback;return {...fallback,registrationMode:row.registrationMode as Config['registrationMode'],loginMode:row.loginMode as Config['loginMode'],serverId:row.serverId||fallback.serverId,sessionDays:row.sessionDays,defaultRole:row.defaultRole,serverBridgeEnabled:row.serverBridgeEnabled,allowRegistration:row.registrationMode==='website'||row.registrationMode==='both'}}
function publicMember(member:any){return {id:member.id,name:member.name,email:member.email||'',minecraftUsername:member.minecraftUsername,playerUuid:member.playerUuid,serverId:member.serverId,authSource:member.authSource,role:member.role||'member',allowedPages:Array.isArray(member.allowedPages)?member.allowedPages:[],status:member.status,lastLoginAt:member.lastLoginAt,createdAt:member.createdAt}}
function legacyBridgeAllowed(request:NextRequest){const expected=process.env.BLOCKCTRL_SITE_SERVER_BRIDGE_KEY||'';const supplied=request.headers.get('x-blockctrl-server-bridge')||'';if(!expected||!supplied)return false;const a=Buffer.from(createHash('sha256').update(expected).digest('hex'));const b=Buffer.from(createHash('sha256').update(supplied).digest('hex'));return a.length===b.length&&timingSafeEqual(a,b)}
async function nodeBridgeAllowed(request:NextRequest,serverId:string){
  const nodeId=String(request.headers.get('x-node-id')||'')
  const token=String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim()
  if(!nodeId||!token||!serverId)return false
  const node=(await db.select({id:nodes.id,agentTokenHash:nodes.agentTokenHash}).from(nodes).where(eq(nodes.id,nodeId)).limit(1))[0]
  if(!node)return false
  const actual=Buffer.from(createHash('sha256').update(token).digest('hex'))
  const expected=Buffer.from(node.agentTokenHash)
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false
  const server=(await db.select({id:servers.id}).from(servers).where(and(eq(servers.id,serverId),eq(servers.nodeId,node.id))).limit(1))[0]
  return Boolean(server)
}
async function createSession(request:NextRequest,siteId:string,memberId:string,cfg:Config){const token=randomBytes(32).toString('base64url');const ip=(request.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,80)||null;const userAgent=(request.headers.get('user-agent')||'').slice(0,500)||null;await db.insert(websiteMemberSessions).values({websiteId:siteId,memberId,tokenHash:tokenHash(token),ipAddress:ip,userAgent,lastSeenAt:new Date(),expiresAt:new Date(Date.now()+cfg.sessionDays*24*60*60*1000)});return token}
async function findMemberForLogin(siteId:string,identifier:string,mode:Config['loginMode']){if(mode==='email')return (await db.select().from(websiteMembers).where(and(eq(websiteMembers.websiteId,siteId),ilike(websiteMembers.email,identifier))).limit(1))[0];if(mode==='minecraft')return (await db.select().from(websiteMembers).where(and(eq(websiteMembers.websiteId,siteId),ilike(websiteMembers.minecraftUsername,identifier))).limit(1))[0];return (await db.select().from(websiteMembers).where(and(eq(websiteMembers.websiteId,siteId),or(ilike(websiteMembers.email,identifier),ilike(websiteMembers.minecraftUsername,identifier)))).limit(1))[0]}


export async function GET(request:NextRequest){
  await ensurePanelSchema();const slug=String(request.nextUrl.searchParams.get('site')||'');const site=await getSite(slug);if(!site)return response(request,site,{error:'Website bulunamadı.'},404);const cfg=await authConfig(site);if(!cfg.enabled)return response(request,site,{error:'Website üye sistemi kapalı.'},403)
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!token)return response(request,site,{user:null,config:cfg})
  const session=(await db.select().from(websiteMemberSessions).where(and(eq(websiteMemberSessions.websiteId,site.id),eq(websiteMemberSessions.tokenHash,tokenHash(token)),gt(websiteMemberSessions.expiresAt,new Date()))).limit(1))[0]
  if(!session)return response(request,site,{user:null,config:cfg})
  const member=(await db.select().from(websiteMembers).where(and(eq(websiteMembers.id,session.memberId),eq(websiteMembers.websiteId,site.id))).limit(1))[0]
  if(!member||member.status!=='active')return response(request,site,{user:null,config:cfg})
  await db.update(websiteMemberSessions).set({lastSeenAt:new Date()}).where(eq(websiteMemberSessions.id,session.id))
  return response(request,site,{user:publicMember(member),config:cfg})
}


export async function POST(request:NextRequest){
  await ensurePanelSchema();const body=await request.json().catch(()=>({})) as Record<string,unknown>;const slug=String(body.site||'');const action=String(body.action||'');const provisionServerId=String(body.serverId||'');const site=action==='server-provision'?await getSiteForProvision(slug,provisionServerId):await getSite(slug);if(!site)return response(request,site,{error:action==='server-provision'&&!slug?'Bu Minecraft sunucusuna bağlı tek ve etkin website bulunamadı.':'Website bulunamadı.'},action==='server-provision'?409:404);const cfg=await authConfig(site);if(!cfg.enabled)return response(request,site,{error:'Website üye sistemi kapalı.'},403)
  if(action==='register'){
    if(!(cfg.registrationMode==='website'||cfg.registrationMode==='both')||!cfg.allowRegistration)return response(request,site,{error:'Website üzerinden yeni üyelik kaydı kapalı.'},403)
    const name=String(body.name||'').trim().slice(0,80),email=String(body.email||'').trim().toLowerCase().slice(0,180),password=String(body.password||''),minecraftUsername=String(body.minecraftUsername||'').trim().slice(0,32)
    const registerIp=await consumeRateLimit(site.id,'register-ip',requestIp(request),8,60*60*1000);if(!registerIp.allowed)return rateLimited(request,site,registerIp)
    const registerIdentity=await consumeRateLimit(site.id,'register-identity',email||minecraftUsername||name||'anonymous',4,60*60*1000);if(!registerIdentity.allowed)return rateLimited(request,site,registerIdentity)
    const emailRequired=cfg.loginMode!=='minecraft',mcRequired=cfg.loginMode!=='email'
    if(name.length<2||password.length<8||(emailRequired&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(mcRequired&&!/^[A-Za-z0-9_]{3,32}$/.test(minecraftUsername)))return response(request,site,{error:'Kayıt alanlarını seçilen giriş yöntemine göre eksiksiz doldurun; şifre en az 8 karakter olmalı.'},400)
    if(email){const exists=(await db.select({id:websiteMembers.id}).from(websiteMembers).where(and(eq(websiteMembers.websiteId,site.id),ilike(websiteMembers.email,email))).limit(1))[0];if(exists)return response(request,site,{error:'Bu e-posta ile kayıt zaten var.'},409)}
    if(minecraftUsername){const exists=(await db.select({id:websiteMembers.id}).from(websiteMembers).where(and(eq(websiteMembers.websiteId,site.id),ilike(websiteMembers.minecraftUsername,minecraftUsername))).limit(1))[0];if(exists)return response(request,site,{error:'Bu Minecraft kullanıcı adı zaten bağlı.'},409)}
    let member:any
    try{[member]=await db.insert(websiteMembers).values({websiteId:site.id,email:email||null,name,passwordHash:await hashPassword(password),minecraftUsername:minecraftUsername||null,serverId:cfg.serverId||null,authSource:'website',role:cfg.defaultRole,allowedPages:[]}).returning()}catch(error){if((error as {code?:string})?.code==='23505')return response(request,site,{error:'Bu e-posta veya Minecraft kullanıcı adı zaten kayıtlı.'},409);throw error}
    const token=await createSession(request,site.id,member.id,cfg);await db.update(websiteMembers).set({lastLoginAt:new Date(),updatedAt:new Date()}).where(eq(websiteMembers.id,member.id))
    return response(request,site,{ok:true,token,user:publicMember({...member,lastLoginAt:new Date()}),redirect:`/${cfg.afterLoginPageSlug}`},201)
  }
  if(action==='server-provision'){
    if(!(cfg.registrationMode==='server'||cfg.registrationMode==='both')||!cfg.serverBridgeEnabled)return response(request,site,{error:'Sunucu üzerinden kayıt bu website için kapalı.'},403)
    const serverId=String(body.serverId||'')
    if(!(legacyBridgeAllowed(request)||await nodeBridgeAllowed(request,serverId)))return response(request,site,{error:'Sunucu bridge doğrulaması başarısız.'},401)
    const minecraftUsername=String(body.minecraftUsername||'').trim().slice(0,32),playerUuid=String(body.playerUuid||'').trim().slice(0,64),email=String(body.email||'').trim().toLowerCase().slice(0,180),name=String(body.name||minecraftUsername).trim().slice(0,80),password=String(body.password||'')
    if(!cfg.serverId||serverId!==cfg.serverId)return response(request,site,{error:'Bu sunucu website kayıt kaynağı olarak seçilmemiş.'},403)
    if(!/^[A-Za-z0-9_]{3,32}$/.test(minecraftUsername)||password.length<8)return response(request,site,{error:'Minecraft kullanıcı adı ve en az 8 karakter şifre gerekli.'},400)
    const provisionLimit=await consumeRateLimit(site.id,'server-provision',`${serverId}:${minecraftUsername}`,12,60*60*1000);if(!provisionLimit.allowed)return rateLimited(request,site,provisionLimit)
    const exists=(await db.select({id:websiteMembers.id}).from(websiteMembers).where(and(eq(websiteMembers.websiteId,site.id),ilike(websiteMembers.minecraftUsername,minecraftUsername))).limit(1))[0];if(exists)return response(request,site,{error:'Bu Minecraft oyuncusu zaten kayıtlı.'},409)
    if(email){const emailExists=(await db.select({id:websiteMembers.id}).from(websiteMembers).where(and(eq(websiteMembers.websiteId,site.id),ilike(websiteMembers.email,email))).limit(1))[0];if(emailExists)return response(request,site,{error:'Bu e-posta ile kayıt zaten var.'},409)}
    let member:any
    try{[member]=await db.insert(websiteMembers).values({websiteId:site.id,email:email||null,name:name||minecraftUsername,passwordHash:await hashPassword(password),minecraftUsername,playerUuid:playerUuid||null,serverId,authSource:'server',role:cfg.defaultRole,allowedPages:[]}).returning()}catch(error){if((error as {code?:string})?.code==='23505')return response(request,site,{error:'Bu e-posta veya Minecraft kullanıcı adı zaten kayıtlı.'},409);throw error}
    return response(request,site,{ok:true,user:publicMember(member)},201)
  }
  if(action==='login'){
    const identifier=String(body.identifier||body.email||body.minecraftUsername||'').trim().slice(0,180),password=String(body.password||'');if(!identifier||!password)return response(request,site,{error:'Giriş bilgileri eksik.'},400)
    const loginIp=await consumeRateLimit(site.id,'login-ip',requestIp(request),60,10*60*1000);if(!loginIp.allowed)return rateLimited(request,site,loginIp)
    const loginIdentity=await consumeRateLimit(site.id,'login-identity',identifier,8,10*60*1000);if(!loginIdentity.allowed)return rateLimited(request,site,loginIdentity)
    const member=await findMemberForLogin(site.id,identifier,cfg.loginMode)
    if(!member||member.status!=='active'||!(await verifyPassword(password,member.passwordHash)))return response(request,site,{error:'Giriş bilgileri hatalı.'},401)
    await Promise.all([clearRateLimit(site.id,'login-identity',identifier),clearRateLimit(site.id,'login-ip',requestIp(request))])
    const token=await createSession(request,site.id,member.id,cfg);const now=new Date();await db.update(websiteMembers).set({lastLoginAt:now,updatedAt:now}).where(eq(websiteMembers.id,member.id))
    return response(request,site,{ok:true,token,user:publicMember({...member,lastLoginAt:now}),redirect:`/${cfg.afterLoginPageSlug}`})
  }
  if(action==='logout'){
    const token=String(body.token||'');if(token)await db.delete(websiteMemberSessions).where(and(eq(websiteMemberSessions.websiteId,site.id),eq(websiteMemberSessions.tokenHash,tokenHash(token))))
    return response(request,site,{ok:true,redirect:`/${cfg.loginPageSlug}`})
  }
  return response(request,site,{error:'Geçersiz üye işlemi.'},400)
}
