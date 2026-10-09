'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Globe2, LoaderCircle, Pencil, Plus, RefreshCw, Rocket, Settings2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { WebsiteBuilder, defaultBuilderData, type WebsiteBuilderData, type BuilderWebsite } from '@/components/website-builder'
import { WebsiteManagementWorkspace, type WebsiteManagementSite } from '@/components/website-management-workspace'
import { useActionConfirm } from '@/components/action-confirm-dialog'

type WebsiteRow = {
  id:string
  userId:string
  serverId:string|null
  name:string
  slug:string
  projectName:string
  template:string
  description:string|null
  vercelProjectId:string|null
  deploymentId:string|null
  deploymentUrl:string|null
  productionUrl:string|null
  status:string
  lastError:string|null
  builderData:WebsiteBuilderData|null
  publishedAt:string|null
  createdAt:string
  updatedAt:string
}

type WebsiteServerOption={id:string;name:string;status:string;playerCount:number;mcVersion:string;loader:string;owned:boolean;canWebsiteData:boolean;map:{configured:boolean;url:string|null;provider:string|null}}
type WebsitesResponse = {
  websites: WebsiteRow[]
  servers: WebsiteServerOption[]
  canCreate:boolean
  integrationConfigured:boolean
  hostingMode:'vercel'|'internal'
  internalHosting:boolean
  suffix:string
}

async function json<T>(response:Response){
  const text=await response.text()
  const data=(text?JSON.parse(text):{}) as T & {error?:string}
  if(!response.ok) throw new Error(data.error||`Website işlemi başarısız (HTTP ${response.status})`)
  return data
}

async function fetcher(url:string){
  return json<WebsitesResponse>(await fetch(url,{cache:'no-store',headers:{accept:'application/json'}}))
}

function normalizeSlug(value:string){
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/ı/g,'i')
    .replace(/ş/g,'s')
    .replace(/ğ/g,'g')
    .replace(/ü/g,'u')
    .replace(/ö/g,'o')
    .replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,40)
}

const statusLabel:Record<string,string>={ready:'Yayında',building:'Yayınlanıyor',queued:'Kuyrukta',failed:'Hata',configuration_required:'Entegrasyon gerekli'}
const templateLabel:Record<string,string>={blank:'Boş Proje',landing:'Landing Page',minecraft:'Minecraft Sunucu Sitesi',community:'Topluluk',corporate:'Kurumsal',portfolio:'Portföy',shop:'E-Ticaret',minimal:'Minimal'}

