'use client'




import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Archive, Ban, CheckCircle2, Clock3, Crown, FileText, MessageSquare, RefreshCw, Search, ShieldCheck, UserCheck, UserCog, UserMinus, Users, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActionConfirm } from '@/components/action-confirm-dialog'
import { ServerPlayerModeration } from '@/components/server-player-moderation'




type PlayerRow={
  id:string;playerUuid?:string|null;playerName:string;firstSeenAt:string;lastSeenAt?:string|null;lastJoinAt?:string|null;lastLeaveAt?:string|null;sessionStartedAt?:string|null;totalPlaySeconds:number;isOnline:boolean;isOp:boolean;whitelisted:boolean;banned:boolean;banReason?:string|null;banExpiresAt?:string|null;lastSyncAt?:string|null
}
type PlayersResponse={
  players:PlayerRow[]
  summary:{total:number;online:number;banned:number;ops:number;whitelisted:number;lastSyncAt?:string|null;maxPlayers?:number|null;whitelistEnabled?:boolean|null}
  nodeOnline:boolean
  runtimeSynced:boolean
  runtimeError?:string|null
  canManage:boolean
}
type Props={serverId:string;running:boolean;canManage:boolean;maxPlayers?:number|null;whitelistEnabled?:boolean|null;antiCheatEventCount?:number|null}




async function readJson(response:Response){const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={error:text}}if(!response.ok)throw new Error(data.error??`İstek başarısız (${response.status})`);return data}
const fetcher=(url:string)=>fetch(url,{cache:'no-store',headers:{accept:'application/json'}}).then(readJson)
const visiblePoll=(ms:number)=>()=>typeof document!=='undefined'&&document.visibilityState==='hidden'?0:ms




