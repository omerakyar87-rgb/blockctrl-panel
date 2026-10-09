import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { del, list } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, gt, inArray, like, or } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { auditLog, serverPermissions, serverSettings, serverWebsiteData, servers, websiteAuthRateLimits, websiteAuthSettings, websiteFormSubmissions, websiteMembers, websiteMemberSessions, websites } from '@/lib/db/schema'
import { resolvePanelUser } from '@/lib/db/identity'

const RESERVED = new Set(['www','api','admin','dashboard','panel','support','destek','blockctrl','vercel','app','mail','status'])
const STATUS_MAP:Record<string,string>={READY:'ready',BUILDING:'building',QUEUED:'queued',INITIALIZING:'building',ERROR:'failed',CANCELED:'failed'}
async function cleanupWebsiteBlobs(websiteId:string){const prefix=`websites/${websiteId}/`;let cursor:string|undefined,deleted=0;try{for(let page=0;page<20;page++){const result=await list({prefix,limit:1000,cursor});if(result.blobs.length){await del(result.blobs.map(item=>item.url));deleted+=result.blobs.length}if(!result.hasMore||!result.cursor)break;cursor=result.cursor}return{deleted,error:null as string|null}}catch(error){return{deleted,error:error instanceof Error?error.message:'Blob cleanup failed'}}}

