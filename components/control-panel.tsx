'use client'

import { useEffect, useState } from 'react'
import { Bell, BellRing, Box, Headphones, Menu, Paintbrush, Server, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfrastructureManager } from '@/components/infrastructure-manager'
import { SupportCenter } from '@/components/support-center'
import { cn } from '@/lib/utils'

const tools = [
  {key:'worlds', title:'Dünya Ayarları', description:'Dünya ve harita yönetimi', icon:Box, image:'/admin-card-world.png', accent:'border-emerald-300/45 shadow-[0_18px_50px_rgba(34,197,94,.18)]'},
  {key:'support', title:'Destek Ayarları', description:'Yardım ve destek seçenekleri', icon:Headphones, image:'/admin-card-support.png', accent:'border-sky-300/45 shadow-[0_18px_50px_rgba(14,165,233,.20)]'},
  {key:'info', title:'Bilgilendirme Ayarları', description:'Duyuru ve bildirim yönetimi', icon:BellRing, image:'/admin-card-info.png', accent:'border-violet-300/45 shadow-[0_18px_50px_rgba(139,92,246,.20)]'},
  {key:'websites', title:'Website Tasarım Ayarları', description:'Site görünümü ve tema', icon:Paintbrush, image:'/admin-card-website.png', accent:'border-orange-300/45 shadow-[0_18px_50px_rgba(249,115,22,.20)]'},
] as const