export function ServerPlayersCenter({serverId,running,canManage,maxPlayers,whitelistEnabled,antiCheatEventCount}:Props){
  const actionConfirm=useActionConfirm()
  const {data,error,mutate,isLoading}=useSWR<PlayersResponse>(`/api/players?serverId=${encodeURIComponent(serverId)}`,fetcher,{refreshInterval:visiblePoll(5000),revalidateOnFocus:true})
  const [selected,setSelected]=useState('')
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState<'all'|'online'|'offline'|'staff'|'banned'>('all')
  const [busy,setBusy]=useState('')
  const [notice,setNotice]=useState('')
  const [message,setMessage]=useState('')
  const [reason,setReason]=useState('')
  const [advancedBusy,setAdvancedBusy]=useState('')
  const [advancedNotice,setAdvancedNotice]=useState('')
  const [runtimeDetail,setRuntimeDetail]=useState<Record<string,unknown>|null>(null)
  const [historyLines,setHistoryLines]=useState<string[]>([])
  const [inventoryItems,setInventoryItems]=useState<Array<Record<string,unknown>>|null>(null)
  const [enderItems,setEnderItems]=useState<Array<Record<string,unknown>>|null>(null)




  const players=data?.players??[]
  useEffect(()=>{if(selected&&players.some(player=>player.playerName===selected))return;setSelected(players.find(player=>player.isOnline)?.playerName??players[0]?.playerName??'')},[players,selected])
  useEffect(()=>{setRuntimeDetail(null);setHistoryLines([]);setInventoryItems(null);setEnderItems(null);setAdvancedNotice('')},[selected])
  const normalized=query.trim().toLocaleLowerCase('tr-TR')
  const visible=useMemo(()=>players.filter(player=>{
    const matchesSearch=!normalized||`${player.playerName} ${player.playerUuid??''}`.toLocaleLowerCase('tr-TR').includes(normalized)
    const matchesFilter=filter==='all'||(filter==='online'&&player.isOnline)||(filter==='offline'&&!player.isOnline)||(filter==='staff'&&player.isOp)||(filter==='banned'&&player.banned)
    return matchesSearch&&matchesFilter
  }),[players,normalized,filter])
  const current=visible.find(player=>player.playerName===selected)??null
  const effectiveCanManage=canManage&&data?.canManage!==false
  const actualMax=data?.summary?.maxPlayers??maxPlayers??null
  const actualWhitelist=data?.summary?.whitelistEnabled??whitelistEnabled??null




  async function post(action:string,payload:Record<string,unknown>={}){
    setBusy(action);setNotice('')
    try{const result=await readJson(await fetch('/api/players',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,action,...payload})}));setNotice(result.message??'İşlem tamamlandı.');await mutate();return result}
    catch(e){setNotice(e instanceof Error?e.message:'Oyuncu işlemi başarısız.');return null}finally{setBusy('')}
  }
  async function refresh(){await post('refresh')}
  async function runAgent(action:'player-details'|'player-inventory'|'player-enderchest'|'player-history',payload:Record<string,unknown>={}){
    setAdvancedBusy(action);setAdvancedNotice('')
    try{
      const started=await readJson(await fetch('/api/server-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId,action,payload})}))
      const commandId=String(started.command?.id??'');if(!commandId)throw new Error('Agent komut kimliği alınamadı')
      const deadline=Date.now()+15_000
      while(Date.now()<deadline){
        const snapshot=await readJson(await fetch(`/api/server-actions?serverId=${encodeURIComponent(serverId)}`,{cache:'no-store'}))
        const row=(snapshot.actions??[]).find((item:any)=>String(item.id)===commandId)
        if(row?.status==='failed')throw new Error(String(row.result?.error??'Agent oyuncu sorgusu başarısız'))
        if(row?.status==='completed')return row.result??{}
        await new Promise(resolve=>setTimeout(resolve,500))
      }
      throw new Error('Agent oyuncu sorgusu zaman aşımına uğradı')
    }catch(e){setAdvancedNotice(e instanceof Error?e.message:'Gelişmiş oyuncu sorgusu başarısız');return null}finally{setAdvancedBusy('')}
  }
  async function loadRuntimeDetail(){
    if(!current)return
    const result=await runAgent('player-details');if(!result)return
    const rows=Array.isArray(result.players)?result.players as Array<Record<string,unknown>>:[]
    const detail=rows.find(row=>String(row.playerName??'').toLowerCase()===current.playerName.toLowerCase())??null
    setRuntimeDetail(detail?{...detail,onlineVerified:result.onlineVerified,onlineSource:result.onlineSource,syncedAt:result.syncedAt}:null)
    setAdvancedNotice(detail?'Canlı oyuncu detayları yenilendi.':'Agent snapshotında seçili oyuncu bulunamadı.')
  }
  async function loadHistory(){
    if(!current)return
    const result=await runAgent('player-history',{playerName:current.playerName});if(!result)return
    setHistoryLines(Array.isArray(result.lines)?result.lines.map(String):[])
    setAdvancedNotice('Oyuncu günlük geçmişi yenilendi.')
  }
  async function loadStorage(action:'player-inventory'|'player-enderchest'){
    if(!current)return
    const result=await runAgent(action,{playerName:current.playerName});if(!result)return
    const items=Array.isArray(result.items)?result.items as Array<Record<string,unknown>>:[]
    if(action==='player-inventory')setInventoryItems(items);else setEnderItems(items)
    setAdvancedNotice(action==='player-inventory'?'Oyuncu envanteri canlı sunucudan okundu.':'Oyuncu Ender Chest içeriği canlı sunucudan okundu.')
  }




  async function act(action:'message'|'kick'|'whitelist-add'|'whitelist-remove'|'op'|'deop'|'ban'|'unban'){
    if(!current)return
    if(action==='message'){if(!message.trim()){setNotice('Gönderilecek mesajı yazın.');return};const ok=await post(action,{playerName:current.playerName,message:message.trim()});if(ok)setMessage('');return}
    if(action==='kick'){
      const ok=await actionConfirm.ask(`${current.playerName} sunucudan çıkarılacak.`,{title:'Oyuncuyu çıkar',confirmLabel:'Kick',danger:true});if(!ok)return
    }
    if(action==='ban'){
      const ok=await actionConfirm.ask(`${current.playerName} oyuncusu yasaklanacak. Devam etmek için oyuncu adını yazın.`,{title:'Oyuncuyu yasakla',confirmLabel:'Ban',danger:true,requiredText:current.playerName});if(!ok)return
    }
    if(action==='unban'){
      const ok=await actionConfirm.ask(`${current.playerName} oyuncusunun yasağı kaldırılacak.`,{title:'Yasağı kaldır',confirmLabel:'Unban'});if(!ok)return
    }
    await post(action,{playerName:current.playerName,reason:reason.trim()||undefined})
  }




  return <div className="space-y-5">
    <div className="rounded-2xl border border-cyan-400/15 bg-[linear-gradient(120deg,rgba(7,31,50,.82),rgba(3,15,27,.88))] p-5 shadow-[0_16px_48px_rgba(0,0,0,.18)] backdrop-blur-xl flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div><div className="flex items-center gap-2"><div className="grid size-10 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[.07]"><Users className="size-5 text-cyan-300"/></div><h2 className="text-[24px] font-bold tracking-[-.025em] text-white">Oyuncular</h2></div><p className="mt-1 text-sm text-slate-500">Canlı oyuncu durumunu, yetkileri, whitelist/ban kayıtlarını ve kalıcı oyuncu geçmişini tek merkezden yönetin.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${data?.nodeOnline===false?'border-amber-400/20 bg-amber-400/10 text-amber-200':'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}><span className={`size-1.5 rounded-full ${data?.nodeOnline===false?'bg-amber-300':'bg-emerald-300'}`}/>{data?.nodeOnline===false?'Node çevrimdışı':'Node bağlı'}</span><Button variant="outline" disabled={!!busy||data?.nodeOnline===false} onClick={()=>void refresh()}><RefreshCw className={`mr-2 size-4 ${busy==='refresh'?'animate-spin':''}`}/>Sunucudan yenile</Button></div>
    </div>




    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={<Users className="size-4"/>} label="Çevrimiçi" value={`${data?.summary.online??0}${actualMax?` / ${actualMax}`:''}`} sub={running?'Canlı oturumlar':'Sunucu kapalı'} accent/>
      <Stat icon={<UserCheck className="size-4"/>} label="Kayıtlı oyuncular" value={String(data?.summary.total??0)} sub="Sunucuda daha önce görülen oyuncular"/>
      <Stat icon={<ShieldCheck className="size-4"/>} label="Whitelist" value={actualWhitelist===null?'Bilinmiyor':actualWhitelist?'Aktif':'Kapalı'} sub={`${data?.summary.whitelisted??0} oyuncu listede`} good={actualWhitelist===true}/>
      <Stat icon={<Ban className="size-4"/>} label="Yasaklı" value={String(data?.summary.banned??0)} sub={antiCheatEventCount===null||antiCheatEventCount===undefined?'Moderasyon kayıtlarından':`${antiCheatEventCount} anti-hile olayı`} danger={(data?.summary.banned??0)>0}/>
    </div>




    {(error||data?.runtimeError||notice)&&<div className={`rounded-xl border px-4 py-3 text-sm ${error||data?.runtimeError?'border-amber-400/20 bg-amber-400/[.05] text-amber-200':'border-cyan-400/20 bg-cyan-400/[.05] text-cyan-100'}`} role="status">{notice||error?.message||data?.runtimeError}</div>}




    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.75fr)]">
      <section className="overflow-hidden rounded-2xl border border-cyan-400/15 bg-[linear-gradient(145deg,rgba(7,26,43,.90),rgba(3,15,27,.92))] shadow-[0_16px_44px_rgba(0,0,0,.18)] backdrop-blur-xl">
        <div className="border-b border-cyan-400/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex rounded-xl border border-cyan-400/10 bg-black/20 p-1">{([['all','Tümü'],['online','Çevrimiçi'],['offline','Çevrimdışı'],['staff','OP'],['banned','Banlı']] as const).map(([key,label])=><button key={key} onClick={()=>setFilter(key)} className={`rounded-md px-3 py-1.5 text-xs transition ${filter===key?'bg-cyan-400 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,.16)]':'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}>{label}</button>)}</div>
            <div className="relative min-w-[250px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"/><Input className="pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Oyuncu adı veya UUID ara..."/></div>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">{data?.summary.lastSyncAt?`Son senkron: ${new Date(data.summary.lastSyncAt).toLocaleString('tr-TR')}`:'Kalıcı oyuncu verisi henüz senkronlanmadı.'}</p>
        </div>
        <div className="divide-y divide-cyan-400/[.07]">
          {isLoading&&!players.length?<Empty text="Oyuncu verileri yükleniyor..."/>:visible.length?visible.map(player=><button key={player.id} onClick={()=>setSelected(player.playerName)} className={`grid w-full gap-3 p-4 text-left transition lg:grid-cols-[minmax(220px,1.25fr)_minmax(130px,.7fr)_minmax(160px,.8fr)_auto] lg:items-center ${selected===player.playerName?'bg-cyan-400/[.065] shadow-[inset_3px_0_0_#22d3ee]':'hover:bg-white/[.025]'}`}>
            <div className="flex min-w-0 items-center gap-3"><Avatar name={player.playerName} online={player.isOnline}/><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-white">{player.playerName}</p>{player.isOnline&&<Badge tone="green">Çevrimiçi</Badge>}{player.isOp&&<Badge tone="purple">OP</Badge>}{player.banned&&<Badge tone="red">Banlı</Badge>}</div><p className="mt-1 truncate font-mono text-[10px] text-slate-600">{player.playerUuid||'UUID henüz doğrulanmadı'}</p></div></div>
            <div><p className="text-[9px] uppercase tracking-wider text-slate-600">Son görülme</p><p className="mt-1 text-xs text-slate-300">{player.isOnline?'Şimdi':formatDate(player.lastSeenAt)}</p></div>
            <div><p className="text-[9px] uppercase tracking-wider text-slate-600">Oynama süresi</p><p className="mt-1 text-xs text-slate-300">{formatDuration(player.totalPlaySeconds)}</p></div>
            <div className="flex justify-end"><span className={`size-2 rounded-full ${player.isOnline?'bg-emerald-400 shadow-[0_0_10px_#34d399]':'bg-slate-700'}`}/></div>
          </button>):<Empty text={filter==='online'&&(data?.summary.online??0)>0?'Minecraft oyuncu sayısını bildirdi ancak agent isimleri doğrulayamadı. Konsol bağlantısını kontrol edip yenileyin.':players.length?'Arama veya filtreye uygun oyuncu yok.':'Henüz oyuncu kaydı yok. Sunucudan yenileyerek mevcut usercache/whitelist/ban kayıtlarını içe aktarabilirsiniz.'}/>}
        </div>
      </section>




      <aside className="min-w-0">
        {current?<div className="sticky top-[88px] overflow-hidden rounded-2xl border border-cyan-400/15 bg-[linear-gradient(145deg,rgba(7,26,43,.94),rgba(3,15,27,.95))] shadow-[0_18px_55px_rgba(0,0,0,.25)] backdrop-blur-xl">
          <div className="border-b border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.10] via-transparent to-blue-500/[.05] p-5"><div className="flex items-start gap-4"><Avatar name={current.playerName} online={current.isOnline} large/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xl font-bold text-white">{current.playerName}</h3>{current.isOnline?<Badge tone="green">Çevrimiçi</Badge>:<Badge tone="gray">Çevrimdışı</Badge>}</div><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{current.playerUuid||'UUID doğrulanmadı'}</p><div className="mt-3 flex flex-wrap gap-1.5">{current.isOp&&<Badge tone="purple">OP yetkili</Badge>}{current.whitelisted&&<Badge tone="blue">Whitelist</Badge>}{current.banned&&<Badge tone="red">Yasaklı</Badge>}</div></div></div></div>
          <div className="grid grid-cols-2 gap-px bg-white/[.06]"><Detail label="İlk görülme" value={formatDate(current.firstSeenAt)}/><Detail label="Son görülme" value={current.isOnline?'Şimdi':formatDate(current.lastSeenAt)}/><Detail label="Son giriş" value={formatDate(current.lastJoinAt)}/><Detail label="Toplam süre" value={formatDuration(current.totalPlaySeconds)}/></div>
          <div className="m-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[.035] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-cyan-100">Gelişmiş oyuncu detayları</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Agent’ın doğrulanmış oyuncu snapshotı ve sunucu günlük geçmişi.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!advancedBusy||data?.nodeOnline===false} onClick={()=>void loadRuntimeDetail()}><UserCog className="mr-2 size-3.5"/>{advancedBusy==='player-details'?'Alınıyor…':'Canlı detay'}</Button><Button size="sm" variant="outline" disabled={!!advancedBusy||data?.nodeOnline===false||!running||!current.isOnline} onClick={()=>void loadStorage('player-inventory')}><Archive className="mr-2 size-3.5"/>{advancedBusy==='player-inventory'?'Alınıyor…':'Envanter'}</Button><Button size="sm" variant="outline" disabled={!!advancedBusy||data?.nodeOnline===false||!running||!current.isOnline} onClick={()=>void loadStorage('player-enderchest')}><Archive className="mr-2 size-3.5"/>{advancedBusy==='player-enderchest'?'Alınıyor…':'Ender Chest'}</Button><Button size="sm" variant="outline" disabled={!!advancedBusy||data?.nodeOnline===false} onClick={()=>void loadHistory()}><FileText className="mr-2 size-3.5"/>{advancedBusy==='player-history'?'Alınıyor…':'Geçmiş'}</Button></div></div>
            {advancedNotice&&<p className="mt-3 rounded-lg border border-white/[.06] bg-black/15 px-3 py-2 text-[11px] text-slate-300">{advancedNotice}</p>}
            {runtimeDetail&&<div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><AdvancedValue label="OP seviyesi" value={runtimeDetail.opLevel==null?'—':String(runtimeDetail.opLevel)}/><AdvancedValue label="Player limit bypass" value={runtimeDetail.bypassesPlayerLimit===true?'Evet':runtimeDetail.bypassesPlayerLimit===false?'Hayır':'—'}/><AdvancedValue label="Ban kaynağı" value={String(runtimeDetail.banSource??'—')}/><AdvancedValue label="Online doğrulama" value={runtimeDetail.onlineVerified===true?'Doğrulandı':runtimeDetail.onlineVerified===false?'Doğrulanamadı':'—'}/><AdvancedValue label="Online kaynağı" value={String(runtimeDetail.onlineSource??'—')}/><AdvancedValue label="Agent senkronu" value={runtimeDetail.syncedAt?formatDate(String(runtimeDetail.syncedAt)):'—'}/></div>}
            {inventoryItems!==null&&<PlayerStorageList title="Envanter" items={inventoryItems}/>}
            {enderItems!==null&&<PlayerStorageList title="Ender Chest" items={enderItems}/>}
            {!!historyLines.length&&<details className="mt-3 rounded-lg border border-white/[.06] bg-black/15 p-3"><summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Son {historyLines.length} ilgili günlük satırı</summary><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-slate-500">{historyLines.join('\n')}</pre></details>}
            <p className="mt-3 text-[10px] leading-4 text-slate-600">Envanter ve Ender Chest yalnız sunucu çalışırken ve seçili oyuncu çevrimiçiyken Minecraft canlı verisinden okunur; çevrimdışı oyuncu için uydurma veri gösterilmez.</p>
          </div>




          {current.banned&&<div className="m-4 rounded-xl border border-red-400/20 bg-red-400/[.06] p-3"><p className="text-xs font-semibold text-red-200">Ban kaydı</p><p className="mt-1 text-xs leading-5 text-red-100/70">{current.banReason||'Sebep kaydedilmemiş.'}</p>{current.banExpiresAt&&<p className="mt-1 text-[10px] text-red-300/60">Bitiş: {formatDate(current.banExpiresAt)}</p>}</div>}
          <div className="space-y-3 p-4">
            <div><label className="mb-1.5 block text-[11px] font-medium text-slate-400">Oyuncuya mesaj</label><div className="flex gap-2"><Input value={message} onChange={e=>setMessage(e.target.value)} maxLength={256} placeholder="Mesaj yaz..." disabled={!running||!effectiveCanManage}/><Button size="icon" title="Mesaj gönder" disabled={!running||!effectiveCanManage||!message.trim()||!!busy} onClick={()=>void act('message')}><MessageSquare className="size-4"/></Button></div></div>
            <div><label className="mb-1.5 block text-[11px] font-medium text-slate-400">Moderasyon sebebi <span className="text-slate-600">(isteğe bağlı)</span></label><Input value={reason} onChange={e=>setReason(e.target.value)} maxLength={160} placeholder="Kick / ban sebebi" disabled={!effectiveCanManage}/></div>
            <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={!running||!effectiveCanManage||!!busy} onClick={()=>void act(current.whitelisted?'whitelist-remove':'whitelist-add')}>{current.whitelisted?<UserMinus className="mr-2 size-4"/>:<UserCheck className="mr-2 size-4"/>}{current.whitelisted?'Whitelist çıkar':'Whitelist ekle'}</Button><Button variant="outline" disabled={!running||!effectiveCanManage||!!busy} onClick={()=>void act(current.isOp?'deop':'op')}>{current.isOp?<UserMinus className="mr-2 size-4"/>:<Crown className="mr-2 size-4"/>}{current.isOp?'OP kaldır':'OP ver'}</Button><Button variant="outline" className="text-amber-200" disabled={!running||!effectiveCanManage||!current.isOnline||!!busy} onClick={()=>void act('kick')}><UserX className="mr-2 size-4"/>Kick</Button><Button variant="outline" className={current.banned?'text-emerald-300':'text-red-300'} disabled={!running||!effectiveCanManage||!!busy} onClick={()=>void act(current.banned?'unban':'ban')}><Ban className="mr-2 size-4"/>{current.banned?'Unban':'Ban'}</Button></div>
            {!running&&<p className="rounded-lg border border-amber-400/15 bg-amber-400/[.05] p-2.5 text-[11px] leading-5 text-amber-200">Canlı Minecraft komutları için sunucunun çalışıyor olması gerekir. Kayıtlı oyuncu geçmişi sunucu kapalıyken de görüntülenebilir.</p>}
          </div>
        </div>:<div className="rounded-2xl border border-dashed border-cyan-400/15 bg-[#061522]/80 p-8 text-center text-sm text-slate-500">Detaylarını görmek için bir oyuncu seçin.</div>}
      </aside>
    </div>




    {current&&<ServerPlayerModeration serverId={serverId} playerNames={players.map(player=>player.playerName)} canManage={effectiveCanManage} selectedPlayer={current.playerName} hideSelector/>}
  </div>
}




function Avatar({name,online,large=false}:{name:string;online:boolean;large?:boolean}){return <div className={`relative grid shrink-0 place-items-center rounded-xl border border-cyan-400/15 bg-gradient-to-br from-sky-500/20 to-cyan-500/[.07] font-bold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] ${large?'size-14 text-lg':'size-11 text-sm'}`}>{name.slice(0,2).toUpperCase()}<span className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#061522] ${large?'size-3.5':'size-3'} ${online?'bg-emerald-400 shadow-[0_0_9px_#34d399]':'bg-slate-600'}`}/></div>}
function Badge({children,tone}:{children:React.ReactNode;tone:'green'|'purple'|'red'|'blue'|'gray'}){const cls={green:'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',purple:'border-violet-400/20 bg-violet-400/10 text-violet-300',red:'border-red-400/20 bg-red-400/10 text-red-300',blue:'border-sky-400/20 bg-sky-400/10 text-sky-300',gray:'border-white/10 bg-white/[.04] text-slate-400'}[tone];return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{children}</span>}
function Stat({icon,label,value,sub,accent,good,danger}:{icon:React.ReactNode;label:string;value:string;sub:string;accent?:boolean;good?:boolean;danger?:boolean}){const tone=danger?'text-red-300':accent||good?'text-cyan-300':'text-slate-500';return <div className="rounded-2xl border border-cyan-400/15 bg-[linear-gradient(145deg,rgba(7,26,43,.88),rgba(3,15,27,.90))] p-4 shadow-[0_12px_32px_rgba(0,0,0,.16)]"><div className={`flex items-center gap-2 text-[10px] font-medium uppercase tracking-[.12em] ${tone}`}>{icon}<span>{label}</span></div><p className="mt-2 text-[22px] font-semibold tracking-[-.025em] text-white">{value}</p><p className="mt-1 truncate text-[10px] text-slate-600">{sub}</p></div>}
function Detail({label,value}:{label:string;value:string}){return <div className="bg-[#081421] p-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 text-xs font-medium text-slate-300">{value}</p></div>}
function AdvancedValue({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-white/[.05] bg-black/10 p-2.5"><p className="text-[9px] uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 break-words text-[11px] font-medium text-slate-300">{value}</p></div>}
function PlayerStorageList({title,items}:{title:string;items:Array<Record<string,unknown>>}){return <details open className="mt-3 rounded-lg border border-white/[.06] bg-black/15 p-3"><summary className="cursor-pointer text-[11px] font-semibold text-slate-200">{title} · {items.length} stack</summary>{items.length?<div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((item,index)=><div key={`${String(item.slot??'x')}-${String(item.itemId??index)}-${index}`} className="rounded-md border border-white/[.05] bg-black/15 p-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[10px] text-cyan-200">{String(item.itemId??'Bilinmeyen eşya')}</span><span className="text-[10px] text-slate-400">×{String(item.amount??1)}</span></div><p className="mt-1 text-[9px] text-slate-600">Slot {item.slot==null?'—':String(item.slot)}</p></div>)}</div>:<p className="mt-3 text-[11px] text-slate-500">Bu alan boş.</p>}</details>}
function Empty({text}:{text:string}){return <div className="p-10 text-center"><Users className="mx-auto size-7 text-slate-700"/><p className="mx-auto mt-3 max-w-lg text-xs leading-5 text-slate-500">{text}</p></div>}
function formatDate(value?:string|null){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('tr-TR')}
function formatDuration(total:number){const seconds=Math.max(0,Math.floor(Number(total)||0));const days=Math.floor(seconds/86400);const hours=Math.floor((seconds%86400)/3600);const minutes=Math.floor((seconds%3600)/60);if(days)return `${days} gün ${hours} sa`;if(hours)return `${hours} sa ${minutes} dk`;if(minutes)return `${minutes} dk`;return `${seconds} sn`}