function normalizeRole(role:unknown){
  const value=String(role??'').toLowerCase()
  return value==='manager'||value==='admin'||value==='guide'||value==='member'?value:'member'
}
function canCreate(role:unknown){const r=normalizeRole(role);return r==='manager'||r==='member'}
function cleanSlug(input:unknown){
  return String(input??'')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)
}
function suffix(){
  const value=cleanSlug(process.env.BLOCKCTRL_WEBSITE_PROJECT_SUFFIX||'blockctrl')
  return value||'blockctrl'
}
function runtimeBase(request?:NextRequest){
  const explicit=String(process.env.BLOCKCTRL_PUBLIC_URL||process.env.NEXT_PUBLIC_APP_URL||'').trim()
  const vercelHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL||'').trim()
  const candidate=explicit||(vercelHost?'https://'+vercelHost:'')||request?.nextUrl.origin||''
  try{const url=new URL(candidate);return url.protocol==='https:'?url.origin:''}catch{return ''}
}
function vercelConfig(){
  return {
    token:process.env.VERCEL_TOKEN||'',
    teamId:process.env.VERCEL_TEAM_ID||process.env.VERCEL_ORG_ID||'',
    teamSlug:process.env.VERCEL_TEAM_SLUG||'',
  }
}
function teamQuery(){
  const {teamId,teamSlug}=vercelConfig()
  const query=new URLSearchParams()
  if(teamId)query.set('teamId',teamId)
  else if(teamSlug)query.set('slug',teamSlug)
  const text=query.toString()
  return text?`?${text}`:''
}
async function vercel(path:string,init:RequestInit={}){
  const {token}=vercelConfig()
  if(!token)throw new Error('Vercel yayın entegrasyonu yapılandırılmadı.')
  const method=String(init.method||'GET').toUpperCase()
  const retryable=method==='GET'||method==='HEAD'||method==='DELETE'
  const maxAttempts=retryable?3:1
  let lastError:unknown
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const response=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}${teamQuery().replace(/^\?/,'')}`,{
        ...init,
        headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})},
        cache:'no-store',
        signal:init.signal??AbortSignal.timeout(15_000),
      })
      const text=await response.text()
      let data:Record<string,unknown>={}
      try{data=text?JSON.parse(text) as Record<string,unknown>:{} }catch{data={}}
      if(!response.ok){
        const error=data.error&&typeof data.error==='object'?data.error as Record<string,unknown>:data
        const message=String(error.message??error.error??`Vercel API hatası (HTTP ${response.status})`)
        const err=new Error(message) as Error & {status?:number;retryAfter?:number}
        err.status=response.status
        const retryAfter=Number(response.headers.get('retry-after')||0)
        if(Number.isFinite(retryAfter)&&retryAfter>0)err.retryAfter=retryAfter
        if(!(retryable&&(response.status===429||response.status>=500)&&attempt<maxAttempts))throw err
        lastError=err
        await new Promise(resolve=>setTimeout(resolve,Math.min(3000,(retryAfter>0?retryAfter*1000:300*2**(attempt-1)))))
        continue
      }
      return data
    }catch(error){
      lastError=error
      if(!retryable||attempt>=maxAttempts)throw error
      await new Promise(resolve=>setTimeout(resolve,300*2**(attempt-1)))
    }
  }
  throw lastError instanceof Error?lastError:new Error('Vercel API isteği başarısız.')
}
async function resolveVercelAlias(projectId:string,projectName:string){
  try{
    const result=await vercel(`/v4/aliases?projectId=${encodeURIComponent(projectId)}&limit=100`,{method:'GET'})
    const aliases=Array.isArray(result.aliases)?result.aliases as Array<Record<string,unknown>>:[]
    const preferred=aliases.find(item=>String(item.alias||'')===`${projectName}.vercel.app`)
      ?? aliases.find(item=>String(item.alias||'').endsWith('.vercel.app'))
    const host=String(preferred?.alias||'')
    return host?`https://${host}`:null
  }catch{return null}
}
function esc(value:string){return value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch))}
function normalizedBasePath(value:string){const raw=String(value||'').trim();if(!raw)return '';const parts=raw.split('/').filter(Boolean).map(part=>encodeURIComponent(decodeURIComponent(part)));return parts.length?'/'+parts.join('/'):''}
function sitePagePath(slug:string,basePath=''){const base=normalizedBasePath(basePath);return slug?`${base}/${encodeURIComponent(slug)}/`:`${base}/`}
function siteHref(value:string,basePath=''){const href=String(value||'').trim();if(!href)return '#';if(href==='#'||href.startsWith('#')||href.startsWith('mailto:')||href.startsWith('tel:')||/^https:\/\//i.test(href))return href;if(href.startsWith('/'))return normalizedBasePath(basePath)+href;return href}
function starterHtml(name:string,description:string,template:string){
  const safeName=esc(name)
  const safeDesc=esc(description||'BlockCtrl ile yayınlanan yeni website.')
  const minecraft=template==='minecraft'
  const landing=template==='landing'
  const eyebrow=minecraft?'MINECRAFT TOPLULUĞU':landing?'YENİ PROJE':'BLOCKCTRL WEBSITE'
  const title=minecraft?`${safeName} Sunucusuna Hoş Geldin`:safeName
  const copy=minecraft?'Sunucu duyuruları, topluluk bilgileri ve bağlantılar için yeni web alanınız hazır.':safeDesc
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeName}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 10%,#08345a 0,transparent 32%),radial-gradient(circle at 80% 80%,#062a46 0,transparent 30%),#030b13;color:#eef9ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.wrap{width:min(920px,calc(100% - 36px));padding:64px;border:1px solid rgba(56,189,248,.22);border-radius:28px;background:linear-gradient(145deg,rgba(7,24,39,.92),rgba(4,15,27,.92));box-shadow:0 40px 120px rgba(0,0,0,.45)}.brand{display:flex;align-items:center;gap:12px;color:#38bdf8;font-weight:800;letter-spacing:.08em}.cube{width:34px;height:34px;border-radius:10px;background:linear-gradient(145deg,#22d3ee,#2563eb);box-shadow:0 0 30px rgba(34,211,238,.3)}.eyebrow{margin-top:64px;font-size:12px;letter-spacing:.24em;color:#7dd3fc}.title{font-size:clamp(42px,7vw,78px);line-height:.98;margin:16px 0 20px;letter-spacing:-.05em}.copy{max-width:650px;color:#a8c4d6;font-size:18px;line-height:1.75}.badge{display:inline-flex;margin-top:32px;padding:10px 14px;border-radius:999px;border:1px solid rgba(45,212,191,.25);background:rgba(16,185,129,.08);color:#6ee7b7;font-size:13px}.foot{margin-top:70px;padding-top:20px;border-top:1px solid rgba(125,211,252,.12);font-size:12px;color:#527086}@media(max-width:640px){.wrap{padding:34px}.eyebrow{margin-top:44px}}</style></head><body><main class="wrap"><div class="brand"><span class="cube"></span>BLOCKCTRL</div><div class="eyebrow">${eyebrow}</div><h1 class="title">${title}</h1><p class="copy">${copy}</p><span class="badge">● Website yayında</span><div class="foot">BlockCtrl ile Vercel üzerinde yayınlandı.</div></main></body></html>`
}

type BuilderBackground={type:'color'|'gradient'|'image'|'video';color:string;gradient:string;mediaUrl:string;overlayColor:string;overlayOpacity:number;position:'center'|'top'|'bottom'|'left'|'right'}
type BuilderItem={title:string;description:string;value?:string;image?:string;href?:string}
type BuilderLiveData={mode:'static'|'auto'|'source';source:'server-status'|'players'|'metrics'|'map'|'support'|'store'|'wiki'|'lost-items'|'leaderboard-kills'|'leaderboard-money'|'leaderboard-health'|'leaderboard-playtime'|'bans'|'custom-json';serverId:string;endpoint:string;refreshSeconds:number}
type BuilderAuth={enabled:boolean;allowRegistration:boolean;registrationMode:'website'|'server'|'both'|'closed';loginMode:'email'|'minecraft'|'both';serverId:string;sessionDays:number;defaultRole:string;loginPageSlug:string;registerPageSlug:string;afterLoginPageSlug:string}
type BuilderSection={id:string;type:string;variant:string;label:string;title:string;subtitle:string;body:string;buttonText:string;buttonHref:string;secondaryButtonText:string;secondaryButtonHref:string;items:BuilderItem[];liveData:BuilderLiveData;background:BuilderBackground;settings:{width:'boxed'|'wide'|'full';align:'left'|'center'|'right';paddingY:number;minHeight:number;placement:'flow'|'sticky-top'|'fixed-top'|'fixed-bottom';visible:boolean;rounded:number}}
type BuilderPage={id:string;name:string;slug:string;seoTitle:string;seoDescription:string;showInNav:boolean;pageType:'standard'|'login'|'register'|'member-dashboard';requiresAuth:boolean;accessMode:'public'|'authenticated'|'assigned'|'role';allowedRoles:string[];sections:BuilderSection[]}
type BuilderBinding={serverId:string;inheritLiveData:boolean}
type BuilderData={version:1;theme:{primary:string;secondary:string;background:string;text:string;muted:string;fontFamily:string;radius:number};binding:BuilderBinding;auth:BuilderAuth;pages:BuilderPage[]}
const BUILDER_TYPES=new Set(['navbar','hero','features','stats','content','gallery','map','pricing','testimonials','team','faq','contact','cta','footer','minecraft','support','banlist','leaderboard','wiki','guide','connect','store','login','register','member-dashboard'])
const LIVE_SOURCES=new Set(['server-status','players','metrics','map','support','store','wiki','lost-items','leaderboard-kills','leaderboard-money','leaderboard-health','leaderboard-playtime','bans','custom-json'])
const BUILDER_PLACEMENTS=new Set(['flow','sticky-top','fixed-top','fixed-bottom'])
const BUILDER_WIDTHS=new Set(['boxed','wide','full'])
const BUILDER_ALIGNS=new Set(['left','center','right'])
function textValue(value:unknown,max=500){return String(value??'').trim().slice(0,max)}
function numberValue(value:unknown,min:number,max:number,fallback:number){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function safeColor(value:unknown,fallback:string){const v=String(value??'').trim();return /^#[0-9a-f]{6}$/i.test(v)?v:fallback}
function safeCssGradient(value:unknown){const v=String(value??'').trim().slice(0,400);return /^(linear-gradient|radial-gradient)\(/i.test(v)?v:'linear-gradient(135deg,#071827,#0b2640)'}
function safeMediaUrl(value:unknown){const v=String(value??'').trim().slice(0,2000);if(!v)return '';try{const u=new URL(v);return u.protocol==='https:'?v:''}catch{return ''}}
function safeHref(value:unknown){const v=String(value??'').trim().slice(0,600);if(!v)return '#';if(v.startsWith('/')||v.startsWith('#')||v.startsWith('mailto:')||v.startsWith('tel:'))return v;try{const u=new URL(v);return u.protocol==='https:'?v:'#'}catch{return '#'}}
function safeEndpoint(value:unknown){const v=String(value??'').trim().slice(0,2000);if(!v)return '';try{const u=new URL(v);return u.protocol==='https:'?v:''}catch{return ''}}
function defaultLiveData(type:string,variant=''):BuilderLiveData{if(type==='map')return {mode:'auto',source:'map',serverId:'',endpoint:'',refreshSeconds:30};if(type==='support')return {mode:'auto',source:'support',serverId:'',endpoint:'',refreshSeconds:30};if(type==='store')return {mode:'auto',source:'store',serverId:'',endpoint:'',refreshSeconds:60};if(type==='wiki')return {mode:'auto',source:'wiki',serverId:'',endpoint:'',refreshSeconds:60};if(type==='minecraft'||type==='stats'||type==='connect'||type==='member-dashboard')return {mode:'auto',source:'server-status',serverId:'',endpoint:'',refreshSeconds:15};if(type==='banlist')return {mode:'auto',source:'bans',serverId:'',endpoint:'',refreshSeconds:30};if(type==='leaderboard')return {mode:'auto',source:variant.includes('3')?'leaderboard-money':variant.includes('4')?'leaderboard-health':variant.includes('5')?'leaderboard-playtime':'leaderboard-kills',serverId:'',endpoint:'',refreshSeconds:30};return {mode:'static',source:'server-status',serverId:'',endpoint:'',refreshSeconds:30}}
function normalizeBuilderData(input:unknown,siteName='Website'):BuilderData{
  const root=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{}
  const themeRaw=root.theme&&typeof root.theme==='object'&&!Array.isArray(root.theme)?root.theme as Record<string,unknown>:{}
  const theme={primary:safeColor(themeRaw.primary,'#0ea5e9'),secondary:safeColor(themeRaw.secondary,'#7c3aed'),background:safeColor(themeRaw.background,'#030b13'),text:safeColor(themeRaw.text,'#f4f9ff'),muted:safeColor(themeRaw.muted,'#91a9bb'),fontFamily:textValue(themeRaw.fontFamily,160)||'Inter, ui-sans-serif, system-ui, sans-serif',radius:numberValue(themeRaw.radius,0,40,18)}
  const bindingRaw=root.binding&&typeof root.binding==='object'&&!Array.isArray(root.binding)?root.binding as Record<string,unknown>:{}
  const binding:BuilderBinding={serverId:textValue(bindingRaw.serverId,80),inheritLiveData:bindingRaw.inheritLiveData!==false}
  const authRaw=root.auth&&typeof root.auth==='object'&&!Array.isArray(root.auth)?root.auth as Record<string,unknown>:{}
  const registrationMode=['website','server','both','closed'].includes(String(authRaw.registrationMode))?String(authRaw.registrationMode) as BuilderAuth['registrationMode']:(authRaw.allowRegistration===false?'closed':'website')
  const loginMode=['email','minecraft','both'].includes(String(authRaw.loginMode))?String(authRaw.loginMode) as BuilderAuth['loginMode']:'email'
  const auth:BuilderAuth={enabled:authRaw.enabled===true,allowRegistration:registrationMode==='website'||registrationMode==='both',registrationMode,loginMode,serverId:textValue(authRaw.serverId,80),sessionDays:numberValue(authRaw.sessionDays,1,90,30),defaultRole:cleanSlug(authRaw.defaultRole)||'member',loginPageSlug:cleanSlug(authRaw.loginPageSlug)||'giris',registerPageSlug:cleanSlug(authRaw.registerPageSlug)||'kayit',afterLoginPageSlug:cleanSlug(authRaw.afterLoginPageSlug)||'hesabim'}
  const rawPages=Array.isArray(root.pages)?root.pages.slice(0,20):[]
  const pages:BuilderPage[]=[];const pageSlugs=new Set<string>()
  for(let pageIndex=0;pageIndex<rawPages.length;pageIndex++){
    const raw=rawPages[pageIndex]&&typeof rawPages[pageIndex]==='object'?rawPages[pageIndex] as Record<string,unknown>:{}
    const baseName=textValue(raw.name,80)||`Sayfa ${pageIndex+1}`
    let slug=cleanSlug(raw.slug)
    if(pageIndex===0&&(!slug||slug==='anasayfa'||slug==='home'))slug=''
    if(slug&&pageSlugs.has(slug))slug=`${slug}-${pageIndex+1}`
    pageSlugs.add(slug)
    const rawSections=Array.isArray(raw.sections)?raw.sections.slice(0,120):[]
    const sections:BuilderSection[]=[]
    for(let sectionIndex=0;sectionIndex<rawSections.length;sectionIndex++){
      const item=rawSections[sectionIndex]&&typeof rawSections[sectionIndex]==='object'?rawSections[sectionIndex] as Record<string,unknown>:{}
      const type=textValue(item.type,30).toLowerCase();if(!BUILDER_TYPES.has(type))continue
      const settingsRaw=item.settings&&typeof item.settings==='object'&&!Array.isArray(item.settings)?item.settings as Record<string,unknown>:{}
      const bgRaw=item.background&&typeof item.background==='object'&&!Array.isArray(item.background)?item.background as Record<string,unknown>:{}
      const liveRaw=item.liveData&&typeof item.liveData==='object'&&!Array.isArray(item.liveData)?item.liveData as Record<string,unknown>:{}
      const defaultLive=defaultLiveData(type,textValue(item.variant,60))
      const bgType=['color','gradient','image','video'].includes(String(bgRaw.type))?String(bgRaw.type) as BuilderBackground['type']:'color'
      const items:Array<BuilderItem>=[]
      if(Array.isArray(item.items))for(const rawItem of item.items.slice(0,24)){if(!rawItem||typeof rawItem!=='object')continue;const row=rawItem as Record<string,unknown>;items.push({title:textValue(row.title,100),description:textValue(row.description,500),value:textValue(row.value,60)||undefined,image:safeMediaUrl(row.image)||undefined,href:safeHref(row.href)})}
      sections.push({
        id:textValue(item.id,80).replace(/[^a-zA-Z0-9_-]/g,'')||crypto.randomUUID(),type,variant:textValue(item.variant,60)||`${type}-1`,label:textValue(item.label,120)||type,
        title:textValue(item.title,180),subtitle:textValue(item.subtitle,220),body:textValue(item.body,4000),buttonText:textValue(item.buttonText,80),buttonHref:safeHref(item.buttonHref),secondaryButtonText:textValue(item.secondaryButtonText,80),secondaryButtonHref:safeHref(item.secondaryButtonHref),items,
        liveData:{mode:['static','auto','source'].includes(String(liveRaw.mode))?String(liveRaw.mode) as BuilderLiveData['mode']:defaultLive.mode,source:LIVE_SOURCES.has(String(liveRaw.source))?String(liveRaw.source) as BuilderLiveData['source']:defaultLive.source,serverId:textValue(liveRaw.serverId,80),endpoint:safeEndpoint(liveRaw.endpoint),refreshSeconds:numberValue(liveRaw.refreshSeconds,5,120,defaultLive.refreshSeconds)},
        background:{type:bgType,color:safeColor(bgRaw.color,'#071827'),gradient:safeCssGradient(bgRaw.gradient),mediaUrl:safeMediaUrl(bgRaw.mediaUrl),overlayColor:safeColor(bgRaw.overlayColor,'#020817'),overlayOpacity:numberValue(bgRaw.overlayOpacity,0,95,35),position:['center','top','bottom','left','right'].includes(String(bgRaw.position))?String(bgRaw.position) as BuilderBackground['position']:'center'},
        settings:{width:BUILDER_WIDTHS.has(String(settingsRaw.width))?String(settingsRaw.width) as BuilderSection['settings']['width']:'wide',align:BUILDER_ALIGNS.has(String(settingsRaw.align))?String(settingsRaw.align) as BuilderSection['settings']['align']:'center',paddingY:numberValue(settingsRaw.paddingY,0,160,64),minHeight:numberValue(settingsRaw.minHeight,40,1000,220),placement:BUILDER_PLACEMENTS.has(String(settingsRaw.placement))?String(settingsRaw.placement) as BuilderSection['settings']['placement']:'flow',visible:settingsRaw.visible!==false,rounded:numberValue(settingsRaw.rounded,0,40,0)},
      })
    }
    const pageType=['standard','login','register','member-dashboard'].includes(String(raw.pageType))?String(raw.pageType) as BuilderPage['pageType']:'standard'
    const accessMode=['public','authenticated','assigned','role'].includes(String(raw.accessMode))?String(raw.accessMode) as BuilderPage['accessMode']:(raw.requiresAuth===true||pageType==='member-dashboard'?'authenticated':'public')
    const allowedRoles=Array.isArray(raw.allowedRoles)?raw.allowedRoles.map(value=>cleanSlug(value)).filter(Boolean).slice(0,12):[]
    pages.push({id:textValue(raw.id,80).replace(/[^a-zA-Z0-9_-]/g,'')||crypto.randomUUID(),name:baseName,slug,seoTitle:textValue(raw.seoTitle,180)||baseName,seoDescription:textValue(raw.seoDescription,320),showInNav:raw.showInNav!==false,pageType,requiresAuth:accessMode!=='public',accessMode,allowedRoles,sections})
  }
  if(!pages.length)pages.push({id:crypto.randomUUID(),name:'Ana Sayfa',slug:'',seoTitle:siteName,seoDescription:'',showInNav:true,pageType:'standard',requiresAuth:false,accessMode:'public',allowedRoles:[],sections:[]})
  if(!pages.some(page=>page.slug===''))pages[0].slug=''
  return {version:1,theme,binding,auth,pages}
}
async function accessibleServerIds(userId:string,role:string){
  if(role==='manager')return (await db.select({id:servers.id}).from(servers)).map(row=>row.id)
  const own=await db.select({id:servers.id}).from(servers).where(eq(servers.userId,userId))
  const grants=await db.select({serverId:serverPermissions.serverId}).from(serverPermissions).where(and(eq(serverPermissions.userId,userId),eq(serverPermissions.canWebsiteData,true)))
  return [...new Set([...own.map(row=>row.id),...grants.map(row=>row.serverId)])]
}
async function accessibleServerRows(userId:string,role:string){
  const ids=await accessibleServerIds(userId,role)
  if(!ids.length)return []
  const rows=await db.select().from(servers).where(inArray(servers.id,ids))
  return Promise.all(rows.map(async server=>{
    const settings=(await db.select({settings:serverSettings.settings}).from(serverSettings).where(eq(serverSettings.serverId,server.id)).limit(1))[0]
    const raw=(settings?.settings||{}) as Record<string,unknown>
    const mapUrl=safeEndpoint(raw.websiteMapUrl||raw.bluemapUrl||raw.dynmapUrl)
    const mapProvider=['bluemap','dynmap','custom'].includes(String(raw.websiteMapProvider))?String(raw.websiteMapProvider):mapUrl?'custom':''
    return {id:server.id,name:server.name,status:server.status,playerCount:server.playerCount,mcVersion:server.mcVersion,loader:server.loader,owned:server.userId===userId||role==='manager',canWebsiteData:true,map:{configured:Boolean(mapUrl),url:mapUrl||null,provider:mapProvider||null}}
  }))
}
async function prepareBuilderData(input:unknown,siteName:string,userId:string,role:string,preferredServerId=''){
  const builder=normalizeBuilderData(input,siteName)
  const allowed=await accessibleServerIds(userId,role);const allowedSet=new Set(allowed)
  const requested=allowedSet.has(preferredServerId)?preferredServerId:''
  if(builder.binding.serverId&&!allowedSet.has(builder.binding.serverId))builder.binding.serverId=''
  if(!builder.binding.serverId)builder.binding.serverId=requested||allowed[0]||''
  if(builder.auth.serverId&&!allowedSet.has(builder.auth.serverId))builder.auth.serverId=''
  for(const page of builder.pages)for(const section of page.sections){
    if(section.liveData.mode==='static'||section.liveData.source==='custom-json')continue
    if(section.liveData.serverId&&!allowedSet.has(section.liveData.serverId))section.liveData.serverId=''
    if(builder.binding.inheritLiveData&&section.liveData.serverId===builder.binding.serverId)section.liveData.serverId=''
  }
  return builder
}
async function syncAuthSettings(websiteId:string,builder:BuilderData,executor:any=db){
  const auth=builder.auth
  await executor.insert(websiteAuthSettings).values({websiteId,registrationMode:auth.registrationMode,loginMode:auth.loginMode,serverId:auth.serverId||builder.binding.serverId||null,sessionDays:auth.sessionDays,defaultRole:auth.defaultRole,serverBridgeEnabled:auth.registrationMode==='server'||auth.registrationMode==='both',updatedAt:new Date()}).onConflictDoUpdate({target:websiteAuthSettings.websiteId,set:{registrationMode:auth.registrationMode,loginMode:auth.loginMode,serverId:auth.serverId||builder.binding.serverId||null,sessionDays:auth.sessionDays,defaultRole:auth.defaultRole,serverBridgeEnabled:auth.registrationMode==='server'||auth.registrationMode==='both',updatedAt:new Date()}})
}
const WEBSITE_MANAGED_PUBLIC_SOURCES=new Set<BuilderLiveData['source']>(['support','store','wiki'])
function websitePublicSourceKey(websiteId:string,source:string){return `website:${websiteId}:${source}`}
async function syncWebsiteManagedPublicData(websiteId:string,userId:string,builder:BuilderData,executor:any=db){
  const grouped=new Map<string,{serverId:string;source:BuilderLiveData['source'];items:Array<{title:string;description:string;value:string;image?:string|null;href?:string|null}>}>()
  for(const page of builder.pages)for(const section of page.sections){
    if(section.liveData.mode!=='auto'||!WEBSITE_MANAGED_PUBLIC_SOURCES.has(section.liveData.source))continue
    const serverId=section.liveData.serverId||builder.binding.serverId
    if(!serverId)continue
    const key=`${serverId}|${section.liveData.source}`
    const group=grouped.get(key)||{serverId,source:section.liveData.source,items:[]}
    for(const item of section.items){
      if(group.items.length>=25)break
      const href=safeHref(item.href)
      group.items.push({title:textValue(item.title,80),description:textValue(item.description,500),value:textValue(item.value,120),image:safeMediaUrl(item.image)||null,href:href==='#'?null:href})
    }
    grouped.set(key,group)
  }
  await executor.delete(serverWebsiteData).where(like(serverWebsiteData.source,websitePublicSourceKey(websiteId,'%')))
  for(const group of grouped.values()){
    await executor.insert(serverWebsiteData).values({userId,serverId:group.serverId,source:websitePublicSourceKey(websiteId,group.source),data:{items:group.items},updatedAt:new Date()}).onConflictDoUpdate({target:[serverWebsiteData.serverId,serverWebsiteData.source],set:{userId,data:{items:group.items},updatedAt:new Date()}})
  }
}
function validateAuthPages(builder:BuilderData){
  if(!builder.auth.enabled)return
  const slugs=new Set(builder.pages.map(page=>page.slug))
  const required=[builder.auth.loginPageSlug,builder.auth.afterLoginPageSlug]
  if(builder.auth.registrationMode==='website'||builder.auth.registrationMode==='both')required.push(builder.auth.registerPageSlug)
  const missing=[...new Set(required.filter(Boolean))].filter(slug=>!slugs.has(slug))
  if(missing.length)throw new Error(`Üye sistemi için gerekli sayfalar eksik: ${missing.map(slug=>`/${slug}`).join(', ')}`)
}
function rgbaFromHex(hex:string,opacity:number){const raw=hex.replace('#','');const r=parseInt(raw.slice(0,2),16),g=parseInt(raw.slice(2,4),16),b=parseInt(raw.slice(4,6),16);return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,opacity/100))})`}
function sectionBackground(section:BuilderSection){if(section.background.type==='gradient')return section.background.gradient;if(section.background.type==='image'&&section.background.mediaUrl)return `url('${section.background.mediaUrl.replace(/'/g,'%27')}')`;return section.background.color}
function renderItems(section:BuilderSection){
  if(section.type==='map'){const mapItem=section.items[0];const mapUrl=mapItem?.href&&/^https:\/\//i.test(mapItem.href)?mapItem.href:'';const points=section.items.slice(1,5);return `<div class="world-map-layout"><div class="world-map-frame">${mapUrl?`<iframe src="${esc(mapUrl)}" title="${esc(mapItem?.title||'Minecraft dünya haritası')}" loading="lazy" referrerpolicy="no-referrer"></iframe>`:`<div class="world-map-placeholder"><div class="map-grid"></div><div class="map-glow one"></div><div class="map-glow two"></div><div class="map-pin"><b>⌖</b><span>Spawn</span></div><div class="map-hint">BlueMap / Dynmap HTTPS bağlantısını ilk kartın bağlantı alanına ekleyin.</div></div>`}</div><div class="map-points">${points.map(item=>`<article><div class="map-point-icon">⌖</div><div><b>${esc(item.title)}</b><span>${esc(item.description)}</span>${item.value?`<em>${esc(item.value)}</em>`:''}</div></article>`).join('')}</div></div>`}

  if(section.type==='stats')return `<div class="grid stats">${section.items.map(item=>`<article><strong>${esc(item.value||'—')}</strong><b>${esc(item.title)}</b><span>${esc(item.description)}</span></article>`).join('')}</div>`
  if(['features','minecraft','wiki','guide','connect'].includes(section.type))return `<div class="grid features">${section.items.map(item=>`<article><i>◆</i><div class="item-head"><b>${esc(item.title)}</b>${item.value?`<em>${esc(item.value)}</em>`:''}</div><span>${esc(item.description)}</span></article>`).join('')}</div>`
  if(section.type==='banlist')return `<div class="data-list bans">${section.items.map((item,i)=>`<article><strong>${i+1}</strong><div><b>${esc(item.title)}</b><span>${esc(item.description)}</span></div><em>${esc(item.value||'Aktif')}</em></article>`).join('')}</div>`
  if(section.type==='leaderboard')return `<div class="data-list leaderboard">${section.items.map((item,i)=>`<article class="${i===0?'top':''}"><strong>#${i+1}</strong><div><b>${esc(item.title)}</b><span>${esc(item.description)}</span></div><em>${esc(item.value||'—')}</em></article>`).join('')}</div>`
  if(section.type==='store')return `<div class="grid store">${section.items.map(item=>`<article>${item.image?`<img src="${esc(item.image)}" alt="${esc(item.title)}">`:`<div class="product-placeholder">◆</div>`}<b>${esc(item.title)}</b><strong>${esc(item.value||'')}</strong><span>${esc(item.description)}</span>${item.href&&item.href!=='#'?`<a href="${esc(item.href)}">Satın Al</a>`:`<span class="disabled-action" aria-disabled="true">Satın alma bağlantısı eklenmedi</span>`}</article>`).join('')}</div>`
  if(section.type==='pricing')return `<div class="grid pricing">${section.items.map((item,i)=>`<article class="${i===1?'featured':''}"><b>${esc(item.title)}</b><strong>${esc(item.value||'')}</strong><span>${esc(item.description)}</span>${item.href&&item.href!=='#'?`<a href="${esc(item.href)}">Seç</a>`:`<span class="disabled-action" aria-disabled="true">Plan bağlantısı eklenmedi</span>`}</article>`).join('')}</div>`
  if(section.type==='faq')return `<div class="faq">${section.items.map(item=>`<details><summary>${esc(item.title)}</summary><p>${esc(item.description)}</p></details>`).join('')}</div>`
  if(section.type==='gallery')return `<div class="grid gallery">${section.items.map(item=>item.image?`<img src="${esc(item.image)}" alt="${esc(item.title)}">`:`<div class="placeholder">${esc(item.title)}</div>`).join('')}</div>`
  if(section.type==='team'||section.type==='testimonials')return `<div class="grid cards">${section.items.map(item=>`<article><div class="avatar"></div><b>${esc(item.title)}</b><span>${esc(item.description)}</span></article>`).join('')}</div>`
  return ''
}
function renderSection(section:BuilderSection,pages:BuilderPage[],theme:BuilderData['theme'],authConfig:BuilderAuth,basePath=''){
  if(!section.settings.visible)return ''
  const placement=section.settings.placement==='sticky-top'?'sticky':section.settings.placement==='fixed-top'?'fixed top':section.settings.placement==='fixed-bottom'?'fixed bottom':''
  const width=section.settings.width==='boxed'?'boxed':section.settings.width==='full'?'full':'wide'
  const align=`align-${section.settings.align}`
  const media=section.background.type==='video'&&section.background.mediaUrl?`<video class="section-video" src="${esc(section.background.mediaUrl)}" autoplay muted loop playsinline></video>`:''
  const overlay=(section.background.type==='image'||section.background.type==='video')?`<div class="overlay" style="background:${rgbaFromHex(section.background.overlayColor,section.background.overlayOpacity)}"></div>`:''
  const style=`background:${sectionBackground(section)};background-position:${section.background.position};background-size:cover;min-height:${section.settings.minHeight}px;padding:${section.settings.paddingY}px 24px;border-radius:${section.settings.rounded}px`
  const liveAttrs=section.liveData.mode!=='static'?` data-live-source="${esc(section.liveData.source)}" data-live-server="${esc(section.liveData.serverId)}" data-live-endpoint="${esc(section.liveData.endpoint)}" data-live-refresh="${section.liveData.refreshSeconds}"`:''
  if(section.type==='navbar'){
    const links=pages.filter(page=>page.showInNav).map(page=>`<a data-page-link data-page-slug="${esc(page.slug)}" data-access-mode="${esc(page.accessMode)}" data-roles="${esc(page.allowedRoles.join(','))}" href="${esc(sitePagePath(page.slug,basePath))}">${esc(page.name)}</a>`).join('')
    return `<section class="builder-section navbar ${placement}" style="${style}">${media}${overlay}<div class="inner ${width}"><b class="brand">${esc(section.title||'LOGO')}</b><nav>${links}</nav>${section.buttonText?`<a class="btn" href="${esc(siteHref(section.buttonHref,basePath))}">${esc(section.buttonText)}</a>`:''}</div></section>`
  }
  if(section.type==='footer'){const footerLinks=pages.filter(page=>page.showInNav).slice(0,9).map(page=>`<a href="${esc(sitePagePath(page.slug,basePath))}">${esc(page.name)}</a>`);const cols=[footerLinks.slice(0,3),footerLinks.slice(3,6),footerLinks.slice(6,9)];return `<footer class="builder-section ${placement}" style="${style}">${media}${overlay}<div class="inner ${width} footer"><div><b>${esc(section.title)}</b><p>${esc(section.body)}</p></div>${cols.map((links,index)=>`<div><b>${['Sayfalar','Topluluk','Bağlantılar'][index]}</b>${links.length?links.join(''):'<span>Bağlantı eklenmedi</span>'}</div>`).join('')}</div></footer>`}
  if(section.type==='login'){const identifierLabel=authConfig.loginMode==='minecraft'?'Minecraft Kullanıcı Adı':authConfig.loginMode==='both'?'E-posta veya Minecraft Kullanıcı Adı':'E-posta';const identifierType=authConfig.loginMode==='email'?'email':'text';return `<section class="builder-section auth-section ${align}" style="${style}">${media}${overlay}<div class="inner ${width}"><div class="heading"><span class="eyebrow">${esc(section.subtitle)}</span><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p></div><form class="auth-card" data-blockctrl-auth="login"><label>${esc(identifierLabel)}<input name="identifier" type="${identifierType}" autocomplete="username" required></label><label>Şifre<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><button type="submit">${esc(section.buttonText||'Giriş Yap')}</button><p class="form-message" aria-live="polite"></p></form></div></section>`}
  if(section.type==='register'){if(authConfig.registrationMode==='server'||authConfig.registrationMode==='closed')return `<section class="builder-section auth-section ${align}" style="${style}">${media}${overlay}<div class="inner ${width}"><div class="heading"><span class="eyebrow">${esc(section.subtitle)}</span><h2>${esc(section.title)}</h2><p>${authConfig.registrationMode==='server'?'Bu website için hesaplar Minecraft sunucusu üzerinden oluşturulur. Sunucuda kaydınızı tamamladıktan sonra giriş sayfasını kullanın.':'Yeni kayıt şu anda kapalıdır.'}</p></div></div></section>`;const needEmail=authConfig.loginMode!=='minecraft';const needMinecraft=authConfig.loginMode!=='email';return `<section class="builder-section auth-section ${align}" style="${style}">${media}${overlay}<div class="inner ${width}"><div class="heading"><span class="eyebrow">${esc(section.subtitle)}</span><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p></div><form class="auth-card" data-blockctrl-auth="register"><label>Ad Soyad<input name="name" autocomplete="name" required></label>${needMinecraft?`<label>Minecraft Kullanıcı Adı<input name="minecraftUsername" autocomplete="off" required></label>`:''}${needEmail?`<label>E-posta<input name="email" type="email" autocomplete="email" required></label>`:''}<label>Şifre<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><button type="submit">${esc(section.buttonText||'Kayıt Ol')}</button><p class="form-message" aria-live="polite"></p></form></div></section>`}
  if(section.type==='member-dashboard')return `<section class="builder-section member-section ${align}" ${liveAttrs} style="${style}">${media}${overlay}<div class="inner ${width}"><div class="heading"><span class="eyebrow">${esc(section.subtitle)}</span><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p></div><div class="member-grid"><article><b data-member-name>Üye</b><span data-member-email>—</span><span data-member-mc>—</span><button class="member-logout" type="button">Çıkış Yap</button></article><div class="grid stats live-target">${section.items.map(item=>`<article><strong>${esc(item.value||'—')}</strong><b>${esc(item.title)}</b><span>${esc(item.description)}</span></article>`).join('')}</div></div></div></section>`
  const buttons=(section.type==='hero'||section.type==='cta')?`<div class="buttons">${section.buttonText?`<a class="btn" href="${esc(siteHref(section.buttonHref,basePath))}">${esc(section.buttonText)}</a>`:''}${section.secondaryButtonText?`<a class="btn secondary" href="${esc(siteHref(section.secondaryButtonHref,basePath))}">${esc(section.secondaryButtonText)}</a>`:''}</div>`:''
  let body=renderItems(section)
  if(section.type==='support')body=`<div class="contact support-center"><form data-blockctrl-form="support"><input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0" value=""><input name="name" placeholder="Adınız" required><input name="email" type="email" placeholder="E-posta" required><input name="subject" placeholder="Destek konusu" required><textarea name="message" placeholder="Sorununuzu ayrıntılı anlatın" required></textarea><button type="submit">Destek Talebi Gönder</button><p class="form-message" aria-live="polite"></p></form><aside><b>Destek Merkezi</b><p>${esc(section.body||'Sorunuzu veya destek talebinizi gönderin. Talep Website Yönetimi → Formlar ekranına düşer.')}</p>${section.items.length?`<div class="support-topics">${section.items.slice(0,6).map(item=>`<div><b>${esc(item.title)}</b><span>${esc(item.description)}</span></div>`).join('')}</div>`:''}</aside></div>`
  if(section.type==='contact')body=`<div class="contact"><form data-blockctrl-form="contact"><input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0" value=""><input name="name" placeholder="Adınız"><input name="email" type="email" placeholder="E-posta"><input name="subject" placeholder="Konu"><textarea name="message" placeholder="Mesajınız" required></textarea><button type="submit">Gönder</button><p class="form-message" aria-live="polite"></p></form><aside>${esc(section.body)}</aside></div>`
  if(section.type==='content')body=`<div class="content-split"><div class="content-image"></div><p>${esc(section.body)}</p></div>`
  return `<section class="builder-section ${placement} ${align}" ${liveAttrs} style="${style}">${media}${overlay}<div class="inner ${width}"><div class="heading"><span class="eyebrow">${esc(section.subtitle)}</span><h2 class="${section.type==='hero'?'hero-title':''}">${esc(section.title)}</h2><p>${esc(section.body)}</p>${buttons}</div>${body}</div></section>`
}
function renderPublishedPage(site:{name:string;slug:string},page:BuilderPage,builder:BuilderData,runtimeBase:string,basePath=''){
  const theme=builder.theme
  const normalizedPath=normalizedBasePath(basePath)
  const sections=page.sections.map(section=>renderSection(section,builder.pages,theme,builder.auth,normalizedPath)).join('')
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.seoTitle||page.name||site.name)}</title><meta name="description" content="${esc(page.seoDescription)}"><style>
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:${theme.background};color:${theme.text};font-family:${theme.fontFamily};overflow-x:hidden}a{color:inherit;text-decoration:none}.builder-section{position:relative;overflow:hidden}.builder-section>.inner{position:relative;z-index:2;margin:0 auto}.inner.boxed{max-width:960px}.inner.wide{max-width:1240px}.inner.full{max-width:none}.section-video,.overlay{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.sticky{position:sticky;top:0;z-index:40}.fixed.top{position:fixed;left:0;right:0;top:0;z-index:50}.fixed.bottom{position:fixed;left:0;right:0;bottom:0;z-index:50}.navbar .inner{display:flex;align-items:center;gap:24px}.navbar nav{display:flex;gap:20px;margin-left:auto;font-size:14px;color:${theme.muted}}.brand{font-size:20px}.btn{display:inline-flex;padding:12px 18px;border-radius:${theme.radius}px;background:${theme.primary};color:white;font-weight:700}.btn.secondary{background:transparent;border:1px solid rgba(255,255,255,.18)}.heading{max-width:760px}.align-center .heading{margin-inline:auto;text-align:center}.align-right .heading{margin-left:auto;text-align:right}.eyebrow{color:${theme.primary};font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.heading h2{font-size:clamp(30px,4vw,52px);line-height:1.05;letter-spacing:-.04em;margin:14px 0}.heading .hero-title{font-size:clamp(46px,7vw,82px)}.heading p{color:${theme.muted};line-height:1.8}.buttons{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.align-center .buttons{justify-content:center}.align-right .buttons{justify-content:flex-end}.grid{display:grid;gap:16px;margin-top:34px}.features{grid-template-columns:repeat(4,1fr)}.stats{grid-template-columns:repeat(4,1fr)}.pricing{grid-template-columns:repeat(3,1fr)}.cards{grid-template-columns:repeat(4,1fr)}.gallery{grid-template-columns:repeat(4,1fr)}.store{grid-template-columns:repeat(4,1fr)}article,details,.contact form,.contact aside{border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.18);border-radius:${theme.radius}px;padding:22px;backdrop-filter:blur(10px)}article{display:flex;flex-direction:column;gap:8px}article strong{font-size:32px;color:${theme.primary}}article span{color:${theme.muted};font-size:14px;line-height:1.5}article i{font-style:normal;color:${theme.primary}}article em{font-style:normal;font-size:12px;padding:5px 8px;border-radius:999px;border:1px solid color-mix(in srgb,${theme.primary} 45%,transparent);color:${theme.primary};white-space:nowrap}.item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.data-list{display:grid;gap:10px;margin-top:30px}.data-list article{display:grid;grid-template-columns:56px minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px 18px}.data-list article>strong{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.05);font-size:15px}.data-list article>div{display:flex;min-width:0;flex-direction:column;gap:4px}.data-list article>em{font-size:13px}.bans article{border-color:rgba(248,113,113,.18)}.bans article>em{color:#fca5a5;border-color:rgba(248,113,113,.28);background:rgba(239,68,68,.08)}.leaderboard .top{border-color:rgba(251,191,36,.34);background:rgba(251,191,36,.05)}.leaderboard .top>strong{color:#fbbf24}.store article img,.product-placeholder{width:100%;aspect-ratio:16/9;border-radius:${theme.radius}px;object-fit:cover;border:1px solid rgba(255,255,255,.08)}.product-placeholder{display:grid;place-items:center;background:linear-gradient(135deg,${theme.primary}33,${theme.secondary}33);font-size:32px;color:${theme.primary}}.store article a{margin-top:auto;padding:10px;border-radius:${theme.radius}px;background:${theme.primary};text-align:center;font-weight:700}.pricing .featured{border-color:${theme.primary}}.pricing article a{margin-top:14px;padding:10px;border-radius:${theme.radius}px;background:${theme.primary};text-align:center}.disabled-action{margin-top:auto;padding:10px;border-radius:${theme.radius}px;border:1px dashed rgba(255,255,255,.15);color:${theme.muted};text-align:center;font-size:12px}.world-map-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(260px,.65fr);gap:18px;margin-top:34px}.world-map-frame{min-height:430px;overflow:hidden;border:1px solid rgba(56,189,248,.2);border-radius:${theme.radius}px;background:#06111c;box-shadow:inset 0 0 70px rgba(14,165,233,.05)}.world-map-frame iframe{display:block;width:100%;height:430px;border:0;background:#06111c}.world-map-placeholder{position:relative;min-height:430px;overflow:hidden;background:#06111c}.map-grid{position:absolute;inset:0;opacity:.32;background-image:linear-gradient(rgba(56,189,248,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.15) 1px,transparent 1px);background-size:36px 36px}.map-glow{position:absolute;width:220px;height:220px;border-radius:999px;filter:blur(18px);opacity:.22}.map-glow.one{left:20%;top:24%;background:#22c55e}.map-glow.two{right:12%;bottom:12%;background:${theme.primary}}.map-pin{position:absolute;left:38%;top:44%;display:grid;justify-items:center;gap:7px;transform:translate(-50%,-50%)}.map-pin b{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(110,231,183,.42);border-radius:999px;background:rgba(16,185,129,.18);color:#a7f3d0;font-size:20px;box-shadow:0 0 30px rgba(16,185,129,.2)}.map-pin span,.map-hint{border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(2,8,23,.78);padding:7px 10px;color:#dbeafe;font-size:11px}.map-hint{position:absolute;left:16px;right:16px;bottom:16px;color:${theme.muted}}.map-points{display:grid;gap:10px;align-content:start}.map-points article{display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;padding:16px}.map-point-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:${theme.primary}22;color:${theme.primary};font-weight:900}.map-points article>div:last-child{display:grid;gap:5px}.map-points em{justify-self:start}.gallery img,.gallery .placeholder{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:${theme.radius}px;border:1px solid rgba(255,255,255,.1)}.placeholder{display:grid;place-items:center;background:linear-gradient(135deg,#102b43,#1e1034);color:${theme.muted}}.faq{display:grid;gap:10px;margin-top:30px}.faq summary{cursor:pointer;font-weight:700}.faq p{color:${theme.muted}}.avatar{width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.1)}.contact{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px}.contact form{display:grid;gap:12px}.contact input,.contact textarea{width:100%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:${theme.text};padding:12px;border-radius:${theme.radius}px}.contact textarea{min-height:120px}.contact button{border:0;background:${theme.primary};color:white;padding:12px;border-radius:${theme.radius}px;font-weight:700}.support-center aside{display:flex;flex-direction:column;gap:14px}.support-center aside>p{color:${theme.muted};line-height:1.7}.support-topics{display:grid;gap:9px}.support-topics>div{border:1px solid rgba(255,255,255,.08);border-radius:${theme.radius}px;padding:11px 12px;background:rgba(255,255,255,.025);display:grid;gap:4px}.support-topics span{color:${theme.muted};font-size:12px;line-height:1.5}.content-split{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:center;margin-top:30px}.content-image{min-height:280px;border-radius:${theme.radius}px;background:linear-gradient(135deg,${theme.primary}44,${theme.secondary}44);border:1px solid rgba(255,255,255,.1)}.content-split p{color:${theme.muted};line-height:1.9}.footer{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:28px}.footer p,.footer a{display:block;margin-top:8px;color:${theme.muted};font-size:13px}.auth-section .heading{margin-inline:auto;text-align:center}.auth-card{width:min(480px,100%);margin:32px auto 0;display:grid;gap:14px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.28);padding:26px;border-radius:${theme.radius}px;backdrop-filter:blur(16px)}.auth-card label{display:grid;gap:7px;color:${theme.muted};font-size:12px}.auth-card input{height:46px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:${theme.text};padding:0 13px;border-radius:${theme.radius}px;outline:none}.auth-card button,.member-logout{border:0;background:${theme.primary};color:white;padding:13px 16px;border-radius:${theme.radius}px;font-weight:800;cursor:pointer}.form-message{min-height:18px;margin:0;color:${theme.muted};font-size:12px}.member-grid{display:grid;grid-template-columns:320px 1fr;gap:18px;margin-top:32px}.member-grid>article{min-height:220px}.member-grid .stats{margin-top:0}.live-loading{opacity:.65}.live-error{outline:1px solid rgba(251,191,36,.35)}.live-empty{margin-top:24px;padding:18px;border:1px dashed rgba(125,211,252,.2);border-radius:${theme.radius}px;color:${theme.muted};display:grid;gap:6px}.live-empty b{color:${theme.text}}@media(max-width:900px){.world-map-layout{grid-template-columns:1fr}.world-map-frame,.world-map-frame iframe,.world-map-placeholder{min-height:360px;height:360px}.features,.stats,.pricing,.cards,.gallery,.store{grid-template-columns:repeat(2,1fr)}.navbar nav{display:none}.contact,.content-split,.footer,.member-grid{grid-template-columns:1fr}}@media(max-width:560px){.features,.stats,.pricing,.cards,.gallery,.store{grid-template-columns:1fr}.data-list article{grid-template-columns:44px minmax(0,1fr)}.data-list article>em{grid-column:2;justify-self:start}.builder-section{padding-left:18px!important;padding-right:18px!important}.heading .hero-title{font-size:44px}}
  </style></head><body>${sections}<script>
  (()=>{
    const CFG=${JSON.stringify({site:site.slug,runtimeBase,basePath:normalizedPath,auth:builder.auth,page:{type:page.pageType,requiresAuth:page.requiresAuth,accessMode:page.accessMode,allowedRoles:page.allowedRoles,slug:page.slug}}).replace(/</g,'\u003c')};
    const tokenKey='blockctrl-site:'+CFG.site+':token';
    const token=()=>sessionStorage.getItem(tokenKey)||'';
    async function json(url,opts={}){const headers={...(opts.headers||{})};let trusted=false;try{const target=new URL(url,location.href);const runtime=new URL(CFG.runtimeBase);trusted=target.origin===runtime.origin&&target.pathname.startsWith('/api/')}catch{}if(trusted&&token())headers.Authorization='Bearer '+token();const r=await fetch(url,{...opts,headers});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw new Error(data.error||('HTTP '+r.status));return data}
    function liveMarkup(source,items){if(source==='leaderboard-kills'||source==='leaderboard-money'||source==='leaderboard-health'||source==='leaderboard-playtime')return '<div class="data-list leaderboard">'+items.map((x,i)=>'<article class="'+(i===0?'top':'')+'"><strong>#'+(i+1)+'</strong><div><b>'+escapeHtml(x.title||'')+'</b><span>'+escapeHtml(x.description||'')+'</span></div><em>'+escapeHtml(x.value||'—')+'</em></article>').join('')+'</div>';if(source==='bans')return '<div class="data-list bans">'+items.map((x,i)=>'<article><strong>'+(i+1)+'</strong><div><b>'+escapeHtml(x.title||'')+'</b><span>'+escapeHtml(x.description||'')+'</span></div><em>'+escapeHtml(x.value||'Aktif')+'</em></article>').join('')+'</div>';if(source==='store')return '<div class="grid store">'+items.map(x=>'<article>'+(x.image?'<img src="'+escapeHtml(x.image)+'" alt="'+escapeHtml(x.title||'')+'">':'<div class="product-placeholder">◆</div>')+'<b>'+escapeHtml(x.title||'')+'</b><strong>'+escapeHtml(x.value||'')+'</strong><span>'+escapeHtml(x.description||'')+'</span>'+(x.href?'<a href="'+escapeHtml(x.href)+'" target="_blank" rel="noopener noreferrer">Satın Al</a>':'<span class="disabled-action" aria-disabled="true">Satın alma bağlantısı eklenmedi</span>')+'</article>').join('')+'</div>';if(source==='support')return '<div class="support-topics">'+items.map(x=>'<div><b>'+escapeHtml(x.title||'')+'</b><span>'+escapeHtml(x.description||'')+'</span></div>').join('')+'</div>';if(source==='wiki')return '<div class="grid features">'+items.map(x=>'<article><i>◆</i><div class="item-head"><b>'+escapeHtml(x.title||'')+'</b>'+(x.value?'<em>'+escapeHtml(x.value)+'</em>':'')+'</div><span>'+escapeHtml(x.description||'')+'</span></article>').join('')+'</div>';return '<div class="grid stats">'+items.map(x=>'<article><strong>'+escapeHtml(x.value||'—')+'</strong><b>'+escapeHtml(x.title||'')+'</b><span>'+escapeHtml(x.description||'')+'</span></article>').join('')+'</div>'}
    function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
    async function refreshSection(section){const source=section.dataset.liveSource,serverId=section.dataset.liveServer,endpoint=section.dataset.liveEndpoint;if(!source)return;section.classList.add('live-loading');try{let data;if(source==='custom-json'&&endpoint){data=await json(endpoint)}else{const q=new URLSearchParams({site:CFG.site,source,serverId:serverId||''});data=await json(CFG.runtimeBase+'/api/site-runtime?'+q.toString())}
      if(source==='map'){const frame=section.querySelector('.world-map-frame');if(!frame)return;if(data.available===false||!data.map||!data.map.url){frame.innerHTML='<div class="live-empty"><b>Harita bağlantısı hazır değil</b><span>'+escapeHtml(data.reason||'Bu sunucu için BlueMap/Dynmap bağlantısı yapılandırılmadı.')+'</span></div>';section.classList.remove('live-error');return}let mapUrl='';try{const parsed=new URL(String(data.map.url));if(parsed.protocol==='https:')mapUrl=parsed.toString()}catch{}if(!mapUrl){frame.innerHTML='<div class="live-empty"><b>Harita adresi geçersiz</b><span>Sunucu harita bağlantısı güvenli HTTPS adresi olmalı.</span></div>';return}frame.innerHTML='<iframe src="'+escapeHtml(mapUrl)+'" title="'+escapeHtml((data.summary&&data.summary.name?data.summary.name+' · ':'')+'Minecraft dünya haritası')+'" loading="lazy" referrerpolicy="no-referrer"></iframe>';section.classList.remove('live-error');return}
      let target=section.querySelector('.live-target,.stats,.features,.data-list,.store,.support-topics,.live-empty');if(!target)return;if(data.available===false||!Array.isArray(data.items)||!data.items.length){target.outerHTML='<div class="live-empty"><b>Canlı veri kullanılamıyor</b><span>'+escapeHtml(data.reason||'Bu bölüm için henüz canlı veri yok.')+'</span></div>';section.classList.remove('live-error');return}target.outerHTML=liveMarkup(source,data.items);section.classList.remove('live-error')}catch(err){const target=section.querySelector(source==='map'?'.world-map-frame':'.live-target,.stats,.features,.data-list,.store,.support-topics,.live-empty');if(target){const message='<div class="live-empty"><b>Canlı bağlantı kurulamadı</b><span>'+escapeHtml(err&&err.message||'Veri alınamadı; bağlantı yeniden denenecek.')+'</span></div>';if(source==='map')target.innerHTML=message;else target.outerHTML=message}section.classList.add('live-error')}finally{section.classList.remove('live-loading')}}
    document.querySelectorAll('[data-live-source]').forEach(section=>{refreshSection(section);const seconds=Math.max(5,Number(section.dataset.liveRefresh||30));setInterval(()=>refreshSection(section),seconds*1000)})
    async function me(){try{return await json(CFG.runtimeBase+'/api/site-auth?site='+encodeURIComponent(CFG.site))}catch{return {user:null}}}
    document.querySelectorAll('[data-blockctrl-auth]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const kind=form.dataset.blockctrlAuth;const fd=new FormData(form);const message=form.querySelector('.form-message');if(message)message.textContent='İşleniyor...';try{const data=await json(CFG.runtimeBase+'/api/site-auth?site='+encodeURIComponent(CFG.site),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({site:CFG.site,action:kind,name:fd.get('name'),minecraftUsername:fd.get('minecraftUsername'),email:fd.get('email'),identifier:fd.get('identifier'),password:fd.get('password')})});if(data.token)sessionStorage.setItem(tokenKey,data.token);location.href=data.redirect||((CFG.basePath||'')+'/'+CFG.auth.afterLoginPageSlug+'/')}catch(err){if(message)message.textContent=err.message||'İşlem başarısız.'}}))
    document.querySelectorAll('[data-blockctrl-form]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form);const message=form.querySelector('.form-message');if(message)message.textContent='Gönderiliyor...';try{await json(CFG.runtimeBase+'/api/site-form',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({site:CFG.site,formType:form.dataset.blockctrlForm,pageSlug:CFG.page.slug,website:fd.get('website'),name:fd.get('name'),email:fd.get('email'),subject:fd.get('subject'),message:fd.get('message')})});form.reset();if(message)message.textContent='Mesajınız gönderildi.'}catch(err){if(message)message.textContent=err.message||'Gönderilemedi.'}}))
    document.querySelectorAll('.member-logout').forEach(button=>button.addEventListener('click',async()=>{try{await json(CFG.runtimeBase+'/api/site-auth?site='+encodeURIComponent(CFG.site),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({site:CFG.site,action:'logout',token:token()})})}catch{}sessionStorage.removeItem(tokenKey);location.href=(CFG.basePath||'')+'/'+CFG.auth.loginPageSlug+'/'}))
    ;(async()=>{const state=await me();const canAccess=(page,user)=>{const mode=page.accessMode||((page.requiresAuth)?'authenticated':'public');if(mode==='public')return true;if(!user)return false;if(mode==='authenticated')return true;if(mode==='role')return Array.isArray(page.allowedRoles)&&page.allowedRoles.includes(user.role);if(mode==='assigned')return Array.isArray(user.allowedPages)&&user.allowedPages.includes(page.slug||'__home__');return false};document.querySelectorAll('[data-page-link]').forEach(link=>{const page={slug:link.dataset.pageSlug||'',accessMode:link.dataset.accessMode||'public',allowedRoles:(link.dataset.roles||'').split(',').filter(Boolean)};if(!canAccess(page,state.user))link.style.display='none'});if(!canAccess(CFG.page,state.user)){if(!state.user){location.replace((CFG.basePath||'')+'/'+CFG.auth.loginPageSlug+'/');return}document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;background:#030b13;color:#eef9ff;font-family:system-ui"><div style="max-width:560px;padding:32px;border:1px solid #164e63;border-radius:20px;background:#071827"><h1>Bu sayfaya erişiminiz yok</h1><p style="color:#94a3b8">Hesabınıza bu sayfa için erişim verilmemiş.</p><a style="color:#38bdf8" href="'+(CFG.basePath||'')+'/'+CFG.auth.afterLoginPageSlug+'/">Hesabıma dön</a></div></main>';return}if(state.user){document.querySelectorAll('[data-member-name]').forEach(el=>el.textContent=state.user.name||'Üye');document.querySelectorAll('[data-member-email]').forEach(el=>el.textContent=state.user.email||'');document.querySelectorAll('[data-member-mc]').forEach(el=>el.textContent=state.user.minecraftUsername?('Minecraft: '+state.user.minecraftUsername):'Minecraft hesabı bağlı değil');if(CFG.page.type==='login'||CFG.page.type==='register')location.replace((CFG.basePath||'')+'/'+CFG.auth.afterLoginPageSlug+'/')}})()
  })();
  </script></body></html>`
}
function pageAccessMode(page:BuilderPage){return page.accessMode||((page.requiresAuth)?'authenticated':'public')}
function protectedPageShell(site:{name:string;slug:string},page:BuilderPage,builder:BuilderData,runtimeBase:string,basePath=''){
  const cfg={site:site.slug,pageSlug:page.slug,runtimeBase,basePath:normalizedBasePath(basePath),loginPageSlug:builder.auth.loginPageSlug,afterLoginPageSlug:builder.auth.afterLoginPageSlug}
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(page.seoTitle||page.name)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030b13;color:#eef9ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.box{width:min(560px,calc(100% - 32px));padding:28px;border:1px solid rgba(56,189,248,.22);border-radius:20px;background:#071827}.muted{color:#94a3b8;line-height:1.65}.error{color:#fca5a5}</style></head><body><main class="box"><h1>Sayfa doğrulanıyor</h1><p id="state" class="muted">Üyelik ve erişim yetkiniz güvenli şekilde kontrol ediliyor.</p></main><script>(()=>{const CFG=${JSON.stringify(cfg).replace(/</g,'\\u003c')};const key='blockctrl-site:'+CFG.site+':token';const token=sessionStorage.getItem(key)||'';const state=document.getElementById('state');const login=()=>location.replace((CFG.basePath||'')+'/'+CFG.loginPageSlug+'/');if(!token){login();return}fetch(CFG.runtimeBase+'/api/websites',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({action:'runtime-page',site:CFG.site,pageSlug:CFG.pageSlug,internal:Boolean(CFG.basePath)})}).then(async r=>{if(r.status===401){sessionStorage.removeItem(key);login();return}if(r.status===403){state.className='muted error';state.textContent='Bu sayfaya erişim yetkiniz yok.';return}if(!r.ok){state.className='muted error';state.textContent='Sayfa şu anda yüklenemiyor.';return}const html=await r.text();document.open();document.write(html);document.close()}).catch(()=>{state.className='muted error';state.textContent='Güvenli sayfa servisine ulaşılamadı.'})})();</script></body></html>`
}
function deploymentFiles(site:{name:string;slug:string},builderData:BuilderData,runtimeBase:string){return builderData.pages.map(page=>({file:page.slug?`${page.slug}/index.html`:'index.html',data:pageAccessMode(page)==='public'?renderPublishedPage(site,page,builderData,runtimeBase,''):protectedPageShell(site,page,builderData,runtimeBase,'')}))}

const runtimeCors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'private, no-store'}
export function OPTIONS(){return new NextResponse(null,{status:204,headers:runtimeCors})}
function memberTokenHash(value:string){return createHash('sha256').update(value).digest('hex')}
async function runtimeMember(siteId:string,token:string){
  if(!token)return null
  const session=(await db.select().from(websiteMemberSessions).where(and(eq(websiteMemberSessions.websiteId,siteId),eq(websiteMemberSessions.tokenHash,memberTokenHash(token)),gt(websiteMemberSessions.expiresAt,new Date()))).limit(1))[0]
  if(!session)return null
  const member=(await db.select().from(websiteMembers).where(and(eq(websiteMembers.id,session.memberId),eq(websiteMembers.websiteId,siteId))).limit(1))[0]
  if(!member||member.status!=='active')return null
  await db.update(websiteMemberSessions).set({lastSeenAt:new Date()}).where(eq(websiteMemberSessions.id,session.id)).catch(()=>undefined)
  return member
}
function memberCanAccess(page:BuilderPage,member:any){
  const mode=pageAccessMode(page)
  if(mode==='public')return true
  if(!member)return false
  if(mode==='authenticated')return true
  if(mode==='role')return page.allowedRoles.includes(normalizeRole(member.role))
  if(mode==='assigned')return Array.isArray(member.allowedPages)&&member.allowedPages.map(String).includes(page.slug||'__home__')
  return false
}
function runtimeJson(data:unknown,status:number){return NextResponse.json(data,{status,headers:runtimeCors})}

async function actor(){
  const session=await auth.api.getSession({headers:await headers()})
  if(!session?.user)return null
  return resolvePanelUser(session.user)
}

export async function GET(){
  await ensurePanelSchema()
  const a=await actor()
  if(!a)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!a.approved)return NextResponse.json({error:'Approval required'},{status:403})
  const role=normalizeRole(a.role)
  let rows=role==='manager'
    ?await db.select().from(websites).orderBy(desc(websites.createdAt))
    :await db.select().from(websites).where(eq(websites.userId,a.id)).orderBy(desc(websites.createdAt))
  const cfg=vercelConfig()
  if(cfg.token&&(cfg.teamId||cfg.teamSlug)){
    const pending=rows.filter(row=>(row.status==='queued'||row.status==='building')&&row.deploymentId).slice(0,10)
    if(pending.length){
      const updates=await Promise.allSettled(pending.map(async row=>{
        const deployment=await vercel(`/v13/deployments/${encodeURIComponent(String(row.deploymentId))}`,{method:'GET'})
        const readyState=String(deployment.readyState||deployment.state||'QUEUED').toUpperCase()
        const status=STATUS_MAP[readyState]||'queued'
        if(status===row.status)return row
        const [updated]=await db.update(websites).set({status,publishedAt:status==='ready'?(row.publishedAt||new Date()):row.publishedAt,lastError:status==='failed'?String((deployment.error as Record<string,unknown>|undefined)?.message||'Vercel deployment başarısız.'):null,updatedAt:new Date()}).where(eq(websites.id,row.id)).returning()
        return updated
      }))
      const byId=new Map(rows.map(row=>[row.id,row]))
      for(const item of updates)if(item.status==='fulfilled'&&item.value)byId.set(item.value.id,item.value)
      rows=[...byId.values()].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
    }
  }
  const availableServers=await accessibleServerRows(a.id,role)
  return NextResponse.json({
    websites:rows,
    servers:availableServers,
    canCreate:canCreate(role),
    integrationConfigured:Boolean(cfg.token&&(cfg.teamId||cfg.teamSlug)),
    hostingMode:cfg.token&&(cfg.teamId||cfg.teamSlug)?'vercel':'internal',
    internalHosting:true,
    suffix:suffix(),
  },{headers:{'Cache-Control':'private, no-store'}})
}

export async function POST(request:NextRequest){
  await ensurePanelSchema()
  const body=await request.json().catch(()=>({})) as Record<string,unknown>
  const action=String(body.action||'')

  if(action==='runtime-page'){
    const siteSlug=cleanSlug(body.site)
    const requestedSlug=cleanSlug(body.pageSlug)
    const site=(await db.select().from(websites).where(eq(websites.slug,siteSlug)).limit(1))[0]
    if(!site)return runtimeJson({error:'Website bulunamadı.'},404)
    const builder=normalizeBuilderData(site.builderData,site.name)
    const page=builder.pages.find(item=>item.slug===requestedSlug)
    if(!page)return runtimeJson({error:'Sayfa bulunamadı.'},404)
    const mode=pageAccessMode(page)
    const internal=body.internal===true
    const basePath=internal?`/site/${site.slug}`:''
    if(mode!=='public'){
      const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim()
      const member=await runtimeMember(site.id,token)
      if(!member)return runtimeJson({error:'Oturum gerekli.',loginPageSlug:builder.auth.loginPageSlug},401)
      if(!memberCanAccess(page,member))return runtimeJson({error:'Bu sayfaya erişim yetkiniz yok.'},403)
    }
    const configuredRuntimeBase=runtimeBase(request)
    return new NextResponse(renderPublishedPage({name:site.name,slug:site.slug},page,builder,configuredRuntimeBase,basePath),{status:200,headers:{...runtimeCors,'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Authorization'}})
  }

  const a=await actor()
  if(!a)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!a.approved)return NextResponse.json({error:'Approval required'},{status:403})
  const role=normalizeRole(a.role)

  if(action==='create'){
    if(!canCreate(role))return NextResponse.json({error:'Website oluşturma yetkiniz yok.'},{status:403})
    const cfg=vercelConfig()
    const externalHosting=Boolean(cfg.token&&(cfg.teamId||cfg.teamSlug))
    const name=String(body.name||'').trim()
    const slug=cleanSlug(body.slug||name)
    const description=String(body.description||'').trim().slice(0,180)
    const template=['blank','landing','minecraft','community','corporate','portfolio','shop','minimal'].includes(String(body.template))?String(body.template):'minecraft'
    const allowedServers=await accessibleServerIds(a.id,role)
    const requestedServerId=String(body.serverId||'')
    const serverId=requestedServerId?(allowedServers.includes(requestedServerId)?requestedServerId:''):allowedServers[0]||''
    if(requestedServerId&&!serverId)return NextResponse.json({error:'Bu sunucunun website verilerini kullanma yetkiniz yok.'},{status:403})
    if(name.length<2||name.length>80)return NextResponse.json({error:'Website adı 2-80 karakter olmalı.'},{status:400})
    if(slug.length<3||slug.length>40||RESERVED.has(slug))return NextResponse.json({error:'Yayın adı 3-40 karakter olmalı ve ayrılmış bir ad kullanmamalı.'},{status:400})
    const initialBuilder=await prepareBuilderData(body.builderData,name,a.id,role,serverId)
    initialBuilder.binding.serverId=serverId
    if(!initialBuilder.auth.serverId&&serverId)initialBuilder.auth.serverId=serverId
    const hasLiveSections=initialBuilder.pages.some(page=>page.sections.some(section=>section.liveData.mode!=='static'&&section.liveData.source!=='custom-json'))
    const configuredRuntimeBase=runtimeBase(request)
    if(hasLiveSections&&!configuredRuntimeBase)return NextResponse.json({error:'Canlı sunucu verisi için güvenli panel runtime URL adresi çözümlenemedi.'},{status:503})
    const projectName=`${slug}-${suffix()}`
    const existing=await db.select().from(websites).where(or(eq(websites.slug,slug),eq(websites.projectName,projectName))).limit(1)
    if(existing.length){
      const row=existing[0]
      if(row.userId===a.id)return NextResponse.json({ok:true,website:row,idempotent:true})
      return NextResponse.json({error:'Bu website yayın adı zaten kullanılıyor.'},{status:409})
    }

    if(!externalHosting){
      const internalUrl=`${configuredRuntimeBase}/site/${slug}/`
      const created=await db.transaction(async tx=>{
        const [row]=await tx.insert(websites).values({
          userId:a.id,serverId:serverId||null,name,slug,projectName,template,description:description||null,builderData:initialBuilder,
          deploymentUrl:internalUrl,productionUrl:internalUrl,status:'ready',publishedAt:new Date(),
        }).returning()
        await syncAuthSettings(row.id,initialBuilder,tx)
        await syncWebsiteManagedPublicData(row.id,a.id,initialBuilder,tx)
        await tx.insert(auditLog).values({userId:a.id,action:'website.create',resourceType:'website',resourceId:row.id,details:{slug,projectName,template,hosting:'internal',serverId:serverId||null,pages:initialBuilder.pages.length}})
        return row
      })
      return NextResponse.json({ok:true,website:created,hosting:'internal'},{status:201})
    }

    let projectId=''
    try{
      await vercel('/v2/user',{method:'GET'})
      const project=await vercel('/v11/projects',{method:'POST',body:JSON.stringify({name:projectName})})
      projectId=String(project.id||'')
      const deployment=await vercel('/v13/deployments',{method:'POST',body:JSON.stringify({
        name:projectName,
        project:projectName,
        target:'production',
        files:configuredRuntimeBase?deploymentFiles({name,slug},initialBuilder,configuredRuntimeBase):[{file:'index.html',data:starterHtml(name,description,template)}],
        projectSettings:{framework:null},
        meta:{createdBy:'blockctrl',ownerUserId:a.id,websiteSlug:slug},
      })})
      const deploymentId=String(deployment.id||'')
      const deploymentHost=String(deployment.url||'')
      const readyState=String(deployment.readyState||deployment.state||'QUEUED').toUpperCase()
      const productionUrl=projectId?await resolveVercelAlias(projectId,projectName):null
      const created=await db.transaction(async tx=>{
        const [row]=await tx.insert(websites).values({
          userId:a.id,serverId:serverId||null,name,slug,projectName,template,description:description||null,builderData:initialBuilder,
          vercelProjectId:projectId||null,deploymentId:deploymentId||null,
          deploymentUrl:deploymentHost?`https://${deploymentHost}`:null,
          productionUrl,status:STATUS_MAP[readyState]||'queued',
          publishedAt:readyState==='READY'?new Date():null,
        }).returning()
        await syncWebsiteManagedPublicData(row.id,a.id,initialBuilder,tx)
        await tx.insert(auditLog).values({userId:a.id,action:'website.create',resourceType:'website',resourceId:row.id,details:{slug,projectName,template,deploymentId,serverId:serverId||null,pages:initialBuilder.pages.length,liveSections:initialBuilder.pages.reduce((sum,page)=>sum+page.sections.filter(section=>section.liveData.mode!=='static').length,0)}})
        return row
      })
      return NextResponse.json({ok:true,website:created},{status:201})
    }catch(error){
      if(projectId){
        try{await vercel(`/v9/projects/${encodeURIComponent(projectId)}`,{method:'DELETE'})}catch{}
      }
      const status=(error as Error & {status?:number}).status===409?409:502
      return NextResponse.json({error:error instanceof Error?error.message:'Website Vercel üzerinde oluşturulamadı.'},{status})
    }
  }

  const websiteId=String(body.websiteId||'')
  const site=(await db.select().from(websites).where(eq(websites.id,websiteId)).limit(1))[0]
  if(!site)return NextResponse.json({error:'Website bulunamadı.'},{status:404})
  if(role!=='manager'&&site.userId!==a.id)return NextResponse.json({error:'Bu website üzerinde yetkiniz yok.'},{status:403})

  if(action==='set-server'){
    const serverId=String(body.serverId||'')
    const allowed=await accessibleServerIds(a.id,role)
    if(serverId&&!allowed.includes(serverId))return NextResponse.json({error:'Bu sunucunun website verilerini kullanma yetkiniz yok.'},{status:403})
    const builder=await prepareBuilderData(site.builderData,site.name,a.id,role,serverId)
    const oldServerId=site.serverId||builder.binding.serverId
    builder.binding.serverId=serverId
    if(builder.auth.serverId===oldServerId||!builder.auth.serverId)builder.auth.serverId=''
    for(const page of builder.pages)for(const section of page.sections){
      if(section.liveData.mode==='static'||section.liveData.source==='custom-json')continue
      if(!section.liveData.serverId||section.liveData.serverId===oldServerId)section.liveData.serverId=''
    }
    const updated=await db.transaction(async tx=>{
      await syncAuthSettings(site.id,builder,tx)
      await syncWebsiteManagedPublicData(site.id,site.userId,builder,tx)
      const [row]=await tx.update(websites).set({serverId:serverId||null,builderData:builder,updatedAt:new Date(),lastError:null}).where(eq(websites.id,site.id)).returning()
      await tx.insert(auditLog).values({userId:a.id,action:'website.server.bind',resourceType:'website',resourceId:site.id,details:{from:oldServerId||null,to:serverId||null}})
      return row
    })
    return NextResponse.json({ok:true,website:updated})
  }

  if(action==='update-server-map'){
    const serverId=String(body.serverId||site.serverId||'')
    const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0]
    if(!server)return NextResponse.json({error:'Sunucu bulunamadı.'},{status:404})
    if(role!=='manager'&&server.userId!==a.id)return NextResponse.json({error:'Harita bağlantısını yalnız sunucu sahibi veya yönetici değiştirebilir.'},{status:403})
    const mapUrl=safeEndpoint(body.mapUrl)
    const provider=['bluemap','dynmap','custom'].includes(String(body.provider))?String(body.provider):'custom'
    if(String(body.mapUrl||'').trim()&&!mapUrl)return NextResponse.json({error:'Harita adresi geçerli bir HTTPS URL olmalı.'},{status:400})
    const existing=(await db.select().from(serverSettings).where(eq(serverSettings.serverId,serverId)).limit(1))[0]
    const settings={...((existing?.settings||{}) as Record<string,string|number|boolean>),websiteMapUrl:mapUrl,websiteMapProvider:provider}
    if(existing)await db.update(serverSettings).set({settings,updatedBy:a.id,updatedAt:new Date()}).where(eq(serverSettings.id,existing.id))
    else await db.insert(serverSettings).values({serverId,userId:server.userId,settings,capabilities:[],updatedBy:a.id})
    await db.insert(auditLog).values({userId:a.id,action:'website.map.configure',resourceType:'server',resourceId:serverId,details:{provider,configured:Boolean(mapUrl)}})
    return NextResponse.json({ok:true,map:{serverId,provider,url:mapUrl||null,configured:Boolean(mapUrl)}})
  }

  if(action==='update-metadata'){
    const name=String(body.name||'').trim()
    const description=String(body.description||'').trim().slice(0,180)
    if(name.length<2||name.length>80)return NextResponse.json({error:'Website adı 2-80 karakter olmalı.'},{status:400})
    const [updated]=await db.update(websites).set({name,description:description||null,updatedAt:new Date()}).where(eq(websites.id,site.id)).returning()
    await db.insert(auditLog).values({userId:a.id,action:'website.metadata.update',resourceType:'website',resourceId:site.id,details:{name,hasDescription:Boolean(description)}})
    return NextResponse.json({ok:true,website:updated})
  }

  if(action==='save-builder'){
    const builderData=await prepareBuilderData(body.builderData,site.name,a.id,role,site.serverId||'')
    validateAuthPages(builderData)
    const updated=await db.transaction(async tx=>{
      await syncAuthSettings(site.id,builderData,tx)
      await syncWebsiteManagedPublicData(site.id,site.userId,builderData,tx)
      const [row]=await tx.update(websites).set({serverId:builderData.binding.serverId||null,builderData,updatedAt:new Date(),lastError:null}).where(eq(websites.id,site.id)).returning()
      await tx.insert(auditLog).values({userId:a.id,action:'website.builder.save',resourceType:'website',resourceId:site.id,details:{serverId:builderData.binding.serverId||null,pages:builderData.pages.length,sections:builderData.pages.reduce((sum,page)=>sum+page.sections.length,0)}})
      return row
    })
    return NextResponse.json({ok:true,website:updated})
  }

  if(action==='publish'){
    const cfg=vercelConfig()
    const externalHosting=Boolean(cfg.token&&(cfg.teamId||cfg.teamSlug)&&site.vercelProjectId)
    const builderData=await prepareBuilderData(body.builderData??site.builderData,site.name,a.id,role,site.serverId||'')
    validateAuthPages(builderData)
    const configuredRuntimeBase=runtimeBase(request)
    if(!configuredRuntimeBase)return NextResponse.json({error:'Production yayını için güvenli panel runtime URL adresi çözümlenemedi.'},{status:503})
    const runtimeOrigin=configuredRuntimeBase.replace(/\/$/,'')
    if(!externalHosting){
      const internalUrl=`${runtimeOrigin}/site/${site.slug}/`
      const updated=await db.transaction(async tx=>{
        await syncAuthSettings(site.id,builderData,tx)
        await syncWebsiteManagedPublicData(site.id,site.userId,builderData,tx)
        const [row]=await tx.update(websites).set({serverId:builderData.binding.serverId||null,builderData,deploymentUrl:internalUrl,productionUrl:internalUrl,status:'ready',publishedAt:new Date(),lastError:null,updatedAt:new Date()}).where(eq(websites.id,site.id)).returning()
        await tx.insert(auditLog).values({userId:a.id,action:'website.publish',resourceType:'website',resourceId:site.id,details:{hosting:'internal',serverId:builderData.binding.serverId||null,pages:builderData.pages.length}})
        return row
      })
      return NextResponse.json({ok:true,website:updated,hosting:'internal'})
    }
    const vercelProjectId=String(site.vercelProjectId)
    try{
      await db.transaction(async tx=>{
        await syncAuthSettings(site.id,builderData,tx)
        await syncWebsiteManagedPublicData(site.id,site.userId,builderData,tx)
        await tx.update(websites).set({serverId:builderData.binding.serverId||null,builderData,status:'building',lastError:null,updatedAt:new Date()}).where(eq(websites.id,site.id))
      })
      const deployment=await vercel('/v13/deployments',{method:'POST',body:JSON.stringify({
        name:site.projectName,project:vercelProjectId,target:'production',files:deploymentFiles({name:site.name,slug:site.slug},builderData,runtimeOrigin),projectSettings:{framework:null},meta:{createdBy:'blockctrl-builder',ownerUserId:site.userId,websiteId:site.id},
      })})
      const deploymentId=String(deployment.id||'')
      const deploymentHost=String(deployment.url||'')
      const readyState=String(deployment.readyState||deployment.state||'QUEUED').toUpperCase()
      const productionUrl=await resolveVercelAlias(vercelProjectId,site.projectName)
      const updated=await db.transaction(async tx=>{
        const [row]=await tx.update(websites).set({serverId:builderData.binding.serverId||null,builderData,deploymentId:deploymentId||site.deploymentId,deploymentUrl:deploymentHost?`https://${deploymentHost}`:site.deploymentUrl,productionUrl:productionUrl||site.productionUrl,status:STATUS_MAP[readyState]||'queued',publishedAt:readyState==='READY'?new Date():site.publishedAt,lastError:null,updatedAt:new Date()}).where(eq(websites.id,site.id)).returning()
        await tx.insert(auditLog).values({userId:a.id,action:'website.publish',resourceType:'website',resourceId:site.id,details:{deploymentId,serverId:builderData.binding.serverId||null,pages:builderData.pages.length}})
        return row
      })
      return NextResponse.json({ok:true,website:updated})
    }catch(error){
      const message=error instanceof Error?error.message:'Website yayınlanamadı.'
      await db.update(websites).set({lastError:message,status:'failed',updatedAt:new Date()}).where(eq(websites.id,site.id)).catch(()=>undefined)
      return NextResponse.json({error:message},{status:502})
    }
  }

  if(action==='refresh'){
    if(!site.deploymentId||!site.vercelProjectId){
      const configuredRuntimeBase=runtimeBase(request)
      const internalUrl=configuredRuntimeBase?`${configuredRuntimeBase.replace(/\/$/,'')}/site/${site.slug}/`:site.productionUrl
      const [updated]=await db.update(websites).set({status:'ready',productionUrl:internalUrl||site.productionUrl,deploymentUrl:internalUrl||site.deploymentUrl,publishedAt:site.publishedAt||new Date(),lastError:null,updatedAt:new Date()}).where(eq(websites.id,site.id)).returning()
      return NextResponse.json({ok:true,website:updated,hosting:'internal'})
    }
    try{
      const deployment=await vercel(`/v13/deployments/${encodeURIComponent(site.deploymentId)}`,{method:'GET'})
      const readyState=String(deployment.readyState||deployment.state||'QUEUED').toUpperCase()
      const deploymentHost=String(deployment.url||'')
      const nextStatus=STATUS_MAP[readyState]||'queued'
      const productionUrl=site.vercelProjectId?await resolveVercelAlias(site.vercelProjectId,site.projectName):site.productionUrl
      const [updated]=await db.update(websites).set({status:nextStatus,deploymentUrl:deploymentHost?`https://${deploymentHost}`:site.deploymentUrl,productionUrl:productionUrl||site.productionUrl,publishedAt:nextStatus==='ready'?(site.publishedAt||new Date()):site.publishedAt,lastError:nextStatus==='failed'?String((deployment.error as Record<string,unknown>|undefined)?.message||'Vercel deployment başarısız.'):null,updatedAt:new Date()}).where(eq(websites.id,site.id)).returning()
      return NextResponse.json({ok:true,website:updated})
    }catch(error){
      await db.update(websites).set({lastError:error instanceof Error?error.message:'Deployment durumu alınamadı.',updatedAt:new Date()}).where(eq(websites.id,site.id))
      return NextResponse.json({error:error instanceof Error?error.message:'Deployment durumu alınamadı.'},{status:502})
    }
  }

  if(action==='delete'){
    await db.update(websites).set({status:'deleting',lastError:null,updatedAt:new Date()}).where(eq(websites.id,site.id))
    try{
      if(site.vercelProjectId){
        try{await vercel(`/v9/projects/${encodeURIComponent(site.vercelProjectId)}`,{method:'DELETE'})}
        catch(error){if((error as Error & {status?:number}).status!==404)throw error}
      }
      const blobCleanup=await cleanupWebsiteBlobs(site.id)
      await db.transaction(async tx=>{
        await tx.delete(websiteMemberSessions).where(eq(websiteMemberSessions.websiteId,site.id))
        await tx.delete(websiteFormSubmissions).where(eq(websiteFormSubmissions.websiteId,site.id))
        await tx.delete(websiteAuthRateLimits).where(eq(websiteAuthRateLimits.websiteId,site.id))
        await tx.delete(websiteMembers).where(eq(websiteMembers.websiteId,site.id))
        await tx.delete(websiteAuthSettings).where(eq(websiteAuthSettings.websiteId,site.id))
        await tx.delete(serverWebsiteData).where(like(serverWebsiteData.source,websitePublicSourceKey(site.id,'%')))
        await tx.delete(websites).where(eq(websites.id,site.id))
        await tx.insert(auditLog).values({userId:a.id,action:'website.delete',resourceType:'website',resourceId:site.id,details:{projectName:site.projectName,cleanup:'website-runtime-data',blobDeleted:blobCleanup.deleted,blobCleanupError:blobCleanup.error}})
      })
      return NextResponse.json({ok:true,blobCleanup})
    }catch(error){
      const message=error instanceof Error?error.message:'Website silinemedi.';await db.update(websites).set({status:'failed',lastError:`Silme işlemi tamamlanamadı: ${message}`.slice(0,1000),updatedAt:new Date()}).where(eq(websites.id,site.id)).catch(()=>{})
      return NextResponse.json({error:message},{status:502})
    }
  }

  return NextResponse.json({error:'Bilinmeyen website işlemi.'},{status:400})
}
