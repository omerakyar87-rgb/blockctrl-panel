'use client'

import useSWR from 'swr'
import {
  Activity, AlertTriangle, BellRing, CheckCircle2, Cloud, Database, Globe2,
  KeyRound, LoaderCircle, RefreshCw, Server, ShieldCheck, TriangleAlert, Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type CheckStatus='unknown'|'ok'|'error'|'outdated'|'offline'|'not-configured'
type Health={
  service:string
  status:'ok'|'degraded'|'error'
  timestamp:string
  responseTimeMs:number
  database:{status:CheckStatus;latencyMs:number|null;error:string|null;pool:{total:number;idle:number;waiting:number;max:number}}
  migration:{status:CheckStatus;expected:string;latest:string|null;error:string|null}
  agent:{status:CheckStatus;totalNodes:number;onlineNodes:number;latestHeartbeat:string|null;error:string|null}
  auth:{status:CheckStatus;supabaseUrlConfigured:boolean;publishableKeyConfigured:boolean;error:string|null}
  vercelWebsite:{status:CheckStatus;mode:'internal'|'vercel';latencyMs:number|null;teamConfigured:boolean;externalConfigured:boolean;error:string|null}
  blobStorage:{status:CheckStatus;mode:'blob'|'database-fallback';latencyMs:number|null;fallbackMaxBytes:number;error:string|null}
  websiteRuntime:{status:CheckStatus;publicUrlConfigured:boolean;serverBridgeConfigured:boolean;error:string|null}
  security:{status:CheckStatus;cspMode:'enforced'|'report-only';environment:string;error:string|null}
  alerting:{status:CheckStatus;mode?:'internal'|'external';webhookConfigured:boolean;emailConfigured:boolean;error:string|null}
  integrations:{status:CheckStatus;discordBotWorker:boolean;liveStreamGateway:boolean;encryptionConfigured:boolean;oauth:{youtube:boolean;twitch:boolean;kick:boolean};error:string|null}
  readiness:{status:'ready'|'ready-with-warnings'|'blocked';blockers:string[];warnings:string[]}
}

async function healthFetcher(url:string){
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json'}})
  const text=await response.text()
  if(!text.trim())throw new Error(`Health endpoint boş yanıt döndürdü (HTTP ${response.status}).`)
  try{return JSON.parse(text) as Health}catch{throw new Error(`Health endpoint geçersiz JSON döndürdü (HTTP ${response.status}).`)}
}

const tone:Record<CheckStatus,{label:string;dot:string;text:string;border:string;bg:string}>={
  ok:{label:'Hazır',dot:'bg-emerald-400',text:'text-emerald-300',border:'border-emerald-400/20',bg:'bg-emerald-400/[.05]'},
  error:{label:'Hata',dot:'bg-red-400',text:'text-red-300',border:'border-red-400/25',bg:'bg-red-400/[.05]'},
  outdated:{label:'Güncel değil',dot:'bg-amber-400',text:'text-amber-300',border:'border-amber-400/25',bg:'bg-amber-400/[.05]'},
  offline:{label:'Çevrimdışı',dot:'bg-red-400',text:'text-red-300',border:'border-red-400/25',bg:'bg-red-400/[.05]'},
  'not-configured':{label:'Ayarlanmadı',dot:'bg-amber-400',text:'text-amber-300',border:'border-amber-400/25',bg:'bg-amber-400/[.05]'},
  unknown:{label:'Bilinmiyor',dot:'bg-slate-500',text:'text-slate-400',border:'border-white/10',bg:'bg-white/[.02]'},
}

function ageText(value:string|null){
  if(!value)return 'Heartbeat yok'
  const age=Math.max(0,Date.now()-new Date(value).getTime())
  if(!Number.isFinite(age))return 'Tarih doğrulanamadı'
  if(age<60_000)return `${Math.max(1,Math.round(age/1000))} sn önce`
  if(age<3_600_000)return `${Math.round(age/60_000)} dk önce`
  return new Date(value).toLocaleString('tr-TR')
}

function StatusCard({icon:Icon,title,status,summary,detail}:{icon:React.ComponentType<{className?:string}>;title:string;status:CheckStatus;summary:string;detail?:string}){
  const meta=tone[status]
  return <div className={`rounded-2xl border p-4 ${meta.border} ${meta.bg}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[.06] bg-black/15"><Icon className="size-4 text-slate-300"/></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-500">{title}</p><p className="mt-1 truncate text-sm font-semibold text-slate-100">{summary}</p></div></div>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/15 px-2 py-1 text-[10px] font-semibold ${meta.text}`}><span className={`size-1.5 rounded-full ${meta.dot}`}/>{meta.label}</span>
    </div>
    {detail&&<p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>}
  </div>
}

export function SystemReadinessCenter({manager=false}:{manager?:boolean}){
  const{data,error,isLoading,mutate,isValidating}=useSWR<Health>('/api/health',healthFetcher,{refreshInterval:15000,revalidateOnFocus:true,errorRetryCount:4,errorRetryInterval:2500})
  if(isLoading&&!data)return <Card className="border-sky-900/60 bg-[#0d1c2c]"><CardContent className="flex min-h-40 items-center justify-center gap-3 text-sm text-slate-400"><LoaderCircle className="size-5 animate-spin"/>Sistem hazırlığı kontrol ediliyor…</CardContent></Card>
  if(error&&!data)return <Card className="border-red-500/25 bg-red-500/[.05]"><CardHeader><CardTitle className="flex items-center gap-2 text-red-200"><AlertTriangle className="size-5"/>Sistem kontrolü alınamadı</CardTitle><CardDescription>{error.message}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={()=>void mutate()}><RefreshCw className="mr-2 size-4"/>Tekrar dene</Button></CardContent></Card>
  if(!data)return null

  const readiness=data.readiness?.status??(data.status==='error'?'blocked':data.status==='degraded'?'ready-with-warnings':'ready')
  const badge=readiness==='ready'?{label:'Yayına hazır',cls:'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',icon:CheckCircle2}:readiness==='blocked'?{label:'Kritik eksik var',cls:'border-red-400/25 bg-red-400/10 text-red-300',icon:TriangleAlert}:{label:'Çalışır · uyarılar var',cls:'border-amber-400/25 bg-amber-400/10 text-amber-300',icon:AlertTriangle}
  const BadgeIcon=badge.icon

  return <div className="space-y-4">
    <Card className="overflow-hidden border-sky-900/60 bg-[linear-gradient(145deg,rgba(13,29,45,.98),rgba(7,18,30,.98))]">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b border-white/[.06] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-300/60">BLOCKCTRL · ALTYAPI HAZIRLIĞI</p><h2 className="mt-1 text-xl font-bold text-white">Sistem ve yayın hazırlığı</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Veritabanı, migration, kimlik doğrulama, agent, website yayınlama, storage, güvenlik ve operasyon uyarıları tek ekrandan doğrulanır.</p></div>
          <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${badge.cls}`}><BadgeIcon className="size-4"/>{badge.label}</span><Button variant="outline" className="h-10 border-sky-400/20 bg-[#071827]/80" disabled={isValidating} onClick={()=>void mutate()}><RefreshCw className={`mr-2 size-4 ${isValidating?'animate-spin':''}`}/>Yenile</Button></div>
        </div>
        <div className="grid gap-px bg-white/[.05] sm:grid-cols-3"><div className="bg-[#091725] px-5 py-3"><p className="text-[10px] uppercase tracking-[.14em] text-slate-600">Yanıt süresi</p><p className="mt-1 font-mono text-sm text-slate-200">{data.responseTimeMs} ms</p></div><div className="bg-[#091725] px-5 py-3"><p className="text-[10px] uppercase tracking-[.14em] text-slate-600">Son kontrol</p><p className="mt-1 text-sm text-slate-200">{new Date(data.timestamp).toLocaleTimeString('tr-TR')}</p></div><div className="bg-[#091725] px-5 py-3"><p className="text-[10px] uppercase tracking-[.14em] text-slate-600">CSP modu</p><p className="mt-1 text-sm text-slate-200">{data.security?.cspMode==='enforced'?'Enforce':'Report-Only'}</p></div></div>
      </CardContent>
    </Card>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <StatusCard icon={Database} title="Veritabanı" status={data.database.status} summary={data.database.status==='ok'?`${data.database.latencyMs??0} ms · pool ${data.database.pool.total}/${data.database.pool.max}`:'Bağlantı doğrulanamadı'} detail={data.database.error??`Idle ${data.database.pool.idle} · bekleyen ${data.database.pool.waiting}`}/>
      <StatusCard icon={Wrench} title="Migration" status={data.migration.status} summary={data.migration.latest?`${data.migration.latest} / ${data.migration.expected}`:`Beklenen ${data.migration.expected}`} detail={data.migration.error??(data.migration.status==='ok'?'Şema sürümü güncel.':'Veritabanı şeması güncellenmeli.')}/>
      <StatusCard icon={KeyRound} title="Kimlik doğrulama" status={data.auth?.status??'unknown'} summary={data.auth?.status==='ok'?'Supabase Auth yapılandırıldı':'Auth yapılandırması eksik'} detail={data.auth?.error??'Panel oturumları için URL ve publishable key doğrulandı.'}/>
      <StatusCard icon={Server} title="Agent / Node" status={data.agent.status} summary={`${data.agent.onlineNodes} / ${data.agent.totalNodes} node çevrimiçi`} detail={data.agent.error??ageText(data.agent.latestHeartbeat)}/>
      <StatusCard icon={Cloud} title="Website yayınlama" status={data.vercelWebsite.status} summary={data.vercelWebsite.mode==='vercel'?`Ayrı Vercel yayın · ${data.vercelWebsite.latencyMs??0} ms`:'BlockCtrl dahili yayın hazır'} detail={data.vercelWebsite.error??(data.vercelWebsite.mode==='vercel'?'Ayrı Vercel proje/deployment bağlantısı doğrulandı.':'Website’ler /site/<slug>/ altında yayınlanır; VERCEL_TOKEN opsiyoneldir.')}/>
      <StatusCard icon={Globe2} title="Website runtime" status={data.websiteRuntime.status} summary={data.websiteRuntime.status==='ok'?'Runtime URL + node bridge hazır':'Website runtime ayarları eksik'} detail={data.websiteRuntime.error??'Yayınlanan siteler canlı BlockCtrl verisine erişebilir.'}/>
      <StatusCard icon={Activity} title="Medya Deposu" status={data.blobStorage.status} summary={data.blobStorage.mode==='blob'?`Vercel Blob · ${data.blobStorage.latencyMs??0} ms`:'PostgreSQL medya fallback'} detail={data.blobStorage.error??(data.blobStorage.mode==='blob'?'Website ve bilgi medyaları object storage üzerinde tutulur.':`Temel medya yüklemeleri hazır · dosya başına yaklaşık ${Math.max(1,Math.round((data.blobStorage.fallbackMaxBytes||0)/1048576))} MB. Büyük dosyalar için Blob/object storage önerilir.`)}/>
      <StatusCard icon={BellRing} title="Operasyon uyarıları" status={data.alerting?.status??'unknown'} summary={data.alerting?.mode==='internal'?'Dahili structured log aktif':data.alerting?.status==='ok'?'Harici alarm kanalı hazır':'Alarm kanalı hazır değil'} detail={data.alerting?.error??(data.alerting?.mode==='internal'?'Vercel/runtime logları ana alarm kanalıdır; webhook ve e-posta isteğe bağlıdır.':`Webhook ${data.alerting?.webhookConfigured?'hazır':'yok'} · e-posta ${data.alerting?.emailConfigured?'hazır':'yok'}`)}/>
      <StatusCard icon={ShieldCheck} title="Güvenlik" status={data.security?.status??'unknown'} summary={data.security?.cspMode==='enforced'?'CSP enforce':'CSP Report-Only'} detail={data.security?.error??`Ortam: ${data.security?.environment??'unknown'}`}/>
    </div>

    {(data.readiness?.blockers?.length||data.readiness?.warnings?.length)&&<div className="grid gap-3 lg:grid-cols-2">
      <Card className="border-red-500/20 bg-red-500/[.035]"><CardHeader><CardTitle className="flex items-center gap-2 text-sm text-red-200"><TriangleAlert className="size-4"/>Kritik engeller</CardTitle><CardDescription>Production yayınından önce çözülmesi gerekenler.</CardDescription></CardHeader><CardContent>{data.readiness.blockers.length?<div className="space-y-2">{data.readiness.blockers.map(item=><div key={item} className="rounded-lg border border-red-500/15 bg-black/10 px-3 py-2 text-xs leading-5 text-red-100/80">{item}</div>)}</div>:<p className="text-xs text-emerald-300">Kritik engel yok.</p>}</CardContent></Card>
      <Card className="border-amber-500/20 bg-amber-500/[.035]"><CardHeader><CardTitle className="flex items-center gap-2 text-sm text-amber-200"><AlertTriangle className="size-4"/>Uyarılar</CardTitle><CardDescription>Çekirdeği durdurmaz; ilgili özellikleri sınırlar.</CardDescription></CardHeader><CardContent>{data.readiness.warnings.length?<div className="space-y-2">{data.readiness.warnings.map(item=><div key={item} className="rounded-lg border border-amber-500/15 bg-black/10 px-3 py-2 text-xs leading-5 text-amber-100/75">{item}</div>)}</div>:<p className="text-xs text-emerald-300">Yapılandırma uyarısı yok.</p>}</CardContent></Card>
    </div>}

    {manager&&<Card className="border-sky-900/60 bg-[#0d1c2c]"><CardHeader><CardTitle className="text-sm">Yönetici kurulum sırası</CardTitle><CardDescription>Secret değerleri gösterilmez; yalnız eksik yapılandırma isimleri ve güvenli sıra verilir.</CardDescription></CardHeader><CardContent className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border border-white/[.06] bg-black/10 p-3"><b className="text-slate-200">1. Veritabanı</b><p className="mt-1 leading-5">DATABASE_URL → <code>pnpm db:migrate</code> → health migration güncel.</p></div><div className="rounded-lg border border-white/[.06] bg-black/10 p-3"><b className="text-slate-200">2. Auth + Agent</b><p className="mt-1 leading-5">Supabase env + node token → heartbeat doğrulaması.</p></div><div className="rounded-lg border border-white/[.06] bg-black/10 p-3"><b className="text-slate-200">3. Website</b><p className="mt-1 leading-5">Runtime URL ve node bridge otomatik doğrulanır. Ayrı website projesi için VERCEL_TOKEN opsiyoneldir; dahili yayın hazırdır. Medya yükleme için Blob bağlantısı önerilir.</p></div><div className="rounded-lg border border-white/[.06] bg-black/10 p-3"><b className="text-slate-200">4. Operasyon</b><p className="mt-1 leading-5">Alert webhook/e-posta → CSP gözlemi → enforce.</p></div></CardContent></Card>}
  </div>
}
