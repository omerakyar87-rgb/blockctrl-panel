'use client'

import { useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Request={title:string;description:string;confirmLabel:string;danger:boolean;requiredText?:string}
type Options={title?:string;confirmLabel?:string;danger?:boolean;requiredText?:string}

export function useActionConfirm(){
  const [request,setRequest]=useState<Request|null>(null)
  const [typed,setTyped]=useState('')
  const resolver=useRef<((value:boolean)=>void)|null>(null)

  function ask(description:string,options:Options={}){
    if(resolver.current)resolver.current(false)
    setTyped('')
    setRequest({
      title:options.title??'İşlemi onaylayın',
      description,
      confirmLabel:options.confirmLabel??'Onayla',
      danger:options.danger??false,
      requiredText:options.requiredText,
    })
    return new Promise<boolean>(resolve=>{resolver.current=resolve})
  }

  function finish(value:boolean){
    resolver.current?.(value);resolver.current=null;setRequest(null);setTyped('')
  }

  const ready=!request?.requiredText||typed===request.requiredText
  const dialog=<Dialog open={!!request} onOpenChange={open=>{if(!open)finish(false)}}>
    <DialogContent className="border-[#29435d] bg-[#0b1724] text-slate-100 sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><AlertTriangle className={request?.danger?'size-5 text-red-400':'size-5 text-amber-300'}/>{request?.title}</DialogTitle>
        <DialogDescription className="pt-2 text-sm leading-6 text-slate-400">{request?.description}</DialogDescription>
      </DialogHeader>
      {request?.requiredText&&<div className="space-y-2">
        <p className="text-xs text-slate-400">Devam etmek için <strong className="font-mono text-slate-200">{request.requiredText}</strong> yazın.</p>
        <Input value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off" className="border-[#28445f] bg-[#07111f]"/>
      </div>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={()=>finish(false)}>Vazgeç</Button>
        <Button variant={request?.danger?'destructive':'default'} disabled={!ready} onClick={()=>finish(true)}>{request?.confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>
  return {ask,dialog}
}
