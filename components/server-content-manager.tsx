'use client'

import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Archive, Box, CheckCircle2, FileCog, FilePlus2, FileText, FolderOpen, FolderPlus, Gamepad2, Globe2, Loader2, Package, Pencil, RefreshCw, Save, Search, Trash2, UploadCloud, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ContentCategory = 'mods' | 'plugins' | 'plugin-config' | 'resource-packs' | 'config' | 'worlds' | 'world-file'
type ContentItem = { name:string; path:string; category:ContentCategory; directory:boolean; size:number; updatedAt:string; editable:boolean; source:'disk' }
type InventoryResponse = { items:ContentItem[]; scannedAt?:string; serverRunning?:boolean; error?:string }
type UploadTarget = 'auto'|'mods'|'plugins'|'configs'|'resource-packs'|'worlds'
type AddonSource='modrinth'|'curseforge'
type AddonKind='mods'|'plugins'
type AddonSearchResult={source:AddonSource;projectId:string;title:string;description:string;author:string;iconUrl:string|null;downloads:number;slug?:string|null;categories:string[];versions:string[]}
type AddonInstallFile={source:AddonSource;projectId:string;versionId:string;title:string;fileName:string;url:string;size:number;sha1?:string|null;sha512?:string|null;kind:AddonKind}

const MAX_UPLOAD = 2 * 1024 * 1024 * 1024
const CHUNK_RETRY = 3

async function readJson(response:Response){const text=await response.text();try{return text?JSON.parse(text):{}}catch{throw new Error(response.ok?'Sunucudan geçersiz yanıt alındı':`Sunucu hatası (${response.status}): ${text.slice(0,180)}`)}}
const fetcher=(url:string)=>fetch(url,{cache:'no-store'}).then(async response=>{const data=await readJson(response) as InventoryResponse;if(!response.ok)throw new Error(data.error??'Sunucu içeriği alınamadı');return data})

async function directUploadFile(serverId:string,file:File,category:UploadTarget,onProgress:(percent:number)=>void){
  if(file.size>MAX_UPLOAD)throw new Error(`${file.name}: 2 GB sınırını aşıyor`)
  const start=await fetch('/api/direct-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start',serverId,filename:file.name,size:file.size,category})})
  const startData=await readJson(start) as {error?:string;uploadId?:string;commandId?:string;chunkSize?:number}
  if(!start.ok||!startData.uploadId||!startData.commandId||!startData.chunkSize)throw new Error(startData.error??'Yükleme başlatılamadı')
  const totalParts=Math.ceil(file.size/startData.chunkSize)
  for(let part=0;part<totalParts;part++){
    const chunk=file.slice(part*startData.chunkSize,Math.min(file.size,(part+1)*startData.chunkSize))
    let last=''
    for(let attempt=0;attempt<CHUNK_RETRY;attempt++){
      try{
        const response=await fetch(`/api/direct-upload?commandId=${encodeURIComponent(startData.commandId)}&uploadId=${encodeURIComponent(startData.uploadId)}&part=${part}`,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:chunk})
        const data=await readJson(response) as {error?:string};if(!response.ok)throw new Error(data.error??`Parça ${part+1} yüklenemedi`);last='';break
      }catch(error){last=error instanceof Error?error.message:'Parça yüklenemedi';if(attempt<CHUNK_RETRY-1)await new Promise(r=>setTimeout(r,700*(attempt+1)))}
    }
    if(last)throw new Error(last)
    onProgress(Math.round(((part+1)/totalParts)*100))
  }
  const complete=await fetch('/api/direct-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete',commandId:startData.commandId,uploadId:startData.uploadId})})
  const completeData=await readJson(complete) as {error?:string;result?:unknown}
  if(!complete.ok)throw new Error(completeData.error??'Yükleme tamamlanamadı')
  return completeData.result
}