export function WebsiteManager({createOpen,onCreateOpenChange}:{createOpen:boolean;onCreateOpenChange:(value:boolean)=>void}){
  const {data,error,isLoading,mutate}=useSWR<WebsitesResponse>('/api/websites',fetcher,{refreshInterval:8000,revalidateOnFocus:true})
  const [name,setName]=useState('')
  const [slug,setSlug]=useState('')
  const [description,setDescription]=useState('')
  const [template,setTemplate]=useState('blank')
  const [serverId,setServerId]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [editingSite,setEditingSite]=useState<WebsiteRow|null>(null)
  const [managingSite,setManagingSite]=useState<WebsiteRow|null>(null)
  const actionConfirm=useActionConfirm()
  const suffix=data?.suffix||'blockctrl'
  const projectName=useMemo(()=>`${normalizeSlug(slug||name)||'website'}-${suffix}`,[slug,name,suffix])
  const address=data?.hostingMode==='vercel'?`https://${projectName}.vercel.app`:`/site/${normalizeSlug(slug||name)||'website'}/`

  useEffect(()=>{if(createOpen){setMessage('');setName('');setSlug('');setDescription('');setTemplate('blank');setServerId(data?.servers?.[0]?.id??'')}},[createOpen])
  useEffect(()=>{if(createOpen&&!serverId&&data?.servers?.[0]?.id)setServerId(data.servers[0].id)},[createOpen,serverId,data?.servers])

  async function createWebsite(){
    const cleanName=name.trim()
    const cleanSlug=normalizeSlug(slug||name)
    if(cleanName.length<2){setMessage('Website adı en az 2 karakter olmalı.');return}
    if(cleanSlug.length<3){setMessage('Yayın adresi en az 3 karakter olmalı.');return}
    setBusy(true);setMessage('')
    try{
      const payload=await json<{website:WebsiteRow}>(await fetch('/api/websites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',name:cleanName,slug:cleanSlug,description:description.trim(),template,serverId,builderData:defaultBuilderData(cleanName,template,serverId)})}))
      await mutate()
      onCreateOpenChange(false)
      if(payload.website)setEditingSite(payload.website)
    }catch(e){setMessage(e instanceof Error?e.message:'Website oluşturulamadı.')}
    finally{setBusy(false)}
  }

  async function action(actionName:'refresh'|'delete',site:WebsiteRow){
    if(actionName==='delete'){const accepted=await actionConfirm.ask(`“${site.name}” websitesi, website verileri ve Vercel projesi kalıcı olarak silinecek.`,{title:'Website silinsin mi?',confirmLabel:'Website\'yi sil',danger:true,requiredText:site.name});if(!accepted)return}
    setBusy(true);setMessage('')
    try{
      await json(await fetch('/api/websites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:actionName,websiteId:site.id})}))
      await mutate()
    }catch(e){setMessage(e instanceof Error?e.message:'Website işlemi başarısız.')}
    finally{setBusy(false)}
  }

  if(isLoading&&!data)return <Card className="max-w-5xl border-cyan-400/20 bg-[#071827]/90"><CardContent className="flex items-center gap-2 py-10 text-sky-100/70"><LoaderCircle className="size-4 animate-spin"/>Websiteler yükleniyor...</CardContent></Card>

  return <div className="max-w-6xl space-y-4">
    {actionConfirm.dialog}
    {error&&<div className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200"><AlertTriangle className="size-4"/>{error.message}</div>}
    {message&&<div className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertTriangle className="size-4"/>{message}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-[#071827]/80 p-4">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-white"><Globe2 className="size-5 text-cyan-300"/>Websiteler</h2><p className="mt-1 text-sm text-sky-100/50">BlockCtrl üzerinden oluşturduğunuz Minecraft websiteleri ve canlı yayın adresleri.</p></div>
      {data?.canCreate&&<Button className="rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-500 to-sky-600 text-white hover:brightness-110" onClick={()=>onCreateOpenChange(true)}><Plus className="size-4"/>Website oluştur</Button>}
    </div>
    {!data?.integrationConfigured&&<div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[.06] p-4 text-sm text-cyan-100"><b>BlockCtrl dahili yayın aktif.</b><p className="mt-1 text-cyan-100/65">Website oluşturma ve yayınlama hazırdır. Ayrı .vercel.app projesi isterseniz Vercel API entegrasyonu daha sonra opsiyonel olarak bağlanabilir.</p></div>}
    {data?.websites?.length?<div className="grid gap-4 lg:grid-cols-2">{data.websites.map(site=>{
      const liveUrl=site.productionUrl||site.deploymentUrl
      const ready=site.status==='ready'
      return <Card key={site.id} className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#071827]/92 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,.18)]">
        <CardContent className="p-5">
          <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10"><Globe2 className="size-6 text-cyan-300"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-bold text-white">{site.name}</h3><Badge className={ready?'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300':'border border-amber-400/25 bg-amber-400/10 text-amber-200'}>{statusLabel[site.status]||site.status}</Badge></div><p className="mt-1 truncate font-mono text-sm text-cyan-200/75">{site.productionUrl||site.deploymentUrl||(data?.hostingMode==='vercel'?`https://${site.projectName}.vercel.app`:`/site/${site.slug}/`)}</p><p className="mt-1 text-xs text-slate-500">{templateLabel[site.template]||site.template}{site.description?` · ${site.description}`:''}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><span className="size-1.5 rounded-full bg-cyan-400"/>{site.serverId?(data?.servers.find(server=>server.id===site.serverId)?.name??'Bağlı sunucu'):'Ana sunucu seçilmedi'}</p></div></div>
          {site.lastError&&<p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">{site.lastError}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {liveUrl&&<Button size="sm" className="rounded-xl bg-cyan-600 text-white hover:bg-cyan-500" onClick={()=>window.open(liveUrl,'_blank','noopener,noreferrer')}><ExternalLink className="size-4"/>Siteyi Aç</Button>}
            <Button size="sm" variant="outline" className="rounded-xl border-slate-600/60" onClick={()=>navigator.clipboard.writeText(site.productionUrl||site.deploymentUrl||`https://${site.projectName}.vercel.app`)}><Copy className="size-4"/>Adresi Kopyala</Button>
            <Button size="sm" className="rounded-xl border border-cyan-300/35 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:brightness-110" onClick={()=>setManagingSite(site)}><Settings2 className="size-4"/>Yönet</Button>
            <Button size="sm" variant="outline" className="rounded-xl border-cyan-400/30 bg-cyan-400/[.04] text-cyan-200" onClick={()=>setEditingSite(site)}><Pencil className="size-4"/>Tasarımı Düzenle</Button>
            <Button size="sm" variant="outline" className="rounded-xl border-slate-600/60" onClick={()=>void action('refresh',site)} disabled={busy||!site.deploymentId}><RefreshCw className="size-4"/>Durumu Yenile</Button>
            <Button size="sm" variant="outline" className="ml-auto rounded-xl border-red-500/35 bg-red-500/5 text-red-300 hover:bg-red-500/15" onClick={()=>void action('delete',site)} disabled={busy}><Trash2 className="size-4"/>Sil</Button>
          </div>
        </CardContent>
      </Card>
    })}</div>:<Card className="rounded-2xl border border-dashed border-cyan-400/20 bg-[#071827]/70"><CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="grid size-16 place-items-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10"><Globe2 className="size-8 text-cyan-300"/></div><h3 className="mt-4 text-lg font-bold text-white">Henüz websiteniz yok</h3><p className="mt-2 max-w-md text-sm text-sky-100/50">İlk web projenizi oluşturduğunuzda yayın adresi ve durumu burada görünecek.</p>{data?.canCreate&&<Button className="mt-5 rounded-xl bg-cyan-600 text-white hover:bg-cyan-500" onClick={()=>onCreateOpenChange(true)}><Plus className="size-4"/>Website oluştur</Button>}</CardContent></Card>}

    <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto border-cyan-400/25 bg-[#061421] text-slate-100 sm:max-w-3xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><Rocket className="size-5 text-cyan-300"/>Website oluştur</DialogTitle><DialogDescription>Website temelini seçin; oluşturduktan sonra onlarca navbar, hero, içerik ve footer tasarımını sürükle-bırak editörde değiştirebilirsiniz.</DialogDescription></DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-medium">Website adı</label><Input value={name} onChange={e=>{setName(e.target.value);if(!slug)setSlug(normalizeSlug(e.target.value))}} placeholder="Benim Websitem"/></div><div><label className="mb-2 block text-sm font-medium">Yayın adı</label><Input value={slug} onChange={e=>setSlug(normalizeSlug(e.target.value))} placeholder="benim-websitem"/></div></div>
          <div><label className="mb-2 block text-sm font-medium">Açıklama <span className="text-slate-500">(isteğe bağlı)</span></label><Input value={description} onChange={e=>setDescription(e.target.value)} maxLength={180} placeholder="Website hakkında kısa açıklama"/></div>
          <div><label className="mb-2 block text-sm font-medium">Bağlı Minecraft sunucusu</label><select className="h-11 w-full rounded-xl border border-white/10 bg-[#071827] px-3 text-sm text-white" value={serverId} onChange={e=>setServerId(e.target.value)}>{!(data?.servers?.length)&&<option value="">Bağlanabilir sunucu yok</option>}{(data?.servers??[]).map(server=><option key={server.id} value={server.id}>{server.name} · {server.loader} {server.mcVersion} · {server.status}{server.map.configured?' · Harita hazır':''}</option>)}</select><p className="mt-2 text-xs leading-5 text-slate-500">Sayaçlar, harita, destek formları ve üye sistemi varsayılan olarak bu sunucuyu kullanır. Yalnız kendi sunucularınız veya Website verisi izni verilen sunucular listelenir.</p></div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.05] p-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-cyan-300">Ücretsiz yayın adresi</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">{address}</code><Button variant="outline" size="icon" onClick={()=>navigator.clipboard.writeText(address)} aria-label="Adresi kopyala"><Copy className="size-4"/></Button></div><p className="mt-2 text-xs leading-5 text-sky-100/45">Vercel&apos;in varsayılan alan adı yapısı nedeniyle yayın adresi <b>websiteadi-{suffix}.vercel.app</b> biçiminde oluşturulur.</p></div>
          <div><p className="mb-2 text-sm font-medium">Başlangıç şablonu</p><div className="grid gap-3 sm:grid-cols-3">{[
            ['minecraft','Minecraft Sitesi','Sunucu tanıtım ve topluluk yapısı'],
            ['community','Topluluk','Discord, ekip ve topluluk odaklı'],
            ['corporate','Kurumsal','Profesyonel şirket yapısı'],
            ['portfolio','Portföy','Kişisel ve proje vitrini'],
            ['shop','E-Ticaret','Mağaza ve paket tanıtımı'],
            ['landing','Landing Page','Tek sayfalık dönüşüm odaklı'],
            ['minimal','Minimal','Sade ve hızlı başlangıç'],
            ['blank','Boş Proje','Her bölümü kendiniz ekleyin'],
          ].map(([key,title,desc])=><button type="button" key={key} onClick={()=>setTemplate(key)} className={`rounded-2xl border p-4 text-left transition ${template===key?'border-cyan-400/70 bg-cyan-400/10':'border-white/10 bg-white/[.02] hover:border-cyan-400/30'}`}><div className="flex items-center justify-between gap-2"><b className="text-sm text-white">{title}</b>{template===key&&<CheckCircle2 className="size-4 text-cyan-300"/>}</div><p className="mt-1 text-xs text-slate-500">{desc}</p></button>)}</div></div>
          {message&&<div role="alert" className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200"><AlertTriangle className="size-4"/>{message}</div>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>onCreateOpenChange(false)} disabled={busy}>İptal</Button><Button className="bg-gradient-to-r from-cyan-500 to-sky-600 text-white" onClick={()=>void createWebsite()} disabled={busy||!data?.canCreate}>{busy?<LoaderCircle className="size-4 animate-spin"/>:<Rocket className="size-4"/>}{busy?'Yayınlanıyor...':'Website oluştur ve tasarla'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
    <WebsiteManagementWorkspace
      open={!!managingSite}
      site={managingSite as WebsiteManagementSite|null}
      onClose={()=>setManagingSite(null)}
      onOpenBuilder={site=>{setManagingSite(null);setEditingSite(site as WebsiteRow)}}
      onChanged={async updated=>{await mutate();setManagingSite(current=>current&&current.id===updated.id?{...current,...updated}:current)}}
      onDeleted={async()=>{await mutate();setManagingSite(null)}}
    />
    <WebsiteBuilder open={!!editingSite} site={editingSite as BuilderWebsite|null} onClose={()=>setEditingSite(null)} onSaved={async updated=>{await mutate();if(updated){setEditingSite(current=>current&&current.id===updated.id?{...current,...updated}:current);setManagingSite(current=>current&&current.id===updated.id?{...current,...updated}:current)}}}/>
  </div>
}
