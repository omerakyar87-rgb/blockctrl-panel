'use client'
































































import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Archive, ChevronDown, ChevronRight, Copy, Download, FilePlus2, FileText, Folder, FolderPlus, Move, Pencil, RefreshCw, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
































































type Item={path:string;name:string;type?:string;sizeBytes?:number;modifiedAt?:string;permissions?:string}
type Bundle={id:string;status:string;createdAt:string;result?:{filename?:string;sizeBytes?:number;downloadUrl?:string;downloadToken?:string;progress?:number;expiresAt?:string;files?:Array<{filename?:string;sizeBytes?:number;downloadUrl?:string;downloadToken?:string;expiresAt?:string}>}}
type ActionRow={id:string|number;type:string;status:string;result?:Record<string,unknown>|null}
type ActionData={fileIndex?:{items?:Item[];scannedAt?:string;truncated?:boolean;source?:string};inventoryError?:string|null;bundles?:Bundle[];supportedActions?:string[];actions?:ActionRow[]}
const fetcher=async(u:string)=>{const r=await fetch(u,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Dosya işlemleri alınamadı');return d}
const cats=['Tümü','Mods','Config','Worlds','Plugins','Backups','Logs','Server files']
function size(bytes=0){if(!bytes)return'—';if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;if(bytes<1073741824)return `${(bytes/1048576).toFixed(1)} MB`;return `${(bytes/1073741824).toFixed(2)} GB`}
function parentOf(path:string){const i=path.lastIndexOf('/');return i<0?'':path.slice(0,i)}
function joinPath(parent:string,name:string){return parent?`${parent}/${name}`:name}
function categoryMatches(item:Item,cat:string){if(cat==='Tümü')return true;const probe=`${item.type??''} ${item.path}`.toLowerCase();if(cat==='Server files')return !['mods','config','world','plugin','backup','log'].some(x=>probe.includes(x));return probe.includes(cat.toLowerCase().replace('worlds','world').replace('plugins','plugin').replace('backups','backup').replace('logs','log'))}
function textEditable(item:Item){return item.type!=='Folder'&&(item.sizeBytes??0)<=512*1024&&/\.(yml|yaml|json|properties|toml|ini|cfg|conf|txt|md|log)$/i.test(item.path)}
export function ServerBulkDownload({serverId,running=false,canEdit=true}:{serverId:string;running?:boolean;canEdit?:boolean}){
 const {data,error,mutate}=useSWR<ActionData>(`/api/server-actions?serverId=${serverId}`,fetcher,{refreshInterval:4000,revalidateOnFocus:true})
 const [selected,setSelected]=useState<string[]>([]);const [cat,setCat]=useState('Tümü');const [notice,setNotice]=useState('');const [busy,setBusy]=useState('');const [collapsed,setCollapsed]=useState<string[]>([]);const [editorPath,setEditorPath]=useState('');const [editorContent,setEditorContent]=useState('');const [editorOriginal,setEditorOriginal]=useState('')
 const supported=new Set(data?.supportedActions??[])
 const initialScanRequested=useRef(false)
 useEffect(()=>{if(initialScanRequested.current||data?.fileIndex||!supported.has('file-inventory'))return;initialScanRequested.current=true;void queue('file-inventory')},[data?.fileIndex,data?.supportedActions])
 const items=useMemo(()=>[...(data?.fileIndex?.items??[])].sort((a,b)=>a.path.localeCompare(b.path,'tr')),[data?.fileIndex?.items])
 const visible=useMemo(()=>items.filter(item=>categoryMatches(item,cat)).filter(item=>{const parts=item.path.split('/');for(let i=1;i<parts.length;i++)if(collapsed.includes(parts.slice(0,i).join('/')))return false;return true}),[items,cat,collapsed])
 const chosen=items.filter(x=>selected.includes(x.path));const total=chosen.reduce((a,x)=>a+(x.sizeBytes||0),0)
 const editable=canEdit&&!running
 const createAllowed=canEdit
 async function queue(action:string,payload:Record<string,unknown>={},confirm=false,refresh=false){
   setBusy(action);setNotice('')
   try{
     const r=await fetch('/api/server-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,action,payload,confirm})});const d=await r.json().catch(()=>({}))
     if(!r.ok)throw new Error(d.error||'İşlem başlatılamadı')
     setNotice(`${action} agent kuyruğuna alındı.`)
     if(refresh&&supported.has('file-inventory'))await fetch('/api/server-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,action:'file-inventory',payload:{}})})
     await mutate()
     return true
   }catch(e){setNotice(e instanceof Error?e.message:'İşlem başlatılamadı');return false}finally{setBusy('')}
 }
 async function runAction(action:string,payload:Record<string,unknown>={},confirm=false){
   setBusy(action);setNotice('')
   try{
     const started=await fetch('/api/server-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,action,payload,confirm})});const start=await started.json().catch(()=>({}))
     if(!started.ok)throw new Error(start.error||'İşlem başlatılamadı')
     const commandId=String(start.command?.id??'');if(!commandId)throw new Error('Agent komut kimliği alınamadı')
     const deadline=Date.now()+15000
     while(Date.now()<deadline){
       const snapshot=await fetcher(`/api/server-actions?serverId=${serverId}`) as ActionData
       const row=snapshot.actions?.find(x=>String(x.id)===commandId)
       if(row?.status==='failed')throw new Error(String(row.result?.error??'Agent işlemi başarısız'))
       if(row?.status==='completed'){await mutate();return row.result??{}}
       await new Promise(resolve=>setTimeout(resolve,500))
     }
     throw new Error('Agent yanıtı zaman aşımına uğradı')
   }catch(e){setNotice(e instanceof Error?e.message:'İşlem başarısız');return null}finally{setBusy('')}
 }
 async function openText(item:Item){const result=await runAction('file-read',{path:item.path});if(!result)return;const content=String(result.content??'');setEditorPath(item.path);setEditorContent(content);setEditorOriginal(content)}
 async function saveText(){if(!editorPath||!editable||!supported.has('file-write')||editorContent===editorOriginal)return;if(!window.confirm(`${editorPath} kaydedilsin mi? Mevcut dosyanın yedeği oluşturulacaktır.`))return;const result=await runAction('file-write',{path:editorPath,content:editorContent},true);if(result){setEditorOriginal(editorContent);setNotice('Dosya kaydedildi; önceki sürüm .bak-* olarak korundu.')}}
 async function createFolder(){const path=window.prompt('Oluşturulacak klasör yolu','plugins/yeni-klasor')?.trim();if(path&&await queue('folder-create',{path},false,true))setSelected([])}
 async function createFile(){const path=window.prompt('Oluşturulacak dosya yolu','config/yeni-dosya.yml')?.trim();if(path&&await queue('file-create',{path,content:''},false,true))setSelected([])}
 async function renameItem(item:Item){const nextName=window.prompt('Yeni ad',item.name)?.trim();if(!nextName||nextName===item.name)return;const newPath=joinPath(parentOf(item.path),nextName);if(await queue('file-rename',{path:item.path,newPath},false,true))setSelected(s=>s.map(x=>x===item.path?newPath:x))}
 async function moveItem(item:Item){const newPath=window.prompt('Yeni tam yol',item.path)?.trim();if(newPath&&newPath!==item.path&&await queue('file-move',{path:item.path,newPath},false,true))setSelected(s=>s.filter(x=>x!==item.path))}
 async function copyItem(item:Item){const newPath=window.prompt('Kopya için tam yol',joinPath(parentOf(item.path),`copy-${item.name}`))?.trim();if(newPath&&await queue('file-copy',{path:item.path,newPath},false,true))setSelected([])}
 async function chmodItem(item:Item){const mode=window.prompt('Dosya izni (örn. 644 veya 755)',item.permissions||'644')?.trim();if(mode)await queue('file-permissions',{path:item.path,mode},false,true)}
 async function deleteItem(item:Item){if(!window.confirm(`${item.path} kalıcı olarak silinsin mi?`))return;if(await queue('file-delete',{path:item.path},true,true))setSelected(s=>s.filter(x=>x!==item.path))}
 async function bulkMove(){if(!selected.length)return;const destination=window.prompt('Seçilenlerin taşınacağı hedef klasör','archive')?.trim();if(destination&&await queue('file-bulk-move',{paths:selected,destination},false,true))setSelected([])}
 async function bulkDelete(){if(!selected.length||!window.confirm(`${selected.length} öğe kalıcı olarak silinsin mi?`))return;if(await queue('file-bulk-delete',{paths:selected},true,true))setSelected([])}
 function toggleFolder(path:string){setCollapsed(old=>old.includes(path)?old.filter(x=>x!==path):[...old,path])}
 return <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
   <div className="space-y-3">
     <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#203a55] bg-[#0b191f] p-3">
       <div className="flex flex-wrap gap-1">{cats.map(x=><button key={x} onClick={()=>setCat(x)} className={`rounded-md border px-3 py-2 text-xs ${cat===x?'border-sky-500/50 bg-sky-500/10 text-sky-300':'border-[#28445f] text-slate-400 hover:text-white'}`}>{x}</button>)}</div>
       <div className="ml-auto flex flex-wrap gap-2">
         <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void mutate()}><RefreshCw className={`mr-2 size-4 ${busy==='file-inventory'?'animate-spin':''}`}/>Diski yenile</Button>
         {supported.has('folder-create')&&<Button size="sm" variant="outline" disabled={!createAllowed||!!busy} onClick={()=>void createFolder()}><FolderPlus className="mr-2 size-4"/>Klasör</Button>}
         {supported.has('file-create')&&<Button size="sm" variant="outline" disabled={!createAllowed||!!busy} onClick={()=>void createFile()}><FilePlus2 className="mr-2 size-4"/>Dosya</Button>}
       </div>
     </div>
     {running&&<div className="rounded-lg border border-amber-400/20 bg-amber-400/[.06] px-4 py-3 text-xs text-amber-200">Listeleme, indirme ve yeni dosya/klasör oluşturma sunucu çalışırken kullanılabilir. Mevcut dosyayı değiştirme, taşıma ve silme işlemleri güvenlik için sunucu durdurulduğunda açılır.</div>}
     {error&&<div className="rounded-lg border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-xs text-red-200">{error.message}</div>}
     {!error&&!data?.fileIndex&&data?.inventoryError&&<div className="rounded-lg border border-amber-400/20 bg-amber-400/[.06] px-4 py-3 text-xs text-amber-200">Disk envanteri henüz alınamadı: {data.inventoryError}. Agent bağlantısını ve sunucu klasörünü kontrol edin; sahte dosya gösterilmiyor.</div>}
     {!error&&!data?.fileIndex&&!data?.inventoryError&&<div className="rounded-lg border border-sky-400/20 bg-sky-400/[.06] px-4 py-3 text-xs text-sky-200">Gerçek disk envanteri Oracle agent üzerinden okunuyor. “Diski yenile” ile canlı taramayı tekrar başlatabilirsiniz.</div>}
     {notice&&<div role="status" className="rounded-lg border border-sky-500/25 bg-sky-500/[.06] px-4 py-3 text-xs text-sky-200">{notice}</div>}
     <div className="overflow-x-auto rounded-xl border border-[#203a55] bg-[#0b191f]">
       <table className="w-full min-w-[980px] text-left text-xs">
         <thead className="bg-white/[.025] text-slate-400"><tr><th className="p-3"><input type="checkbox" aria-label="Tümünü seç" checked={visible.length>0&&visible.every(x=>selected.includes(x.path))} onChange={e=>setSelected(old=>e.target.checked?[...new Set([...old,...visible.map(x=>x.path)])]:old.filter(p=>!visible.some(x=>x.path===p)))}/></th><th className="p-3">Dosya ağacı</th><th className="p-3">Tür</th><th className="p-3">Boyut</th><th className="p-3">Değiştirilme</th><th className="p-3">İzin</th><th className="p-3">İşlemler</th></tr></thead>
         <tbody>{visible.map(item=>{const folder=item.type==='Folder';const depth=Math.max(0,item.path.split('/').length-1);return <tr key={item.path} className="border-t border-[#203a55]">
           <td className="p-3 align-top"><input type="checkbox" checked={selected.includes(item.path)} onChange={e=>setSelected(s=>e.target.checked?[...new Set([...s,item.path])]:s.filter(p=>p!==item.path))}/></td>
           <td className="p-3"><div className="flex min-w-0 items-center gap-2" style={{paddingLeft:`${Math.min(depth,10)*14}px`}}>{folder?<button type="button" className="grid size-6 place-items-center text-slate-400" onClick={()=>toggleFolder(item.path)}>{collapsed.includes(item.path)?<ChevronRight className="size-4"/>:<ChevronDown className="size-4"/>}</button>:<span className="w-6"/>}{folder?<Folder className="size-4 shrink-0 text-amber-300"/>:<span className="size-2 shrink-0 rounded-full bg-sky-400"/>}<div className="min-w-0"><p className="truncate font-semibold text-white">{item.name}</p><p className="truncate font-mono text-[10px] text-slate-500">/{item.path}</p></div></div></td>
           <td className="p-3 text-slate-300">{item.type||'—'}</td><td className="p-3 text-slate-400">{folder?'Klasör':size(item.sizeBytes)}</td><td className="p-3 text-slate-400">{item.modifiedAt?new Date(item.modifiedAt).toLocaleString('tr-TR'):'—'}</td><td className="p-3 font-mono text-slate-300">{item.permissions||'—'}</td>
           <td className="p-3"><div className="flex flex-wrap gap-1">
             {!folder&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!!busy} onClick={()=>queue('bulk-download',{paths:[item.path],mode:'separate'})}><Download className="mr-1 size-3"/>İndir</Button>}
             {folder&&supported.has('folder-download')&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!!busy} onClick={()=>queue('folder-download',{path:item.path})}><Download className="mr-1 size-3"/>İndir</Button>}
             {!folder&&supported.has('file-read')&&textEditable(item)&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!!busy} onClick={()=>void openText(item)}><FileText className="mr-1 size-3"/>Aç</Button>}
             {supported.has('file-rename')&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!editable||!!busy} onClick={()=>void renameItem(item)}><Pencil className="mr-1 size-3"/>Ad</Button>}
             {supported.has('file-move')&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!editable||!!busy} onClick={()=>void moveItem(item)}><Move className="mr-1 size-3"/>Taşı</Button>}
             {supported.has('file-copy')&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!editable||!!busy} onClick={()=>void copyItem(item)}><Copy className="mr-1 size-3"/>Kopyala</Button>}
             {supported.has('file-permissions')&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!editable||!!busy} onClick={()=>void chmodItem(item)}><ShieldCheck className="mr-1 size-3"/>İzin</Button>}
             {supported.has('file-delete')&&<Button size="sm" variant="outline" className="h-7 px-2 text-[10px] text-red-300" disabled={!editable||!!busy} onClick={()=>void deleteItem(item)}><Trash2 className="mr-1 size-3"/>Sil</Button>}
           </div></td>
         </tr>})}{!visible.length&&<tr><td colSpan={7} className="p-10 text-center text-slate-500">Dosya envanteri henüz hazır değil. “Diski yenile” ile Oracle sunucu diskini tekrar tarayın.</td></tr>}</tbody>
       </table>
       <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#203a55] px-4 py-3 text-[10px] text-slate-500"><span>{visible.length} öğe · {selected.length} seçili {data?.fileIndex?.truncated?'· liste sınırlandı':''}</span><span>{data?.fileIndex?.scannedAt?`Son tarama: ${new Date(data.fileIndex.scannedAt).toLocaleString('tr-TR')}`:'Henüz taranmadı'}</span></div>
     </div>
     {editorPath&&<section className="rounded-xl border border-[#203a55] bg-[#0b191f] p-4">
       <div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-white">Metin düzenleyici</h3><p className="mt-1 truncate font-mono text-[10px] text-slate-500">/{editorPath}</p></div><Button size="icon" variant="ghost" onClick={()=>{setEditorPath('');setEditorContent('');setEditorOriginal('')}}><X className="size-4"/></Button></div>
       <textarea value={editorContent} onChange={e=>setEditorContent(e.target.value)} readOnly={!editable||!supported.has('file-write')} spellCheck={false} className="min-h-[320px] w-full rounded-lg border border-[#28445f] bg-black/30 p-3 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-sky-500/50"/>
       <div className="mt-3 flex flex-wrap items-center gap-2">{supported.has('file-write')&&<Button disabled={!editable||!!busy||editorContent===editorOriginal} onClick={()=>void saveText()}><Save className="mr-2 size-4"/>Kaydet</Button>}<span className="text-[10px] text-slate-500">{editable?'Kaydetme öncesi otomatik .bak-* yedeği oluşturulur.':'Sunucu çalışırken editör salt okunurdur.'}</span></div>
     </section>}
   </div>
   <aside className="space-y-3">
     <div className="rounded-xl border border-[#203a55] bg-[#0b191f] p-4"><h3 className="font-semibold text-white">Seçili dosya işlemleri</h3><div className="mt-3 space-y-2 text-xs text-slate-400"><div className="flex justify-between"><span>Seçili öğe</span><b className="text-white">{chosen.length}</b></div><div className="flex justify-between"><span>Toplam dosya boyutu</span><b className="text-white">{size(total)}</b></div></div><div className="mt-4 grid gap-2">
       <Button className="bg-sky-600 text-white hover:bg-sky-500" disabled={!chosen.filter(x=>x.type!=='Folder').length||!!busy||!supported.has('bulk-download')} onClick={()=>queue('bulk-download',{paths:chosen.filter(x=>x.type!=='Folder').map(x=>x.path),mode:'archive'})}><Archive className="mr-2 size-4"/>Arşiv indir</Button>
       {supported.has('file-bulk-move')&&<Button variant="outline" disabled={!selected.length||!editable||!!busy} onClick={()=>void bulkMove()}><Move className="mr-2 size-4"/>Toplu taşı</Button>}
       {supported.has('file-bulk-delete')&&<Button variant="outline" className="text-red-300" disabled={!selected.length||!editable||!!busy} onClick={()=>void bulkDelete()}><Trash2 className="mr-2 size-4"/>Toplu sil</Button>}
       <Button variant="outline" disabled={!selected.length} onClick={()=>setSelected([])}>Seçimi temizle</Button>
     </div></div>
     <div className="rounded-xl border border-[#203a55] bg-[#0b191f] p-4"><h3 className="font-semibold text-white">Son indirme paketleri</h3><div className="mt-3 space-y-2">{(data?.bundles??[]).map(b=><div key={b.id} className="rounded-lg border border-[#203a55] p-3 text-xs"><div className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-white">{b.result?.filename||`paket-${b.id.slice(0,8)}.tar.gz`}</span><span className="text-slate-400">{b.status}</span></div><div className="mt-1 text-[10px] text-slate-500">{new Date(b.createdAt).toLocaleString('tr-TR')} · %{b.result?.progress??(b.status==='completed'?100:0)}</div>{b.result?.downloadUrl&&<a className="mt-2 inline-flex items-center gap-1 text-sky-300" href={b.result.downloadUrl}><Download className="size-3"/>İndir</a>}{b.result?.files?.length?<div className="mt-2 grid gap-1">{b.result.files.map((f,i)=>f.downloadUrl?<a key={`${b.id}-${i}`} className="inline-flex items-center gap-1 text-sky-300" href={f.downloadUrl}><Download className="size-3"/>{f.filename||`Dosya ${i+1}`}</a>:null)}</div>:null}</div>)}{!(data?.bundles??[]).length&&<div className="text-xs text-slate-500">Henüz indirme paketi yok.</div>}</div></div>
   </aside>
 </div>
}
