'use client'


import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { upload } from '@vercel/blob/client'
import {
  AlertTriangle, ArrowDown, ArrowUp, Bell, Bug, Check, CheckCircle2, Clock3, Copy, FileImage, FileText, Headphones, Info, LockKeyhole,
  Megaphone, MessageCircle, Paperclip, Plus, Save, Send, Settings2, ShieldCheck, Trash2, Type, Upload, UserRoundPlus, Video, X, XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'


const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
const MAX_ATTACHMENTS = 6
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif',
  'video/mp4','video/webm','video/quicktime','video/x-m4v',
])


type AppRole='founder'|'manager'|'admin'|'guide'|'member'
type ThreadType=string
type ThreadStatus='pending'|'open'|'invited'|'closed'|'declined'
type ThreadSummary={
  id:string;type:ThreadType;status:ThreadStatus;subject:string;priority:string;creatorUserId:string;targetUserId:string|null;assignedUserId:string|null;
  creatorName?:string|null;creatorRole?:string|null;targetName?:string|null;targetRole?:string|null;assignedName?:string|null;assignedRole?:string|null;
  acceptedAt?:string|null;closedAt?:string|null;lastMessageAt:string;createdAt:string;updatedAt:string
}
type Actor={id:string;name:string;role:AppRole}
type InformationBlockType='section'|'heading'|'paragraph'|'copy'|'image'|'video'|'pdf'|'divider'
type InformationBlock={id:string;type:InformationBlockType;content?:string;caption?:string;url?:string;pathname?:string;filename?:string;color?:string;background?:string;align?:'left'|'center'|'right';size?:'xs'|'sm'|'base'|'lg'|'xl'|'2xl'|'3xl'}
type InformationPage={title:string;description:string;blocks:InformationBlock[];canEdit:boolean;migrationRequired?:boolean;updatedAt?:string|null;updatedBy?:string|null}
type SupportRequestType={id:string;title:string;description:string;color:string;icon:string;enabled:boolean}
type SupportHeroMedia={id:string;type:'image'|'video';url?:string;pathname?:string;caption?:string}
type SupportSettings={title:string;description:string;transition:'fade'|'slide'|'zoom'|'none';intervalMs:number;media:SupportHeroMedia[];requestTypes:SupportRequestType[];migrationRequired?:boolean}
type Announcement={id:string;title:string;status:'draft'|'scheduled'|'published'|'archived';blocks:InformationBlock[];publishAt:string|null;expireAt:string|null;createdAt:string;updatedAt:string;effectiveStatus?:string}
type SupportSummary={actor:Actor;consent:{required:boolean;accepted:boolean;version:string};threads:ThreadSummary[];members:Array<{id:string;name:string;role:string}>;staff:Array<{id:string;name:string;role:string}>;attentionCount:number;information?:InformationPage;supportSettings?:SupportSettings;announcements?:Announcement[];announcementUnread?:number}
const DEFAULT_INFORMATION:InformationPage={title:'Bilgilendirme',description:'',blocks:[],canEdit:false}
const DEFAULT_SUPPORT_SETTINGS:SupportSettings={title:'Destek Merkezi',description:'İhtiyacınıza uygun destek türünü seçin.',transition:'fade',intervalMs:5000,media:[],requestTypes:[{id:'support',title:'Destek',description:'Sunucu veya panel desteği.',color:'#10b981',icon:'headphones',enabled:true},{id:'bug',title:'Hata bildirimi',description:'Teknik bir hatayı bildirin.',color:'#f59e0b',icon:'bug',enabled:true}]}
type Attachment={id:string;threadId:string;messageId:string;filename:string;contentType:string;sizeBytes:string|number;createdAt:string}
type ChatMessage={id:string;threadId:string;senderUserId:string;body:string;createdAt:string;senderName?:string|null;senderRole?:string|null;attachments:Attachment[]}
type ThreadDetail={thread:ThreadSummary;messages:ChatMessage[];permissions:{canAccept:boolean;canSend:boolean;canClose:boolean;canRespondInvite:boolean}}
type View='home'|'info'|'new-request'|'invite-private'|'thread'|'support-admin'|'announcements'|'announcements-admin'
type ServerSupportContext={serverId:string;serverName:string;address?:string;loader?:string;mcVersion?:string;status?:string;nodeName?:string;recentErrors?:number}
type SupportOpenDetail={view?:View;requestType?:string;serverContext?:ServerSupportContext}


