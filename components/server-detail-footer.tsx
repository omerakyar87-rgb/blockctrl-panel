'use client'

import { CheckCircle2 } from 'lucide-react'

export function ServerDetailFooter({onlineNode}:{onlineNode:boolean}){
  return <footer className="mx-auto flex max-w-[1540px] flex-col gap-2 px-3 pb-4 pt-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <span className="flex flex-wrap items-center gap-2 text-sky-400"><CheckCircle2 className="size-3.5"/>BLOCKCTRL sunucu durumu izleniyor. <span className="text-slate-600">|</span><span className="text-slate-500">Yalnız doğrulanmış telemetri gösterilir.</span></span>
    <span className="flex shrink-0 items-center gap-2"><span className={`size-2 rounded-full ${onlineNode?'bg-cyan-400':'bg-amber-400'}`}/>{onlineNode?'Node heartbeat güncel':'Node heartbeat güncel değil'}</span>
  </footer>
}
