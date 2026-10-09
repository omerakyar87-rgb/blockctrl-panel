'use client'

import {
  ArrowLeft, Box, Clock3, Database, Download, FileText, Folder, Gamepad2, Globe2, LifeBuoy,
  Network, Package, Server as ServerIcon, Settings2, Shield, ShieldCheck, Signal, Terminal, Users, X, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export const SERVER_NAV=[
  ['overview','Genel Bakış',Gamepad2],['console','Konsol',Terminal],['players','Oyuncular',Users],['files','Dosyalar',Folder],
  ['worlds','Dünyalar',Globe2],['software','Eklentiler / Modlar',Package],['databases','Veritabanları',Database],['backups','Yedekler',Clock3],
  ['schedules','Zamanlanmış Görevler',Clock3],['settings','Ayarlar',Settings2],['security','Güvenlik',ShieldCheck],['lost-items','Kayıp Eşya Takibi',Box],
  ['sftp','SFTP',Network],['integrations','Entegrasyonlar',Zap],['support','Destek',LifeBuoy],['logs','Günlükler',FileText],
  ['network','Ağ & Portlar',Signal],['bulk-download','Toplu İndirme',Download],['access','Erişim & Roller',Shield]
] as const

export type ServerNavKey=(typeof SERVER_NAV)[number][0]
export type ServerNavItem=(typeof SERVER_NAV)[number]
const NAV_SECTIONS=['Sunucu','İçerik','Veri & otomasyon','Yönetim','Sistem'] as const

type Props={
  open:boolean
  items:readonly ServerNavItem[]
  active:ServerNavKey
  serverName:string
  serverMeta:string
  coverUrl?:string|null
  processState:'ok'|'bad'|'warn'|'neutral'
  processStatusLabel:string
  heartbeatHealthy:boolean
  onlineNode:boolean
  diskPct:number
  serverCount?:number
  serverLimit?:number
  onClose:()=>void
  onSelect:(key:ServerNavKey)=>void
  onBack:()=>void
}

export function ServerDetailNavigation({
  open,items,active,serverName,coverUrl,processState,processStatusLabel,serverCount=1,serverLimit=50,onClose,onSelect,onBack,
}:Props){
  const usage=Math.max(0,Math.min(100,serverCount/Math.max(1,serverLimit)*100))
  return <aside className={`${open?'translate-x-0':'-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-[220px] shrink-0 flex-col border-r border-[#1c2d3f] bg-[#07111d] shadow-[18px_0_50px_rgba(0,0,0,.22)] transition-transform lg:static lg:translate-x-0`}>
    <div className="flex min-h-[58px] items-center justify-between border-b border-[#1a2a3b] px-3">
      <img src="/blockctrl-logo.png" alt="BLOCKCTRL Sunucu Yönetim Paneli" className="h-[38px] w-auto max-w-[160px] object-contain object-left"/>
      <Button size="icon" variant="ghost" className="size-8 border border-[#22374d] bg-[#0b1827] lg:hidden" onClick={onClose}><X className="size-4"/></Button>
    </div>

    <div className="m-2.5 rounded-xl border border-[#1d3348] bg-[#0b1827] p-2.5">
      <div className="flex items-center gap-2.5">
        {coverUrl?<img src={coverUrl} alt="" className="size-11 rounded-lg border border-white/10 object-cover"/>:<div className="grid size-11 place-items-center rounded-lg border border-[#29445e] bg-[#102238] text-sky-300"><ServerIcon className="size-5"/></div>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-white">{serverName}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${processState==='ok'?'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]':processState==='bad'?'bg-red-400':processState==='warn'?'bg-amber-400':'bg-slate-500'}`}/>
            <span className={`text-[10px] font-medium ${processState==='ok'?'text-emerald-300':processState==='bad'?'text-red-300':processState==='warn'?'text-amber-300':'text-slate-500'}`}>{processStatusLabel}</span>
          </div>
        </div>
        <span className="text-xs text-slate-500">⌄</span>
      </div>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Sunucu yönetimi">
      <span className="sr-only">{NAV_SECTIONS.join(' · ')}</span>
      <div className="space-y-0.5">{items.map(([key,label,Icon])=><button
        key={key}
        aria-current={active===key?'page':undefined}
        onClick={()=>onSelect(key)}
        className={`group relative flex min-h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[12px] font-medium transition ${active===key?'bg-[#1b3f73] text-white shadow-[inset_2px_0_0_#38bdf8]':'text-slate-400 hover:bg-[#0d1c2c] hover:text-slate-100'}`}
      >
        <Icon className={`size-[17px] shrink-0 ${active===key?'text-sky-200':'text-slate-400 group-hover:text-sky-300'}`}/>
        <span className="truncate">{label}</span>
      </button>)}</div>
    </nav>

    <div className="border-t border-[#1a2a3b] p-3">
      <p className="text-[10px] text-slate-500">Panel Kullanımı</p>
      <p className="mt-1 text-[11px] text-slate-300">{serverCount} / {serverLimit} sunucu</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#26384c]"><div className="h-full rounded-full bg-sky-400" style={{width:`${usage}%`}}/></div>
      <button onClick={onBack} className="mt-3 flex min-h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-[11px] font-medium text-slate-400 transition hover:bg-[#0d1c2c] hover:text-white"><ArrowLeft className="size-4"/>Sunucu Listesi</button>
    </div>
  </aside>
}
