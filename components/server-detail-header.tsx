'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronDown, CircleHelp, Menu, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Actor={name:string;role:string}

function roleLabel(role:string){
  return role==='founder'?'Kurucu':role==='manager'?'Yönetici':role==='admin'?'Admin':role==='guide'?'Rehber':'Üye'
}

export function ServerDetailHeader({
  serverName,sectionLabel,actor,onOpenMenu,onRefresh,
}:{
  serverName:string
  sectionLabel:string
  actor?:Actor|null
  onOpenMenu:()=>void
  onRefresh:()=>void
}){
  const router=useRouter()
  const inputRef=useRef<HTMLInputElement|null>(null)
  const[query,setQuery]=useState('')

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[])

  function submitSearch(){
    const value=query.trim()
    if(value)router.push('/?search='+encodeURIComponent(value))
  }

  return <header className="sticky top-0 z-30 border-b border-[#1b2c3e] bg-[#07111d]/96 backdrop-blur-xl">
    <div className="flex min-h-[58px] items-center justify-between gap-3 px-3 sm:px-4 lg:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button size="icon" variant="ghost" className="shrink-0 border border-[#22374d] bg-[#0b1827] text-slate-200 hover:bg-[#102238] lg:hidden" onClick={onOpenMenu} aria-label="Sunucu menüsünü aç"><Menu className="size-5"/></Button>
        <div className="relative hidden w-full max-w-[332px] md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"/>
          <input
            ref={inputRef}
            value={query}
            onChange={event=>setQuery(event.target.value)}
            onKeyDown={event=>{if(event.key==='Enter')submitSearch()}}
            className="h-9 w-full rounded-lg border border-[#1d3349] bg-[#0b1827] pl-9 pr-16 text-xs text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10"
            placeholder="Sunucularda ara..."
            aria-label="Sunucularda ara"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">Ctrl + K</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <Button size="icon" variant="ghost" className="relative size-9 rounded-lg text-slate-400 hover:bg-[#102238] hover:text-white" onClick={()=>window.dispatchEvent(new CustomEvent('blockctrl:open-support',{detail:{view:'announcements'}}))} title="Bildirimler" aria-label="Bildirimler"><Bell className="size-[17px]"/></Button>
        <Button size="icon" variant="ghost" className="size-9 rounded-lg text-slate-400 hover:bg-[#102238] hover:text-white" onClick={()=>window.dispatchEvent(new CustomEvent('blockctrl:open-support',{detail:{view:'home'}}))} title="Yardım" aria-label="Yardım"><CircleHelp className="size-[17px]"/></Button>
        <Button size="icon" variant="ghost" className="size-9 rounded-lg text-slate-400 hover:bg-[#102238] hover:text-white" onClick={onRefresh} title="Canlı veriyi yenile" aria-label="Canlı veriyi yenile"><RefreshCw className="size-[17px]"/></Button>
        {actor&&<div className="ml-1 flex items-center gap-2 border-l border-[#1d2f42] pl-3">
          <div className="grid size-9 place-items-center rounded-full bg-[#182840] text-sm font-semibold text-slate-100">{actor.name.slice(0,1).toUpperCase()}</div>
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="max-w-28 truncate text-xs font-semibold text-white">{actor.name}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{roleLabel(actor.role)}</p>
          </div>
          <ChevronDown className="hidden size-3.5 text-slate-500 sm:block"/>
        </div>}
      </div>
    </div>
    <div className="flex h-10 items-center gap-2 border-t border-[#142538] px-4 text-[11px] text-slate-500 lg:px-5">
      <span>Sunucular</span><span className="text-slate-700">›</span><span className="truncate text-slate-400">{serverName}</span><span className="text-slate-700">›</span><span className="font-medium text-slate-200">{sectionLabel}</span>
      <span className="ml-1 h-1.5 w-1.5 rounded-full bg-cyan-400/80"/>
    </div>
  </header>
}