const tabs:Array<{key:'all'|'mods'|'plugins'|'resource-packs'|'config'|'worlds'|'world-files';label:string;icon:any}>=[
  {key:'all',label:'Tümü',icon:FolderOpen},{key:'mods',label:'Modlar',icon:Box},{key:'plugins',label:'Pluginler',icon:Package},{key:'resource-packs',label:'Resource Pack',icon:Archive},{key:'config',label:'Config',icon:FileCog},{key:'worlds',label:'Dünyalar',icon:Globe2},{key:'world-files',label:'Dünya dosyaları',icon:FileText},
]
const targetLabels:Record<UploadTarget,string>={auto:'Otomatik / Karma ZIP',mods:'Mod',plugins:'Plugin',configs:'Config','resource-packs':'Resource Pack',worlds:'Dünya'}
const categoryLabels:Record<ContentCategory,string>={mods:'Mod',plugins:'Plugin','plugin-config':'Plugin ayarı','resource-packs':'Resource Pack',config:'Config',worlds:'Dünya','world-file':'Dünya dosyası'}
const categoryClass:Record<ContentCategory,string>={mods:'bg-blue-500/10 text-blue-300',plugins:'bg-violet-500/10 text-violet-300','plugin-config':'bg-fuchsia-500/10 text-fuchsia-300','resource-packs':'bg-amber-500/10 text-amber-300',config:'bg-cyan-500/10 text-cyan-300',worlds:'bg-blue-500/10 text-cyan-300','world-file':'bg-sky-500/10 text-sky-300'}
function formatSize(bytes:number,directory:boolean){if(directory)return 'Klasör';if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;if(bytes<1073741824)return `${(bytes/1048576).toFixed(1)} MB`;return `${(bytes/1073741824).toFixed(2)} GB`}