async function fetcher<T>(url:string){
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json'}})
  const text=await response.text();let data:any={}
  try{data=text?JSON.parse(text):{}}catch{data={error:text.slice(0,200)}}
  if(!response.ok)throw new Error(String(data.error??`İstek başarısız (${response.status})`))
  return data as T
}
function roleLabel(role:unknown){const r=String(role);return r==='founder'?'Founder':r==='manager'?'Yönetici':r==='admin'?'Admin':r==='guide'?'Rehber / Yetkili':'Üye'}
function typeLabel(type:ThreadType,settings?:SupportSettings){if(type==='private')return 'Özel sohbet';return settings?.requestTypes.find(item=>item.id===type)?.title??type}
function statusLabel(status:ThreadStatus){return status==='pending'?'Onay bekliyor':status==='open'?'Açık':status==='invited'?'Davet bekliyor':status==='declined'?'Reddedildi':'Kapalı'}
function statusVariant(status:ThreadStatus):'default'|'secondary'|'destructive'|'outline'{return status==='open'?'default':status==='pending'||status==='invited'?'secondary':status==='declined'?'destructive':'outline'}
function bytes(value:number|string){const n=Number(value||0);if(n<1024)return `${n} B`;if(n<1024**2)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024**2).toFixed(1)} MB`}
function safeFileName(name:string){return name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-160)||'file'}
function counterpart(thread:ThreadSummary,actor:Actor){
  if(thread.type==='private')return thread.creatorUserId===actor.id?(thread.targetName??'Üye'):(thread.creatorName??'Yetkili')
  if(thread.creatorUserId===actor.id)return thread.assignedName??'Destek ekibi'
  return thread.creatorName??'Üye'
}


export function SupportCenter({showTriggers=true}:{showTriggers?:boolean}={}){
  const[open,setOpen]=useState(false)
  const[view,setView]=useState<View>('home')
  const[selectedId,setSelectedId]=useState<string|null>(null)
  const[selectedRequestType,setSelectedRequestType]=useState('support')
  const[serverContext,setServerContext]=useState<ServerSupportContext|null>(null)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState<string|null>(null)
  const{data,mutate}=useSWR<SupportSummary>('/api/support',fetcher,{refreshInterval:open?3000:12000,revalidateOnFocus:true})
  const{data:detail,mutate:mutateDetail}=useSWR<ThreadDetail>(open&&selectedId?`/api/support?threadId=${encodeURIComponent(selectedId)}`:null,fetcher,{refreshInterval:2000,revalidateOnFocus:true})
  const isStaff=!!data&&['founder','manager','admin','guide'].includes(data.actor.role)
  const information=data?.information??DEFAULT_INFORMATION
  const supportSettings=data?.supportSettings??DEFAULT_SUPPORT_SETTINGS
  const announcements=data?.announcements??[]


  useEffect(()=>{if(open&&data&&data.consent.required&&!data.consent.accepted)setView('info')},[open,data])
  useEffect(()=>{
    const openSupport=(event:Event)=>{const detail=(event as CustomEvent<SupportOpenDetail>).detail;setOpen(true);setSelectedId(null);if(detail?.requestType)setSelectedRequestType(detail.requestType);setServerContext(detail?.serverContext??null);setView(detail?.serverContext?'new-request':detail?.view??'home')}
    window.addEventListener('blockctrl:open-support',openSupport)
    return ()=>window.removeEventListener('blockctrl:open-support',openSupport)
  },[])
  useEffect(()=>{if(!open){setSelectedId(null);setView('home');setError(null);setServerContext(null)}},[open])


  async function post(body:Record<string,unknown>){
    setBusy(true);setError(null)
    try{
      const response=await fetch('/api/support',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)})
      const text=await response.text();let payload:any={};try{payload=text?JSON.parse(text):{}}catch{}
      if(!response.ok)throw new Error(String(payload.error??`İşlem başarısız (${response.status})`))
      await mutate();if(selectedId)await mutateDetail();return payload
    }catch(e){setError(e instanceof Error?e.message:'İşlem başarısız');return null}finally{setBusy(false)}
  }
  function selectThread(id:string){setSelectedId(id);setView('thread');setError(null)}
  function openAnnouncementCenter(){setOpen(true);setSelectedId(null);setView('announcements')}
  const enabledRequestTypes=data?.supportSettings?.requestTypes?.filter(item=>item.enabled)??[]


  return <>
    {showTriggers&&<>
    <Button type="button" variant="ghost" size="icon" className="relative rounded-full" aria-label="Duyurular" title="Duyurular" onClick={openAnnouncementCenter}>
      <Bell className="size-[19px]"/>
      {!!data?.announcementUnread&&<span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-black">{Math.min(99,data.announcementUnread)}</span>}
    </Button>
    <Button type="button" variant="ghost" size="icon" className="relative rounded-full" aria-label="Destek ve sohbet" title="Destek ve sohbet" onClick={()=>setOpen(true)}>
      <MessageCircle className="size-[19px]"/>
      {!!data?.attentionCount&&<span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">{Math.min(99,data.attentionCount)}</span>}
    </Button>
    </>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="h-[88svh] w-[calc(100vw-1rem)] max-w-[1180px] overflow-hidden p-0 sm:max-w-[1180px]">
        <div className="flex h-full min-h-0 flex-col bg-background">
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2"><MessageCircle className="size-5 text-primary"/>BLOCKCTRL Destek, Bilgilendirme ve Duyurular</DialogTitle>
            <DialogDescription>Destek talepleri, özel görüşmeler, bilgilendirme ve zamanlanmış duyurular.</DialogDescription>
          </DialogHeader>
          {error&&<div className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0"/>{error}</div>}
          {!data?<div className="grid flex-1 place-items-center text-sm text-muted-foreground">Destek sistemi yükleniyor...</div>:
          data.consent.required&&!data.consent.accepted?<ConsentView busy={busy} error={error} information={information} accept={async()=>{const ok=await post({action:'accept-consent'});if(ok)setView('home')}}/>:
          <div className="grid min-h-0 flex-1 md:grid-cols-[330px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-r bg-muted/10">
              <div className="space-y-2 border-b p-3">
                {!isStaff&&enabledRequestTypes.map(item=><Button key={item.id} size="sm" variant="outline" className="w-full justify-start" style={{borderColor:item.color,color:item.color}} onClick={()=>{setSelectedRequestType(item.id);setSelectedId(null);setView('new-request')}}><Headphones className="mr-1 size-4"/>{item.title}</Button>)}
                <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={()=>{setSelectedId(null);setView('info')}}><Info className="mr-1 size-4"/>Bilgilendirme</Button><Button size="sm" variant="outline" onClick={()=>{setSelectedId(null);setView('announcements')}}><Megaphone className="mr-1 size-4"/>Duyurular</Button></div>
                {isStaff&&<div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={()=>{setSelectedId(null);setView('support-admin')}}><Settings2 className="mr-1 size-4"/>Destek ayarı</Button><Button size="sm" variant="outline" onClick={()=>{setSelectedId(null);setView('announcements-admin')}}><Megaphone className="mr-1 size-4"/>Duyuru yönet</Button><Button size="sm" variant="outline" className="col-span-2" onClick={()=>{setSelectedId(null);setView('invite-private')}}><UserRoundPlus className="mr-1 size-4"/>Özel davet</Button></div>}
              </div>
              {isStaff&&<div className="border-b px-3 py-2 text-xs text-muted-foreground">Bekleyen destek: <b className="text-foreground">{data.threads.filter(t=>t.type!=='private'&&t.status==='pending').length}</b></div>}
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {data.threads.length?data.threads.map(thread=><button type="button" key={thread.id} onClick={()=>selectThread(thread.id)} className={`w-full rounded-lg border p-3 text-left transition ${selectedId===thread.id?'border-primary/60 bg-primary/5':'bg-card hover:bg-muted/40'}`}>
                  <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold">{thread.subject}</span><Badge variant={statusVariant(thread.status)} className="shrink-0 text-[10px]">{statusLabel(thread.status)}</Badge></div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{typeLabel(thread.type,data.supportSettings)} · {counterpart(thread,data.actor)}</span><span className="shrink-0">{new Date(thread.lastMessageAt).toLocaleDateString('tr-TR')}</span></div>
                </button>):<div className="p-6 text-center text-sm text-muted-foreground">Henüz sohbet veya destek talebi yok.</div>}
              </div>
            </aside>
            <main className="min-h-0 overflow-hidden">
              {view==='info'?<InformationPanel accepted={data.consent.accepted} information={information} canEdit={isStaff} busy={busy} post={post} refresh={async()=>{await mutate()}}/>:
               view==='new-request'?<CreateRequest kind={selectedRequestType} config={supportSettings.requestTypes.find(item=>item.id===selectedRequestType)} busy={busy} post={post} select={selectThread} serverContext={serverContext}/>:
               view==='invite-private'?<PrivateInvite members={data.members} busy={busy} post={post} select={selectThread}/>:
               view==='support-admin'&&isStaff?<SupportAdminPanel settings={supportSettings} busy={busy} post={post} refresh={async()=>{await mutate()}}/>:
               view==='announcements-admin'&&isStaff?<AnnouncementAdminPanel announcements={announcements} busy={busy} post={post} refresh={async()=>{await mutate()}}/>:
               view==='announcements'?<AnnouncementsPanel announcements={announcements} post={post}/>:
               selectedId?<Conversation detail={detail} actor={data.actor} settings={supportSettings} busy={busy} post={post} refresh={async()=>{await Promise.all([mutate(),mutateDetail()])}}/>:<HomePanel actor={data.actor} isStaff={isStaff} pending={data.threads.filter(t=>t.type!=='private'&&t.status==='pending').length} settings={supportSettings}/>} 
            </main>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}


function ConsentView({busy,accept,information}:{busy:boolean;error:string|null;accept:()=>Promise<void>;information:InformationPage}){
  const[checked,setChecked]=useState(false)
  return <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8"><div className="mx-auto max-w-3xl space-y-5">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary"/><div><h3 className="font-semibold">Destek ve sohbet bilgilendirmesi</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Üyeler destek sistemini ilk kez kullanmadan önce bu bilgilendirmeyi okumalı ve kabul etmelidir.</p></div></div></div>
    <InformationPanel accepted={false} information={information} canEdit={false} busy={busy}/>
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} className="mt-1 size-4 accent-blue-500"/><span className="text-sm leading-6">Bilgilendirmeyi okudum. Destek mesajlarımın ve yüklediğim görsel/video dosyalarının talebimi çözmek amacıyla destek yetkilileri tarafından görüntülenebileceğini kabul ediyorum.</span></label>
    <Button className="w-full" disabled={!checked||busy} onClick={accept}><Check className="mr-1 size-4"/>{busy?'Kaydediliyor...':'Okudum ve kabul ediyorum'}</Button>
  </div></div>
}


const INFORMATION_ASSET_LIMIT = 200 * 1024 * 1024
const INFORMATION_ASSET_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime','video/x-m4v','application/pdf'])
const INFO_LABELS:Record<InformationBlockType,string>={section:'Bölüm',heading:'Başlık',paragraph:'Paragraf',copy:'Kopyalanabilir metin',image:'Görsel',video:'Video',pdf:'PDF',divider:'Ayraç'}


function cloneInformation(source:InformationPage):InformationPage{return {...source,blocks:(source.blocks??[]).map(block=>({...block}))}}
function informationAssetSrc(block:InformationBlock){return block.pathname?`/api/support?informationAsset=${encodeURIComponent(block.pathname)}`:(block.url??'')}
function blockFontSize(size:InformationBlock['size']){return ({xs:'0.75rem',sm:'0.875rem',base:'1rem',lg:'1.125rem',xl:'1.25rem','2xl':'1.5rem','3xl':'1.875rem'} as Record<string,string>)[size??'base']??'1rem'}
function newInformationBlock(type:InformationBlockType):InformationBlock{
  const base:InformationBlock={id:crypto.randomUUID(),type,align:'left',size:type==='heading'?'2xl':type==='section'?'xl':'base'}
  if(type==='section')return {...base,content:'Yeni bölüm',caption:'Bölüm açıklamasını buraya yazın.'}
  if(type==='heading')return {...base,content:'Yeni başlık'}
  if(type==='paragraph')return {...base,content:'Yeni paragraf metni'}
  if(type==='copy')return {...base,content:'Kopyalanabilir metin'}
  if(type==='divider')return base
  return {...base,content:type==='image'?'Görsel açıklaması':type==='video'?'Video başlığı':'PDF belgesi',caption:''}
}


function InformationPanel({accepted,information,canEdit,busy,post,refresh}:{accepted:boolean;information:InformationPage;canEdit:boolean;busy:boolean;post?:(body:Record<string,unknown>)=>Promise<any>;refresh?:()=>Promise<void>}){
  const[editing,setEditing]=useState(canEdit)
  const[draft,setDraft]=useState<InformationPage>(()=>cloneInformation(information))
  const[localError,setLocalError]=useState<string|null>(null)
  const[uploadProgress,setUploadProgress]=useState<Record<string,number>>({})
  const[dragging,setDragging]=useState<string|null>(null)
  useEffect(()=>{if(!editing)setDraft(cloneInformation(information))},[information.updatedAt,information.title,information.description,editing])
  useEffect(()=>{if(!canEdit)setEditing(false)},[canEdit])
  function patchBlock(id:string,patch:Partial<InformationBlock>){setDraft(current=>({...current,blocks:current.blocks.map(block=>block.id===id?{...block,...patch}:block)}))}
  function removeBlock(id:string){setDraft(current=>({...current,blocks:current.blocks.filter(block=>block.id!==id)}))}
  function moveBlock(index:number,direction:-1|1){setDraft(current=>{const next=[...current.blocks];const target=index+direction;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return {...current,blocks:next}})}
  function dropBlock(targetId:string){if(!dragging||dragging===targetId)return;setDraft(current=>{const next=[...current.blocks];const from=next.findIndex(block=>block.id===dragging);const to=next.findIndex(block=>block.id===targetId);if(from<0||to<0)return current;const[item]=next.splice(from,1);next.splice(to,0,item);return {...current,blocks:next}});setDragging(null)}
  async function save(){setLocalError(null);if(!post)return;const result=await post({action:'save-information',information:{title:draft.title,description:draft.description,blocks:draft.blocks}});if(!result){setLocalError('Bilgilendirme kaydedilemedi.');return}await refresh?.();setEditing(false)}
  async function uploadAsset(block:InformationBlock,file:File){
    setLocalError(null)
    if(file.size>INFORMATION_ASSET_LIMIT){setLocalError(`${file.name} 200 MB sınırını aşıyor.`);return}
    if(!INFORMATION_ASSET_TYPES.has(file.type)){setLocalError(`${file.name} desteklenmeyen bir dosya türü.`);return}
    if(block.type==='image'&&!file.type.startsWith('image/')){setLocalError('Görsel bloğuna yalnız görsel yükleyebilirsiniz.');return}
    if(block.type==='video'&&!file.type.startsWith('video/')){setLocalError('Video bloğuna yalnız video yükleyebilirsiniz.');return}
    if(block.type==='pdf'&&file.type!=='application/pdf'){setLocalError('PDF bloğuna yalnız PDF yükleyebilirsiniz.');return}
    try{
      const pathname=`information/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const blob=await upload(pathname,file,{access:'private',handleUploadUrl:'/api/information-upload',clientPayload:JSON.stringify({filename:file.name}),multipart:true,onUploadProgress:event=>setUploadProgress(current=>({...current,[block.id]:Math.round(event.percentage)}))})
      patchBlock(block.id,{pathname:blob.pathname,url:'',filename:file.name,content:block.content||file.name})
      setUploadProgress(current=>({...current,[block.id]:100}))
    }catch(error){setLocalError(error instanceof Error?error.message:'Dosya yüklenemedi')}
  }
  return <div className="h-full overflow-y-auto p-5 md:p-7"><div className="mx-auto max-w-4xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1">{editing?<><Input value={draft.title} onChange={event=>setDraft(current=>({...current,title:event.target.value}))} maxLength={120} className="max-w-xl text-lg font-semibold"/><textarea value={draft.description} onChange={event=>setDraft(current=>({...current,description:event.target.value}))} maxLength={500} rows={2} className="mt-2 w-full max-w-3xl resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Bilgilendirme açıklaması"/></>:<><h3 className="text-xl font-semibold">{information.title}</h3><p className="mt-1 text-sm text-muted-foreground">{information.description}</p></>}</div>{canEdit&&<div className="flex gap-2">{editing?<><Button variant="outline" onClick={()=>{setDraft(cloneInformation(information));setEditing(false);setLocalError(null)}} disabled={busy}>Vazgeç</Button><Button onClick={save} disabled={busy||information.migrationRequired}><Save className="mr-2 size-4"/>{busy?'Kaydediliyor...':'Yayımla'}</Button></>:<Button onClick={()=>setEditing(true)}><Type className="mr-2 size-4"/>Düzenle</Button>}</div>}</div>
    {information.migrationRequired&&canEdit&&<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">İçerik şu anda varsayılan metinden gösteriliyor. Düzenlemeyi kalıcı kaydetmek için <code>pnpm db:migrate</code> ile yeni Bilgilendirme migrasyonunu uygulayın.</div>}
    {localError&&<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{localError}</div>}
    {editing&&<div className="rounded-xl border bg-muted/20 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blok ekle</p><div className="flex flex-wrap gap-2">{(['section','heading','paragraph','copy','image','video','pdf','divider'] as InformationBlockType[]).map(type=><Button key={type} type="button" size="sm" variant="outline" onClick={()=>setDraft(current=>({...current,blocks:[...current.blocks,newInformationBlock(type)]}))}><Plus className="mr-1 size-3.5"/>{INFO_LABELS[type]}</Button>)}</div></div>}
    <div className="space-y-3">{(editing?draft.blocks:information.blocks).map((block,index)=>editing?<InformationEditorBlock key={block.id} block={block} index={index} total={draft.blocks.length} progress={uploadProgress[block.id]??0} patch={patchBlock} remove={removeBlock} move={moveBlock} uploadAsset={uploadAsset} onDragStart={()=>setDragging(block.id)} onDrop={()=>dropBlock(block.id)}/>:<InformationBlockView key={block.id} block={block}/>)}</div>
    {!editing&&!information.blocks.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Henüz yayımlanmış bir bilgilendirme bloğu yok.</div>}
    {accepted&&!editing&&<div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-cyan-300"><CheckCircle2 className="size-4"/>Bu bilgilendirmeyi kabul ettiniz.</div>}
  </div></div>
}


function InformationEditorBlock({block,index,total,progress,patch,remove,move,uploadAsset,onDragStart,onDrop}:{block:InformationBlock;index:number;total:number;progress:number;patch:(id:string,patch:Partial<InformationBlock>)=>void;remove:(id:string)=>void;move:(index:number,direction:-1|1)=>void;uploadAsset:(block:InformationBlock,file:File)=>Promise<void>;onDragStart:()=>void;onDrop:()=>void}){
  const textBlock=['section','heading','paragraph','copy'].includes(block.type)
  const mediaBlock=['image','video','pdf'].includes(block.type)
  return <div draggable onDragStart={onDragStart} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();onDrop()}} className="rounded-xl border bg-card p-4 shadow-sm">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{index+1}. {INFO_LABELS[block.type]}</span><span className="text-[11px] text-muted-foreground">Sürükleyerek veya oklarla sıralayın</span></div><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" disabled={index===0} onClick={()=>move(index,-1)} aria-label="Yukarı taşı"><ArrowUp className="size-4"/></Button><Button type="button" size="icon" variant="ghost" disabled={index===total-1} onClick={()=>move(index,1)} aria-label="Aşağı taşı"><ArrowDown className="size-4"/></Button><Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={()=>remove(block.id)} aria-label="Bloğu sil"><Trash2 className="size-4"/></Button></div></div>
    {block.type==='section'&&<div className="grid gap-3"><Input value={block.content??''} onChange={event=>patch(block.id,{content:event.target.value})} placeholder="Bölüm başlığı"/><textarea value={block.caption??''} onChange={event=>patch(block.id,{caption:event.target.value})} rows={3} maxLength={1000} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm" placeholder="Bölüm açıklaması"/></div>}
    {block.type==='heading'&&<Input value={block.content??''} onChange={event=>patch(block.id,{content:event.target.value})} placeholder="Başlık"/>}
    {block.type==='paragraph'&&<textarea value={block.content??''} onChange={event=>patch(block.id,{content:event.target.value})} rows={5} maxLength={5000} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm" placeholder="Paragraf metni"/>}
    {block.type==='copy'&&<textarea value={block.content??''} onChange={event=>patch(block.id,{content:event.target.value})} rows={6} maxLength={12000} className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm" placeholder="Kopyalanabilir metin veya komut"/>}
    {mediaBlock&&<div className="space-y-3"><div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"><Upload className="size-4"/>{block.pathname?'Dosyayı değiştir':'Dosya yükle'}<input type="file" className="hidden" accept={block.type==='image'?'image/*':block.type==='video'?'video/mp4,video/webm,video/quicktime,video/x-m4v':'application/pdf'} onChange={event=>{const file=event.target.files?.[0];if(file)void uploadAsset(block,file);event.currentTarget.value='' }}/></label>{block.filename&&<span className="self-center text-xs text-muted-foreground">{block.filename}</span>}</div>{progress>0&&progress<100&&<Progress value={progress}/>}<Input value={block.url??''} onChange={event=>patch(block.id,{url:event.target.value,pathname:''})} placeholder="İsterseniz HTTPS medya URL'si kullanın"/><Input value={block.content??''} onChange={event=>patch(block.id,{content:event.target.value})} placeholder={block.type==='image'?'Görsel alt metni':block.type==='video'?'Video başlığı':'PDF başlığı'}/><Input value={block.caption??''} onChange={event=>patch(block.id,{caption:event.target.value})} placeholder="Açıklama / altyazı"/>{informationAssetSrc(block)&&<div className="rounded-lg border bg-muted/20 p-2"><InformationBlockView block={block}/></div>}</div>}
    {textBlock&&<div className="mt-4 grid gap-3 rounded-lg border bg-muted/10 p-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-muted-foreground">Metin rengi<div className="mt-1 flex items-center gap-2"><input type="color" value={block.color||'#e5e7eb'} onChange={event=>patch(block.id,{color:event.target.value})} className="h-9 w-12 rounded border bg-transparent"/><Button type="button" size="sm" variant="ghost" onClick={()=>patch(block.id,{color:''})}>Sıfırla</Button></div></label><label className="text-xs text-muted-foreground">Arka plan<div className="mt-1 flex items-center gap-2"><input type="color" value={block.background||'#111827'} onChange={event=>patch(block.id,{background:event.target.value})} className="h-9 w-12 rounded border bg-transparent"/><Button type="button" size="sm" variant="ghost" onClick={()=>patch(block.id,{background:''})}>Sıfırla</Button></div></label><label className="text-xs text-muted-foreground">Hizalama<select value={block.align??'left'} onChange={event=>patch(block.id,{align:event.target.value as InformationBlock['align']})} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option></select></label><label className="text-xs text-muted-foreground">Boyut<select value={block.size??'base'} onChange={event=>patch(block.id,{size:event.target.value as InformationBlock['size']})} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="xs">Çok küçük</option><option value="sm">Küçük</option><option value="base">Normal</option><option value="lg">Büyük</option><option value="xl">Çok büyük</option><option value="2xl">Başlık</option><option value="3xl">Büyük başlık</option></select></label></div>}
  </div>
}


function InformationBlockView({block}:{block:InformationBlock}){
  const style={color:block.color||undefined,backgroundColor:block.background||undefined,textAlign:block.align??'left' as const,fontSize:blockFontSize(block.size)}
  const src=informationAssetSrc(block)
  if(block.type==='divider')return <hr className="my-5 border-border"/>
  if(block.type==='heading')return <h3 className="whitespace-pre-wrap rounded-lg px-2 py-1 font-bold" style={style}>{block.content}</h3>
  if(block.type==='paragraph')return <p className="whitespace-pre-wrap rounded-lg px-3 py-2 leading-7" style={style}>{block.content}</p>
  if(block.type==='copy')return <div className="rounded-xl border bg-muted/30 p-3" style={{backgroundColor:block.background||undefined}}><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">Kopyalanabilir metin</span><CopyInformationButton text={block.content??''}/></div><pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono leading-6" style={{color:block.color||undefined,fontSize:blockFontSize(block.size),textAlign:block.align??'left'}}>{block.content}</pre></div>
  if(block.type==='section')return <section className="rounded-xl border p-5" style={{backgroundColor:block.background||undefined,textAlign:block.align??'left'}}><h4 className="font-semibold" style={{color:block.color||undefined,fontSize:blockFontSize(block.size)}}>{block.content}</h4>{block.caption&&<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{block.caption}</p>}</section>
  if(block.type==='image')return <figure className="overflow-hidden rounded-xl border bg-muted/10">{src?<img src={src} alt={block.content||block.filename||'Bilgilendirme görseli'} className="max-h-[560px] w-full object-contain"/>:<div className="grid min-h-40 place-items-center text-sm text-muted-foreground">Görsel eklenmemiş</div>}{(block.content||block.caption)&&<figcaption className="border-t p-3"><p className="font-medium">{block.content}</p>{block.caption&&<p className="mt-1 text-sm text-muted-foreground">{block.caption}</p>}</figcaption>}</figure>
  if(block.type==='video')return <figure className="overflow-hidden rounded-xl border bg-muted/10">{src?<video src={src} controls preload="metadata" className="max-h-[560px] w-full bg-black"/>:<div className="grid min-h-40 place-items-center text-sm text-muted-foreground">Video eklenmemiş</div>}{(block.content||block.caption)&&<figcaption className="border-t p-3"><p className="font-medium">{block.content}</p>{block.caption&&<p className="mt-1 text-sm text-muted-foreground">{block.caption}</p>}</figcaption>}</figure>
  return <div className="overflow-hidden rounded-xl border bg-muted/10">{src?<iframe src={src} title={block.content||'PDF'} className="h-[560px] w-full bg-white"/>:<div className="grid min-h-40 place-items-center text-sm text-muted-foreground">PDF eklenmemiş</div>}<div className="flex flex-wrap items-center justify-between gap-2 border-t p-3"><div><p className="font-medium">{block.content||block.filename||'PDF'}</p>{block.caption&&<p className="mt-1 text-sm text-muted-foreground">{block.caption}</p>}</div>{src&&<Button type="button" size="sm" variant="outline" onClick={()=>window.open(src,'_blank','noopener,noreferrer')}><FileText className="mr-1 size-4"/>PDF'yi aç</Button>}</div></div>
}


function CopyInformationButton({text}:{text:string}){const[copied,setCopied]=useState(false);return <Button type="button" size="sm" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{}}}><Copy className="mr-1 size-3.5"/>{copied?'Kopyalandı':'Kopyala'}</Button>}


function supportMediaSrc(item:SupportHeroMedia){return item.pathname?`/api/support?informationAsset=${encodeURIComponent(item.pathname)}`:(item.url??'')}
function HomePanel({actor,isStaff,pending,settings}:{actor:Actor;isStaff:boolean;pending:number;settings:SupportSettings}){
  const[index,setIndex]=useState(0)
  useEffect(()=>{if(settings.media.length<2||settings.transition==='none')return;const timer=window.setInterval(()=>setIndex(value=>(value+1)%settings.media.length),Math.max(1500,settings.intervalMs||5000));return()=>window.clearInterval(timer)},[settings.media.length,settings.intervalMs,settings.transition])
  useEffect(()=>{if(index>=settings.media.length)setIndex(0)},[settings.media.length,index])
  const media=settings.media[index]
  const transitionClass=settings.transition==='zoom'?'transition-transform duration-500 hover:scale-[1.01]':settings.transition==='slide'?'transition-all duration-500':'transition-opacity duration-500'
  return <div className="h-full overflow-y-auto p-6 md:p-8"><div className="mx-auto max-w-3xl space-y-6">
    <div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><MessageCircle className="size-7"/></span><h3 className="mt-4 text-2xl font-semibold">{settings.title||`Merhaba, ${actor.name}`}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{settings.description}{isStaff?` · ${pending} bekleyen talep`:''}</p></div>
    {media&&<div className="overflow-hidden rounded-2xl border bg-muted/10">{media.type==='video'?<video key={media.id} src={supportMediaSrc(media)} controls autoPlay muted playsInline className={`max-h-[430px] w-full bg-black object-contain ${transitionClass}`}/>:<img key={media.id} src={supportMediaSrc(media)} alt={media.caption||'Destek görseli'} className={`max-h-[430px] w-full object-contain ${transitionClass}`}/>} {media.caption&&<p className="border-t p-3 text-center text-sm text-muted-foreground">{media.caption}</p>} {settings.media.length>1&&<div className="flex justify-center gap-1.5 p-3">{settings.media.map((item,i)=><button key={item.id} aria-label={`${i+1}. medya`} onClick={()=>setIndex(i)} className={`size-2 rounded-full ${i===index?'bg-primary':'bg-muted-foreground/30'}`}/>)}</div>}</div>}
    {!isStaff&&<div className="grid gap-3 sm:grid-cols-2">{settings.requestTypes.filter(item=>item.enabled).map(item=><div key={item.id} className="rounded-xl border p-4" style={{borderColor:item.color}}><p className="font-semibold" style={{color:item.color}}>{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.description}</p></div>)}</div>}
  </div></div>
}


function CreateRequest({kind,config,busy,post,select,serverContext}:{kind:string;config?:SupportRequestType;busy:boolean;post:(body:Record<string,unknown>)=>Promise<any>;select:(id:string)=>void;serverContext?:ServerSupportContext|null}){
  const[subject,setSubject]=useState('');const[message,setMessage]=useState('');const[priority,setPriority]=useState('normal');const[files,setFiles]=useState<File[]>([]);const[progress,setProgress]=useState(0);const[localError,setLocalError]=useState<string|null>(null)
  useEffect(()=>{if(!serverContext)return;setSubject(`[${serverContext.serverName}] Sunucu desteği`);setMessage(`Sunucu: ${serverContext.serverName}\nSunucu ID: ${serverContext.serverId}\nAdres: ${serverContext.address||'—'}\nYazılım: ${serverContext.loader||'—'} ${serverContext.mcVersion||''}\nDurum: ${serverContext.status||'—'}\nNode: ${serverContext.nodeName||'—'}\nSon günlüklerde hata: ${serverContext.recentErrors??0}\n\nSorun açıklaması:\n`)},[serverContext])
  async function submit(){
    setLocalError(null)
    if(subject.trim().length<3||message.trim().length<3){setLocalError('Konu ve açıklama en az 3 karakter olmalı.');return}
    if(files.length>MAX_ATTACHMENTS){setLocalError(`En fazla ${MAX_ATTACHMENTS} dosya seçebilirsiniz.`);return}
    for(const file of files){if(file.size>MAX_ATTACHMENT_BYTES||!ALLOWED_ATTACHMENT_TYPES.has(file.type)){setLocalError(`${file.name} desteklenmiyor veya 100 MB sınırını aşıyor.`);return}}
    const result=await post({action:'create-thread',type:kind,subject:subject.trim(),message:message.trim(),priority});if(!result?.threadId)return
    const threadId=String(result.threadId)
    try{if(files.length){const attachments=await uploadAttachments(threadId,files,setProgress);await post({action:'send-message',threadId,message:'',attachments,evidenceOnly:true})}setSubject('');setMessage('');setFiles([]);setProgress(0);select(threadId)}catch(e){setLocalError(e instanceof Error?e.message:'Dosyalar yüklenemedi');select(threadId)}
  }
  return <div className="h-full overflow-y-auto p-5 md:p-7"><div className="mx-auto max-w-2xl space-y-5"><div><h3 className="text-lg font-semibold">{config?.title??'Destek talebi oluştur'}</h3><p className="mt-1 text-sm text-muted-foreground">{config?.description??'Sorununuzu açıklayın. Bir destek yetkilisi kabul ettiğinde canlı sohbet açılır.'}</p></div>
    {serverContext&&<div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-sm"><b>{serverContext.serverName}</b> sunucusunun teknik bilgileri talebe otomatik eklendi. Göndermeden önce açıklamanızı aşağıya yazın.</div>}
    {localError&&<div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{localError}</div>}
    <label className="block space-y-1.5"><span className="text-sm font-medium">Konu</span><Input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={120} placeholder="Kısa bir konu yazın"/></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">Öncelik</span><select value={priority} onChange={e=>setPriority(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">Açıklama</span><textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={5000} rows={7} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" placeholder="Sorunu, ne yaptığınızı ve ne olduğunu yazın..."/></label>
    <AttachmentPicker files={files} setFiles={setFiles} progress={progress}/>
    <Button className="w-full" disabled={busy} onClick={submit}><Headphones className="mr-1 size-4"/>{busy?'Gönderiliyor...':'Talebi gönder'}</Button>
  </div></div>
}


function PrivateInvite({members,busy,post,select}:{members:Array<{id:string;name:string;role:string}>;busy:boolean;post:(body:Record<string,unknown>)=>Promise<any>;select:(id:string)=>void}){
  const[targetUserId,setTargetUserId]=useState('');const[subject,setSubject]=useState('Özel görüşme');const[message,setMessage]=useState('')
  useEffect(()=>{if(!targetUserId&&members[0])setTargetUserId(members[0].id)},[members,targetUserId])
  return <div className="h-full overflow-y-auto p-5 md:p-7"><div className="mx-auto max-w-2xl space-y-5"><div><h3 className="text-lg font-semibold">Üyeyi özel sohbete çağır</h3><p className="mt-1 text-sm text-muted-foreground">Davet yalnız seçtiğiniz üyeye görünür. Üye kabul ettikten sonra birebir sohbet açılır.</p></div>
    {!members.length?<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Özel sohbete davet edilebilecek onaylı üye bulunmuyor.</div>:<>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Üye</span><select value={targetUserId} onChange={e=>setTargetUserId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Konu</span><Input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={120}/></label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Davet mesajı</span><textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={5000} rows={6} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Neden görüşmek istediğinizi yazın..."/></label>
      <Button className="w-full" disabled={busy||!targetUserId} onClick={async()=>{const result=await post({action:'invite-private',targetUserId,subject,message});if(result?.threadId)select(String(result.threadId))}}><UserRoundPlus className="mr-1 size-4"/>{busy?'Davet gönderiliyor...':'Özel sohbet daveti gönder'}</Button>
    </>}
  </div></div>
}


function Conversation({detail,actor,settings,busy,post,refresh}:{detail?:ThreadDetail;actor:Actor;settings:SupportSettings;busy:boolean;post:(body:Record<string,unknown>)=>Promise<any>;refresh:()=>Promise<void>}){
  const[text,setText]=useState('');const[files,setFiles]=useState<File[]>([]);const[progress,setProgress]=useState(0);const[localError,setLocalError]=useState<string|null>(null)
  const thread=detail?.thread
  useEffect(()=>{setText('');setFiles([]);setProgress(0);setLocalError(null)},[thread?.id])
  if(!detail||!thread)return <div className="grid h-full place-items-center text-sm text-muted-foreground">Sohbet yükleniyor...</div>
  const threadId = thread.id
  async function send(){
    setLocalError(null)
    if(!text.trim()&&!files.length)return
    if(files.length>MAX_ATTACHMENTS){setLocalError(`En fazla ${MAX_ATTACHMENTS} dosya seçebilirsiniz.`);return}
    for(const file of files){if(file.size>MAX_ATTACHMENT_BYTES||!ALLOWED_ATTACHMENT_TYPES.has(file.type)){setLocalError(`${file.name} desteklenmiyor veya 100 MB sınırını aşıyor.`);return}}
    try{
      const attachments=files.length?await uploadAttachments(threadId,files,setProgress):[]
      const result=await post({action:'send-message',threadId,message:text.trim(),attachments})
      if(result){setText('');setFiles([]);setProgress(0);await refresh()}
    }catch(e){setLocalError(e instanceof Error?e.message:'Mesaj gönderilemedi')}
  }
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{thread.subject}</h3><Badge variant={statusVariant(thread.status)}>{statusLabel(thread.status)}</Badge><Badge variant="outline">{typeLabel(thread.type,settings)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{counterpart(thread,actor)} · {thread.type!=='private'?(thread.assignedName?`Atanan: ${thread.assignedName}`:'Henüz yetkili atanmadı'):'Birebir özel görüşme'}</p></div><div className="flex flex-wrap gap-2">
      {detail.permissions.canAccept&&<Button size="sm" onClick={async()=>{await post({action:'accept-thread',threadId:thread.id});await refresh()}} disabled={busy}><Check className="mr-1 size-4"/>Talebi kabul et</Button>}
      {detail.permissions.canRespondInvite&&<><Button size="sm" onClick={async()=>{await post({action:'respond-invite',threadId:thread.id,accept:true});await refresh()}} disabled={busy}><Check className="mr-1 size-4"/>Kabul et</Button><Button size="sm" variant="outline" onClick={async()=>{await post({action:'respond-invite',threadId:thread.id,accept:false});await refresh()}} disabled={busy}><X className="mr-1 size-4"/>Reddet</Button></>}
      {detail.permissions.canClose&&<Button size="sm" variant="outline" onClick={async()=>{if(!window.confirm('Bu sohbet kapatılsın mı?'))return;await post({action:'close-thread',threadId:thread.id});await refresh()}} disabled={busy}><XCircle className="mr-1 size-4"/>Kapat</Button>}
    </div></div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/5 p-4">{detail.messages.length?detail.messages.map(message=><MessageBubble key={message.id} message={message} mine={message.senderUserId===actor.id}/>):<div className="grid h-full place-items-center text-sm text-muted-foreground">Henüz mesaj yok.</div>}</div>
    {localError&&<div className="border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">{localError}</div>}
    {thread.status==='pending'&&!detail.permissions.canAccept?<div className="border-t bg-amber-500/5 px-4 py-3 text-sm text-amber-300"><Clock3 className="mr-1 inline size-4"/>Talebiniz destek ekibinin kabulün�� bekliyor. Kabul edildikten sonra sohbet açılır.</div>:
     thread.status==='invited'&&!detail.permissions.canRespondInvite?<div className="border-t bg-blue-500/5 px-4 py-3 text-sm text-blue-300"><Clock3 className="mr-1 inline size-4"/>Özel sohbet davetinin kabul edilmesi bekleniyor.</div>:
     thread.status==='closed'||thread.status==='declined'?<div className="border-t px-4 py-3 text-center text-sm text-muted-foreground">Bu sohbet {thread.status==='declined'?'reddedildi':'kapatıldı'}. Mesaj gönderilemez.</div>:
     detail.permissions.canSend?<div className="border-t p-3"><div className="flex gap-2"><textarea value={text} onChange={e=>setText(e.target.value)} maxLength={5000} rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder="Mesajınızı yazın..." className="min-h-12 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/><Button className="self-end" size="icon" onClick={send} disabled={busy||(!text.trim()&&!files.length)} aria-label="Mesajı gönder"><Send/></Button></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"><Paperclip className="size-3.5"/>Görsel / video ekle<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,video/x-m4v" multiple className="hidden" onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,MAX_ATTACHMENTS))}/></label><span className="text-xs text-muted-foreground">{files.length?`${files.length} dosya seçildi`:''}</span></div>{progress>0&&progress<100&&<Progress value={progress} className="mt-2"/>}{files.length>0&&<div className="mt-2 flex flex-wrap gap-1">{files.map(file=><Badge key={`${file.name}-${file.size}`} variant="secondary" className="max-w-52 truncate">{file.name}</Badge>)}</div>}</div>:
     <div className="border-t px-4 py-3 text-center text-sm text-muted-foreground">Bu konuşmaya mesaj gönderme yetkiniz yok.</div>}
  </div>
}


async function uploadInformationAsset(file:File,prefix:string,onProgress?:(value:number)=>void){
  if(file.size>INFORMATION_ASSET_LIMIT)throw new Error(`${file.name} 200 MB sınırını aşıyor.`)
  if(!INFORMATION_ASSET_TYPES.has(file.type))throw new Error(`${file.name} desteklenmeyen bir dosya türü.`)
  const pathname=`information/${prefix}-${crypto.randomUUID()}-${safeFileName(file.name)}`
  return upload(pathname,file,{access:'private',handleUploadUrl:'/api/information-upload',clientPayload:JSON.stringify({filename:file.name}),multipart:true,onUploadProgress:event=>onProgress?.(Math.round(event.percentage))})
}


function SupportAdminPanel({settings,busy,post,refresh}:{settings:SupportSettings;busy:boolean;post:(body:Record<string,unknown>)=>Promise<any>;refresh:()=>Promise<void>}){
  const[draft,setDraft]=useState<SupportSettings>(()=>structuredClone(settings));const[localError,setLocalError]=useState<string|null>(null);const[uploading,setUploading]=useState(false)
  useEffect(()=>setDraft(structuredClone(settings)),[settings.title,settings.description,settings.intervalMs,settings.transition,settings.media.length,settings.requestTypes.length])
  const move=<T,>(items:T[],index:number,direction:-1|1)=>{const next=[...items],target=index+direction;if(target<0||target>=next.length)return items;[next[index],next[target]]=[next[target],next[index]];return next}
  async function save(){setLocalError(null);const result=await post({action:'save-support-settings',settings:draft});if(!result){setLocalError('Destek ayarları kaydedilemedi.');return}await refresh()}
  async function addMedia(file:File){setUploading(true);setLocalError(null);try{if(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))throw new Error('Yalnız görsel veya video yükleyebilirsiniz.');const blob=await uploadInformationAsset(file,'support-hero');setDraft(current=>({...current,media:[...current.media,{id:crypto.randomUUID(),type:file.type.startsWith('video/')?'video':'image',pathname:blob.pathname,caption:file.name}]}))}catch(e){setLocalError(e instanceof Error?e.message:'Dosya yüklenemedi')}finally{setUploading(false)}}
  return <div className="h-full overflow-y-auto p-5 md:p-7"><div className="mx-auto max-w-4xl space-y-6"><div className="flex items-center justify-between gap-3"><div><h3 className="text-xl font-semibold">Destek Merkezi görünümü</h3><p className="mt-1 text-sm text-muted-foreground">İlk ekranı, destek türlerini ve görsel/video geçişlerini tamamen buradan ayarlayın.</p></div><Button onClick={save} disabled={busy}><Save className="mr-1 size-4"/>Kaydet</Button></div>
    {settings.migrationRequired&&<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">Destek ayarlarını kalıcı kullanmak için yeni veritabanı migrasyonunu çalıştırın.</div>}{localError&&<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{localError}</div>}
    <div className="grid gap-3 rounded-xl border p-4"><label className="text-sm font-medium">Başlık<Input className="mt-1" value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))}/></label><label className="text-sm font-medium">Açıklama<textarea className="mt-1 w-full rounded-md border bg-background p-3 text-sm" rows={3} value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Geçiş<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={draft.transition} onChange={e=>setDraft(v=>({...v,transition:e.target.value as SupportSettings['transition']}))}><option value="fade">Fade</option><option value="slide">Slide</option><option value="zoom">Zoom</option><option value="none">Kapalı</option></select></label><label className="text-sm">Geçiş süresi (ms)<Input type="number" min={1500} max={30000} className="mt-1" value={draft.intervalMs} onChange={e=>setDraft(v=>({...v,intervalMs:Number(e.target.value)||5000}))}/></label></div></div>
    <section className="space-y-3"><div className="flex items-center justify-between"><div><h4 className="font-semibold">Geçişli görsel / video</h4><p className="text-xs text-muted-foreground">Sıra giriş ekranındaki gösterim sırasıdır.</p></div><label className="cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-muted"><Upload className="mr-1 inline size-4"/>{uploading?'Yükleniyor...':'Medya yükle'}<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v" className="hidden" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void addMedia(file);e.currentTarget.value=''}}/></label></div><div className="space-y-2">{draft.media.map((item,index)=><div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[120px_1fr_auto]"><div className="overflow-hidden rounded-md bg-muted">{supportMediaSrc(item)?item.type==='video'?<video src={supportMediaSrc(item)} muted className="h-20 w-full object-cover"/>:<img src={supportMediaSrc(item)} alt="" className="h-20 w-full object-cover"/>:<div className="grid h-20 place-items-center text-xs">URL yok</div>}</div><div className="space-y-2"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={item.type} onChange={e=>setDraft(v=>({...v,media:v.media.map(x=>x.id===item.id?{...x,type:e.target.value as 'image'|'video'}:x)}))}><option value="image">Görsel</option><option value="video">Video</option></select><Input value={item.url??''} placeholder="İsterseniz HTTPS URL" onChange={e=>setDraft(v=>({...v,media:v.media.map(x=>x.id===item.id?{...x,url:e.target.value,pathname:''}:x)}))}/><Input value={item.caption??''} placeholder="Açıklama" onChange={e=>setDraft(v=>({...v,media:v.media.map(x=>x.id===item.id?{...x,caption:e.target.value}:x)}))}/></div><div className="flex sm:flex-col"><Button size="icon" variant="ghost" disabled={index===0} onClick={()=>setDraft(v=>({...v,media:move(v.media,index,-1)}))}><ArrowUp/></Button><Button size="icon" variant="ghost" disabled={index===draft.media.length-1} onClick={()=>setDraft(v=>({...v,media:move(v.media,index,1)}))}><ArrowDown/></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={()=>setDraft(v=>({...v,media:v.media.filter(x=>x.id!==item.id)}))}><Trash2/></Button></div></div>)}{!draft.media.length&&<div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Henüz giriş medyası yok.</div>}</div></section>
    <section className="space-y-3"><div className="flex items-center justify-between"><div><h4 className="font-semibold">Destek türleri</h4><p className="text-xs text-muted-foreground">Kullanıcı yeni talep oluştururken burada tanımlanan aktif türleri görür.</p></div><Button size="sm" variant="outline" onClick={()=>setDraft(v=>({...v,requestTypes:[...v.requestTypes,{id:`type-${Date.now()}`,title:'Yeni destek türü',description:'Açıklama',color:'#10b981',icon:'headphones',enabled:true}]}))}><Plus className="mr-1 size-4"/>Tür ekle</Button></div><div className="space-y-2">{draft.requestTypes.map((item,index)=><div key={item.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[140px_1fr_120px_auto]"><div><label className="text-xs text-muted-foreground">Kimlik<Input value={item.id} onChange={e=>setDraft(v=>({...v,requestTypes:v.requestTypes.map(x=>x===item?{...x,id:e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)}:x)}))}/></label><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={e=>setDraft(v=>({...v,requestTypes:v.requestTypes.map(x=>x.id===item.id?{...x,enabled:e.target.checked}:x)}))}/>Aktif</label></div><div className="space-y-2"><Input value={item.title} placeholder="Tür başlığı" onChange={e=>setDraft(v=>({...v,requestTypes:v.requestTypes.map(x=>x.id===item.id?{...x,title:e.target.value}:x)}))}/><Input value={item.description} placeholder="Açıklama" onChange={e=>setDraft(v=>({...v,requestTypes:v.requestTypes.map(x=>x.id===item.id?{...x,description:e.target.value}:x)}))}/></div><div><label className="text-xs text-muted-foreground">Renk<input type="color" className="mt-1 h-10 w-full rounded border" value={item.color||'#10b981'} onChange={e=>setDraft(v=>({...v,requestTypes:v.requestTypes.map(x=>x.id===item.id?{...x,color:e.target.value}:x)}))}/></label><Input className="mt-2" value={item.icon} placeholder="İkon" onChange={e=>setDraft(v=>({...v,requestTypes:v.requestTypes.map(x=>x.id===item.id?{...x,icon:e.target.value}:x)}))}/></div><div className="flex md:flex-col"><Button size="icon" variant="ghost" disabled={index===0} onClick={()=>setDraft(v=>({...v,requestTypes:move(v.requestTypes,index,-1)}))}><ArrowUp/></Button><Button size="icon" variant="ghost" disabled={index===draft.requestTypes.length-1} onClick={()=>setDraft(v=>({...v,requestTypes:move(v.requestTypes,index,1)}))}><ArrowDown/></Button><Button size="icon" variant="ghost" className="text-destructive" disabled={draft.requestTypes.length<=1} onClick={()=>setDraft(v=>({...v,requestTypes:v.requestTypes.filter(x=>x.id!==item.id)}))}><Trash2/></Button></div></div>)}</div></section>
  </div></div>
}


function AnnouncementsPanel({announcements,post}:{announcements:Announcement[];post:(body:Record<string,unknown>)=>Promise<any>}){
  const[selected,setSelected]=useState<string|null>(announcements[0]?.id??null)
  useEffect(()=>{if(!selected&&announcements[0])setSelected(announcements[0].id)},[announcements,selected])
  const item=announcements.find(a=>a.id===selected)??announcements[0]
  useEffect(()=>{if(item?.id&&item.effectiveStatus==='published')void post({action:'mark-announcement-read',id:item.id})},[item?.id])
  return <div className="grid h-full min-h-0 md:grid-cols-[260px_1fr]"><aside className="overflow-y-auto border-r p-3"><h3 className="mb-3 flex items-center gap-2 font-semibold"><Bell className="size-4"/>Duyurular</h3>{announcements.length?announcements.map(a=><button key={a.id} onClick={()=>setSelected(a.id)} className={`mb-2 w-full rounded-lg border p-3 text-left ${item?.id===a.id?'border-primary bg-primary/5':''}`}><p className="font-medium">{a.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(a.publishAt??a.createdAt).toLocaleString('tr-TR')}</p></button>):<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aktif duyuru yok.</div>}</aside><div className="overflow-y-auto p-5 md:p-7">{item?<div className="mx-auto max-w-4xl space-y-4"><div><h2 className="text-2xl font-bold">{item.title}</h2><p className="text-xs text-muted-foreground">{new Date(item.publishAt??item.createdAt).toLocaleString('tr-TR')}</p></div>{item.blocks.map(block=><InformationBlockView key={block.id} block={block}/>)}</div>:<div className="grid h-full place-items-center text-sm text-muted-foreground">Duyuru bulunmuyor.</div>}</div></div>
}


function AnnouncementAdminPanel({announcements,busy,post,refresh}:{announcements:Announcement[];busy:boolean;post:(body:Record<string,unknown>)=>Promise<any>;refresh:()=>Promise<void>}){
  const[editing,setEditing]=useState<Announcement|null>(announcements[0]?structuredClone(announcements[0]):null);const[localError,setLocalError]=useState<string|null>(null);const[progress,setProgress]=useState<Record<string,number>>({});const[dragging,setDragging]=useState<string|null>(null)
  useEffect(()=>{if(editing){const fresh=announcements.find(a=>a.id===editing.id);if(fresh&&fresh.updatedAt!==editing.updatedAt)setEditing(structuredClone(fresh))}},[announcements])
  function makeNew(){setEditing({id:crypto.randomUUID(),title:'Yeni duyuru',status:'draft',blocks:[],publishAt:null,expireAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}
  function patchBlock(id:string,patch:Partial<InformationBlock>){setEditing(cur=>cur?{...cur,blocks:cur.blocks.map(b=>b.id===id?{...b,...patch}:b)}:cur)}
  function removeBlock(id:string){setEditing(cur=>cur?{...cur,blocks:cur.blocks.filter(b=>b.id!==id)}:cur)}
  function moveBlock(index:number,direction:-1|1){setEditing(cur=>{if(!cur)return cur;const next=[...cur.blocks],target=index+direction;if(target<0||target>=next.length)return cur;[next[index],next[target]]=[next[target],next[index]];return {...cur,blocks:next}})}
  function dropBlock(targetId:string){if(!dragging)return;setEditing(cur=>{if(!cur)return cur;const next=[...cur.blocks],from=next.findIndex(b=>b.id===dragging),to=next.findIndex(b=>b.id===targetId);if(from<0||to<0)return cur;const[item]=next.splice(from,1);next.splice(to,0,item);return {...cur,blocks:next}});setDragging(null)}
  async function uploadAsset(block:InformationBlock,file:File){setLocalError(null);try{if(block.type==='image'&&!file.type.startsWith('image/'))throw new Error('Görsel bloğuna yalnız görsel yükleyebilirsiniz.');if(block.type==='video'&&!file.type.startsWith('video/'))throw new Error('Video bloğuna yalnız video yükleyebilirsiniz.');if(block.type==='pdf'&&file.type!=='application/pdf')throw new Error('PDF bloğuna yalnız PDF yükleyebilirsiniz.');const blob=await uploadInformationAsset(file,'announcement',value=>setProgress(v=>({...v,[block.id]:value})));patchBlock(block.id,{pathname:blob.pathname,url:'',filename:file.name,content:block.content||file.name})}catch(e){setLocalError(e instanceof Error?e.message:'Dosya yüklenemedi')}}
  async function save(){if(!editing)return;setLocalError(null);const result=await post({action:'save-announcement',announcement:editing});if(!result){setLocalError('Duyuru kaydedilemedi.');return}await refresh()}
  const toLocal=(value:string|null)=>value?new Date(value).toISOString().slice(0,16):''
  return <div className="grid h-full min-h-0 md:grid-cols-[260px_1fr]"><aside className="overflow-y-auto border-r p-3"><Button className="mb-3 w-full" onClick={makeNew}><Plus className="mr-1 size-4"/>Duyuru oluştur</Button>{announcements.map(a=><button key={a.id} onClick={()=>setEditing(structuredClone(a))} className={`mb-2 w-full rounded-lg border p-3 text-left ${editing?.id===a.id?'border-primary bg-primary/5':''}`}><p className="font-medium">{a.title}</p><div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>{a.status}</span><span>{new Date(a.updatedAt).toLocaleDateString('tr-TR')}</span></div></button>)}</aside><div className="overflow-y-auto p-5">{editing?<div className="mx-auto max-w-4xl space-y-4"><div className="flex flex-wrap items-center gap-2"><Input className="min-w-52 flex-1 text-lg font-semibold" value={editing.title} onChange={e=>setEditing(v=>v?{...v,title:e.target.value}:v)}/><Button onClick={save} disabled={busy}><Save className="mr-1 size-4"/>Kaydet</Button><Button variant="destructive" disabled={busy||!announcements.some(a=>a.id===editing.id)} onClick={async()=>{if(window.confirm('Duyuru kaldırılsın mı?')){await post({action:'delete-announcement',id:editing.id});setEditing(null);await refresh()}}}><Trash2 className="mr-1 size-4"/>Kaldır</Button></div>{localError&&<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{localError}</div>}<div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3"><label className="text-xs text-muted-foreground">Durum<select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={editing.status} onChange={e=>setEditing(v=>v?{...v,status:e.target.value as Announcement['status']}:v)}><option value="draft">Taslak</option><option value="scheduled">Zamanlanmış</option><option value="published">Yayında</option><option value="archived">Arşiv</option></select></label><label className="text-xs text-muted-foreground">Yayın zamanı<Input type="datetime-local" className="mt-1" value={toLocal(editing.publishAt)} onChange={e=>setEditing(v=>v?{...v,publishAt:e.target.value?new Date(e.target.value).toISOString():null}:v)}/></label><label className="text-xs text-muted-foreground">Yayından kalkma<Input type="datetime-local" className="mt-1" value={toLocal(editing.expireAt)} onChange={e=>setEditing(v=>v?{...v,expireAt:e.target.value?new Date(e.target.value).toISOString():null}:v)}/></label></div><div className="rounded-xl border bg-muted/20 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">İçerik bloğu ekle</p><div className="flex flex-wrap gap-2">{(['section','heading','paragraph','copy','image','video','pdf','divider'] as InformationBlockType[]).map(type=><Button key={type} size="sm" variant="outline" onClick={()=>setEditing(v=>v?{...v,blocks:[...v.blocks,newInformationBlock(type)]}:v)}><Plus className="mr-1 size-3.5"/>{INFO_LABELS[type]}</Button>)}</div></div><div className="space-y-3">{editing.blocks.map((block,index)=><InformationEditorBlock key={block.id} block={block} index={index} total={editing.blocks.length} progress={progress[block.id]??0} patch={patchBlock} remove={removeBlock} move={moveBlock} uploadAsset={uploadAsset} onDragStart={()=>setDragging(block.id)} onDrop={()=>dropBlock(block.id)}/>)}</div></div>:<div className="grid h-full place-items-center text-sm text-muted-foreground">Düzenlemek için bir duyuru seçin veya yeni duyuru oluşturun.</div>}</div></div>
}


function MessageBubble({message,mine}:{message:ChatMessage;mine:boolean}){return <div className={`flex ${mine?'justify-end':'justify-start'}`}><div className={`max-w-[88%] rounded-2xl border px-3 py-2 ${mine?'border-primary/30 bg-primary/10':'bg-card'}`}><div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground"><b className="text-foreground">{message.senderName??'Kullanıcı'}</b><span>{roleLabel(message.senderRole)}</span><span>·</span><span>{new Date(message.createdAt).toLocaleString('tr-TR')}</span></div>{message.body&&<p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>}{message.attachments?.length>0&&<div className="mt-2 grid gap-2 sm:grid-cols-2">{message.attachments.map(file=><AttachmentPreview key={file.id} file={file}/>)}</div>}</div></div>}


function AttachmentPreview({file}:{file:Attachment}){const src=`/api/support?attachmentId=${encodeURIComponent(file.id)}`;const video=file.contentType.startsWith('video/');return <div className="overflow-hidden rounded-lg border bg-black/10">{video?<video src={src} controls preload="metadata" className="max-h-72 w-full bg-black"/>:<a href={src} target="_blank" rel="noreferrer"><img src={src} alt={file.filename} loading="lazy" className="max-h-72 w-full object-contain"/></a>}<div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">{video?<Video className="size-3"/>:<FileImage className="size-3"/>}<span className="min-w-0 flex-1 truncate">{file.filename}</span><span>{bytes(file.sizeBytes)}</span></div></div>}


function AttachmentPicker({files,setFiles,progress}:{files:File[];setFiles:(files:File[])=>void;progress:number}){return <div className="space-y-2"><div className="rounded-lg border border-dashed p-4"><label className="flex cursor-pointer items-center justify-center gap-2 text-sm"><Paperclip className="size-4 text-primary"/>Görsel veya video seç<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,video/x-m4v" multiple className="hidden" onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,MAX_ATTACHMENTS))}/></label><p className="mt-1 text-center text-xs text-muted-foreground">En fazla {MAX_ATTACHMENTS} dosya · dosya başına 100 MB</p></div>{files.length>0&&<div className="flex flex-wrap gap-1">{files.map(file=><Badge key={`${file.name}-${file.size}`} variant="secondary">{file.name} · {bytes(file.size)}</Badge>)}</div>}{progress>0&&progress<100&&<div className="space-y-1"><Progress value={progress}/><p className="text-right text-xs text-muted-foreground">Yükleniyor %{progress}</p></div>}</div>}


async function uploadAttachments(threadId:string,files:File[],setProgress:(value:number)=>void){
  const uploaded:Array<{pathname:string;url:string;filename:string;contentType:string;sizeBytes:number}>=[]
  for(let index=0;index<files.length;index++){
    const file=files[index]
    const base=Math.round(index/files.length*100)
    const weight=1/files.length
    const pathname=`support/${threadId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const blob=await upload(pathname,file,{access:'private',handleUploadUrl:'/api/support-upload',clientPayload:JSON.stringify({threadId}),multipart:true,onUploadProgress:event=>setProgress(Math.min(99,Math.round(base+event.percentage*weight)))})
    uploaded.push({pathname:blob.pathname,url:blob.url,filename:file.name,contentType:file.type,sizeBytes:file.size})
  }
  setProgress(100)
  return uploaded
}