export function ControlPanel() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [utilityOpen, setUtilityOpen] = useState(false)
  const [role, setRole] = useState<'founder'|'manager'|'admin'|'guide'|'member'>('member')

  useEffect(()=>{
    const handler=(event:Event)=>{
      const next=(event as CustomEvent<{role?:string}>).detail?.role
      if(next==='founder'||next==='manager'||next==='admin'||next==='guide'||next==='member')setRole(next)
    }
    window.addEventListener('blockctrl:role',handler)
    return()=>window.removeEventListener('blockctrl:role',handler)
  },[])

  useEffect(()=>{
    if(!utilityOpen)return
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setUtilityOpen(false)}
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[utilityOpen])

  function openTool(key:(typeof tools)[number]['key']){
    if(key==='worlds') window.dispatchEvent(new CustomEvent('blockctrl:open-world-management'))
    if(key==='websites') window.dispatchEvent(new CustomEvent('blockctrl:open-websites'))
    if(key==='support'||key==='info') window.dispatchEvent(new CustomEvent('blockctrl:open-support',{detail:{view:key==='info'?'info':'home'}}))
    setUtilityOpen(false)
  }

  return <div className="relative min-h-svh overflow-x-hidden bg-[#020b16] font-sans text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[url('/blockctrl-panel-background.jpg')] bg-cover bg-center bg-no-repeat"/>
    <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(2,14,28,.55),rgba(1,10,21,.68)),radial-gradient(circle_at_70%_15%,rgba(0,153,255,.08),transparent_34%)]"/>

    <aside className={cn('fixed inset-y-0 left-0 z-30 flex w-[278px] flex-col border-r border-sky-400/20 bg-[#03111e]/82 shadow-[20px_0_80px_rgba(0,0,0,.28)] backdrop-blur-[7px] transition-transform lg:translate-x-0',mobileOpen?'translate-x-0':'-translate-x-full')}>
      <div className="flex h-[76px] items-center justify-between border-b border-sky-400/15 px-4">
        <img src="/blockctrl-logo.png" alt="BlockCtrl Sunucu Yönetim Paneli" className="h-[52px] w-auto max-w-[230px] object-contain object-left"/>
        <Button variant="ghost" size="icon" className="text-sky-100 lg:hidden" onClick={()=>setMobileOpen(false)}><X/></Button>
      </div>

      <nav className="flex flex-1 flex-col p-3">
        <button type="button" className="mt-7 flex items-center gap-3 rounded-xl border border-cyan-300/55 bg-[linear-gradient(90deg,rgba(0,174,255,.22),rgba(0,91,180,.14))] px-5 py-4 text-left text-[15px] font-medium text-white shadow-[inset_5px_0_0_#22d3ee,0_0_28px_rgba(14,165,233,.12)]">
          <Server className="size-5 text-cyan-200"/>Sunucu operasyonları
        </button>
        <div className="mt-auto px-3 pb-7">
          <div className="mb-3 h-px w-8 bg-cyan-400"/>
          <p className="text-[10px] uppercase leading-5 tracking-[.26em] text-sky-200/60">Sunucular<br/>daha fazlasını başarır</p>
        </div>
      </nav>
    </aside>

    <div className="relative lg:pl-[278px]">
      <header className="sticky top-0 z-20 flex h-[66px] items-center border-b border-sky-400/18 bg-[#020d19]/72 px-4 backdrop-blur-[8px] md:px-7">
        <Button variant="ghost" size="icon" className="text-sky-100 lg:hidden" onClick={()=>setMobileOpen(true)}><Menu/></Button>
        <div className="ml-auto flex items-center gap-2.5">
          <div className="mr-2 hidden items-center gap-2 text-xs text-sky-100/70 sm:flex"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]"/>Panel çevrimiçi</div>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-slate-100 hover:bg-white/[.06]" aria-label="Bildirimler"><Bell className="size-5"/></Button>
          <SupportCenter/>
          {role!=='member'&&<Button variant="ghost" size="icon" onClick={()=>setUtilityOpen(true)} aria-label="Yönetim menüsünü aç" title="Yönetim" className="group relative size-11 rounded-xl border border-cyan-300/45 bg-[#061a2b]/90 text-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,.08),0_0_26px_rgba(14,165,233,.18),inset_0_0_20px_rgba(34,211,238,.05)] transition hover:border-cyan-200 hover:bg-cyan-400/10 hover:text-cyan-100"><Box className="size-6 stroke-[1.8] transition group-hover:scale-105"/><span className="pointer-events-none absolute -right-1 -top-1 size-2 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]"/></Button>}
        </div>
      </header>

      <main className="relative min-h-[calc(100svh-66px)] px-4 py-8 md:px-7 lg:px-12 lg:py-11"><InfrastructureManager/></main>
    </div>

    {utilityOpen&&role!=='member'&&<div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="BlockCtrl yönetim menüsü">
      <button className="absolute inset-0 bg-[#010812]/72 backdrop-blur-[3px]" onClick={()=>setUtilityOpen(false)} aria-label="Menüyü kapat"/>
      <aside className="absolute right-0 top-0 h-full w-full max-w-[760px] overflow-y-auto border-l border-sky-300/20 bg-[#04111f] shadow-[-30px_0_110px_rgba(0,0,0,.72)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,16,29,.88),rgba(2,12,23,.97)),url('/auth-bg.png')] bg-cover bg-center opacity-90"/>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_8%,rgba(14,165,233,.10),transparent_28%),linear-gradient(90deg,rgba(255,255,255,.015),transparent_40%)]"/>

        <div className="relative z-10 flex min-h-full flex-col px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex items-start justify-between gap-5 border-b border-sky-300/12 pb-6">
            <img src="/blockctrl-logo.png" alt="BlockCtrl Sunucu Yönetim Paneli" className="h-[62px] w-auto max-w-[360px] object-contain object-left"/>
            <div className="ml-auto hidden items-start gap-4 lg:flex"><div className="border-l border-sky-300/20 pl-4 text-[10px] font-semibold uppercase leading-6 tracking-[.28em] text-sky-200/38">Daha fazla<br/>kontrol<br/>daha büyük<br/>dünyalar<div className="mt-2 h-[2px] w-9 bg-cyan-400"/></div></div>
            <Button variant="ghost" size="icon" className="shrink-0 rounded-xl border border-sky-400/15 bg-[#071827]/70 text-sky-100 hover:bg-sky-400/10" onClick={()=>setUtilityOpen(false)} aria-label="Kapat"><X/></Button>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {tools.map(item=>{const Icon=item.icon;return <button key={item.key} type="button" onClick={()=>openTool(item.key)} className={cn('group relative min-h-[245px] overflow-hidden rounded-xl border text-left text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200',item.accent)}>
              <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-cover"/>
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,8,16,.03),rgba(1,8,16,.20))]"/>
              <div className="relative z-10 flex h-full min-h-[245px] flex-col p-6">
                <span className="grid size-[72px] place-items-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-[0_12px_35px_rgba(0,0,0,.12)] backdrop-blur-[2px]"><Icon className="size-10 stroke-[1.6]"/></span>
                <div className="mt-auto pr-10"><strong className="block text-[24px] font-black leading-[1.08] tracking-[-.025em] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,.25)]">{item.title}</strong><span className="mt-2 block max-w-[260px] text-[15px] leading-5 text-white/78">{item.description}</span></div>
                <span className="absolute bottom-5 right-6 text-[38px] font-light leading-none text-white transition group-hover:translate-x-1">→</span>
              </div>
            </button>})}
          </div>

          <div className="mt-8 border-t border-sky-300/12 pt-5"><div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[.30em] text-sky-200/35"><span>Kendi dünyanı yönet</span><span>BLOCKCTRL.COM</span></div></div>
        </div>
      </aside>
    </div>}
  </div>
}