export function ServerContentManager({serverId,running,canEdit,scopeWorld,loader,mcVersion,serverName,canInstallMarketplace=false}:{serverId:string;running:boolean;canEdit:boolean;scopeWorld?:string;loader?:string;mcVersion?:string;serverName?:string;canInstallMarketplace?:boolean}){
  const inputRef=useRef<HTMLInputElement>(null)
  const inventoryUrl=`/api/server-content?serverId=${encodeURIComponent(serverId)}${scopeWorld?`&world=${encodeURIComponent(scopeWorld)}`:''}`
  const {data,error,mutate,isLoading}=useSWR<InventoryResponse>(inventoryUrl,fetcher,{refreshInterval:8000})
  const [tab,setTab]=useState<(typeof tabs)[number]['key']>('all')
  const [query,setQuery]=useState('')
  const [target,setTarget]=useState<UploadTarget>('auto')
  const [pending,setPending]=useState<File[]>([])
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [progress,setProgress]=useState(0)
  const [editing,setEditing]=useState<ContentItem|null>(null)
  const [editorValue,setEditorValue]=useState('')
  const [editorLoading,setEditorLoading]=useState(false)
  const [newWorldFile,setNewWorldFile]=useState('datapacks/blockctrl/functions/setup.txt')
  const [newEntryKind,setNewEntryKind]=useState<'file'|'folder'>('file')
  const [newEntryPath,setNewEntryPath]=useState(scopeWorld?`${scopeWorld}/new-file.txt`:'notes.txt')
  const [marketSource,setMarketSource]=useState<AddonSource>('modrinth')
  const [marketKind,setMarketKind]=useState<AddonKind>(loader==='paper'?'plugins':'mods')
  const [marketQuery,setMarketQuery]=useState('')
  const [marketResults,setMarketResults]=useState<AddonSearchResult[]>([])
  const [marketBusy,setMarketBusy]=useState(false)
  const [marketError,setMarketError]=useState('')
  const [curseforgeReady,setCurseforgeReady]=useState<boolean|null>(null)
  const marketplaceEnabled=!scopeWorld&&!!loader&&!!mcVersion&&loader!=='vanilla'

  const items=data?.items??[]
  const filtered=useMemo(()=>items.filter(item=>{
    const categoryOk=tab==='all'||(tab==='world-files'?item.category==='world-file':item.category===tab)||(tab==='plugins'&&item.category==='plugin-config')
    const q=query.trim().toLocaleLowerCase('tr-TR')
    return categoryOk&&(!q||(item.name+' '+item.path+' '+categoryLabels[item.category]).toLocaleLowerCase('tr-TR').includes(q))
  }),[items,tab,query])
  const counts=useMemo(()=>({mods:items.filter(x=>x.category==='mods').length,plugins:items.filter(x=>x.category==='plugins').length,pluginConfigs:items.filter(x=>x.category==='plugin-config').length,packs:items.filter(x=>x.category==='resource-packs').length,worlds:items.filter(x=>x.category==='worlds').length,worldFiles:items.filter(x=>x.category==='world-file').length}),[items])

  async function uploadPending(){
    if(!pending.length||running||!canEdit)return
    if(target==='plugins'&&pending.some(file=>!file.name.toLowerCase().endsWith('.jar')))return setNotice('Plugin hedefinde yalnız .jar dosyası yüklenebilir.')
    if(target==='mods'&&pending.some(file=>!file.name.toLowerCase().endsWith('.jar')))return setNotice('Mod hedefinde yalnız .jar dosyası yüklenebilir.')
    if(target==='resource-packs'&&pending.some(file=>!file.name.toLowerCase().endsWith('.zip')))return setNotice('Resource Pack hedefinde .zip dosyası seçin.')
    if(target==='worlds'&&pending.some(file=>!file.name.toLowerCase().endsWith('.zip')))return setNotice('Dünya hedefinde .zip dosyası seçin.')
    setBusy(true);setNotice('');setProgress(0)
    try{
      for(let i=0;i<pending.length;i++){
        const file=pending[i]
        setNotice(`${file.name} yükleniyor...`)
        await directUploadFile(serverId,file,target,p=>setProgress(Math.round(((i+p/100)/pending.length)*100)))
      }
      const total=pending.length;setPending([]);setProgress(100);setNotice(`${total} dosya işlendi. Sunucu diski yeniden tarandı.`);if(inputRef.current)inputRef.current.value='';await mutate()
    }catch(error){setNotice(error instanceof Error?error.message:'Yükleme başarısız')}
    finally{setBusy(false)}
  }

  async function openEditor(item:ContentItem){
    if(!item.editable)return
    setEditorLoading(true);setNotice('')
    try{const response=await fetch(`/api/server-content?serverId=${serverId}&path=${encodeURIComponent(item.path)}`,{cache:'no-store'});const body=await readJson(response) as {content?:string;error?:string};if(!response.ok)throw new Error(body.error??'Dosya okunamadı');setEditing(item);setEditorValue(body.content??'')}
    catch(error){setNotice(error instanceof Error?error.message:'Dosya okunamadı')}
    finally{setEditorLoading(false)}
  }
  async function saveEditor(){
    if(!editing||running||!canEdit)return
    setEditorLoading(true);setNotice('')
    try{const response=await fetch('/api/server-content',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,path:editing.path,content:editorValue})});const body=await readJson(response) as {error?:string};if(!response.ok)throw new Error(body.error??'Dosya kaydedilemedi');setNotice(`${editing.path} kaydedildi. Önceki sürüm .bak olarak korundu.`);setEditing(null);await mutate()}
    catch(error){setNotice(error instanceof Error?error.message:'Dosya kaydedilemedi')}
    finally{setEditorLoading(false)}
  }
  async function createEntry(){
    if(!canEdit||busy)return
    const relative=newEntryPath.replace(/\\/g,'/').replace(/^\/+/, '').trim()
    if(!relative||relative.split('/').some(part=>!part||part==='.'||part==='..')){setNotice('Geçerli bir göreli dosya veya klasör yolu yazın.');return}
    if(newEntryKind==='file'&&!/[.](yml|yaml|json|json5|properties|toml|ini|cfg|conf|txt|md|xml|mcmeta|mcfunction|log)$/i.test(relative)){setNotice('Panelden canlı oluşturulan dosya güvenli bir metin uzantısına sahip olmalıdır.');return}
    setBusy(true);setNotice('')
    try{
      const response=await fetch('/api/server-content',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,action:newEntryKind==='file'?'create-file':'create-folder',path:relative,content:''})})
      const body=await readJson(response) as {error?:string;serverRunning?:boolean}
      if(!response.ok)throw new Error(body.error??'Oluşturma işlemi başarısız')
      setNotice(`${relative} ${newEntryKind==='file'?'dosyası':'klasörü'} oluşturuldu.${body.serverRunning?' Sunucu çalışırken güvenli oluşturma kullanıldı.':''}`)
      await mutate()
    }catch(error){setNotice(error instanceof Error?error.message:'Oluşturma işlemi başarısız')}
    finally{setBusy(false)}
  }
  async function createWorldTextFile(){
    if(!scopeWorld||!canEdit)return
    const relative=newWorldFile.replace(/\\/g,'/').replace(/^\/+/, '').trim()
    if(!relative||relative.split('/').some(part=>!part||part==='.'||part==='..')||!/[.](yml|yaml|json|json5|properties|toml|ini|cfg|conf|txt|md|xml|mcmeta|mcfunction)$/i.test(relative)){setNotice('Dünya içinde oluşturulacak dosya güvenli bir metin uzantısına sahip olmalıdır.');return}
    setBusy(true);setNotice('')
    try{const path=`${scopeWorld}/${relative}`;const response=await fetch('/api/server-content',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,action:'create-file',path,content:''})});const body=await readJson(response) as {error?:string;serverRunning?:boolean};if(!response.ok)throw new Error(body.error??'Dünya dosyası oluşturulamadı');setNotice(`${path} oluşturuldu.${body.serverRunning?' Sunucu çalışırken güvenli oluşturma kullanıldı.':''}`);await mutate()}
    catch(error){setNotice(error instanceof Error?error.message:'Dünya dosyası oluşturulamadı')}
    finally{setBusy(false)}
  }
  async function searchMarketplace(){
    if(!marketplaceEnabled||!loader||!mcVersion)return
    setMarketBusy(true);setMarketError('')
    try{
      const params=new URLSearchParams({mode:'addons',source:marketSource,kind:marketKind,loader,mcVersion,query:marketQuery.trim()})
      const response=await fetch(`/api/catalog?${params.toString()}`,{cache:'no-store'})
      const body=await readJson(response) as {error?:string;results?:AddonSearchResult[];capabilities?:{curseforge?:boolean}}
      if(typeof body.capabilities?.curseforge==='boolean')setCurseforgeReady(body.capabilities.curseforge)
      if(!response.ok)throw new Error(body.error??'Katalog araması başarısız')
      setMarketResults(Array.isArray(body.results)?body.results:[])
      if(!body.results?.length)setMarketError(`${mcVersion} / ${loader} için eşleşen ${marketKind==='plugins'?'plugin':'mod'} bulunamadı.`)
    }catch(error){setMarketResults([]);setMarketError(error instanceof Error?error.message:'Katalog araması başarısız')}finally{setMarketBusy(false)}
  }

  async function installMarketplaceAddon(project:AddonSearchResult){
    if(!marketplaceEnabled||!loader||!mcVersion||!serverName||!canEdit||!canInstallMarketplace)return
    setMarketBusy(true);setMarketError('');setNotice('')
    try{
      const params=new URLSearchParams({mode:'addon-plan',source:project.source,kind:marketKind,loader,mcVersion,projectId:project.projectId})
      const response=await fetch(`/api/catalog?${params.toString()}`,{cache:'no-store'})
      const body=await readJson(response) as {error?:string;plan?:AddonInstallFile[];dependencyCount?:number}
      if(!response.ok||!Array.isArray(body.plan)||!body.plan.length)throw new Error(body.error??'Kurulum planı oluşturulamadı')
      const deps=Math.max(0,Number(body.dependencyCount??body.plan.length-1))
      const warning=running?' Sunucu otomatik durdurulup kurulumdan sonra yeniden başlatılacak.':''
      if(!confirm(`${project.title}${deps?` + ${deps} zorunlu bağımlılık`:''} kurulacak.${warning} Devam edilsin mi?`))return
      const install=await fetch('/api/addons/install',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,files:body.plan,restartAfter:running})})
      const installBody=await readJson(install) as {error?:string;queued?:number;restarted?:boolean}
      if(!install.ok)throw new Error(installBody.error??'Kurulum kuyruğa alınamadı')
      setNotice(`${project.title}${deps?` ve ${deps} bağımlılığı`:''} kurulum kuyruğuna alındı.${installBody.restarted?' Sunucu kurulum sonrası otomatik açılacak.':''}`)
      setTimeout(()=>void mutate(),2500)
    }catch(error){setMarketError(error instanceof Error?error.message:'Kurulum başarısız')}finally{setMarketBusy(false)}
  }

  async function remove(item:ContentItem){
    if(running||!canEdit)return
    if(item.category==='worlds'){setNotice('Dünya klasörünü silmek için Dünya yönetimindeki güvenli “Dünyayı sil” işlemini kullanın.');return}
    const kind=categoryLabels[item.category]
    if(!window.confirm(`${item.path} (${kind}) kalıcı olarak silinsin mi? Sunucunun kapalı olması gerekir.`))return
    setBusy(true);setNotice('')
    try{const response=await fetch('/api/server-content',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,path:item.path,confirm:true})});const body=await readJson(response) as {error?:string};if(!response.ok)throw new Error(body.error??'Silinemedi');if(editing?.path===item.path)setEditing(null);setNotice(`${item.path} silindi.`);await mutate()}
    catch(error){setNotice(error instanceof Error?error.message:'Silinemedi')}
    finally{setBusy(false)}
  }

  return <div className="space-y-3">
    <section className="rounded-xl border border-sky-950/70 bg-[linear-gradient(145deg,rgba(15,33,26,.92),rgba(8,23,18,.92))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{scopeWorld?`${scopeWorld} · Dünya & İçerik yöneticisi`:'Mod / Plugin / Dünya içerik yöneticisi'}</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{scopeWorld?`Seçili dünyanın dosyaları ile sunucu genelindeki mod, plugin, plugin config, config ve resource pack içerikleri birlikte gösterilir. `:''}Oracle sunucu diski doğrudan taranır. Panel kurulmadan önce eklenmiş mod ve pluginler de burada görünür. Karma ZIP; <b className="text-slate-300">mods/</b>, <b className="text-slate-300">plugins/</b>, <b className="text-slate-300">config/</b>, <b className="text-slate-300">resourcepacks/</b> ve dünya klasörlerini ayırır.</p></div><Button size="sm" variant="outline" onClick={()=>mutate()} disabled={isLoading||busy}><RefreshCw className={`mr-2 size-4 ${isLoading?'animate-spin':''}`}/>Sunucuyu tara</Button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6"><MiniStat icon={Box} label="Mod" value={counts.mods}/><MiniStat icon={Package} label="Plugin" value={counts.plugins}/><MiniStat icon={FileText} label="Plugin config" value={counts.pluginConfigs}/><MiniStat icon={Archive} label="Resource pack" value={counts.packs}/><MiniStat icon={Globe2} label="Dünya" value={counts.worlds}/><MiniStat icon={FileText} label="Dünya dosyası" value={counts.worldFiles}/></div>
      {data?.scannedAt&&<p className="mt-3 text-[10px] text-slate-600">Son gerçek disk taraması: {new Date(data.scannedAt).toLocaleString('tr-TR')}</p>}
    </section>

    <section className="rounded-xl border border-sky-900/50 bg-sky-950/10 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full sm:w-32"><span className="mb-1.5 block text-[11px] font-semibold text-slate-300">Tür</span><select value={newEntryKind} onChange={e=>setNewEntryKind(e.target.value as 'file'|'folder')} disabled={busy||!canEdit} className="h-9 w-full rounded-md border border-sky-950/80 bg-[#07130f] px-3 text-xs"><option value="file">Dosya</option><option value="folder">Klasör</option></select></label>
        <label className="min-w-[260px] flex-1"><span className="mb-1.5 block text-[11px] font-semibold text-slate-300">Yeni {newEntryKind==='file'?'dosya':'klasör'} yolu</span><Input value={newEntryPath} onChange={e=>setNewEntryPath(e.target.value)} placeholder={scopeWorld?`${scopeWorld}/datapacks/paket`:'config/yeni-ayar.yml'} className="h-9 border-sky-950/80 bg-[#07130f] text-xs"/></label>
        <Button variant="outline" disabled={busy||!canEdit} onClick={createEntry}>{newEntryKind==='file'?<FilePlus2 className="mr-2 size-4"/>:<FolderPlus className="mr-2 size-4"/>}{newEntryKind==='file'?'Dosya oluştur':'Klasör oluştur'}</Button>
      </div>
      <p className="mt-2 text-[10px] leading-5 text-slate-500">Yeni ve üzerine yazmayan dosya/klasör oluşturma işlemi <b className="text-cyan-300">sunucu çalışırken de</b> kullanılabilir. Mevcut dosyayı düzenleme, silme ve taşıma işlemleri güvenlik için sunucu durdurulduğunda yapılır.</p>
    </section>
    {marketplaceEnabled&&<section className="rounded-xl border border-cyan-500/20 bg-[linear-gradient(145deg,rgba(8,27,35,.9),rgba(7,19,15,.94))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Mod / Plugin marketi</h3><p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">{mcVersion} · {loader} uyumluluğuna göre Modrinth veya CurseForge üzerinde arayın. Kurulumdan önce seçilen sürüm ve zorunlu bağımlılıklar çözülür; SHA-1 mevcutsa agent dosyayı diske almadan önce doğrular.</p></div><span className="rounded-full border border-sky-900/70 px-2 py-1 text-[10px] text-cyan-300">{!canInstallMarketplace?'Kurulum yetkisi yok':running?'Durdur → kur → yeniden başlat':'Kurulum hazır'}</span></div>
      <div className="mt-3 grid gap-2 md:grid-cols-[150px_150px_1fr_auto]"><select value={marketSource} onChange={e=>{setMarketSource(e.target.value as AddonSource);setMarketResults([]);setMarketError('')}} className="h-9 rounded-md border border-sky-950/80 bg-[#07130f] px-3 text-xs"><option value="modrinth">Modrinth</option><option value="curseforge">CurseForge</option></select><select value={marketKind} onChange={e=>{setMarketKind(e.target.value as AddonKind);setMarketResults([])}} className="h-9 rounded-md border border-sky-950/80 bg-[#07130f] px-3 text-xs"><option value="mods">Modlar</option><option value="plugins">Pluginler</option></select><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-500"/><Input value={marketQuery} onChange={e=>setMarketQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void searchMarketplace()}} placeholder="Örn. Lithium, LuckPerms, WorldEdit..." className="h-9 border-sky-950/80 bg-[#07130f] pl-8 text-xs"/></div><Button variant="outline" disabled={marketBusy} onClick={searchMarketplace}>{marketBusy?<Loader2 className="mr-2 size-4 animate-spin"/>:<Search className="mr-2 size-4"/>}Ara</Button></div>
      {marketSource==='curseforge'&&curseforgeReady===false&&<p className="mt-2 text-[10px] text-amber-300">CurseForge için Vercel ortamında CURSEFORGE_API_KEY gerekli. Modrinth anahtarsız çalışır.</p>}
      {marketError&&<div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">{marketError}</div>}
      {marketResults.length>0&&<div className="mt-3 grid gap-2 xl:grid-cols-2">{marketResults.map(project=><div key={`${project.source}:${project.projectId}`} className="flex gap-3 rounded-lg border border-sky-950/65 bg-black/10 p-3">{project.iconUrl?<img src={project.iconUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" loading="lazy"/>:<div className="grid size-12 shrink-0 place-items-center rounded-lg bg-slate-800"><Package className="size-5 text-slate-400"/></div>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="truncate text-xs text-white">{project.title}</b><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">{project.source}</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{project.description||'Açıklama yok'}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500"><span>{project.author||'Bilinmeyen geliştirici'} · {Intl.NumberFormat('tr-TR',{notation:'compact'}).format(project.downloads)} indirme</span><Button size="sm" className="h-7 bg-blue-600 px-2 text-[10px] text-white" disabled={marketBusy||!canEdit||!canInstallMarketplace||!serverName} onClick={()=>installMarketplaceAddon(project)}>{running?'Durdur ve Kur':'Kur'}</Button></div></div></div>)}</div>}
    </section>}

    {scopeWorld&&<section className="rounded-xl border border-sky-900/50 bg-sky-950/10 p-4"><div className="flex flex-wrap items-end gap-3"><label className="min-w-[260px] flex-1 text-[11px] font-semibold text-slate-300">Yeni dünya metin dosyası<Input className="mt-1" value={newWorldFile} onChange={e=>setNewWorldFile(e.target.value)} placeholder="datapacks/paket/data/.../function.mcfunction"/></label><Button variant="outline" disabled={busy||!canEdit} onClick={createWorldTextFile}><FileText className="mr-2 size-4"/>Boş dosya oluştur</Button></div><p className="mt-2 text-[10px] leading-5 text-slate-500">Güvenlik için yalnız metin tabanlı .yml, .json, .properties, .toml, .ini, .cfg, .conf, .txt, .md, .mcmeta ve .mcfunction dosyaları panelden oluşturulup düzenlenir. level.dat gibi binary/kritik dosyalar salt görüntü listesinde kalır.</p></section>}

    <section className="rounded-xl border border-sky-950/70 bg-[#0b1914] p-4">
      <input ref={inputRef} type="file" multiple className="hidden" accept=".jar,.zip,.yml,.yaml,.json,.properties,.toml,.ini,.cfg,.conf,.txt,.xml" onChange={e=>setPending(Array.from(e.target.files??[]))}/>
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto] lg:items-end"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-300">Yükleme hedefi</span><select value={target} onChange={e=>setTarget(e.target.value as UploadTarget)} disabled={busy||running||!canEdit} className="h-9 w-full rounded-md border border-sky-950/80 bg-[#07130f] px-3 text-xs">{Object.entries(targetLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><div><span className="mb-1.5 block text-[11px] font-semibold text-slate-300">Dosyalar</span><button type="button" onClick={()=>inputRef.current?.click()} disabled={busy||running||!canEdit} className="flex h-9 w-full items-center rounded-md border border-dashed border-sky-800/70 bg-black/10 px-3 text-left text-xs text-slate-300 disabled:opacity-50"><UploadCloud className="mr-2 size-4 text-cyan-300"/>{pending.length?`${pending.length} dosya seçildi`:'JAR, ZIP veya config seç'}</button></div><Button onClick={uploadPending} disabled={!pending.length||busy||running||!canEdit} className="bg-blue-600 text-sky-950 hover:bg-blue-500">{busy?<Loader2 className="mr-2 size-4 animate-spin"/>:<UploadCloud className="mr-2 size-4"/>}Yükle ve ayıkla</Button></div>
      {pending.length>0&&<div className="mt-3 flex flex-wrap gap-2">{pending.slice(0,8).map(file=><span key={`${file.name}-${file.size}`} className="rounded-md border border-sky-950/70 bg-[#07130f] px-2 py-1 text-[10px] text-slate-400">{file.name} · {formatSize(file.size,false)}</span>)}{pending.length>8&&<span className="px-2 py-1 text-[10px] text-slate-500">+{pending.length-8} dosya</span>}</div>}
      {busy&&<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{width:`${progress}%`}}/></div>}
      <p className="mt-3 text-[10px] leading-5 text-slate-500"><b className="text-slate-300">Karma ZIP:</b> Mod, plugin, plugin config, dünya, resource pack ve config dosyalarını tek ZIP içinde beraber yükleyebilirsiniz. Tek bir plugin JAR yüklerken hedefi “Plugin”, tek resource pack ZIP yüklerken “Resource Pack” seçin.</p>
    </section>

    {error&&<div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">Gerçek sunucu içeriği okunamadı: {error.message}</div>}
    {notice&&<div className="rounded-xl border border-blue-500/25 bg-sky-950/20 p-3 text-xs text-sky-200">{notice}</div>}
    {running&&<div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">Sunucu çalışırken gerçek disk listesini görüntüleyebilir ve <b>yeni dosya/klasör oluşturabilirsiniz</b>. Mevcut dosyayı düzenleme, silme, taşıma ve toplu yükleme işlemleri için sunucuyu durdurun.</div>}

    <section className="overflow-hidden rounded-xl border border-sky-950/70 bg-[linear-gradient(145deg,rgba(15,33,26,.92),rgba(8,23,18,.92))]">
      <div className="flex flex-wrap items-center gap-2 border-b border-sky-950/65 p-3"><div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">{tabs.map(item=>{const Icon=item.icon;return <button key={item.key} onClick={()=>setTab(item.key)} className={`inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-[11px] font-semibold ${tab===item.key?'border-blue-500/50 bg-blue-500/10 text-cyan-300':'border-sky-950/70 text-slate-400 hover:text-white'}`}><Icon className="mr-1.5 size-3.5"/>{item.label}</button>})}</div><div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-500"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Sunucu diskinde ara..." className="h-8 border-sky-950/80 bg-[#0a1928] pl-8 text-xs"/></div></div>
      {isLoading?<div className="p-8 text-center text-xs text-slate-500"><Loader2 className="mx-auto mb-2 size-5 animate-spin"/>Sunucu diski taranıyor...</div>:filtered.length===0?<div className="p-8 text-center text-xs text-slate-500">Bu bölümde sunucu diskinde içerik bulunamadı.</div>:<div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-white/[.025] text-slate-400"><tr><th className="px-4 py-3 font-medium">Ad</th><th className="px-4 py-3 font-medium">Tür</th><th className="px-4 py-3 font-medium">Gerçek konum</th><th className="px-4 py-3 font-medium">Boyut</th><th className="px-4 py-3 font-medium">Değiştirilme</th><th className="px-4 py-3 font-medium">İşlem</th></tr></thead><tbody>{filtered.map(item=><tr key={`${item.category}:${item.path}`} className="border-t border-sky-950/55"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-md bg-slate-800/70 text-slate-300">{item.category==='mods'?<Gamepad2 className="size-4"/>:(item.category==='worlds'||item.category==='world-file')?<Globe2 className="size-4"/>:item.category==='resource-packs'?<Archive className="size-4"/>:<FileCog className="size-4"/>}</div><div className="min-w-0"><div className="max-w-[300px] truncate font-semibold text-white">{item.name}</div><div className="mt-0.5 text-[10px] text-cyan-400/80">Sunucu diskinde bulundu</div></div></div></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] ${categoryClass[item.category]}`}>{categoryLabels[item.category]}</span></td><td className="px-4 py-3 font-mono text-[10px] text-slate-500">/{item.path}</td><td className="px-4 py-3 text-slate-400">{formatSize(item.size,item.directory)}</td><td className="px-4 py-3 text-slate-400">{new Date(item.updatedAt).toLocaleString('tr-TR')}</td><td className="px-4 py-3"><div className="flex gap-1.5">{item.editable&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={editorLoading} onClick={()=>openEditor(item)}><Pencil className="mr-1 size-3"/>Görüntüle / düzenle</Button>}<Button size="sm" variant="outline" className="h-7 px-2 text-[10px] text-red-300" disabled={running||busy||!canEdit||item.path==='server.properties'||item.category==='worlds'} onClick={()=>remove(item)}><Trash2 className="mr-1 size-3"/>Sil</Button></div></td></tr>)}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-950/55 px-4 py-3 text-[10px] text-slate-500"><span>{filtered.length} öğe gösteriliyor · toplam {items.length}</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-cyan-400"/>Yükleme geçmişi değil, gerçek Oracle sunucu dizini</span></div>
    </section>

    {editing&&<section className="rounded-xl border border-cyan-500/25 bg-[#081713] p-4"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Plugin / config / dünya metin dosyası düzenleyici</h3><p className="mt-1 font-mono text-[10px] text-cyan-300">/{editing.path}</p></div><Button size="icon" variant="ghost" onClick={()=>setEditing(null)}><X className="size-4"/></Button></div><textarea value={editorValue} onChange={e=>setEditorValue(e.target.value)} spellCheck={false} className="min-h-[360px] w-full rounded-lg border border-sky-950/80 bg-[#050e0b] p-3 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-blue-700"/><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-slate-500">Kaydetmeden önce eski dosya otomatik olarak <b>.bak</b> kopyasına taşınır. JAR dosyaları binary olduğu için metin olarak düzenlenmez.</p><Button onClick={saveEditor} disabled={running||editorLoading||!canEdit} className="bg-blue-600 text-sky-950 hover:bg-blue-500">{editorLoading?<Loader2 className="mr-2 size-4 animate-spin"/>:<Save className="mr-2 size-4"/>}Kaydet</Button></div></section>}
  </div>
}

function MiniStat({icon:Icon,label,value}:{icon:any;label:string;value:number}){return <div className="rounded-lg border border-sky-950/70 bg-[#07130f] p-3"><div className="flex items-center justify-between"><span className="text-[10px] text-slate-500">{label}</span><Icon className="size-3.5 text-cyan-400"/></div><div className="mt-1 text-xl font-semibold text-white">{value}</div></div>}
