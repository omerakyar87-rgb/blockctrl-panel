import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { serverMetrics, serverPermissions, serverSettings, serverWebsiteData, servers, websites } from '@/lib/db/schema'
import { resolvePanelUser } from '@/lib/db/identity'

function normalizeRole(role:unknown){const value=String(role??'').toLowerCase();return value==='manager'||value==='admin'||value==='guide'||value==='member'?value:'member'}
async function actor(){const session=await auth.api.getSession({headers:await headers()});if(!session?.user)return null;return resolvePanelUser(session.user)}

export async function GET(request:NextRequest){
  await ensurePanelSchema()
  const a=await actor()
  if(!a)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!a.approved)return NextResponse.json({error:'Approval required'},{status:403})
  const websiteId=String(request.nextUrl.searchParams.get('websiteId')||'')
  const site=(await db.select().from(websites).where(eq(websites.id,websiteId)).limit(1))[0]
  if(!site)return NextResponse.json({error:'Website bulunamadı.'},{status:404})
  const role=normalizeRole(a.role)
  if(role!=='manager'&&site.userId!==a.id)return NextResponse.json({error:'Bu website üzerinde yetkiniz yok.'},{status:403})
  let rows=role==='manager'?await db.select().from(servers):await db.select().from(servers).where(eq(servers.userId,a.id))
  if(role!=='manager'){
    const grants=await db.select({serverId:serverPermissions.serverId}).from(serverPermissions).where(and(eq(serverPermissions.userId,a.id),eq(serverPermissions.canWebsiteData,true)))
    const ids=grants.map(x=>x.serverId)
    if(ids.length){const shared=await db.select().from(servers).where(inArray(servers.id,ids));const map=new Map(rows.map(x=>[x.id,x]));for(const row of shared)map.set(row.id,row);rows=[...map.values()]}
  }
  const mapped=await Promise.all(rows.map(async server=>{
    const settings=(await db.select().from(serverSettings).where(eq(serverSettings.serverId,server.id)).limit(1))[0]
    const metric=(await db.select().from(serverMetrics).where(eq(serverMetrics.serverId,server.id)).orderBy(desc(serverMetrics.createdAt)).limit(1))[0]
    const raw=(settings?.settings||{}) as Record<string,unknown>
    const hostname=String(raw.hostname||raw.srvRecord||'').trim()
    const publicRows=await db.select({source:serverWebsiteData.source,updatedAt:serverWebsiteData.updatedAt}).from(serverWebsiteData).where(eq(serverWebsiteData.serverId,server.id))
    const freshPublicSources=new Set(publicRows.filter(row=>Date.now()-new Date(row.updatedAt).getTime()<=5*60_000).map(row=>row.source))
    const siteManagedSources=new Set(publicRows.filter(row=>row.source.startsWith(`website:${site.id}:`)).map(row=>row.source.slice(`website:${site.id}:`.length)))
    const mapCandidate=String(raw.websiteMapUrl||raw.bluemapUrl||raw.dynmapUrl||'').trim()
    let mapUrl:string|null=null;try{const parsed=new URL(mapCandidate);if(parsed.protocol==='https:')mapUrl=parsed.toString()}catch{}
    const mapProvider=['bluemap','dynmap','custom'].includes(String(raw.websiteMapProvider))?String(raw.websiteMapProvider):mapUrl?'custom':null
    return {id:server.id,name:server.name,status:server.status,playerCount:server.playerCount,mcVersion:server.mcVersion,loader:server.loader,port:server.port,address:hostname||null,itemTrackingEnabled:server.itemTrackingEnabled,owned:role==='manager'||server.userId===a.id,canConfigureMap:role==='manager'||server.userId===a.id,map:{configured:Boolean(mapUrl),url:mapUrl,provider:mapProvider},metrics:metric?{cpuPercent:metric.cpuPercent,memoryUsedMb:metric.memoryUsedMb,memoryTotalMb:metric.memoryTotalMb,tps:metric.tps,mspt:metric.mspt,players:metric.players,uptimeSeconds:metric.uptimeSeconds}:null,nativeSources:{serverStatus:true,players:true,metrics:true,map:Boolean(mapUrl),support:siteManagedSources.has('support')||freshPublicSources.has('support'),store:siteManagedSources.has('store')||freshPublicSources.has('store'),wiki:siteManagedSources.has('wiki')||freshPublicSources.has('wiki'),lostItems:server.itemTrackingEnabled,leaderboards:freshPublicSources.has('leaderboard-kills'),leaderboardKills:freshPublicSources.has('leaderboard-kills'),leaderboardMoney:freshPublicSources.has('leaderboard-money'),leaderboardHealth:freshPublicSources.has('leaderboard-health'),leaderboardPlaytime:freshPublicSources.has('leaderboard-playtime'),bans:freshPublicSources.has('bans')}}
  }))
  return NextResponse.json({websiteId:site.id,selectedServerId:site.serverId||null,servers:mapped,sourceTypes:[
    {id:'server-status',label:'Sunucu Durumu',native:true},{id:'players',label:'Çevrimiçi Oyuncu',native:true},{id:'metrics',label:'Performans / TPS',native:true},{id:'map',label:'Dünya Haritası · BlueMap/Dynmap',native:true},{id:'support',label:'Destek İçeriği · Website/Sunucu',native:true},{id:'store',label:'Mağaza · Website/Sunucu',native:true},{id:'wiki',label:'Wiki · Website/Sunucu',native:true},{id:'lost-items',label:'Kayıp Eşya',native:true},{id:'leaderboard-kills',label:'Kill Sıralaması · Agent',native:true},{id:'leaderboard-money',label:'Para Sıralaması · Plugin',native:false},{id:'leaderboard-health',label:'Can / Seviye · Plugin',native:false},{id:'leaderboard-playtime',label:'Oynama Süresi · Agent',native:true},{id:'bans',label:'Banlı Oyuncular · Agent',native:true},{id:'custom-json',label:'Özel JSON API',native:false},
  ]},{headers:{'Cache-Control':'private, no-store'}})
}
