import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db, ensurePanelSchema } from '@/lib/db'
import { lostItems, nodes, serverMetrics, serverPermissions, serverSettings, serverWebsiteData, servers, websites } from '@/lib/db/schema'

const ALLOWED=new Set(['server-status','players','metrics','map','support','store','wiki','lost-items','leaderboard-kills','leaderboard-money','leaderboard-health','leaderboard-playtime','bans'])
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'public, max-age=5, stale-while-revalidate=15'}
function response(data:unknown,status=200){return NextResponse.json(data,{status,headers:cors})}
export function OPTIONS(){return new NextResponse(null,{status:204,headers:cors})}
function referencedServerIds(data:unknown){const ids=new Set<string>();if(!data||typeof data!=='object')return ids;const pages=Array.isArray((data as any).pages)?(data as any).pages:[];for(const page of pages){for(const section of Array.isArray(page?.sections)?page.sections:[]){const id=String(section?.liveData?.serverId||'');if(id)ids.add(id)}}return ids}

export async function GET(request:NextRequest){
  await ensurePanelSchema()
  const siteSlug=String(request.nextUrl.searchParams.get('site')||'')
  const source=String(request.nextUrl.searchParams.get('source')||'')
  const requestedServerId=String(request.nextUrl.searchParams.get('serverId')||'')
  if(!siteSlug||!ALLOWED.has(source))return response({error:'Geçersiz canlı veri isteği.'},400)
  const site=(await db.select().from(websites).where(eq(websites.slug,siteSlug)).limit(1))[0]
  if(!site)return response({error:'Website bulunamadı.'},404)
  const configured=referencedServerIds(site.builderData);if(site.serverId)configured.add(site.serverId)
  let serverId=requestedServerId||site.serverId||''
  if(requestedServerId&&!configured.has(requestedServerId)&&site.serverId)serverId=site.serverId
  if(!serverId)return response({available:false,source,reason:'Website için ana sunucu seçilmedi.',items:[]})
  if(!configured.has(serverId))return response({error:'Bu sunucu website canlı verisine bağlı değil.'},403)
  const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0]
  if(!server)return response({available:false,source,reason:'Sunucu bulunamadı.',items:[]})
  if(server.userId!==site.userId){
    const grant=(await db.select({id:serverPermissions.id,canWebsiteData:serverPermissions.canWebsiteData}).from(serverPermissions).where(and(eq(serverPermissions.userId,site.userId),eq(serverPermissions.serverId,server.id),eq(serverPermissions.canWebsiteData,true))).limit(1))[0]
    if(!grant)return response({error:'Website sahibi bu sunucunun public website verisini yayınlama yetkisine sahip değil.'},403)
  }
  const node=(await db.select({lastHeartbeat:nodes.lastHeartbeat}).from(nodes).where(eq(nodes.id,server.nodeId)).limit(1))[0]
  const nodeFresh=Boolean(node?.lastHeartbeat&&Date.now()-new Date(node.lastHeartbeat).getTime()<=120_000)
  const metric=(await db.select().from(serverMetrics).where(eq(serverMetrics.serverId,server.id)).orderBy(desc(serverMetrics.createdAt)).limit(1))[0]
  const settings=(await db.select().from(serverSettings).where(eq(serverSettings.serverId,server.id)).limit(1))[0]
  const raw=(settings?.settings||{}) as Record<string,unknown>
  const hostname=String(raw.hostname||raw.srvRecord||'').trim()
  const metricAt=metric?.createdAt?new Date(metric.createdAt):null
  const telemetryFresh=Boolean(nodeFresh&&metricAt&&Date.now()-metricAt.getTime()<=120_000)
  const summary={serverId:server.id,name:server.name,status:server.status,online:nodeFresh?server.status==='running':null,players:telemetryFresh?(metric?.players??null):null,version:server.mcVersion,loader:server.loader,port:server.port,address:hostname||null,tps:telemetryFresh?(metric?.tps??null):null,mspt:telemetryFresh?(metric?.mspt??null):null,cpuPercent:telemetryFresh?(metric?.cpuPercent??null):null,memoryUsedMb:telemetryFresh?(metric?.memoryUsedMb??null):null,memoryTotalMb:telemetryFresh?(metric?.memoryTotalMb??server.memoryMb):server.memoryMb,uptimeSeconds:telemetryFresh?(metric?.uptimeSeconds??null):null,nodeFresh,telemetryFresh,metricAt:metricAt?.toISOString()??null}
  const mapCandidate=String(raw.websiteMapUrl||raw.bluemapUrl||raw.dynmapUrl||'').trim()
  let mapUrl='';try{const parsed=new URL(mapCandidate);if(parsed.protocol==='https:')mapUrl=parsed.toString()}catch{}
  const mapProvider=['bluemap','dynmap','custom'].includes(String(raw.websiteMapProvider))?String(raw.websiteMapProvider):mapUrl?'custom':''
  if(source==='metrics'&&!telemetryFresh)return response({available:false,source,reason:'Sunucu telemetrisi güncel değil. Agent yeni metric göndermedi.',updatedAt:metricAt?.toISOString()??null,summary,items:[]})
  if(source==='map'){
    if(!mapUrl)return response({available:false,source,reason:'Bu sunucu için BlueMap/Dynmap HTTPS adresi yapılandırılmadı.',summary,map:{configured:false,url:null,provider:null},items:[]})
    return response({available:true,source,updatedAt:new Date().toISOString(),summary,map:{configured:true,url:mapUrl,provider:mapProvider||'custom'},items:[{title:'Dünya Haritası',description:server.name,value:mapProvider||'Harita'}]})
  }
  if(source==='server-status'||source==='players'||source==='metrics')return response({available:true,source,updatedAt:metricAt?.toISOString()??null,summary,items:[
    {title:'Çevrimiçi Oyuncu',description:server.name,value:summary.players==null?'—':String(summary.players)},
    {title:'Sunucu Durumu',description:`${server.loader} ${server.mcVersion}`,value:summary.online==null?'Bağlantı yok':summary.online?'Çalışıyor':'Kapalı'},
    {title:'TPS',description:telemetryFresh?'Son telemetri':'Telemetri güncel değil',value:summary.tps==null?'—':String(summary.tps)},
    {title:'Uptime',description:telemetryFresh?'Çalışma süresi':'Telemetri güncel değil',value:summary.uptimeSeconds?`${Math.floor(summary.uptimeSeconds/3600)} sa`:'—'},
  ]})
  if(source==='lost-items'){
    if(!server.itemTrackingEnabled)return response({available:false,source,reason:'Kayıp eşya takibi bu sunucuda etkin değil.',summary,items:[]})
    const rows=await db.select().from(lostItems).where(eq(lostItems.serverId,server.id)).orderBy(desc(lostItems.occurredAt)).limit(12)
    return response({available:true,source,updatedAt:new Date().toISOString(),summary,items:rows.map(row=>({title:row.playerName||'Oyuncu',description:`${row.itemName} x${row.amount} · ${row.reason}`,value:row.status,image:null}))})
  }
  if(['bans','leaderboard-kills','leaderboard-money','leaderboard-health','leaderboard-playtime','support','store','wiki'].includes(source)){
    const scopedSource=`website:${site.id}:${source}`
    const scoped=(await db.select().from(serverWebsiteData).where(and(eq(serverWebsiteData.serverId,server.id),eq(serverWebsiteData.source,scopedSource))).limit(1))[0]
    const agentSnapshot=(await db.select().from(serverWebsiteData).where(and(eq(serverWebsiteData.serverId,server.id),eq(serverWebsiteData.source,source))).limit(1))[0]
    const agentUpdatedAt=agentSnapshot?new Date(agentSnapshot.updatedAt):null
    const agentFresh=Boolean(nodeFresh&&agentUpdatedAt&&Date.now()-agentUpdatedAt.getTime()<=5*60_000)
    const snapshot=agentFresh?agentSnapshot:scoped??agentSnapshot
    if(!snapshot){
      const reason=source==='support'?'Destek formu sunucuya bağlı; destek kartları için henüz içerik kaydedilmedi.':source==='store'?'Bu sunucu için mağaza verisi henüz yapılandırılmadı.':source==='wiki'?'Bu sunucu için wiki verisi henüz yapılandırılmadı.':source==='leaderboard-money'||source==='leaderboard-health'?'Bu sıralama için gerçek plugin/veri sağlayıcısı bağlı değil.':'Agent henüz bu veri kaynağı için snapshot göndermedi.'
      return response({available:false,source,reason,summary,items:[]})
    }
    const updatedAt=new Date(snapshot.updatedAt)
    const scopedManaged=snapshot.source===scopedSource
    const fresh=scopedManaged||(nodeFresh&&Number.isFinite(updatedAt.getTime())&&Date.now()-updatedAt.getTime()<=5*60_000)
    const items=Array.isArray(snapshot.data?.items)?snapshot.data.items.slice(0,25):[]
    if(!fresh)return response({available:false,source,reason:'Sunucu website veri snapshotı güncel değil.',updatedAt:updatedAt.toISOString(),summary,items:[]})
    return response({available:true,source,updatedAt:updatedAt.toISOString(),summary,managedByWebsite:scopedManaged,items})
  }
  return response({available:false,source,reason:'Bu veri türü için henüz canlı plugin/veri sağlayıcısı bağlı değil.',summary,items:[]})
}