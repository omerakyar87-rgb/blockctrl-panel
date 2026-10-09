'use client'








import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  Activity, AlertTriangle, ArrowLeft, Ban, Box, CheckCircle2, Clock3, Copy, Cpu,
  Database, Download, FileText, Folder, Globe2, HardDrive, Info, KeyRound,
  LifeBuoy, MoreHorizontal, Network, Package, Pencil, Play, Plus, RefreshCw, RotateCcw, Search, Send,
  Server as ServerIcon, Settings2, Shield, ShieldCheck, Signal, Square, Terminal, Trash2, Users, Wifi, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServerFilesManager } from '@/components/server-files-manager'
import { ServerSettingsCenter } from '@/components/server-settings-center'
import { ServerBulkDownload } from '@/components/server-bulk-download'
import { ServerFeatureActions } from '@/components/server-feature-actions'
import { ServerPlayersCenter } from '@/components/server-players-center'
import { ServerSftpManager } from '@/components/server-sftp-manager'
import { ServerContentManager } from '@/components/server-content-manager'
import { ServerSecurityCenter } from '@/components/server-security-center'
import { ServerWorldCenter } from '@/components/server-world-center'
import { ServerIntegrationsCenter } from '@/components/server-integrations-center'
import { SupportCenter } from '@/components/support-center'
import { useActionConfirm } from '@/components/action-confirm-dialog'
import { SERVER_NAV, ServerDetailNavigation, type ServerNavKey } from '@/components/server-detail-navigation'
import { ServerDetailHeader } from '@/components/server-detail-header'
import { ServerAccessSection } from '@/components/server-access-section'
import { ServerDetailFooter } from '@/components/server-detail-footer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'








const MAX_DIRECT_UPLOAD = 2 * 1024 * 1024 * 1024








type Server = {
  id:string; name:string; nodeId?:string; loader:string; mcVersion:string; loaderVersion?:string|null;
  status:string; port:number; memoryMb:number; playerCount:number; installProgress:number;
  installError?:string|null; worldName?:string; publicHost?:string; connectionAddress?:string; itemTrackingEnabled?:boolean
  directBridge?:{online:boolean;error?:string;status?:number}; connectivity?:{heartbeatOnline:boolean;directOnline:boolean;directError?:string|null;label:string}
}
type NodeInfo = { id:string; name:string; status:string; lastHeartbeat:string|null; cpuPercent:number; memoryUsedMb:number; memoryTotalMb:number; diskUsedGb:number; diskTotalGb:number }
type LogRow = { id:number; serverId:string; stream:'stdout'|'stderr'|string; line:string; createdAt:string }
type WorldRow = { id:string; serverId:string; name:string; isActive:boolean; sizeMb:number; seed?:string|null; lastBackupAt?:string|null }
type Permission = { userId:string; serverId:string; canStart:boolean; canStop:boolean; canRestart:boolean; canConsole:boolean; canFiles:boolean; canBackup:boolean; canReset:boolean; canViewLostItems:boolean; canManageLostItems:boolean; sections?:string[] }
type Member = { id:string; name:string; email:string; role:string; approved:boolean }
type Operation = { id:number; serverId:string; operation:string; status:string; message?:string|null; createdAt:string }
type LostItemRow = { id:string; serverId:string; playerUuid?:string|null; playerName?:string|null; itemId:string; itemName:string; amount:number; reason:string; world:string; x:number; y:number; z:number; status?:string|null; restoreCommandId?:string|null; restoreRequestedAt?:string|null; restoredAt?:string|null; restoredByUserId?:string|null; restoredByName?:string|null; restoreError?:string|null; occurredAt:string }
type Panel = { servers:Server[]; nodes:NodeInfo[]; logs:LogRow[]; worlds:WorldRow[]; users:Member[]; permissions:Permission[]; currentPermission?:Permission|null; allowedSections?:string[]; serverAccess?:{isOwner:boolean;isManager:boolean;fullAccess:boolean}; operations:Operation[]; lostItems?:LostItemRow[]; schedules?:ScheduleRow[]; databases?:ManagedDatabaseRow[]; sftp?:SftpRow|null; actor?:{id:string;name:string;email:string;role:string} }
type BackupRow = { id:string; worldId:string|null; worldName:string|null; blobPathname:string; sizeMb:number; createdAt:string; status?:'queued'|'running'|'completed'|'failed'; progress?:number; source?:string; type?:string; restorable?:boolean }
type ScheduleRow = { id:string; serverId:string; name:string; taskType:'restart'|'backup'|'log-cleanup'; cadence:'daily'|'weekly'|'interval'; timeOfDay?:string|null; weekday?:number|null; intervalMinutes?:number|null; timezoneOffsetMinutes:number; enabled:boolean; payload?:{retentionDays?:number}; lastRunAt?:string|null; nextRunAt:string; createdAt:string }
type ManagedDatabaseRow = { id:string; serverId:string; engine:string; databaseName:string; databaseUser:string; host:string; port:number; credentialsPath?:string|null; status:string; lastError?:string|null; createdAt:string; telemetry?:{version?:string;tls?:{available?:boolean;required?:boolean;cipher?:string|null};slowQuery?:{enabled?:boolean;longQueryTime?:number;slowQueries?:number;logOutput?:string|null};connections?:number;uptimeSeconds?:number;backups?:Array<{filename:string;sizeBytes:number;modifiedAt:string}>;checkedAt?:string}|null; lastBackup?:{filename?:string;sizeBytes?:number;createdAt?:string;downloadUrl?:string;downloadToken?:string;expiresAt?:string}|null; lastMaintenance?:{id:string;type:string;status:string;result?:Record<string,unknown>|null;createdAt:string}|null }
type SftpRow = { username:string; port:number; rootPath:string; status:string; lastError?:string|null; lastTestAt?:string|null; passwordRotatedAt?:string|null; disabledAt?:string|null; createdAt?:string|null; updatedAt?:string|null }
type SettingsSnapshot = { settings:Record<string,unknown>; canEdit:boolean; liveSync:boolean; liveSyncError?:string|null; nodeOnline:boolean; pendingApply?:boolean; runtime?:{itemTrackingEnabled:boolean;itemTrackingMode:string|null;trackerAdapter:string|null;trackerWarning:string|null;trackerAuth:boolean;controlChannelReady:boolean;pid:number|null}|null }
type SecurityEvent = { id?:string; severity?:string; source?:string; event?:string; status?:string; createdAt?:string; details?:Record<string,unknown> }
type SecuritySnapshot = { summary?:{score:number|null;activeThreats:number;lastScanAt:string|null}; modules?:Array<{key:string;status:string;enabled?:boolean;detail?:string}>; policies?:{active:string|null}; snapshot?:Record<string,any>|null; events?:SecurityEvent[] }
type ServerMetric = { id:number; serverId:string; cpuPercent:number; memoryUsedMb:number; memoryTotalMb:number; diskUsedGb:number; diskTotalGb:number; tps:number|null; mspt:number|null; players:number; uptimeSeconds:number; createdAt:string }
type MetricsData = { metrics:ServerMetric[] }
type PlayersOverviewData = { summary?: { online?: number; maxPlayers?: number|null }; nodeOnline?: boolean; runtimeSynced?: boolean; runtimeError?: string|null }
type LostItemsData = { items:LostItemRow[]; trackingEnabled:boolean; diagnostics?:{state:string;message:string;runtimeEnabled?:boolean;mode?:string|null;adapter?:unknown;runtimeError?:string|null} }
type AgentConsoleEvent = { at:string; level:'info'|'warn'|'error'; message:string; serverId:string|null }
type AgentActionRow = { id:number; type:string; status:string; createdAt:string; result?:Record<string,unknown>|null }
type AgentActionsData = { actions:AgentActionRow[] }
type NetworkDiagnostics = {checkedAt:string;requested:{host:string;port:number};dns:Array<{address:string;family:number}>;srv:Array<{name:string;port:number;priority:number;weight:number}>;effectiveTarget:{host:string;port:number;viaSrv:boolean};tcp:{reachable:boolean;latencyMs:number|null;error:string|null};oracleNsg:{status:string;configured?:boolean;writeEnabled?:boolean;portAllowed?:boolean|null;ingressRules?:number;matchingRules?:Array<{id?:string|null;source?:string|null;description?:string|null}>;requestId?:string|null;nsg?:string;detail:string}}
type ConsoleDiagnostics = {
  at:string
  events:AgentConsoleEvent[]
  startup:{stdout:string[];stderr:string[]}
  node:{hostname:string;agentPid:number;nodeVersion:string;agentUptimeSeconds:number;systemUptimeSeconds:number;cpuCount:number;loadAverage:number[];memoryUsedMb:number;memoryTotalMb:number;diskUsedGb:number|null;diskTotalGb:number|null}
  server:{running:boolean;pid:number|null;controlChannelReady:boolean;process:{name:string|null;state:string|null;vmRss:string|null;vmSize:string|null;threads:number|null}|null;openFileDescriptors:number|null;stdoutBytes:number;stderrBytes:number;loader:string;version:string;memoryMb:number|null;trackingMode:string;javaRuntime:{binary:string;version:string|null;vendor:string|null;home:string|null;runtimeName:string|null;error:string|null}|null}
}
















async function readJson(response:Response){
  const text = await response.text()
  try { return text ? JSON.parse(text) : {} }
  catch { throw new Error(response.ok ? 'Sunucudan geçersiz yanıt alındı' : `Sunucu hatası (${response.status}): ${text.slice(0,180)}`) }
}
const fetcher=(url:string)=>fetch(url,{cache:'no-store',headers:{accept:'application/json'}}).then(async r=>{const d=await readJson(r);if(!r.ok){const error=new Error(d.error??'İstek başarısız') as Error&{status?:number};error.status=r.status;throw error}return d})
function visiblePoll(ms:number){return ()=>typeof document!=='undefined'&&document.visibilityState==='hidden'?0:ms}








async function directUploadFile(serverId:string,file:File,category:string,onProgress?:(percent:number)=>void){
  const started=await fetch('/api/direct-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start',serverId,filename:file.name,size:file.size,category})})
  const s=await readJson(started) as {error?:string;uploadId?:string;commandId?:string;chunkSize?:number}
  if(!started.ok||!s.uploadId||!s.commandId||!s.chunkSize) throw new Error(s.error??`Yükleme başlatılamadı (${started.status})`)
  const uploadId=s.uploadId; const commandId=s.commandId; const chunkSize=s.chunkSize
  const total=Math.ceil(file.size/chunkSize)
  const statusResponse=await fetch(`/api/direct-upload?commandId=${encodeURIComponent(commandId)}&uploadId=${encodeURIComponent(uploadId)}`,{cache:'no-store'}); const statusData=await readJson(statusResponse) as {receivedParts?:number[];receivedBytes?:number}; const received=new Set(statusData.receivedParts??[])
  let uploadedBytes=Number(statusData.receivedBytes??0); let nextPart=0; const concurrency=4; onProgress?.(Math.round(uploadedBytes/file.size*100))
  const uploadPart=async(part:number)=>{const chunk=file.slice(part*chunkSize,Math.min(file.size,(part+1)*chunkSize));let last='';for(let attempt=0;attempt<5;attempt++){try{const r=await fetch(`/api/direct-upload?commandId=${encodeURIComponent(commandId)}&uploadId=${encodeURIComponent(uploadId)}&part=${part}`,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:chunk});const d=await readJson(r);if(!r.ok)throw new Error(d.error??`Parça ${part+1} yüklenemedi`);last='';break}catch(error){last=error instanceof Error?error.message:'Parça yüklenemedi';if(attempt<4)await new Promise(resolve=>setTimeout(resolve,500*2**attempt))}}if(last)throw new Error(last);uploadedBytes+=chunk.size;onProgress?.(Math.round(uploadedBytes/file.size*100))}
  const worker=async()=>{while(true){const part=nextPart++;if(part>=total)return;if(received.has(part))continue;await uploadPart(part)}}
  await Promise.all(Array.from({length:Math.min(concurrency,total)},()=>worker()))
  const done=await fetch('/api/direct-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete',commandId,uploadId})})
  const result=await readJson(done); if(!done.ok)throw new Error(result.error??'Yükleme tamamlanamadı'); return result
}








export default function ServerPage(){
  const {id}=useParams<{id:string}>(); const router=useRouter(); const searchParams=useSearchParams()
  const {data,error,mutate}=useSWR<Panel>(`/api/panel?serverId=${id}`,fetcher,{refreshInterval:visiblePoll(5000),revalidateOnFocus:true})
  useEffect(()=>{if((error as (Error&{status?:number})|undefined)?.status===401)router.replace(`/sign-in?next=${encodeURIComponent(`/servers/${id}`)}`)},[error,id,router])
  const server=data?.servers.find(s=>s.id===id); const node=data?.nodes?.find(n=>n.id===server?.nodeId)
  const manager=data?.serverAccess?.isManager===true; const fullAccess=data?.serverAccess?.fullAccess===true; const permission=data?.currentPermission??undefined
  const allowedSections=useMemo(()=>data?.allowedSections??(fullAccess?SERVER_NAV.map(([key])=>key):[]),[data?.allowedSections,fullAccess])
  const visibleNav=useMemo(()=>SERVER_NAV.filter(([key])=>{if(key==='support')return true;if(key==='lost-items')return fullAccess||data?.serverAccess?.isOwner===true||!!permission?.canViewLostItems||!!permission?.canManageLostItems;if(key==='sftp')return manager;if(key==='security'||key==='access')return fullAccess||allowedSections.includes(key);if(key==='bulk-download')return fullAccess||allowedSections.includes('files');return fullAccess||allowedSections.includes(key)}),[allowedSections,data?.serverAccess?.isOwner,fullAccess,manager,permission?.canManageLostItems,permission?.canViewLostItems])
  const {data:backupData,error:backupError,mutate:mutateBackups}=useSWR<{backups:BackupRow[]}>(allowedSections.includes('backups')?`/api/backups?serverId=${id}`:null,fetcher,{refreshInterval:visiblePoll(7000),revalidateOnFocus:true})
  const {data:settingsSnapshot}=useSWR<SettingsSnapshot>(`/api/panel-settings?serverId=${id}`,fetcher,{refreshInterval:visiblePoll(15000),revalidateOnFocus:true})
  const {data:securitySnapshot}=useSWR<SecuritySnapshot>((fullAccess||allowedSections.includes('security'))?`/api/security?serverId=${id}`:null,fetcher,{refreshInterval:visiblePoll(20000),revalidateOnFocus:true})
  const canReadMetrics=fullAccess||allowedSections.includes('overview')||allowedSections.includes('players')||allowedSections.includes('console')
  const {data:metricsData}=useSWR<MetricsData>(canReadMetrics?`/api/metrics?serverId=${id}&limit=240`:null,fetcher,{refreshInterval:15000})
  const {data:playersOverview}=useSWR<PlayersOverviewData>(canReadMetrics?`/api/players?serverId=${id}`:null,fetcher,{refreshInterval:5000,revalidateOnFocus:true})
  
  const [section,setSection]=useState<ServerNavKey>('overview'); const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('')
  const {data:lostItemsData,mutate:mutateLostItems}=useSWR<LostItemsData>(section==='lost-items'?`/api/lost-items?serverId=${id}`:null,fetcher,{refreshInterval:7000,revalidateOnFocus:true})
  const actionConfirm=useActionConfirm()
  const [settingsTab,setSettingsTab]=useState<'general'|'security'|'performance'|'anticheat'|'backup'>('general'); const [selectedUserId,setSelectedUserId]=useState('')
  const [uiSecurity,setUiSecurity]=useState({startupScan:true,bruteForce:true,commandLog:true,fileFilter:true,proxyControl:true,movement:true,reach:true,speed:true,xray:true,crashRecovery:true,performanceMonitor:true,autoCleanup:true})
  const [motd,setMotd]=useState('BlockCtrl sunucusu'); const [maxPlayers,setMaxPlayers]=useState('20'); const [onlineMode,setOnlineMode]=useState(false); const [gamemode,setGamemode]=useState('survival'); const [difficulty,setDifficulty]=useState('easy'); const [pvp,setPvp]=useState(true); const [viewDistance,setViewDistance]=useState('10'); const [simulationDistance,setSimulationDistance]=useState('10'); const [spawnProtection,setSpawnProtection]=useState('16'); const [allowFlight,setAllowFlight]=useState(false); const [whitelist,setWhitelist]=useState(false)
  const [playerName,setPlayerName]=useState(''); const [consoleLevel,setConsoleLevel]=useState('all'); const [consoleQuery,setConsoleQuery]=useState(''); const [consoleClearAt,setConsoleClearAt]=useState(0); const [consoleTab,setConsoleTab]=useState<'server'|'agent'|'system'>('server'); const [consolePauseAt,setConsolePauseAt]=useState<number|null>(null); const [consoleWrap,setConsoleWrap]=useState(true); const [consoleAutoScroll,setConsoleAutoScroll]=useState(true); const [consoleTimestamps,setConsoleTimestamps]=useState(true); const [consoleHistory,setConsoleHistory]=useState<string[]>([]); const [consoleHistoryIndex,setConsoleHistoryIndex]=useState(-1); const [logTab,setLogTab]=useState<'server'|'error'|'crash'>('server'); const [logLevel,setLogLevel]=useState('all'); const [logQuery,setLogQuery]=useState(''); const [logWindow,setLogWindow]=useState<'all'|'24h'|'7d'>('all'); const [userQuery,setUserQuery]=useState(''); const [newPort,setNewPort]=useState(''); const [worldName,setWorldName]=useState('world_2'); const [softwareLoader,setSoftwareLoader]=useState('paper'); const [softwareVersion,setSoftwareVersion]=useState('1.21.1'); const [softwareLoaderVersion,setSoftwareLoaderVersion]=useState(''); const [consoleLine,setConsoleLine]=useState('')
  const [scheduleName,setScheduleName]=useState('Gece yeniden başlat'); const [scheduleTask,setScheduleTask]=useState<'restart'|'backup'|'log-cleanup'>('restart'); const [scheduleCadence,setScheduleCadence]=useState<'daily'|'weekly'|'interval'>('daily'); const [scheduleTime,setScheduleTime]=useState('04:00'); const [scheduleWeekday,setScheduleWeekday]=useState('0'); const [scheduleInterval,setScheduleInterval]=useState('60'); const [retentionDays,setRetentionDays]=useState('30')
  const [databaseName,setDatabaseName]=useState('minecraft'); const [databaseUser,setDatabaseUser]=useState('mc_user')
  const [lostQuery,setLostQuery]=useState(''); const [lostReason,setLostReason]=useState('all'); const [lostRange,setLostRange]=useState<'24h'|'7d'|'30d'|'all'>('7d'); const [selectedLostItemId,setSelectedLostItemId]=useState<string|null>(null); const [lostPage,setLostPage]=useState(1)
  const [networkDiagnostics,setNetworkDiagnostics]=useState<NetworkDiagnostics|null>(null)
  const [ociCidr,setOciCidr]=useState('0.0.0.0/0')
  const consoleViewportRef=useRef<HTMLDivElement|null>(null)
  const {data:consoleDiagnostics,error:consoleDiagnosticsError,mutate:mutateConsoleDiagnostics}=useSWR<ConsoleDiagnostics>((section==='console'||section==='software')?`/api/console-diagnostics?serverId=${id}`:null,fetcher,{refreshInterval:()=>typeof document!=='undefined'&&document.visibilityState==='hidden'?0:section==='console'?(consolePauseAt?0:5000):20000,revalidateOnFocus:true})
  const {data:consoleActions,mutate:mutateConsoleActions}=useSWR<AgentActionsData>((section==='console'||section==='logs')?`/api/server-actions?serverId=${id}`:null,fetcher,{refreshInterval:()=>typeof document!=='undefined'&&document.visibilityState==='hidden'?0:section==='console'&&consolePauseAt?0:7000,revalidateOnFocus:true})
  const logs=useMemo(()=>data?.logs?.filter(l=>l.serverId===id).slice(-150)??[],[data,id])
  const errorCount=useMemo(()=>logs.filter(row=>/\bERROR\b|Exception|failed|fatal/i.test(row.line)).length,[logs])
  const activeSchedules=(data?.schedules??[]).filter(s=>s.enabled).length; const activeBackupSchedules=(data?.schedules??[]).filter(s=>s.enabled&&s.taskType==='backup').length; const detectedScheduledBackups=(backupData?.backups??[]).filter(b=>b.type==='scheduled'||/scheduled|otomatik/i.test(`${b.blobPathname} ${b.type??''}`)).length; const backupAutomationLabel=activeBackupSchedules>0?'Aktif':detectedScheduledBackups>0?'Harici':'Kapalı'
  const canStart=!!manager||!!permission?.canStart; const canStop=!!manager||!!permission?.canStop; const canRestart=!!manager||!!permission?.canRestart; const canConsole=!!manager||!!permission?.canConsole; const canFiles=!!manager||!!permission?.canFiles; const canViewFiles=fullAccess||allowedSections.includes('files')||allowedSections.includes('bulk-download'); const canViewSoftwareFiles=canViewFiles||allowedSections.includes('software'); const canBackup=!!manager||!!permission?.canBackup; const canReset=!!manager||!!permission?.canReset; const canManageLostItems=fullAccess||!!permission?.canManageLostItems
  useEffect(()=>{if(visibleNav.length&&!visibleNav.some(([key])=>key===section))setSection(visibleNav[0][0])},[visibleNav,section])
  useEffect(()=>{const wanted=searchParams.get('section');if(wanted&&visibleNav.some(([key])=>key===wanted))setSection(wanted as ServerNavKey)},[searchParams,visibleNav])
  useEffect(()=>{if(manager&&!selectedUserId&&data?.users?.length)setSelectedUserId(data.users[0].id)},[manager,selectedUserId,data?.users])
  useEffect(()=>{const x=settingsSnapshot?.settings;if(!x)return;if(typeof x.motd==='string')setMotd(x.motd);if(typeof x.maxPlayers==='number'||typeof x.maxPlayers==='string')setMaxPlayers(String(x.maxPlayers));if(typeof x.onlineMode==='boolean')setOnlineMode(x.onlineMode);if(typeof x.gamemode==='string')setGamemode(x.gamemode);if(typeof x.difficulty==='string')setDifficulty(x.difficulty);if(typeof x.pvp==='boolean')setPvp(x.pvp);if(typeof x.viewDistance==='number'||typeof x.viewDistance==='string')setViewDistance(String(x.viewDistance));if(typeof x.simulationDistance==='number'||typeof x.simulationDistance==='string')setSimulationDistance(String(x.simulationDistance));if(typeof x.spawnProtection==='number'||typeof x.spawnProtection==='string')setSpawnProtection(String(x.spawnProtection));if(typeof x.allowFlight==='boolean')setAllowFlight(x.allowFlight);if(typeof x.whitelist==='boolean')setWhitelist(x.whitelist)},[settingsSnapshot])
  useEffect(()=>{try{const raw=localStorage.getItem(`blockctrl:console-history:${id}`);if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed))setConsoleHistory(parsed.filter(x=>typeof x==='string').slice(-60))}}catch{}},[id])
  useEffect(()=>{try{localStorage.setItem(`blockctrl:console-history:${id}`,JSON.stringify(consoleHistory.slice(-60)))}catch{}},[id,consoleHistory])








  async function command(type:string,payload:Record<string,unknown>={},destructive=false){
    if(!server)return; let confirmName: string|undefined
    if(destructive){const approved=await actionConfirm.ask(`Bu kritik işlem ${server.name} sunucusunda uygulanacak.`,{title:'Kritik sunucu işlemi',confirmLabel:'İşlemi uygula',danger:true,requiredText:server.name});if(!approved)return;confirmName=server.name}
    setBusy(true);setNotice('')
    try{const r=await fetch('/api/panel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'command',serverId:id,type,payload:{...payload,confirm:destructive?true:payload.confirm},confirm:confirmName})});const d=await readJson(r);if(!r.ok)throw new Error(d.error??'İşlem başarısız');setNotice('İşlem kuyruğa alındı.');await mutate()}
    catch(e){setNotice(e instanceof Error?e.message:'İşlem başarısız')} finally{setBusy(false)}
  }
  async function panelAction(action:string,payload:Record<string,unknown>={}){
    setBusy(true);setNotice('')
    try{
      const r=await fetch('/api/panel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,serverId:id,...payload})})
      const d=await readJson(r);if(!r.ok)throw new Error(d.error??'İşlem başarısız')
      setNotice('İşlem başarıyla kaydedildi.');await mutate();return d
    }catch(e){setNotice(e instanceof Error?e.message:'İşlem başarısız');return null}finally{setBusy(false)}
  }
  async function databaseAction(databaseId:string,operation:'database-status'|'database-backup'|'database-export'|'database-optimize'|'database-repair'|'database-restore'|'database-import',extra:Record<string,unknown>={}){
    return panelAction('database-action',{databaseId,operation,...extra})
  }
  async function runNetworkDiagnostics(){
    setBusy(true);setNotice('')
    try{
      const response=await fetch('/api/panel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'network-diagnostics',serverId:id})})
      const body=await readJson(response) as {error?:string;diagnostics?:NetworkDiagnostics}
      if(!response.ok||!body.diagnostics)throw new Error(body.error??'Ağ teşhisi çalıştırılamadı')
      setNetworkDiagnostics(body.diagnostics);setNotice(body.diagnostics.tcp.reachable?`Dış TCP bağlantısı başarılı${body.diagnostics.tcp.latencyMs!==null?` · ${body.diagnostics.tcp.latencyMs} ms`:''}.`:`Dış TCP bağlantısı başarısız: ${body.diagnostics.tcp.error??'ulaşılamıyor'}`)
    }catch(error){setNotice(error instanceof Error?error.message:'Ağ teşhisi başarısız')}finally{setBusy(false)}
  }








  async function ensureOciMinecraftPort(){
    const result=await panelAction('oci-nsg-ensure-port',{cidr:ociCidr.trim()||'0.0.0.0/0'})
    if(result){setNotice(result.oci?.changed?'OCI NSG Minecraft ingress kuralı eklendi.':'OCI NSG kuralı zaten mevcut.');await runNetworkDiagnostics()}
  }








  async function restoreLostItem(item:LostItemRow){
    if(!canManageLostItems||!item.playerName)return
    if(!await actionConfirm.ask(`${item.playerName} oyuncusuna ${item.amount}× ${minecraftItemDisplayName(item)} geri verilecek.`,{title:'Eşyayı geri yükle',confirmLabel:'Geri yükle'}))return
    const result=await panelAction('restore-lost-item',{id:item.id})
    if(result)setSelectedLostItemId(item.id)
  }
  async function deleteLostItem(item:LostItemRow){
    if(!canManageLostItems)return
    if(!await actionConfirm.ask(`${minecraftItemDisplayName(item)} kaydı kalıcı olarak silinecek. Bu işlem eşyayı oyuncudan geri almaz.`,{title:'Kayıp eşya kaydını sil',confirmLabel:'Kalıcı sil',danger:true}))return
    const result=await panelAction('delete-lost-item',{id:item.id})
    if(result&&selectedLostItemId===item.id)setSelectedLostItemId(null)
  }








  async function backupAction(type:string,payload:Record<string,unknown>={},requiresConfirm=false){
    if(requiresConfirm&&!await actionConfirm.ask('Bu yedek işlemi mevcut sunucu verisinin üzerine yazabilir.',{title:'Yedek işlemini onayla',confirmLabel:'Devam et',danger:true,requiredText:'CONFIRM'}))return;setBusy(true);setNotice('')
    try{const r=await fetch('/api/backups',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serverId:id,type,payload,...payload,confirm:requiresConfirm})});const d=await readJson(r);if(!r.ok)throw new Error(d.error??'Yedek işlemi başarısız');setNotice(String(d.message??(d.queuedSequence?'Sunucu durdurulup yedek alındıktan sonra otomatik yeniden başlatılacak.':'Yedek işlemi başlatıldı.')));await mutateBackups();await mutate()}
    catch(e){setNotice(e instanceof Error?e.message:'Yedek işlemi başarısız')}finally{setBusy(false)}
  }
  async function permissionAction(userId:string,grant:boolean){setBusy(true);setNotice('');try{const r=await fetch('/api/panel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(grant?{action:'set-permission',serverId:id,userId,canStart:true,canStop:true,canRestart:true,canConsole:true,canFiles:true,canBackup:true,canReset:true,canViewLostItems:true,canManageLostItems:true}:{action:'remove-permission',serverId:id,userId})});const d=await readJson(r);if(!r.ok)throw new Error(d.error??'Erişim güncellenemedi');setNotice(grant?'Kullanıcıya tam erişim verildi.':'Kullanıcının erişimi kaldırıldı.');await mutate()}catch(e){setNotice(e instanceof Error?e.message:'Erişim güncellenemedi')}finally{setBusy(false)}}
  const saveSettings=()=>command('set-properties',{'max-players':Math.max(1,Math.min(500,Number(maxPlayers)||20)),motd:motd.slice(0,150),'online-mode':onlineMode,gamemode,difficulty,pvp,'view-distance':Math.max(2,Math.min(32,Number(viewDistance)||10)),'simulation-distance':Math.max(2,Math.min(32,Number(simulationDistance)||10)),'spawn-protection':Math.max(0,Math.min(256,Number(spawnProtection)||16)),'allow-flight':allowFlight,'white-list':whitelist})
  async function sendConsoleCommand(raw:string){
    const line=raw.trim();if(!line||!running||!canConsole)return
    setConsoleHistory(current=>[...current.filter(item=>item!==line),line].slice(-60));setConsoleHistoryIndex(-1);setConsoleLine('')
    await command('console',{line});void mutateConsoleActions()
  }
  function consoleVisibleText(){
    if(consoleTab==='server')return consoleRows.map(row=>`${consoleTimestamps?`[${new Date(row.createdAt).toLocaleString('tr-TR')}] `:''}[${row.stream||'stdout'}] ${row.line}`).join('\n')
    if(consoleTab==='agent')return [...agentConsoleRows.map(event=>`${consoleTimestamps?`[${new Date(event.at).toLocaleString('tr-TR')}] `:''}[${event.level.toUpperCase()}] ${event.message}`),...startupStdout.map(line=>`[STARTUP/OUT] ${line}`),...startupStderr.map(line=>`[STARTUP/ERR] ${line}`)].join('\n')
    const d=consoleDiagnostics;if(!d)return ''
    return [
      `Zaman: ${d.at}`,`Node: ${d.node.hostname}`,`Node.js: ${d.node.nodeVersion}`,`Agent PID: ${d.node.agentPid}`,
      `Agent uptime: ${formatDuration(d.node.agentUptimeSeconds*1000)}`,`Sistem uptime: ${formatDuration(d.node.systemUptimeSeconds*1000)}`,
      `Load average: ${(d.node.loadAverage??[]).join(' / ')}`,`Node RAM: ${d.node.memoryUsedMb} / ${d.node.memoryTotalMb} MB`,
      `Disk: ${d.node.diskUsedGb??'—'} / ${d.node.diskTotalGb??'—'} GB`,`Minecraft PID: ${d.server.pid??'—'}`,
      `FIFO: ${d.server.controlChannelReady?'hazır':'hazır değil'}`,`Threads: ${d.server.process?.threads??'—'}`,`FD: ${d.server.openFileDescriptors??'—'}`,
      `Process RSS: ${d.server.process?.vmRss??'—'}`,`Process state: ${d.server.process?.state??'—'}`,`Tracker: ${d.server.trackingMode}`,
    ].join('\n')
  }
  async function copyConsoleView(){const text=consoleVisibleText();if(!text){setNotice('Kopyalanacak konsol verisi yok.');return}await navigator.clipboard.writeText(text);setNotice('Görünen konsol verisi panoya kopyalandı.')}
  function downloadConsoleView(){const text=consoleVisibleText();if(!text){setNotice('İndirilecek konsol verisi yok.');return}const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${server?.name??'server'}-${consoleTab}-console-${new Date().toISOString().replace(/[:.]/g,'-')}.log`;a.click();URL.revokeObjectURL(url)}
  async function upload(e:React.ChangeEvent<HTMLInputElement>,category:string){const file=e.target.files?.[0];if(!file)return;if(file.size>MAX_DIRECT_UPLOAD){setNotice('Dosya 2 GB sınırını aşamaz.');e.target.value='';return}setBusy(true);try{await directUploadFile(id,file,category,p=>{const uploaded=Math.round(file.size*p/100/1048576);setNotice(`${file.name} yükleniyor: %${p} �� ${uploaded} / ${(file.size/1048576).toFixed(0)} MB · 4 paralel parça`)});setNotice(`${file.name} sunucuya yüklendi.`);await mutate()}catch(err){setNotice(err instanceof Error?err.message:'Dosya yüklenemedi')}finally{setBusy(false);e.target.value=''}}
  async function uploadWorldFile(file:File){if(file.size>MAX_DIRECT_UPLOAD){setNotice('Dünya ZIP dosyası 2 GB sınırını aşamaz.');return}setBusy(true);try{await directUploadFile(id,file,'worlds',p=>{const uploaded=Math.round(file.size*p/100/1048576);setNotice(`${file.name} yükleniyor: %${p} · ${uploaded} / ${(file.size/1048576).toFixed(0)} MB`)});setNotice(`${file.name} dünya paketi sunucuya yüklendi.`);await mutate()}catch(err){setNotice(err instanceof Error?err.message:'Dünya yüklenemedi')}finally{setBusy(false)}}
  function downloadLogs(){const body=logs.map(l=>`[${new Date(l.createdAt).toLocaleString('tr-TR')}] ${l.line}`).join('\n');const url=URL.createObjectURL(new Blob([body],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=`${server?.name??'server'}-latest.log`;a.click();URL.revokeObjectURL(url)}








  // Keep hook order stable while SWR is loading. These values do not require a resolved server.
  const consoleRows=logs.filter(row=>{const at=new Date(row.createdAt).getTime();return at>=consoleClearAt&&(consolePauseAt===null||at<=consolePauseAt)}).filter(row=>{const parsed=parseLog(row.line);return (consoleLevel==='all'||parsed.level===consoleLevel)&&(consoleQuery.trim()===''||row.line.toLowerCase().includes(consoleQuery.toLowerCase()))})
  const agentConsoleRows=(consoleDiagnostics?.events??[]).filter(event=>{const at=new Date(event.at).getTime();const normalized=event.level==='error'?'ERROR':event.level==='warn'?'WARN':'INFO';return at>=consoleClearAt&&(consolePauseAt===null||at<=consolePauseAt)&&(consoleLevel==='all'||normalized===consoleLevel)&&(consoleQuery.trim()===''||event.message.toLowerCase().includes(consoleQuery.toLowerCase()))})
  const startupStdout=(consoleDiagnostics?.startup?.stdout??[]).filter(line=>consoleQuery.trim()===''||line.toLowerCase().includes(consoleQuery.toLowerCase()))
  const startupStderr=(consoleDiagnostics?.startup?.stderr??[]).filter(line=>consoleQuery.trim()===''||line.toLowerCase().includes(consoleQuery.toLowerCase()))
  useEffect(()=>{if(section!=='console'||consolePauseAt!==null||!consoleAutoScroll)return;const el=consoleViewportRef.current;if(!el)return;el.scrollTop=el.scrollHeight},[section,consoleTab,consoleRows.length,agentConsoleRows.length,startupStdout.length,startupStderr.length,consolePauseAt,consoleAutoScroll])

  if((error as (Error&{status?:number})|undefined)?.status===401)return <main className="min-h-svh bg-[#030c16] p-8 text-slate-300">Giriş sayfasına yönlendiriliyor...</main>; if(error)return <main className="p-8 text-red-300">{error.message}</main>; if(!data)return <main className="min-h-svh bg-[#030c16] p-8 text-slate-400">Sunucu bilgileri yükleniyor...</main>; if(!server)return <main className="p-8">Sunucu bulunamadı veya bu sunucuya erişiminiz yok.</main>
  if(!fullAccess&&data?.allowedSections&&data.allowedSections.length===0&&!permission?.canViewLostItems&&!permission?.canManageLostItems)return <main className="min-h-svh bg-[#06100d] p-8 text-slate-100"><div className="mx-auto max-w-xl rounded-xl border border-[#203a55] bg-[#0b1b2a] p-6"><Shield className="size-8 text-slate-500"/><h1 className="mt-4 text-xl font-semibold">Sunucu ayrıntı erişimi atanmadı</h1><p className="mt-2 text-sm text-slate-400">Bu sunucuda görüntüleyebileceğiniz bir yönetim bölümü bulunmuyor. Size özel kayıp eşya veya diğer izinler ana panelden kullanılabilir.</p><Button className="mt-5" variant="outline" onClick={()=>router.push('/')}><ArrowLeft className="mr-2 size-4"/>Sunuculara dön</Button></div></main>
  const running=server.status==='running'; const diskPct=node?.diskTotalGb?Math.round(node.diskUsedGb/node.diskTotalGb*100):0; const ramPct=node?.memoryTotalMb?Math.round(node.memoryUsedMb/node.memoryTotalMb*100):0








  const connectionAddress=server.connectionAddress??`${server.publicHost??'IP bekleniyor'}:${server.port}`
  const recentLogs=[...logs].reverse().slice(0,24)
  const lastBackup=backupData?.backups?.[0]
  const onlineNode=server.connectivity?.heartbeatOnline===true
  const latestMetric=metricsData?.metrics?.[0]??null
  const metricAge=latestMetric?Math.max(0,Math.round((Date.now()-new Date(latestMetric.createdAt).getTime())/1000)):null
  const metricFresh=!!latestMetric&&metricAge!==null&&metricAge<60
  const livePlayerCount=playersOverview?.summary?.online
  const displayedPlayerCount=running&&onlineNode?(typeof livePlayerCount==='number'?livePlayerCount:(metricFresh?latestMetric.players:null)):running?null:0
  const processCpu=running&&metricFresh?latestMetric.cpuPercent:null
  const processMemoryUsed=running&&metricFresh?latestMetric.memoryUsedMb:null
  const processMemoryLimit=running&&metricFresh&&latestMetric.memoryTotalMb>0?latestMetric.memoryTotalMb:server.memoryMb
  const processRamPct=processMemoryUsed!==null&&processMemoryLimit>0?Math.min(100,Math.round(processMemoryUsed/processMemoryLimit*100)):null
  const uptimeText=running&&metricFresh?formatDuration(latestMetric.uptimeSeconds*1000):'—'
  const metrics24h=(()=>{const cutoff=Date.now()-86_400_000;const rows=(metricsData?.metrics??[]).filter(metric=>new Date(metric.createdAt).getTime()>=cutoff);const source=rows.length?rows:(metricsData?.metrics??[]).slice(0,120);return [...source].reverse()})()
  const lastRestartOperation=(data?.operations??[]).find(operation=>operation.status==='completed'&&/restart|yeniden/i.test(operation.operation))
  const lastRestartText=lastRestartOperation?formatDuration(Date.now()-new Date(lastRestartOperation.createdAt).getTime()):'—'
  const coverSetting=settingsSnapshot?.settings?.coverImageUrl
  const serverCoverUrl=typeof coverSetting==='string'&&coverSetting.trim()?coverSetting.trim():null
  const settingsVerified=settingsSnapshot?.liveSync===true
  const settingsFreshness=settingsVerified?'Canlı server.properties':settingsSnapshot?'Son kaydedilen değer · canlı doğrulanmadı':'Ayar verisi bekleniyor'
  const trackerRuntime=settingsVerified?settingsSnapshot?.runtime??null:null
  const trackerMode=trackerRuntime?.itemTrackingMode??null
  const trackerRuntimeVerified=!!trackerRuntime&&trackerRuntime.itemTrackingEnabled===server.itemTrackingEnabled
  const trackerLabel=!server.itemTrackingEnabled?'Kapalı':!trackerRuntimeVerified?'Doğrulanmadı':trackerMode==='event-adapter'?'Event adapter':trackerMode==='death-snapshot'?'Snapshot fallback':trackerMode??'Doğrulanmadı'
  const trackerState:'ok'|'warn'|'neutral'=!server.itemTrackingEnabled?'neutral':trackerRuntimeVerified&&trackerMode==='event-adapter'?'ok':'warn'
  const actualMaxPlayers=typeof settingsSnapshot?.settings?.maxPlayers==='number'?settingsSnapshot.settings.maxPlayers:Number.isFinite(Number(settingsSnapshot?.settings?.maxPlayers))?Number(settingsSnapshot?.settings?.maxPlayers):null
  const actualOnlineMode=typeof settingsSnapshot?.settings?.onlineMode==='boolean'?settingsSnapshot.settings.onlineMode:null
  const actualWhitelist=typeof settingsSnapshot?.settings?.whitelist==='boolean'?settingsSnapshot.settings.whitelist:null
  const securityModule=(key:string)=>securitySnapshot?.modules?.find(module=>module.key===key)
  const consoleJobs=(consoleActions?.actions??[]).filter(action=>['queued','running','completed','failed'].includes(action.status)).slice(0,12)
  const latestCrashJob=(consoleActions?.actions??[]).find(action=>action.type==='crash-reports'&&action.status==='completed')
  const crashReportRows=Array.isArray(latestCrashJob?.result?.reports)?latestCrashJob!.result!.reports as Array<Record<string,unknown>>:[]
  const latestLogExport=(consoleActions?.actions??[]).find(action=>action.type==='logs-export'&&action.status==='completed')
  const logExportUrl=typeof latestLogExport?.result?.downloadUrl==='string'?latestLogExport.result.downloadUrl:''
  const logExportSize=Number(latestLogExport?.result?.sizeBytes??0)

  const logCutoff=logWindow==='24h'?Date.now()-86_400_000:logWindow==='7d'?Date.now()-7*86_400_000:0
  const filteredRecentLogs=[...logs].reverse().filter(row=>new Date(row.createdAt).getTime()>=logCutoff).filter(row=>{const parsed=parseLog(row.line);const tabOk=logTab==='server'||(logTab==='error'?parsed.level==='ERROR':/crash|exception|fatal|watchdog|tick loop/i.test(row.line));return tabOk&&(logLevel==='all'||parsed.level===logLevel)&&(logQuery.trim()===''||row.line.toLowerCase().includes(logQuery.toLowerCase()))}).slice(0,150)
  const heartbeatAge=node?.lastHeartbeat?Math.max(0,Math.round((Date.now()-new Date(node.lastHeartbeat).getTime())/1000)):null
  const canOpenSection=(key:string)=>visibleNav.some(([visibleKey])=>visibleKey===key)
  const canSeeBackups=fullAccess||allowedSections.includes('backups')
  const canSeeSecurity=fullAccess||allowedSections.includes('security')
  const canSeeLostItems=fullAccess||data?.serverAccess?.isOwner===true||!!permission?.canViewLostItems||!!permission?.canManageLostItems
  const directBridgeOnline=server.directBridge?.online===true
  const heartbeatHealthy=onlineNode&&heartbeatAge!==null&&heartbeatAge<60
  const processStatusLabel=!running?'Kapalı':metricFresh?'Çalışıyor':heartbeatHealthy?'Doğrulanıyor':'Doğrulanamıyor'
  const processState:'ok'|'warn'|'bad'|'neutral'=!running?'neutral':metricFresh?'ok':heartbeatHealthy?'warn':'bad'
  const actualGamemode=typeof settingsSnapshot?.settings?.gamemode==='string'?settingsSnapshot.settings.gamemode:null
  const actualDifficulty=typeof settingsSnapshot?.settings?.difficulty==='string'?settingsSnapshot.settings.difficulty:null
  const queryEnabled=typeof settingsSnapshot?.settings?.enableQuery==='boolean'?settingsSnapshot.settings.enableQuery:null
  const queryPort=Number.isFinite(Number(settingsSnapshot?.settings?.queryPort))?Number(settingsSnapshot?.settings?.queryPort):null
  const rconEnabled=typeof settingsSnapshot?.settings?.enableRcon==='boolean'?settingsSnapshot.settings.enableRcon:null
  const rconPort=Number.isFinite(Number(settingsSnapshot?.settings?.rconPort))?Number(settingsSnapshot?.settings?.rconPort):null
  const securityPortObservedAt=typeof securitySnapshot?.snapshot?.scannedAt==='string'?securitySnapshot.snapshot.scannedAt:null
  const securityScanAge=securityPortObservedAt?Date.now()-new Date(securityPortObservedAt).getTime():null
  const securityPortScanFresh=securityScanAge!==null&&securityScanAge>=0&&securityScanAge<=5*60_000
  const observedPorts=Array.isArray(securitySnapshot?.snapshot?.ports)?securitySnapshot!.snapshot!.ports as Array<Record<string,unknown>>:[]
  const observedPort=(port:number|null)=>port===null?null:observedPorts.find(row=>Number(row.port)===port)??null
  const portState=(port:number|null,enabled:boolean|null):'open'|'closed'|'unknown'=>{if(port===null||enabled===false)return'closed';if(enabled===null)return'unknown';if(!securityPortScanFresh)return'unknown';return observedPort(port)?'open':'closed'}
  const minecraftPortState:'open'|'closed'|'unknown'=securityPortScanFresh?(observedPort(server.port)?'open':'closed'):'unknown'
  const requestedPort=Number(newPort);const portChangeValid=Number.isInteger(requestedPort)&&requestedPort>=1024&&requestedPort<=65535&&requestedPort!==server.port
  const lostItems=(lostItemsData?.items??data?.lostItems??[]).filter(item=>item.serverId===id)
  const lostReasons:string[]=[...new Set<string>(lostItems.map(item=>String(item.reason)).filter(Boolean))].sort()
  const lostRangeMs=lostRange==='24h'?86_400_000:lostRange==='7d'?7*86_400_000:lostRange==='30d'?30*86_400_000:null
  const filteredLostItems=lostItems.filter(item=>{const query=lostQuery.trim().toLowerCase();const age=Date.now()-new Date(item.occurredAt).getTime();const rangeOk=lostRangeMs===null||(age>=0&&age<=lostRangeMs);const queryOk=!query||`${item.playerName??''} ${item.itemName} ${item.itemId} ${item.world} ${item.reason} ${server.name}`.toLowerCase().includes(query);return queryOk&&rangeOk&&(lostReason==='all'||item.reason===lostReason)})
  const recentLostItems=lostItems.slice(0,5)
  const lostLast24h=lostItems.filter(item=>Date.now()-new Date(item.occurredAt).getTime()<=86_400_000).length
  const restoredLostItems=lostItems.filter(item=>item.status==='restored').length
  const pendingLostItems=lostItems.filter(item=>item.status!=='restored').length
  const lostPageSize=10
  const lostPageCount=Math.max(1,Math.ceil(filteredLostItems.length/lostPageSize))
  const safeLostPage=Math.min(lostPage,lostPageCount)
  const pagedLostItems=filteredLostItems.slice((safeLostPage-1)*lostPageSize,safeLostPage*lostPageSize)
  const selectedLostItem=lostItems.find(item=>item.id===selectedLostItemId)??pagedLostItems[0]??null
  const failedOperations=(data?.operations??[]).filter(operation=>operation.status==='failed')
  const recentSystemEvents=recentLogs.filter(row=>/\bWARN(?:ING)?\b|\bERROR\b|Exception|failed|fatal|crash/i.test(row.line)).slice(0,5)
  const antiCheatEvents=(securitySnapshot?.events??[]).filter(event=>String(event.source??'').toLowerCase()==='anticheat'||/anti.?cheat|xray|speed|reach|killaura|autoclick|nofall|scaffold|blink|phase|noslow|velocity|critical/i.test(String(event.event??'')))
  const backupAgeText=lastBackup?formatDuration(Date.now()-new Date(lastBackup.createdAt).getTime()):'—'
  const scheduleRows=data?.schedules??[]
  const lastSchedule=[...scheduleRows].filter(row=>row.lastRunAt).sort((a,b)=>new Date(b.lastRunAt!).getTime()-new Date(a.lastRunAt!).getTime())[0]
  const scheduledOperations=(data?.operations??[]).filter(operation=>operation.operation.startsWith('scheduled-'))
  const primaryDatabase=(data?.databases??[]).find(row=>row.status==='ready')??data?.databases?.[0]??null
  const overviewAlerts:Array<{tone:'critical'|'warn'|'info';title:string;text:string}> = []
  if(running&&!onlineNode)overviewAlerts.push({tone:'critical',title:'Sunucu çalışıyor görünüyor ancak node çevrimdışı',text:'Agent heartbeat alınamıyor. Stop, restart ve konsol işlemlerinden önce node bağlantısını kontrol edin.'})
  if(running&&onlineNode&&heartbeatAge!==null&&heartbeatAge>=60)overviewAlerts.push({tone:'critical',title:'Agent heartbeat gecikmiş',text:`Son agent sinyali ${heartbeatAge} saniye önce alındı.`})
  if(running&&(!latestMetric||!metricFresh))overviewAlerts.push({tone:'warn',title:'Minecraft process telemetrisi güncel değil',text:latestMetric&&metricAge!==null?`Son process metriği ${metricAge} saniye önce alındı.`:'Henüz sunucu bazlı process metriği alınmadı.'})
  if(processCpu!==null&&processCpu>=90)overviewAlerts.push({tone:'warn',title:'Minecraft CPU kullanımı yüksek',text:`Doğrulanmış process CPU kullanımı %${Math.round(processCpu)}.`})
  if(processRamPct!==null&&processRamPct>=90)overviewAlerts.push({tone:'warn',title:'Minecraft RAM kullanımı yüksek',text:`Minecraft process belleğinin yapılandırılan limite oranı %${processRamPct}.`})
  if(onlineNode&&node&&node.cpuPercent>=90)overviewAlerts.push({tone:'warn',title:'Node CPU kullanımı yüksek',text:`Doğrulanmış node CPU kullanımı %${Math.round(node.cpuPercent)}.`})
  if(onlineNode&&node&&ramPct>=90)overviewAlerts.push({tone:'warn',title:'Node RAM kullanımı yüksek',text:`Node belleğinin %${ramPct} kadarı kullanılıyor.`})
  if(onlineNode&&node&&diskPct>=90)overviewAlerts.push({tone:'warn',title:'Disk alanı kritik eşiğe yakın',text:`Node diskinin %${diskPct} kadarı kullanılıyor.`})
  if(errorCount>0)overviewAlerts.push({tone:'warn',title:'Yakın günlüklerde hata bulundu',text:`Yüklenen son günlüklerde ${errorCount} hata/exception kaydı var.`})
  if(canSeeBackups&&backupData&&!lastBackup)overviewAlerts.push({tone:'info',title:'Henüz yedek bulunmuyor',text:'Sunucu verileri için düzenli bir yedekleme planı oluşturabilirsiniz.'})
  if(settingsVerified&&actualOnlineMode===false&&actualWhitelist===false)overviewAlerts.push({tone:'warn',title:'Offline mod ve whitelist kapalı',text:'Canlı server.properties bu yapılandırmayı doğruluyor. Kullanım amacınıza göre kimlik doğrulama ayarlarını kontrol edin.'})
  if(server.installError)overviewAlerts.unshift({tone:'critical',title:'Sunucu kurulum/çalıştırma hatası',text:server.installError})
  const operationalState=!running?'Kapalı':overviewAlerts.some(alert=>alert.tone==='critical')?'Müdahale gerekli':overviewAlerts.some(alert=>alert.tone==='warn')?'İnceleme gerekli':'Normal'








  return <main className="min-h-svh bg-[#08111d] text-slate-100 selection:bg-sky-400/25">
    <a href="#server-main-content" className="bc-skip-link">Sunucu içeriğine geç</a>
    {actionConfirm.dialog}
    <SupportCenter showTriggers={false}/>
    <div className="flex min-h-svh">
      <ServerDetailNavigation
        open={open}
        items={visibleNav}
        active={section}
        serverName={server.name}
        serverMeta={`${server.loader} ${server.mcVersion}`}
        coverUrl={serverCoverUrl}
        processState={processState}
        processStatusLabel={processStatusLabel}
        heartbeatHealthy={heartbeatHealthy}
        onlineNode={onlineNode}
        diskPct={diskPct}
        serverCount={(data?.servers??[]).length}
        serverLimit={50}
        onClose={()=>setOpen(false)}
        onSelect={key=>{setSection(key);setOpen(false);const params=new URLSearchParams(searchParams.toString());params.set('section',key);router.replace(`/servers/${id}?${params.toString()}`,{scroll:false})}}
        onBack={()=>router.push('/')}
      />








      <section id="server-main-content" className="min-w-0 flex-1">
        <ServerDetailHeader
          serverName={server.name}
          sectionLabel={SERVER_NAV.find(item=>item[0]===section)?.[1]??section}
          actor={data?.actor}
          onOpenMenu={()=>setOpen(true)}
          onRefresh={()=>{void mutate()}}
        />








        <div className="w-full space-y-3 p-3 sm:p-4 lg:p-4">
          {notice&&<div role="status" className="rounded-lg border border-sky-500/25 bg-[#0d2034]/35 px-4 py-3 text-sm text-sky-200">{notice}</div>}








          {section==='overview'&&<>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_332px]">
              <div className="min-w-0 space-y-3">
                <DashboardCard className="overflow-hidden p-0">
                  <div className="flex flex-col gap-4 p-3.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center">
                      {serverCoverUrl?<img src={serverCoverUrl} alt={`${server.name} kapak görseli`} className="size-[108px] shrink-0 rounded-lg border border-[#2a3f55] object-cover shadow-[0_8px_24px_rgba(0,0,0,.32)]"/>:<div className="grid size-[108px] shrink-0 place-items-center rounded-lg border border-[#2a3f55] bg-[#102033] text-emerald-300"><ServerIcon className="size-10"/></div>}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-[23px] font-bold tracking-[-.02em] text-white">{server.name}</h2>
                          {canOpenSection('settings')&&<button type="button" onClick={()=>setSection('settings')} className="grid size-7 place-items-center rounded-md text-slate-500 transition hover:bg-white/[.05] hover:text-slate-200" aria-label="Sunucu ayarlarını aç"><Pencil className="size-3.5"/></button>}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold ${processState==='ok'?'border-emerald-400/25 bg-emerald-400/10 text-emerald-300':processState==='bad'?'border-red-500/30 bg-red-500/10 text-red-300':processState==='warn'?'border-amber-500/30 bg-amber-500/10 text-amber-300':'border-slate-600 bg-slate-700/20 text-slate-300'}`}><span className={`size-1.5 rounded-full ${processState==='ok'?'bg-emerald-400':processState==='bad'?'bg-red-400':processState==='warn'?'bg-amber-400':'bg-slate-500'}`}/>{processStatusLabel}</span>
                          <span className="rounded-md border border-[#253a52] bg-[#0b1928] px-2 py-1 text-slate-300">{server.loader} {server.mcVersion}</span>
                          <span className="rounded-md border border-[#253a52] bg-[#0b1928] px-2 py-1 text-slate-300">{node?.name??'Node doğrulanmadı'}</span>
                        </div>
                        <button onClick={()=>{void navigator.clipboard.writeText(connectionAddress);setNotice('Sunucu adresi panoya kopyalandı.')}} className="mt-2.5 inline-flex max-w-full items-center gap-2 text-[11px] text-slate-300 transition hover:text-sky-300"><Network className="size-3.5 text-sky-400"/><span className="truncate">{connectionAddress}</span><Copy className="size-3.5 text-slate-500"/></button>
                        <p className="mt-2 text-xs text-slate-500">Son yeniden başlatma: {lastRestartText}{running&&metricFresh?` · Çalışma süresi: ${uptimeText}`:''}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {canStart&&<Button className="h-[58px] min-w-[76px] rounded-md border border-emerald-400/25 bg-emerald-600 text-white shadow-none hover:bg-emerald-500" disabled={busy||running} onClick={()=>command('start')}><Play className="mr-2 size-4"/>Başlat</Button>}
                      {canStop&&<Button className="h-[58px] min-w-[76px] rounded-md border border-red-400/25 bg-red-600/90 text-white shadow-none hover:bg-red-500" disabled={busy||!running} onClick={()=>command('stop')}><Square className="mr-2 size-4"/>Durdur</Button>}
                      {canRestart&&<Button className="h-[58px] min-w-[138px] rounded-md border border-blue-400/30 bg-blue-600/90 text-white shadow-none hover:bg-blue-500" disabled={busy||!running} onClick={()=>command('restart')}><RefreshCw className="mr-2 size-4"/>Yeniden Başlat</Button>}
                      <Button size="icon" variant="outline" className="size-[58px] rounded-md border-[#29445f] bg-[#102138] text-slate-300 hover:border-sky-400/35 hover:bg-[#132943]" onClick={()=>setSection(canOpenSection('settings')?'settings':'logs')} aria-label="Diğer sunucu işlemleri"><MoreHorizontal className="size-5"/></Button>
                    </div>
                  </div>
                </DashboardCard>








                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <OverviewKpi icon={Users} title="Oyuncular" value={`${displayedPlayerCount??'—'} / ${actualMaxPlayers??'—'}`} detail={displayedPlayerCount!==null&&onlineNode?'Canlı oyuncu verisi':'Canlı veri bekleniyor'} progress={displayedPlayerCount!==null&&actualMaxPlayers?Math.round(displayedPlayerCount/Math.max(1,actualMaxPlayers)*100):undefined} tone="blue"/>
                  <OverviewKpi icon={Cpu} title="Node CPU" value={onlineNode&&node?`%${Math.round(node.cpuPercent)}`:'—'} detail={onlineNode?'Heartbeat telemetrisi':'Node doğrulanmadı'} progress={onlineNode&&node?node.cpuPercent:undefined} tone="green"/>
                  <OverviewKpi icon={HardDrive} title="Node RAM" value={onlineNode&&node?`${(node.memoryUsedMb/1024).toFixed(1)} GB`:'—'} detail={onlineNode&&node?`${(node.memoryTotalMb/1024).toFixed(1)} GB toplam`:'Node doğrulanmadı'} progress={onlineNode?ramPct:undefined} tone="green"/>
                  <OverviewKpi icon={Database} title="Node Disk" value={onlineNode&&node?.diskTotalGb?`${node.diskUsedGb.toFixed(0)} GB`:'—'} detail={onlineNode&&node?.diskTotalGb?`${node.diskTotalGb.toFixed(0)} GB toplam`:'Disk doğrulanmadı'} progress={onlineNode&&node?.diskTotalGb?diskPct:undefined} tone="green"/>
                  <OverviewKpi icon={HardDrive} title="Sunucu RAM" value={processMemoryUsed!==null?`${(processMemoryUsed/1024).toFixed(1)} GB`:'—'} detail={processMemoryLimit?`${(processMemoryLimit/1024).toFixed(1)} GB limit`:'Process doğrulanmadı'} progress={processRamPct??undefined} tone={processRamPct!==null&&processRamPct>=75?'amber':'blue'}/>
                  <OverviewKpi icon={Box} title="Kayıp Eşya" value={canSeeLostItems?`${lostLast24h} kayıt`:'—'} detail={canSeeLostItems?'Son 24 saat':'Yetki yok'} tone="blue"/>
                </div>








                <div className="grid gap-3 lg:grid-cols-2">
                  <DashboardCard title="Oyuncu Aktivitesi" subtitle={metrics24h.length?'Son 24 saat · gerçek sunucu metrik geçmişi':'Henüz telemetri örneği yok'}><TelemetryChart metrics={metrics24h} mode="players"/></DashboardCard>
                  <DashboardCard title="Kaynak Kullanımı" subtitle="Minecraft process CPU/RAM ve disk yüzdeleri"><TelemetryChart metrics={metrics24h} mode="resources"/></DashboardCard>
                </div>
              </div>








              <aside className="space-y-3">
                <DashboardCard title="Sunucu Durumu">
                  <div className="flex items-center gap-3 border-b border-[#1b3047] pb-4">
                    <span className={`size-4 rounded-full shadow-[0_0_18px_currentColor] ${processState==='ok'?'bg-emerald-400 text-emerald-400':processState==='bad'?'bg-red-400 text-red-400':processState==='warn'?'bg-amber-400 text-amber-400':'bg-slate-500 text-slate-500'}`}/>
                    <div><p className={`text-base font-semibold ${processState==='ok'?'text-emerald-300':processState==='bad'?'text-red-300':processState==='warn'?'text-amber-300':'text-slate-300'}`}>{processStatusLabel}</p><p className="text-xs text-slate-500">{processState==='ok'?'Tüm servisler normal çalışıyor.':running?'Canlı doğrulama tamamlanmadı':'Sunucu kapalı'}</p></div>
                  </div>
                  <div className="pt-4">
                    <p className="mb-2 text-xs font-semibold text-slate-300">Bağlantı Bilgileri</p>
                    <button onClick={()=>{void navigator.clipboard.writeText(connectionAddress);setNotice('Sunucu adresi panoya kopyalandı.')}} className="flex w-full items-center gap-2 rounded-lg border border-[#29445f] bg-[#102138] px-3 py-3 text-left font-mono text-xs text-slate-200 transition hover:border-sky-500/50"><ServerIcon className="size-4 text-slate-300"/><span className="min-w-0 flex-1 truncate">{connectionAddress}</span><Copy className="size-4 text-slate-500"/></button>
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Sürüm</span><b className="text-slate-300">{server.mcVersion} ({server.loader})</b></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Node</span><b className="max-w-[65%] truncate text-right text-slate-300">{node?.name??'Doğrulanmadı'}</b></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Uptime</span><b className="text-slate-300">{uptimeText}</b></div>
                    </div>
                  </div>
                </DashboardCard>








                <DashboardCard title="Hızlı İşlemler">
                  <div className="grid grid-cols-4 gap-2">
                    {canOpenSection('console')&&<OverviewQuickButton icon={Terminal} label="Konsol" onClick={()=>setSection('console')}/>}
                    {canOpenSection('players')&&<OverviewQuickButton icon={Users} label="Oyuncular" onClick={()=>setSection('players')}/>}
                    {canOpenSection('files')&&<OverviewQuickButton icon={Folder} label="Dosyalar" onClick={()=>setSection('files')}/>}
                    {canOpenSection('worlds')&&<OverviewQuickButton icon={Globe2} label="Dünyalar" onClick={()=>setSection('worlds')}/>}
                    {canBackup&&<OverviewQuickButton icon={RotateCcw} label="Yedek Al" onClick={()=>backupAction('backup',{kind:'full',label:'overview-manual'})} disabled={busy}/>}
                    {canOpenSection('settings')&&<OverviewQuickButton icon={Settings2} label="Ayarlar" onClick={()=>setSection('settings')}/>}
                    {canOpenSection('lost-items')&&<OverviewQuickButton icon={Box} label="Kayıp Eşya" onClick={()=>setSection('lost-items')}/>}
                    {canOpenSection('security')&&<OverviewQuickButton icon={ShieldCheck} label="Güvenlik" onClick={()=>setSection('security')}/>}
                  </div>
                </DashboardCard>
              </aside>
            </div>








            <div className="grid gap-3 lg:grid-cols-3">
              <DashboardCard title="Sunucu Özellikleri">
                <div className="grid gap-1 sm:grid-cols-2">
                  <OverviewPropertyRow label="Oyun Modu" value={actualGamemode??'Doğrulanmadı'}/>
                  <OverviewPropertyRow label="Zorluk" value={actualDifficulty??'Doğrulanmadı'}/>
                  <OverviewPropertyRow label="Max Oyuncu" value={actualMaxPlayers===null?'Doğrulanmadı':String(actualMaxPlayers)}/>
                  <OverviewPropertyRow label="Online-Mode" value={actualOnlineMode===null?'Doğrulanmadı':actualOnlineMode?'Açık':'Kapalı'} good={actualOnlineMode===true}/>
                  <OverviewPropertyRow label="Whitelist" value={actualWhitelist===null?'Doğrulanmadı':actualWhitelist?'Açık':'Kapalı'} good={actualWhitelist===true}/>
                  <OverviewPropertyRow label="Port" value={String(server.port)}/>
                  <OverviewPropertyRow label="Dünya Adı" value={server.worldName??String(settingsSnapshot?.settings?.worldName??'Doğrulanmadı')}/>
                  <OverviewPropertyRow label="Otomatik Yedek" value={backupAutomationLabel} good={activeBackupSchedules>0||detectedScheduledBackups>0}/>
                </div>
              </DashboardCard>









              <DashboardCard title="Servis ve Bağlantı Durumu">
                <div className="space-y-1"><OverviewStatusRow label="Minecraft Process" state={processState} value={processStatusLabel}/><OverviewStatusRow label="Agent Heartbeat" state={heartbeatHealthy?'ok':onlineNode?'warn':'bad'} value={heartbeatAge===null?'Doğrulanmadı':`${heartbeatAge} sn`}/><OverviewStatusRow label="Node Bağlantısı" state={onlineNode?'ok':'bad'} value={onlineNode?'Online':'Çevrimdışı'}/><OverviewStatusRow label="Ayar Senkronizasyonu" state={settingsSnapshot?.liveSync?'ok':settingsSnapshot?'warn':'neutral'} value={settingsSnapshot?.liveSync?'Başarılı':settingsSnapshot?'Kısıtlı':'Doğrulanmadı'}/><OverviewStatusRow label="Güvenlik Telemetrisi" state={canSeeSecurity&&securitySnapshot?.summary?'ok':'neutral'} value={canSeeSecurity?(securitySnapshot?.summary?'Aktif':'Doğrulanmadı'):'Yetki yok'}/><OverviewStatusRow label="Kayıp Eşya Tracker" state={trackerState} value={trackerLabel}/></div>
              </DashboardCard>








              <DashboardCard title="Dikkat Gerektiren Noktalar" action={overviewAlerts.length?<span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">{overviewAlerts.length} uyarı</span>:undefined}>
                {overviewAlerts.length?<div className="space-y-1.5">{overviewAlerts.slice(0,5).map((alert,index)=><div key={`${alert.title}-${index}`} className="flex items-start gap-2 rounded-lg border border-[#20354d] bg-[#0a1826] p-2.5"><AlertTriangle className={`mt-0.5 size-3.5 shrink-0 ${alert.tone==='critical'?'text-red-400':alert.tone==='warn'?'text-amber-400':'text-blue-400'}`}/><div className="min-w-0"><p className="text-xs font-medium text-slate-200">{alert.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{alert.text}</p></div></div>)}</div>:<div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[.05] p-4 text-center text-xs text-emerald-300">Doğrulanmış aktif uyarı yok.</div>}
              </DashboardCard>
            </div>








            <div className="grid gap-3 lg:grid-cols-3">
              <DashboardCard title="Son İşlemler" action={<button className="text-xs text-sky-300 hover:text-sky-200" onClick={()=>setSection('logs')}>Tümünü Gör</button>}>
                <div className="mb-1 grid grid-cols-[minmax(72px,.8fr)_minmax(0,1.2fr)_auto] gap-2 border-b border-[#1d3248] pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600"><span>İşlem</span><span>Durum / Mesaj</span><span>Zaman</span></div>
                <div className="space-y-1">{(data?.operations??[]).slice(0,5).map(operation=><CompactDashboardRow key={operation.id} left={operation.operation} middle={operation.message||operation.status} right={new Date(operation.createdAt).toLocaleString('tr-TR')} tone={operation.status==='failed'?'bad':operation.status==='completed'?'ok':'warn'}/>)}{!(data?.operations??[]).length&&<EmptyDashboardState text="Henüz işlem kaydı yok."/>}</div>
              </DashboardCard>








              <DashboardCard title="Son Hatalar ve Uyarılar" action={<button className="text-xs text-sky-300 hover:text-sky-200" onClick={()=>setSection('logs')}>Tümünü Gör</button>}>
                <div className="mb-1 grid grid-cols-[minmax(72px,.8fr)_minmax(0,1.2fr)_auto] gap-2 border-b border-[#1d3248] pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600"><span>Seviye</span><span>Mesaj</span><span>Zaman</span></div>
                <div className="space-y-1">{recentSystemEvents.map(row=>{const parsed=parseLog(row.line);return <CompactDashboardRow key={row.id} left={parsed.level} middle={parsed.message} right={new Date(row.createdAt).toLocaleString('tr-TR')} tone={parsed.level==='ERROR'?'bad':'warn'}/>})}{!recentSystemEvents.length&&<EmptyDashboardState text="Son günlüklerde önemli hata/uyarı yok."/>}</div>
              </DashboardCard>








              <DashboardCard title="Son Kayıp Eşya Kayıtları" action={canOpenSection('lost-items')?<button className="text-xs text-sky-300 hover:text-sky-200" onClick={()=>setSection('lost-items')}>Tümünü Gör</button>:undefined}>
                <div className="mb-1 grid grid-cols-[minmax(72px,.8fr)_minmax(0,1.2fr)_auto] gap-2 border-b border-[#1d3248] pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600"><span>Oyuncu</span><span>Eşya</span><span>Zaman</span></div>
                <div className="space-y-1">{canSeeLostItems&&recentLostItems.map(item=><CompactDashboardRow key={item.id} left={item.playerName??'—'} middle={`${item.amount}× ${item.itemName} · ${item.reason}`} right={new Date(item.occurredAt).toLocaleString('tr-TR')} tone="info"/>)}{(!canSeeLostItems||!recentLostItems.length)&&<EmptyDashboardState text={canSeeLostItems?'Henüz kayıp eşya kaydı yok.':'Bu veriyi görüntüleme yetkiniz yok.'}/>}</div>
              </DashboardCard>
            </div>
          </>}








          {section==='settings'&&<>
            <PageHeading title="Ayarlar" text="Sunucu, güvenlik, performans, JVM, loader, yedekleme ve diğer gelişmiş seçenekleri tek merkezden yönetin."/>
            <ServerSettingsCenter
              serverId={id}
              loader={server.loader}
              running={running}
              canEdit={canReset}
              onNavigate={target=>{if(visibleNav.some(([key])=>key===target))setSection(target as ServerNavKey)}}
            />
          </>}








          {section==='console'&&<>
            <PageHeading
              title="Konsol Merkezi"
              text={`${server.loader} ${server.mcVersion} · canlı Minecraft çıktısı, agent olayları ve sistem tanılama verileri.`}
              right={<div className="flex flex-wrap items-center gap-2">
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${processState==='ok'?'border-sky-500/25 bg-sky-500/[.07]':processState==='bad'?'border-red-500/25 bg-red-500/[.07]':'border-amber-500/25 bg-amber-500/[.07]'}`}>
                  <span className={`size-2.5 rounded-full ${processState==='ok'?'bg-cyan-400':processState==='bad'?'bg-red-400':processState==='warn'?'bg-amber-400':'bg-slate-500'}`}/>
                  <div><b className={processState==='ok'?'text-sky-300':processState==='bad'?'text-red-300':'text-amber-300'}>{processStatusLabel}</b><div className="text-xs text-slate-500">{heartbeatAge===null?'Heartbeat yok':`${heartbeatAge} sn önce`}</div></div>
                </div>
                <Button size="sm" variant="outline" onClick={()=>{void mutate();void mutateConsoleDiagnostics()}}><RefreshCw className="mr-1.5 size-3.5"/>Yenile</Button>
              </div>}
            />








            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CompactMetric label="Minecraft" value={processStatusLabel} sub={consoleDiagnostics?.server?.pid?`PID ${consoleDiagnostics.server.pid}`:`${server.loader} ${server.mcVersion}`} good={processState==='ok'}/>
              <CompactMetric label="Konsol kanalı" value={!running?'Kapalı':consoleDiagnostics?.server?.controlChannelReady?'Hazır':'Doğrulanmadı'} sub={consoleDiagnostics?.server?.controlChannelReady?'Kalıcı FIFO komut kanalı':running?'Agent tanılaması bekleniyor':'Sunucu çalışmıyor'} good={!!consoleDiagnostics?.server?.controlChannelReady}/>
              <CompactMetric label="Agent" value={consoleDiagnosticsError?'Erişilemiyor':consoleDiagnostics?'Bağlı':'Bekleniyor'} sub={consoleDiagnostics?`${consoleDiagnostics.node.hostname} · PID ${consoleDiagnostics.node.agentPid}`:consoleDiagnosticsError?'Node bridge yanıt vermedi':'Canlı veri yükleniyor'} good={!!consoleDiagnostics&&!consoleDiagnosticsError}/>
              <CompactMetric label="Kayıt akışı" value={`${consoleRows.length} satır`} sub={`${logs.length} API kaydı · ${consolePauseAt?'duraklatıldı':'canlı takip'}`} good={!consolePauseAt}/>
            </div>








            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
              <PanelCard className="overflow-hidden p-0">
                <div className="border-b border-[#203a55] bg-[#081827]">
                  <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
                    <TabPill active={consoleTab==='server'} onClick={()=>setConsoleTab('server')} icon={Terminal} label="Sunucu"/>
                    <TabPill active={consoleTab==='agent'} onClick={()=>setConsoleTab('agent')} icon={Activity} label="Agent"/>
                    <TabPill active={consoleTab==='system'} onClick={()=>setConsoleTab('system')} icon={Cpu} label="Sistem"/>
                    <div className="flex-1"/>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${consolePauseAt?'border-amber-500/30 bg-amber-500/10 text-amber-300':'border-sky-500/30 bg-sky-500/10 text-sky-300'}`}>
                      <span className={`size-1.5 rounded-full ${consolePauseAt?'bg-amber-400':'bg-cyan-400 animate-pulse'}`}/>{consolePauseAt?'Takip duraklatıldı':'Canlı takip'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    {consoleTab!=='system'&&<select value={consoleLevel} onChange={e=>setConsoleLevel(e.target.value)} className="h-9 rounded-md border border-[#28445f] bg-[#07131f] px-3 text-xs text-slate-200 outline-none focus:border-sky-500/50"><option value="all">Tüm seviyeler</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option><option value="DEBUG">DEBUG</option></select>}
                    {consoleTab!=='system'&&<div className="relative min-w-0 flex-1 sm:min-w-[220px]"><Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-500"/><input value={consoleQuery} onChange={e=>setConsoleQuery(e.target.value)} className="h-9 w-full rounded-md border border-[#28445f] bg-[#07131f] pl-8 pr-3 text-xs outline-none focus:border-sky-500/50" placeholder={consoleTab==='server'?'Sunucu konsolunda ara...':'Agent ve startup çıktısında ara...'}/></div>}
                    <Button size="sm" variant="outline" className="h-9" onClick={()=>setConsolePauseAt(value=>value===null?Date.now():null)}>{consolePauseAt?<Play className="mr-1.5 size-3.5"/>:<Square className="mr-1.5 size-3.5"/>}{consolePauseAt?'Devam et':'Duraklat'}</Button>
                    {consoleTab!=='system'&&<Button size="sm" variant="outline" className="h-9" onClick={()=>setConsoleWrap(value=>!value)}><FileText className="mr-1.5 size-3.5"/>{consoleWrap?'Satır kaydırma açık':'Satır kaydırma kapalı'}</Button>}
                    {consoleTab!=='system'&&<Button size="sm" variant="outline" className="h-9" onClick={()=>setConsoleTimestamps(value=>!value)}><Clock3 className="mr-1.5 size-3.5"/>{consoleTimestamps?'Zaman açık':'Zaman kapalı'}</Button>}
                    <Button size="sm" variant="outline" className="h-9" onClick={()=>setConsoleAutoScroll(value=>!value)}><ArrowLeft className={`mr-1.5 size-3.5 ${consoleAutoScroll?'rotate-[-90deg]':''}`}/>{consoleAutoScroll?'Oto-kaydır açık':'Oto-kaydır kapalı'}</Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={()=>void copyConsoleView()}><Copy className="mr-1.5 size-3.5"/>Kopyala</Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={downloadConsoleView}><Download className="mr-1.5 size-3.5"/>İndir</Button>
                    {consoleTab==='server'&&<Button size="sm" variant="outline" className="h-9" onClick={()=>{setConsoleClearAt(Date.now());setNotice('Konsol görünümü temizlendi; sunucudaki gerçek log dosyaları silinmedi.')}}><Trash2 className="mr-1.5 size-3.5"/>Görünümü temizle</Button>}
                  </div>
                </div>








                {consoleTab==='server'&&<>
                  <div ref={consoleViewportRef} className="h-[470px] overflow-auto bg-[#050c15] p-4 font-mono text-[12px] leading-[1.75]">
                    {consoleRows.length?consoleRows.map(row=>{const parsed=parseLog(row.line);const tone=parsed.level==='ERROR'?'text-red-300':parsed.level==='WARN'?'text-amber-300':parsed.level==='DEBUG'?'text-sky-300':'text-slate-300';return <div key={row.id} className={`group flex gap-2 border-l-2 border-transparent px-1 hover:border-sky-500/30 hover:bg-white/[.015] ${tone}`}>{consoleTimestamps&&<span className="shrink-0 select-none text-slate-600">[{new Date(row.createdAt).toLocaleTimeString('tr-TR')}]</span>}<span className={`shrink-0 select-none ${row.stream==='stderr'?'text-amber-500':'text-slate-600'}`}>[{row.stream||'stdout'}]</span><span className={consoleWrap?'whitespace-pre-wrap break-words':'whitespace-pre'}>{row.line}</span></div>}):<div className="grid h-full place-items-center text-center text-slate-500"><div><Terminal className="mx-auto mb-3 size-8 opacity-40"/><p className="text-sm">Henüz konsol çıktısı yok.</p><p className="mt-1 text-xs">Sunucu açıldığında stdout/stderr kayıtları burada görünür.</p></div></div>}
                  </div>
                  <form className="border-t border-[#203a55] bg-[#081827] p-3" onSubmit={e=>{e.preventDefault();void sendConsoleCommand(consoleLine)}}>
                    <div className="flex gap-2">
                      <div className="flex min-w-0 flex-1 items-center rounded-lg border border-[#28445f] bg-[#07131f] focus-within:border-sky-500/50">
                        <span className="ml-3 select-none font-mono text-xs text-sky-400">&gt;</span>
                        <input
                          className="h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-xs outline-none"
                          value={consoleLine}
                          onChange={e=>{setConsoleLine(e.target.value);setConsoleHistoryIndex(-1)}}
                          onKeyDown={e=>{
                            if(e.key==='ArrowUp'&&consoleHistory.length){e.preventDefault();const next=Math.min(consoleHistory.length-1,consoleHistoryIndex+1);setConsoleHistoryIndex(next);setConsoleLine(consoleHistory[consoleHistory.length-1-next]??'')}
                            if(e.key==='ArrowDown'&&consoleHistoryIndex>=0){e.preventDefault();const next=consoleHistoryIndex-1;setConsoleHistoryIndex(next);setConsoleLine(next>=0?consoleHistory[consoleHistory.length-1-next]??'':'')}
                          }}
                          placeholder={!canConsole?'Salt okunur konsol':!running?'Sunucu kapalı':consoleDiagnostics?.server?.controlChannelReady===false?'Konsol kanalı hazır değil':'Minecraft komutu yazın…  ↑↓ geçmiş'}
                          disabled={!running||!canConsole||consoleDiagnostics?.server?.controlChannelReady===false}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <Button className="h-10 bg-sky-500 px-5 font-semibold text-slate-950 hover:bg-cyan-400" disabled={!running||!canConsole||!consoleLine.trim()||consoleDiagnostics?.server?.controlChannelReady===false}><Send className="mr-2 size-4"/>Gönder</Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Enter: gönder · ↑/↓: komut geçmişi · Komut içeriği agent olay kaydına yazılmaz.</span><span>{consoleHistory.length} komut geçmişte</span></div>
                  </form>
                </>}








                {consoleTab==='agent'&&<div ref={consoleViewportRef} className="h-[570px] overflow-auto bg-[#050c15]">
                  {consoleDiagnosticsError&&<div className="m-4 rounded-lg border border-red-500/25 bg-red-500/[.07] p-3 text-xs text-red-300"><AlertTriangle className="mr-2 inline size-4"/>Agent tanılaması alınamadı: {consoleDiagnosticsError.message}</div>}
                  <div className="border-b border-[#203a55] p-4">
                    <div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-semibold text-white">Agent olay akışı</h3><p className="mt-1 text-xs text-slate-500">Yalnız bu sunucuya ait agent görevleri, lifecycle olayları ve hatalar.</p></div><span className="text-xs text-slate-500">{agentConsoleRows.length} olay</span></div>
                    <div className="space-y-0.5 font-mono text-xs leading-6">{agentConsoleRows.length?agentConsoleRows.map((event,index)=><div key={`${event.at}-${index}`} className={event.level==='error'?'text-red-300':event.level==='warn'?'text-amber-300':'text-slate-300'}>{consoleTimestamps&&<><span className="text-slate-600">[{new Date(event.at).toLocaleTimeString('tr-TR')}]</span>{' '}</>}<span className={event.level==='error'?'text-red-400':event.level==='warn'?'text-amber-400':'text-sky-500'}>[{event.level.toUpperCase()}]</span> <span className={consoleWrap?'whitespace-pre-wrap break-words':'whitespace-pre'}>{event.message}</span></div>):<p className="py-8 text-center text-xs text-slate-500">Bu agent oturumunda henüz sunucuya özel olay kaydı yok.</p>}</div>
                  </div>
                  <div className="border-b border-[#203a55] p-4">
                    <div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-semibold text-white">Agent görev geçmişi</h3><p className="mt-1 text-xs text-slate-500">Kuyruk, çalışma ve tamamlanma durumları /api/server-actions üzerinden okunur.</p></div><span className="text-xs text-slate-500">{consoleJobs.length} görev</span></div>
                    <div className="space-y-1.5">{consoleJobs.length?consoleJobs.map(job=>{const tone=job.status==='failed'?'border-red-500/20 bg-red-500/[.05] text-red-300':job.status==='running'?'border-sky-500/20 bg-sky-500/[.05] text-sky-300':job.status==='queued'?'border-amber-500/20 bg-amber-500/[.05] text-amber-300':'border-sky-500/20 bg-sky-500/[.04] text-sky-300';return <div key={job.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${tone}`}><span className="w-20 shrink-0 text-xs font-semibold uppercase">{job.status}</span><code className="min-w-0 flex-1 truncate text-xs text-slate-300">{job.type}</code><span className="shrink-0 text-xs text-slate-500">{new Date(job.createdAt).toLocaleTimeString('tr-TR')}</span></div>}):<p className="py-3 text-center text-xs text-slate-500">Bu sunucu için görünür agent görevi yok.</p>}</div>
                  </div>
                  <div className="grid gap-0 lg:grid-cols-2">
                    <div className="border-b border-[#203a55] p-4 lg:border-b-0 lg:border-r"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">Startup stdout</h3><span className="text-xs text-slate-500">{startupStdout.length} satır</span></div><div className="max-h-[260px] overflow-auto font-mono text-xs leading-5 text-slate-400">{startupStdout.length?startupStdout.slice(-140).map((line,index)=><div key={index} className={consoleWrap?'whitespace-pre-wrap break-words':'whitespace-pre'}>{line}</div>):<span className="text-slate-600">stdout kaydı yok.</span>}</div></div>
                    <div className="p-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">Startup stderr</h3><span className="text-xs text-slate-500">{startupStderr.length} satır</span></div><div className="max-h-[260px] overflow-auto font-mono text-xs leading-5 text-amber-300/80">{startupStderr.length?startupStderr.slice(-140).map((line,index)=><div key={index} className={consoleWrap?'whitespace-pre-wrap break-words':'whitespace-pre'}>{line}</div>):<span className="text-slate-600">stderr kaydı yok.</span>}</div></div>
                  </div>
                </div>}








                {consoleTab==='system'&&<div ref={consoleViewportRef} className="min-h-[570px] bg-[#050c15] p-4">
                  {!consoleDiagnostics?<div className="grid min-h-[500px] place-items-center text-xs text-slate-500">{consoleDiagnosticsError?`Sistem tanılaması alınamadı: ${consoleDiagnosticsError.message}`:'Sistem tanılama verisi yükleniyor…'}</div>:<>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <DiagnosticCard label="Node" value={consoleDiagnostics.node.hostname} detail={`${consoleDiagnostics.node.cpuCount} CPU · load ${(consoleDiagnostics.node.loadAverage??[]).join(' / ')}`} good/>
                      <DiagnosticCard label="Agent process" value={`PID ${consoleDiagnostics.node.agentPid}`} detail={`${consoleDiagnostics.node.nodeVersion} · ${formatDuration(consoleDiagnostics.node.agentUptimeSeconds*1000)}`} good/>
                      <DiagnosticCard label="Minecraft process" value={consoleDiagnostics.server.running?`PID ${consoleDiagnostics.server.pid}`:'Kapalı'} detail={consoleDiagnostics.server.process?.state??`${server.loader} ${server.mcVersion}`} good={consoleDiagnostics.server.running}/>
                      <DiagnosticCard label="Node RAM" value={`${(consoleDiagnostics.node.memoryUsedMb/1024).toFixed(1)} / ${(consoleDiagnostics.node.memoryTotalMb/1024).toFixed(1)} GB`} detail={`%${Math.round(consoleDiagnostics.node.memoryUsedMb/Math.max(1,consoleDiagnostics.node.memoryTotalMb)*100)} kullanım`} good={consoleDiagnostics.node.memoryUsedMb/Math.max(1,consoleDiagnostics.node.memoryTotalMb)<.9}/>
                      <DiagnosticCard label="Node disk" value={consoleDiagnostics.node.diskTotalGb?`${consoleDiagnostics.node.diskUsedGb?.toFixed(1)} / ${consoleDiagnostics.node.diskTotalGb.toFixed(1)} GB`:'—'} detail={consoleDiagnostics.node.diskTotalGb?`%${Math.round((consoleDiagnostics.node.diskUsedGb??0)/consoleDiagnostics.node.diskTotalGb*100)} kullanım`:'Disk ölçümü alınamadı'} good={!consoleDiagnostics.node.diskTotalGb||(consoleDiagnostics.node.diskUsedGb??0)/consoleDiagnostics.node.diskTotalGb<.9}/>
                      <DiagnosticCard label="Konsol FIFO" value={consoleDiagnostics.server.controlChannelReady?'Hazır':'Hazır değil'} detail={consoleDiagnostics.server.controlChannelReady?'Agent restart sonrası komut kontrolü korunur':'Çalışan sunucuyu bir kez yeniden başlatmak gerekebilir'} good={consoleDiagnostics.server.controlChannelReady}/>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-xl border border-[#203a55] bg-[#071522]">
                      <div className="border-b border-[#203a55] px-4 py-3"><h3 className="text-xs font-semibold">Canlı process ayrıntıları</h3><p className="mt-1 text-xs text-slate-500">Değerler agent tarafından doğrudan Linux /proc ve node çalışma zamanından okunur.</p></div>
                      <div className="grid text-xs sm:grid-cols-2">
                        <SystemValue label="Process durumu" value={consoleDiagnostics.server.process?.state??'—'}/>
                        <SystemValue label="Process adı" value={consoleDiagnostics.server.process?.name??'—'}/>
                        <SystemValue label="RSS bellek" value={consoleDiagnostics.server.process?.vmRss??'—'}/>
                        <SystemValue label="Virtual memory" value={consoleDiagnostics.server.process?.vmSize??'—'}/>
                        <SystemValue label="Thread" value={String(consoleDiagnostics.server.process?.threads??'—')}/>
                        <SystemValue label="Açık file descriptor" value={String(consoleDiagnostics.server.openFileDescriptors??'—')}/>
                        <SystemValue label="stdout dosyası" value={formatFileBytes(consoleDiagnostics.server.stdoutBytes)}/>
                        <SystemValue label="stderr dosyası" value={formatFileBytes(consoleDiagnostics.server.stderrBytes)}/>
                        <SystemValue label="Agent uptime" value={formatDuration(consoleDiagnostics.node.agentUptimeSeconds*1000)}/>
                        <SystemValue label="Node uptime" value={formatDuration(consoleDiagnostics.node.systemUptimeSeconds*1000)}/>
                        <SystemValue label="Tracker modu" value={consoleDiagnostics.server.trackingMode||'disabled'}/>
                        <SystemValue label="Tanılama zamanı" value={new Date(consoleDiagnostics.at).toLocaleString('tr-TR')}/>
                      </div>
                    </div>
                  </>}
                </div>}
              </PanelCard>








              <div className="space-y-3">
                <PanelCard title="Bağlantı ve kontrol" subtitle="Konsol komutunun gerçekten sunucuya ulaşabildiğini doğrular." icon={Signal}>
                  <ServiceState label="Agent heartbeat" state={heartbeatHealthy?'ok':onlineNode?'warn':'bad'} value={heartbeatHealthy?'Güncel':onlineNode?'Gecikiyor':'Yok'} detail={heartbeatAge===null?'Heartbeat alınmadı':`${heartbeatAge} saniye önce`}/>
                  <ServiceState label="Node bridge" state={directBridgeOnline?'ok':server.directBridge?'bad':'neutral'} value={directBridgeOnline?'Erişilebilir':server.directBridge?'Erişilemiyor':'Doğrulanmadı'} detail={server.directBridge?.error??'Doğrudan agent bağlantısı'}/>
                  <ServiceState label="Konsol FIFO" state={!running?'neutral':consoleDiagnostics?.server?.controlChannelReady?'ok':'warn'} value={!running?'Kapalı':consoleDiagnostics?.server?.controlChannelReady?'Hazır':'Kontrol gerekli'} detail={consoleDiagnostics?.server?.controlChannelReady?'Komut kanalı hazır':'Eski launcher veya agent erişimi olabilir'}/>
                </PanelCard>








                <PanelCard title="Güvenli hızlı komutlar" subtitle="Sık kullanılan, yıkıcı olmayan Minecraft komutları." icon={Terminal}>
                  <div className="grid gap-2">
                    {[
                      ['Oyuncuları listele','list'],
                      ['Dünyayı kaydet','save-all flush'],
                      ['Whitelist listesi','whitelist list'],
                      ['Bakım mesajı','say Sunucu yönetimi tarafından kontrol ediliyor.'],
                      ...(server.loader==='paper'||server.loader==='purpur'?[['TPS durumunu göster','tps']]:[]),
                    ].map(([label,cmd])=><button key={cmd} type="button" disabled={!running||!canConsole||consoleDiagnostics?.server?.controlChannelReady===false} onClick={()=>void sendConsoleCommand(cmd)} className="flex items-center justify-between rounded-lg border border-[#203a55] bg-black/10 px-3 py-2 text-left text-xs transition hover:border-sky-500/30 hover:bg-sky-500/[.05] disabled:opacity-40"><span className="text-slate-300">{label}</span><code className="ml-2 truncate text-xs text-sky-400">{cmd}</code></button>)}
                  </div>
                </PanelCard>








                <PanelCard title="Konsol özeti" subtitle="Yüklenen veri ve filtrelerin özeti." icon={Activity}>
                  <div className="space-y-2 text-xs">
                    <MiniValue label="Sunucu kayıtları" value={String(logs.length)}/>
                    <MiniValue label="Görünür kayıt" value={String(consoleRows.length)}/>
                    <MiniValue label="Agent olayları" value={String(consoleDiagnostics?.events?.length??0)}/>
                    <MiniValue label="Startup stdout / stderr" value={`${consoleDiagnostics?.startup?.stdout?.length??0} / ${consoleDiagnostics?.startup?.stderr?.length??0}`}/>
                    <MiniValue label="Agent görevleri" value={String(consoleJobs.length)}/>
                    <MiniValue label="Komut geçmişi" value={String(consoleHistory.length)}/>
                    <MiniValue label="Otomatik kaydırma" value={consoleAutoScroll?'Açık':'Kapalı'}/>
                  </div>
                </PanelCard>
              </div>
            </div>
          </>}








          {section==='logs'&&<>
            <PageHeading title="Günlük" text="Sunucu olaylarını, hataları ve sistem kayıtlarını görüntüleyin."/>
            <div className="grid gap-3 xl:grid-cols-[1fr_310px]">
              <PanelCard className="p-0 overflow-hidden"><div className="flex flex-wrap items-center gap-2 border-b border-[#203a55] p-3"><TabPill active={logTab==='server'} onClick={()=>setLogTab('server')} icon={Activity} label="Sunucu"/><TabPill active={logTab==='error'} onClick={()=>setLogTab('error')} icon={AlertTriangle} label="Hata"/><TabPill active={logTab==='crash'} onClick={()=>setLogTab('crash')} icon={FileText} label="Crash"/><div className="flex-1"/><div className="relative min-w-0 flex-1 sm:min-w-[220px] md:max-w-md"><Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-500"/><input value={logQuery} onChange={e=>setLogQuery(e.target.value)} className="h-9 w-full rounded-md border border-[#28445f] bg-[#0a1928] pl-8 pr-3 text-xs outline-none" placeholder="Günlüklerde ara..."/></div><select value={logLevel} onChange={e=>setLogLevel(e.target.value)} className="h-9 rounded-md border border-[#28445f] bg-[#0a1928] px-3 text-xs"><option value="all">Tüm seviyeler</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select><Button size="sm" variant="outline" className="h-9" onClick={downloadLogs}><Download className="mr-1 size-3.5"/>İndir</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-white/[.025] text-slate-400"><tr><th className="px-4 py-3 font-medium">Zaman</th><th className="px-4 py-3 font-medium">Seviye</th><th className="px-4 py-3 font-medium">Kaynak</th><th className="px-4 py-3 font-medium">Olay</th><th className="px-4 py-3 font-medium">Akış</th></tr></thead><tbody>{filteredRecentLogs.map(row=>{const parsed=parseLog(row.line);return <tr key={row.id} className="border-t border-[#203a55]"><td className="px-4 py-2.5 text-slate-400">{new Date(row.createdAt).toLocaleString('tr-TR')}</td><td className="px-4 py-2.5"><LevelBadge level={parsed.level}/></td><td className="px-4 py-2.5 text-slate-300">{parsed.source}</td><td className="max-w-[520px] truncate px-4 py-2.5 text-slate-300">{parsed.message}</td><td className="px-4 py-2.5"><span className={row.stream==='stderr'?'text-amber-300':'text-slate-400'}>{row.stream||'stdout'}</span></td></tr>})}{!filteredRecentLogs.length&&<tr><td colSpan={5} className="p-8 text-center text-slate-500">Henüz günlük kaydı yok.</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t border-[#203a55] px-4 py-3 text-xs text-slate-500"><span>{filteredRecentLogs.length} / {logs.length} kayıt gösteriliyor · {logWindow==='all'?'tüm yüklenen kayıtlar':logWindow==='24h'?'son 24 saat':'son 7 gün'}</span><Button size="sm" variant="outline" className="h-7" onClick={()=>mutate()}><RefreshCw className="mr-1 size-3"/>Yenile</Button></div></PanelCard>
              <div className="space-y-3"><SideStat icon={FileText} label="Yüklenen günlük kaydı" value={String(logs.length)} sub="API tarafından getirilen son kayıtlar"/><SideStat icon={AlertTriangle} label="Son hata" value={errorCount?`${errorCount} hata`:'Yok'} sub={errorCount?'Yüklenen kayıtlarda · inceleme önerilir':'Yüklenen kayıtlarda hata görünmüyor'} danger={!!errorCount}/><SideStat icon={FileText} label="Crash raporları" value={String(logs.filter(x=>/crash|tick loop/i.test(x.line)).length)} sub="Mevcut günlüklerde"/><SideStat icon={HardDrive} label="Node depolaması" value={onlineNode&&node?.diskTotalGb?`${node.diskUsedGb.toFixed(1)} GB`:'—'} sub={onlineNode&&node?.diskTotalGb?`%${diskPct} kullanım`:'Güncel disk bilgisi yok'} progress={onlineNode?diskPct:0}/><PanelCard title="Hızlı filtreler" subtitle="Sık kullanılan filtrelere hızlıca erişin."><div className="grid grid-cols-2 gap-2"><QuickAction icon={AlertTriangle} label="Sadece hatalar" onClick={()=>{setLogTab('error');setLogLevel('all')}}/><QuickAction icon={Info} label="Sadece uyarılar" onClick={()=>{setLogTab('server');setLogLevel('WARN')}}/><QuickAction icon={Clock3} label="Son 24 saat" onClick={()=>setLogWindow('24h')}/><QuickAction icon={Clock3} label="Son 7 gün" onClick={()=>setLogWindow('7d')}/><QuickAction icon={RefreshCw} label="Filtreyi sıfırla" onClick={()=>{setLogWindow('all');setLogLevel('all');setLogTab('server');setLogQuery('')}}/></div></PanelCard></div>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <PanelCard title="Gerçek crash raporları" subtitle="Oracle node üzerindeki crash-reports/*.txt dosyaları agent taramasından gelir." icon={AlertTriangle}>{crashReportRows.length?<div className="space-y-2">{crashReportRows.slice(0,6).map((report,index)=><details key={`${String(report.name)}-${index}`} className="rounded-lg border border-[#203a55] bg-black/10 p-3"><summary className="cursor-pointer text-xs font-semibold text-white">{String(report.name??'Crash raporu')} <span className="ml-2 font-normal text-slate-500">{report.modifiedAt?new Date(String(report.modifiedAt)).toLocaleString('tr-TR'):''}</span></summary><pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/20 p-3 text-xs leading-4 text-slate-400">{String(report.tail??'İçerik alınamadı')}</pre></details>)}</div>:<EmptyText text="Henüz agent crash taraması sonucu yok. Aşağıdaki gelişmiş günlük araçlarından Crash raporlarını tara işlemini çalıştırın."/>}</PanelCard>
              <PanelCard title="Tam günlük arşivi" subtitle="stdout, stderr, logs/ ve crash-reports klasörlerini tek arşivde dışa aktarır." icon={FileText}>{logExportUrl?<div className="space-y-3"><div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 text-xs text-slate-300">Son arşiv hazır · {logExportSize?`${(logExportSize/1048576).toFixed(1)} MB`:'boyut bilinmiyor'}</div><a href={logExportUrl} className="inline-flex h-9 items-center rounded-md bg-sky-600 px-3 text-xs font-semibold text-slate-950"><Download className="mr-2 size-4"/>Node arşivini indir</a><p className="text-xs leading-4 text-slate-500">İndirme bağlantısı kısa ömürlü agent tokenıyla üretilir; arşiv token süresi sonunda otomatik temizlenir.</p></div>:<EmptyText text="Henüz node günlük arşivi oluşturulmadı. Aşağıdaki araçlardan Günlükleri dışa aktar işlemini çalıştırın."/>}</PanelCard>
            </div>
            <ServerFeatureActions serverId={id} section="logs"/>
          </>}








          {section==='players'&&<ServerPlayersCenter serverId={id} running={running} canManage={canConsole} maxPlayers={actualMaxPlayers} whitelistEnabled={actualWhitelist} antiCheatEventCount={canSeeSecurity?antiCheatEvents.length:null}/>}








          {section==='software'&&<>
            <PageHeading title="Yazılım" text="Sunucu yazılımını, modları, pluginleri, resource packleri, dünyaları ve Java ortamını yönetin."/>
            <div className="grid gap-3 xl:grid-cols-3"><InfoCard icon={Settings2} label="Sunucu yazılımı" value={`${server.loader} ${server.mcVersion}`} detail="Kurulu loader ve Minecraft sürümü"/><InfoCard icon={Database} label="Java ortamı" value={consoleDiagnostics?.server?.javaRuntime?.version?`Java ${consoleDiagnostics.server.javaRuntime.version}`:"Doğrulanmadı"} detail={consoleDiagnostics?.server?.javaRuntime?.vendor?`${consoleDiagnostics.server.javaRuntime.vendor} · ${consoleDiagnostics.server.javaRuntime.binary}`:consoleDiagnostics?.server?.javaRuntime?.error??"Agent Java runtime verisi bekleniyor"} good={!!consoleDiagnostics?.server?.javaRuntime?.version}/><InfoCard icon={Package} label="İçerik yönetimi" value="Canlı disk taraması" detail="Mod / plugin / dünya / resource pack / config" good/></div>
            {canViewSoftwareFiles?<ServerContentManager serverId={id} running={running} canEdit={canFiles} loader={server.loader} mcVersion={server.mcVersion} serverName={server.name} canInstallMarketplace={canReset&&canFiles}/>:<PanelCard title="Erişim yok" subtitle="Bu bölümün disk içeriğini görüntüleme yetkiniz yok."><EmptyText text="Yöneticiden Yazılım veya Dosyalar bölüm izni isteyin."/></PanelCard>}
            <PanelCard title="Yazılım değiştir" subtitle="Sunucu yazılımı değiştirildiğinde mevcut sunucu yedeklenir ve yeniden kurulur."><div className="grid gap-4 md:grid-cols-3"><Field label="Loader" value={softwareLoader} set={setSoftwareLoader}/><Field label="Minecraft sürümü" value={softwareVersion} set={setSoftwareVersion}/><Field label="Loader sürümü" value={softwareLoaderVersion} set={setSoftwareLoaderVersion}/></div><Button className="mt-4 bg-sky-600 text-slate-950" disabled={!canReset||busy||running||!softwareLoader.trim()||!softwareVersion.trim()} onClick={()=>command('change-software',{loader:softwareLoader.trim().toLowerCase(),mcVersion:softwareVersion.trim(),loaderVersion:softwareLoaderVersion.trim()||undefined},true)}>Yazılımı değiştir</Button></PanelCard>
            <ServerFeatureActions serverId={id} section="software"/>
          </>}








          {section==='files'&&<>
            <PageHeading title="Dosyalar" text="Sunucu dosyalarınızı yükleyin, yönetin ve silin. Modlar, eklentiler, yapılandırma dosyaları, dünyalar ve günlükler bu sayfadan yönetilir."/>
            {canViewFiles?<div className="space-y-4"><ServerBulkDownload serverId={id} canEdit={canFiles} running={running}/>{canFiles?<ServerFilesManager serverId={id} disabled={false}/>:<PanelCard title="Salt okunur dosya erişimi" subtitle="Dosyaları görüntüleyebilir ve izin verilen indirmeleri kullanabilirsiniz; değiştirme/yükleme işlemleri kapalıdır."><EmptyText text="Düzenleme için ayrıca Dosya işlemleri izni gerekir."/></PanelCard>}</div>:<PanelCard title="Erişim yok" subtitle="Sunucu dosyalarını görüntüleme yetkiniz yok."><EmptyText text="Yöneticiden Dosyalar bölüm izni isteyin."/></PanelCard>}
          </>}








          {section==='bulk-download'&&<>
            <PageHeading title="Toplu İndirme" text="Birden fazla sunucu dosyası ve klasörünü seçip güvenli şekilde ZIP paketleri oluşturun."/>
            {canViewFiles?<ServerBulkDownload serverId={id} canEdit={canFiles} running={running}/>:<PanelCard title="Erişim yok" subtitle="Toplu indirme için Dosyalar bölüm izni gerekir."><EmptyText text="Yöneticiden Dosyalar bölüm izni isteyin."/></PanelCard>}
          </>}








          {section==='worlds'&&<>
            <ServerWorldCenter
              serverId={id}
              serverName={server.name}
              running={running}
              busy={busy}
              canBackup={canBackup}
              canManage={canReset}
              worlds={data?.worlds??[]}
              lastBackupAt={lastBackup?.createdAt??null}
              onBackup={async world=>{await backupAction('backup',{kind:'world',label:world})}}
              onUpload={uploadWorldFile}
              onRefresh={mutate}
            />
          </>}








          {section==='backups'&&<>
            <PageHeading title="Yedekler" text="Sunucunuzun yedeklerini yönetin, geri yükleyin ve indirin."/>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={FileText} title="Listelenen yedek" value={String(backupData?.backups?.length??0)} detail="En yeni en fazla 100 kayıt"/><MetricCard icon={HardDrive} title="Listelenen yedek alanı" value={`${((backupData?.backups??[]).reduce((a,b)=>a+(b.sizeMb||0),0)/1024).toFixed(1)} GB`} detail="Yalnız yüklenen yedek kayıtlarının toplamı"/><MetricCard icon={CheckCircle2} title="Son başarılı yedek" value={lastBackup?new Date(lastBackup.createdAt).toLocaleString('tr-TR'):'—'} detail={lastBackup?'Hazır':'Henüz yedek yok'}/><MetricCard icon={Clock3} title="Otomatik yedekleme" value={backupAutomationLabel} detail={activeBackupSchedules?`${activeBackupSchedules} aktif panel zamanlaması`:detectedScheduledBackups?`${detectedScheduledBackups} otomatik/harici yedek algılandı`:'Yedek zamanlaması veya otomatik yedek izi bulunamadı'} accent={activeBackupSchedules>0||detectedScheduledBackups>0}/></div>
            <div className="flex flex-wrap gap-2">{canBackup&&<Button className="bg-sky-600 text-slate-950" onClick={()=>backupAction('backup',{kind:'full',label:'manual'})}><Plus className="mr-2 size-4"/>Manuel yedek oluştur</Button>}<Button variant="outline" onClick={()=>setSection('schedules')}><Clock3 className="mr-2 size-4"/>Zamanlamayı yönet</Button><Button variant="outline" onClick={()=>mutateBackups()}><RefreshCw className="mr-2 size-4"/>Yenile</Button></div>
            <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 px-4 py-3 text-xs text-amber-200"><AlertTriangle className="mr-2 inline size-4"/><b>Uyarı:</b> Yedek geri yüklendiğinde mevcut dünya verilerinizin üzerine yazılır. Geri yüklemeden önce önemli verilerinizi yedeklediğinizden emin olun.</div>
            <PanelCard className="p-0 overflow-hidden" title="Yedek listesi" subtitle="Oluşturulan yedekleri görüntüleyin, indirin veya geri yükleyin.">{backupError?<p className="p-4 text-red-300">{backupError.message}</p>:<div className="overflow-x-auto"><table className="w-full min-w-[800px] text-xs"><thead className="border-y border-[#203a55] bg-white/[.02] text-left text-slate-400"><tr><th className="p-3">Ad</th><th className="p-3">Tür</th><th className="p-3">Boyut</th><th className="p-3">Tarih</th><th className="p-3">Durum</th><th className="p-3">İşlemler</th></tr></thead><tbody>{backupData?.backups?.length?backupData.backups.map(b=><tr key={b.id} className="border-b border-[#1f3851]"><td className="p-3 font-semibold text-white">{b.blobPathname.split('/').pop()}</td><td className="p-3"><div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-slate-700/50 px-2 py-1">{b.type==='external'?'Harici':b.type==='scheduled'?'Otomatik':'Yedek'}</span><span className="rounded-full border border-[#29445f] px-2 py-1 text-[10px] text-slate-400">{b.source==='panel'?'Panel':b.source==='server-backup-folder'?'Sunucu klasörü':b.source==='node-backup-root'?'Node yedek diski':b.source==='command-history'?'Agent geçmişi':'Disk'}</span></div></td><td className="p-3">{b.sizeMb?`${b.sizeMb.toFixed(1)} MB`:'—'}</td><td className="p-3 text-slate-400">{b.createdAt?new Date(b.createdAt).toLocaleString('tr-TR'):'—'}</td><td className="p-3 text-sky-300">● {b.status==='failed'?'Başarısız':'Başarılı'}</td><td className="p-3"><div className="flex flex-wrap gap-2">{b.source==='panel'&&<a href={`/api/backups/${b.id}/download`} className="rounded-md border border-[#28445f] px-3 py-1.5">İndir</a>}{canBackup&&b.restorable!==false&&<Button size="sm" variant="outline" className="h-7" onClick={()=>backupAction('restore-backup',{path:b.blobPathname},true)}>Geri yükle</Button>}{canBackup&&b.restorable!==false&&<Button size="sm" variant="destructive" className="h-7" onClick={()=>backupAction('delete-backup',{path:b.blobPathname},true)}>Sil</Button>}{b.restorable===false&&<span className="px-2 py-1 text-[10px] text-slate-500">Salt okunur harici yedek</span>}</div></td></tr>):<tr><td colSpan={6} className="p-8 text-center text-slate-500">Henüz yedek yok.</td></tr>}</tbody></table></div>}</PanelCard>
            <ServerFeatureActions serverId={id} section="backups"/>
          </>}








          {section==='network'&&<>
            <PageHeading title="Ağ / Portlar" text="Sunucunun ağ ayarlarını yönetin, portları yapılandırın ve bağlantı bilgilerine erişin."/>
            <div className="grid gap-3 xl:grid-cols-[1.3fr_.8fr_.8fr]"><PanelCard icon={Box} title="Minecraft bağlantısı" subtitle="Oyuncuların sunucunuza katılmak için kullanacağı adres."><div className="mt-2 flex items-center gap-3 rounded-xl border border-[#203a55] bg-black/15 px-4 py-3"><code className="min-w-0 flex-1 truncate text-xl font-semibold tracking-wide text-white">{connectionAddress}</code><Button size="sm" variant="outline" onClick={()=>navigator.clipboard.writeText(connectionAddress)}><Copy className="mr-2 size-4"/>Adresi kopyala</Button></div></PanelCard><PanelCard icon={ServerIcon} title="Node durumu"><div className="mt-2 flex items-center gap-3"><span className={`size-3 rounded-full ${onlineNode?'bg-cyan-400':'bg-slate-500'}`}/><b className="text-lg">{onlineNode?'Çevrimiçi':'Çevrimdışı'}</b></div><p className="mt-2 text-xs text-slate-500">{node?.name??'Node bekleniyor'}</p><p className="mt-1 text-xs text-slate-500">Son kontrol: {node?.lastHeartbeat?new Date(node.lastHeartbeat).toLocaleString('tr-TR'):'—'}</p></PanelCard><PanelCard icon={Signal} title="Heartbeat yaşı"><div className="mt-2 text-2xl font-semibold">{heartbeatAge===null?'—':`${heartbeatAge} sn`}</div><p className="mt-2 text-xs text-slate-500">Bu değer ağ gecikmesi değil, son agent sinyalinin yaşıdır.</p></PanelCard></div>
            <div className="flex items-center justify-between rounded-xl border border-blue-500/30 bg-blue-950/20 px-4 py-3 text-xs text-blue-200"><div className="flex items-start gap-3"><Info className="mt-0.5 size-4"/><div><b>Bağlantı bilgisi</b><p className="mt-1 text-blue-200/70">Minecraft istemcisinde Çok Oyunculu &gt; Sunucu Ekle adımında yukarıdaki adresi kullanın.</p></div></div><Button size="sm" className="bg-sky-600 text-slate-950" disabled={busy} onClick={runNetworkDiagnostics}><Wifi className="mr-2 size-4"/>Bağlantıyı test et</Button></div>
            <div className="grid gap-3 xl:grid-cols-2">
              <PanelCard title="Dış bağlantı teşhisi" subtitle="Panel sunucusundan DNS, Minecraft SRV ve TCP erişilebilirliği gerçek zamanlı test edilir." icon={Wifi}>{networkDiagnostics?<div className="space-y-2 text-xs"><StatusLine icon={Globe2} label="DNS çözümleme" sub={networkDiagnostics.dns.length?networkDiagnostics.dns.map(row=>row.address).join(', '):'A/AAAA kaydı bulunamadı'} status={networkDiagnostics.dns.length?'Başarılı':'Bulunamadı'}/><StatusLine icon={Network} label="Minecraft SRV" sub={networkDiagnostics.srv.length?`${networkDiagnostics.srv[0].name}:${networkDiagnostics.srv[0].port}`:'SRV kaydı yok; doğrudan host/port kullanılıyor'} status={networkDiagnostics.srv.length?'Kullanılıyor':'Yok'}/><StatusLine icon={Signal} label="Dış TCP" sub={`${networkDiagnostics.effectiveTarget.host}:${networkDiagnostics.effectiveTarget.port}${networkDiagnostics.tcp.error?` · ${networkDiagnostics.tcp.error}`:''}`} status={networkDiagnostics.tcp.reachable?`Açık${networkDiagnostics.tcp.latencyMs!==null?` · ${networkDiagnostics.tcp.latencyMs} ms`:''}`:'Ulaşılamıyor'}/><p className="rounded-lg border border-[#203a55] bg-black/10 p-2 text-xs leading-4 text-slate-500">Son test: {new Date(networkDiagnostics.checkedAt).toLocaleString('tr-TR')}</p></div>:<EmptyText text="Henüz dış bağlantı testi çalıştırılmadı. Yukarıdaki Bağlantıyı test et düğmesini kullanın."/>}</PanelCard>
              <PanelCard title="Firewall / Oracle NSG" subtitle="Node içi port taraması ile bulut güvenlik katmanı birbirinden ayrı gösterilir." icon={ShieldCheck}><StatusLine icon={ShieldCheck} label="Node firewall telemetrisi" sub={securityPortScanFresh?`Son tarama ${securityPortObservedAt?new Date(securityPortObservedAt).toLocaleString('tr-TR'):'—'}`:'Güncel port taraması yok'} status={securityPortScanFresh?'Doğrulandı':'Tarama gerekli'}/><StatusLine icon={Box} label={`Minecraft ${server.port}/TCP`} sub={securityPortScanFresh?(minecraftPortState==='open'?'Node üzerinde dinleniyor':'Node üzerinde dinleme görülmedi'):'Port-scan çalıştırılmalı'} status={minecraftPortState==='open'?'Açık':minecraftPortState==='closed'?'Kapalı':'Bilinmiyor'}/><StatusLine icon={Network} label="Oracle Cloud NSG" sub={networkDiagnostics?.oracleNsg.detail??'OCI kontrol düzlemi henüz test edilmedi.'} status={!networkDiagnostics?'Test edilmedi':networkDiagnostics.oracleNsg.status==='connected'?(networkDiagnostics.oracleNsg.portAllowed?'Bağlı · port açık':'Bağlı · kural eksik'):networkDiagnostics.oracleNsg.status==='error'?'OCI hatası':'Yapılandırılmadı'}/><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setSection('security')} disabled={!canOpenSection('security')}><ShieldCheck className="mr-1 size-3.5"/>Güvenlik merkezini aç</Button>{networkDiagnostics?.oracleNsg.configured&&networkDiagnostics.oracleNsg.writeEnabled&&!networkDiagnostics.oracleNsg.portAllowed&&<div className="flex gap-2"><Input className="h-8 w-36 text-[12px]" value={ociCidr} onChange={e=>setOciCidr(e.target.value)} placeholder="0.0.0.0/0"/><Button size="sm" className="h-8 bg-sky-600 text-slate-950" disabled={busy} onClick={()=>void ensureOciMinecraftPort()}>NSG portunu aç</Button></div>}</div></PanelCard>
            </div>
            <PanelCard title="Port yönetimi" subtitle="Sunucunuz için gerekli portları görüntüleyin ve yönetin." action={canReset?<div className="flex gap-2"><Input className="h-8 w-28" placeholder="Yeni port" value={newPort} onChange={e=>setNewPort(e.target.value)}/><Button size="sm" className="h-8 bg-sky-600 text-slate-950" disabled={running||busy||!portChangeValid} onClick={()=>command('change-port',{port:requestedPort})}>Portu değiştir</Button></div>:undefined}><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead className="border-y border-[#203a55] bg-white/[.02] text-left text-slate-400"><tr><th className="p-3">Hizmet</th><th className="p-3">Port</th><th className="p-3">Durum</th><th className="p-3">Açıklama</th></tr></thead><tbody><PortRow icon={Box} name="Minecraft" port={server.port} state={running?minecraftPortState:'closed'} text={securityPortScanFresh?"Son 5 dakikadaki güvenlik port taramasıyla doğrulandı.":"Güncel port taraması yok; process durumu portun açık olduğunu kanıtlamaz."}/><PortRow icon={Search} name="Query" port={queryPort??'—'} state={portState(queryPort,queryEnabled)} text={queryEnabled===false?"server.properties içinde kapalı":queryEnabled===true?"server.properties içinde açık; dinleme durumu taramayla doğrulanır.":"Query ayarı canlı doğrulanmadı."}/><PortRow icon={Terminal} name="RCON" port={rconPort??'—'} state={portState(rconPort,rconEnabled)} text={rconEnabled===false?"server.properties içinde kapalı":rconEnabled===true?"server.properties içinde açık; dinleme durumu taramayla doğrulanır.":"RCON ayarı canlı doğrulanmadı."}/><PortRow icon={FileText} name="SFTP" port={data?.sftp?.port??'—'} state={data?.sftp?.status==='ready'&&!!data?.sftp?.lastTestAt?'open':data?.sftp?.status==='disabled'?'closed':'unknown'} text="Agent SFTP doğrulamasının son sonucunu gösterir."/></tbody></table></div></PanelCard>
            {manager?<ServerSftpManager serverId={id} host={server.publicHost} nodeOnline={onlineNode} sftp={data?.sftp??null} onRefresh={()=>mutate()}/>:<PanelCard title="SFTP erişimi" subtitle="SFTP bilgilerini yalnızca yönetici görüntüleyebilir."><EmptyText text="SFTP hesapları sunucuya özel ve yönetici kontrollüdür."/></PanelCard>}
            <ServerFeatureActions serverId={id} section="network"/>
          </>}
















          {section==='lost-items'&&<>
            <PageHeading title="Kayıp Eşya Takibi" text="Sunucunuzda kaybolan eşyaları gerçek tracker kayıtlarından inceleyin, filtreleyin ve yetkiniz varsa oyuncuya geri verin." right={<div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-lg border border-[#23405e] bg-[#0d1c2c] px-3 py-2 text-xs text-slate-400"><span className={`size-2 rounded-full ${trackerState==='ok'?'bg-cyan-400':trackerState==='warn'?'bg-amber-400':'bg-slate-500'}`}/>{trackerLabel}</div><Button size="sm" variant="outline" className="h-9 border-[#294762] bg-[#0c1b2a] text-slate-200 hover:bg-[#122b43]" onClick={()=>setSection('settings')}><Settings2 className="mr-2 size-4"/>Ayarlar</Button></div>}/>
            {lostItemsData?.diagnostics&&lostItemsData.diagnostics.state!=='ready'&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-100">
              <div><b>Tracker kontrolü:</b> {lostItemsData.diagnostics.message}</div>
              {canManageLostItems&&<Button size="sm" className="bg-amber-500 text-amber-950 hover:bg-amber-400" disabled={busy} onClick={async()=>{setBusy(true);setNotice('');try{const response=await fetch('/api/lost-items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'repair-tracker',serverId:id})});const body=await readJson(response);if(!response.ok)throw new Error(body.error??'Tracker onarımı başlatılamadı');setNotice(body.restartCommandId?'Tracker onarımı kuyruğa alındı; Minecraft yeniden başlatılacak.':'Tracker onarımı kuyruğa alındı.');setTimeout(()=>void Promise.all([mutate(),mutateLostItems()]),2500)}catch(error){setNotice(error instanceof Error?error.message:'Tracker onarımı başlatılamadı')}finally{setBusy(false)}}}><RefreshCw className="mr-2 size-3.5"/>Takibi Onar</Button>}
            </div>}








            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewKpi icon={Box} title="Toplam Kayıt" value={canSeeLostItems?String(lostItems.length):'—'} detail="Bu sunucu için yüklenen kayıt" tone="blue"/>
              <OverviewKpi icon={AlertTriangle} title="Bugün / Son 24 Saat" value={canSeeLostItems?String(lostLast24h):'—'} detail="Son 24 saatte kaybolan" tone={lostLast24h>0?'amber':'blue'}/>
              <OverviewKpi icon={RotateCcw} title="Geri Verilen" value={canSeeLostItems?String(restoredLostItems):'—'} detail={lostItems.length?`Kayıtların %${Math.round(restoredLostItems/lostItems.length*100)}'i`:'Henüz geri verilen yok'} tone="green"/>
              <OverviewKpi icon={Clock3} title="Bekleyen" value={canSeeLostItems?String(pendingLostItems):'—'} detail="Geri verilmemiş / doğrulanmamış" tone={pendingLostItems>0?'amber':'blue'}/>
            </div>








            {!canSeeLostItems?<DashboardCard><EmptyDashboardState text="Bu sunucunun kayıp eşya kayıtlarını görüntüleme yetkiniz yok."/></DashboardCard>:<>
              <DashboardCard className="p-3">
                <div className="grid gap-2 md:grid-cols-[minmax(220px,1.3fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_auto]">
                  <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-500"/><input value={lostQuery} onChange={e=>{setLostQuery(e.target.value);setLostPage(1)}} className="h-9 w-full rounded-lg border border-[#23405e] bg-[#0a1826] pl-9 pr-3 text-xs text-slate-200 outline-none focus:border-sky-500/60" placeholder="Oyuncu veya eşya ara..."/></div>
                  <select value={id} disabled className="h-9 rounded-lg border border-[#23405e] bg-[#0a1826] px-3 text-xs text-slate-300 opacity-90"><option value={id}>{server.name}</option></select>
                  <select value={lostReason} onChange={e=>{setLostReason(e.target.value);setLostPage(1)}} className="h-9 rounded-lg border border-[#23405e] bg-[#0a1826] px-3 text-xs text-slate-200"><option value="all">Tüm sebepler</option>{lostReasons.map(reason=><option key={reason} value={reason}>{lostReasonLabel(reason)}</option>)}</select>
                  <select value={lostRange} onChange={e=>{setLostRange(e.target.value as typeof lostRange);setLostPage(1)}} className="h-9 rounded-lg border border-[#23405e] bg-[#0a1826] px-3 text-xs text-slate-200"><option value="24h">Son 24 saat</option><option value="7d">Son 7 gün</option><option value="30d">Son 30 gün</option><option value="all">Tüm zamanlar</option></select>
                  <Button size="sm" variant="outline" className="h-9 border-[#294762] bg-[#102238] px-4 text-slate-200 hover:bg-[#173451]" onClick={()=>{setLostQuery('');setLostReason('all');setLostRange('7d')}}><RotateCcw className="mr-2 size-3.5"/>Temizle</Button>
                </div>
              </DashboardCard>








              <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_370px]">
                <DashboardCard title="Kayıp Eşya Kayıtları" subtitle="Tracker'ın Minecraft sunucusundan gönderdiği gerçek kayıtlar." action={<span className="text-xs text-slate-500">{filteredLostItems.length} kayıt</span>}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left text-xs">
                      <thead className="border-y border-[#1c3148] bg-white/[.02] text-slate-500"><tr><th className="p-3 font-medium">Eşya</th><th className="p-3 font-medium">Adet</th><th className="p-3 font-medium">Oyuncu</th><th className="p-3 font-medium">Sunucu</th><th className="p-3 font-medium">Sebep</th><th className="p-3 font-medium">Zaman</th><th className="p-3 font-medium">Durum</th></tr></thead>
                      <tbody>{pagedLostItems.map(item=>{const selected=selectedLostItem?.id===item.id;return <tr key={item.id} onClick={()=>setSelectedLostItemId(item.id)} className={`cursor-pointer border-b border-[#172a3e] transition hover:bg-sky-500/[.045] ${selected?'bg-sky-500/[.08]':'bg-transparent'}`}>
                        <td className="p-3"><div className="flex items-center gap-2.5"><MinecraftItemIcon itemId={item.itemId} version={server.mcVersion} size={30}/><div className="min-w-0"><div className="max-w-[190px] truncate font-medium text-white">{minecraftItemDisplayName(item)}</div><div className="mt-0.5 max-w-[190px] truncate font-mono text-xs text-slate-600">{item.itemId}</div></div></div></td>
                        <td className="p-3 font-semibold text-slate-200">{item.amount}</td>
                        <td className="p-3"><div className="font-medium text-slate-200">{item.playerName??'Bilinmeyen'}</div>{item.playerUuid&&<div className="mt-0.5 max-w-[120px] truncate font-mono text-xs text-slate-600">{item.playerUuid}</div>}</td>
                        <td className="p-3"><span className="inline-flex items-center gap-1.5 text-slate-300"><span className="size-2 rounded-full bg-cyan-400"/>{server.name}</span></td>
                        <td className="p-3"><span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300">{lostReasonLabel(item.reason)}</span></td>
                        <td className="p-3"><div className="text-slate-300">{relativeDate(item.occurredAt)}</div><div className="mt-0.5 text-xs text-slate-600">{new Date(item.occurredAt).toLocaleString('tr-TR')}</div></td>
                        <td className="p-3 text-right"><LostItemStatusBadge status={item.status}/></td>
                      </tr>})}{!pagedLostItems.length&&<tr><td colSpan={7} className="p-10 text-center text-slate-500">Filtreye uyan kayıp eşya kaydı yok.</td></tr>}</tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#1c3148] pt-3"><span className="text-xs text-slate-500">Sayfa {safeLostPage} / {lostPageCount} · sayfa başına {lostPageSize}</span><div className="flex gap-1"><Button size="sm" variant="outline" className="h-8 border-[#294762] bg-[#0a1826]" disabled={safeLostPage<=1} onClick={()=>setLostPage(page=>Math.max(1,page-1))}>Önceki</Button><Button size="sm" variant="outline" className="h-8 border-[#294762] bg-[#0a1826]" disabled={safeLostPage>=lostPageCount} onClick={()=>setLostPage(page=>Math.min(lostPageCount,page+1))}>Sonraki</Button></div></div>
                </DashboardCard>








                <DashboardCard title="Eşya Detayları" action={selectedLostItem?<LostItemStatusBadge status={selectedLostItem.status}/>:undefined}>
                  {!selectedLostItem?<EmptyDashboardState text="Detaylarını görmek için tablodan bir eşya seçin."/>:<div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-[#24425f] bg-[#0a1928] p-3"><MinecraftItemIcon itemId={selectedLostItem.itemId} version={server.mcVersion} size={58}/><div className="min-w-0"><h4 className="truncate text-base font-semibold text-white">{minecraftItemDisplayName(selectedLostItem)}</h4><div className="mt-1 flex flex-wrap items-center gap-2"><span className="rounded-md border border-[#315372] bg-[#10253b] px-2 py-1 text-xs text-slate-200">× {selectedLostItem.amount}</span><code className="max-w-[210px] truncate text-xs text-sky-400">{selectedLostItem.itemId}</code></div></div></div>
                    <div className="space-y-0 rounded-xl border border-[#1c3148] bg-black/10">
                      <LostItemDetailRow icon={Users} label="Oyuncu" value={selectedLostItem.playerName??'Bilinmeyen'} sub={selectedLostItem.playerUuid??undefined}/>
                      <LostItemDetailRow icon={ServerIcon} label="Sunucu" value={server.name} sub={connectionAddress}/>
                      <LostItemDetailRow icon={AlertTriangle} label="Sebep" value={lostReasonLabel(selectedLostItem.reason)} sub={selectedLostItem.reason}/>
                      <LostItemDetailRow icon={Globe2} label="Konum" value={`X: ${selectedLostItem.x} · Y: ${selectedLostItem.y} · Z: ${selectedLostItem.z}`} sub={selectedLostItem.world}/>
                      <LostItemDetailRow icon={Clock3} label="Zaman" value={new Date(selectedLostItem.occurredAt).toLocaleString('tr-TR')} sub={relativeDate(selectedLostItem.occurredAt)}/>
                      <LostItemDetailRow icon={ShieldCheck} label="Durum" value={lostItemStatusLabel(selectedLostItem.status)} sub={selectedLostItem.status==='restore_failed'?'Geri verme başarısız oldu':selectedLostItem.status==='restore_sent'?'Komut gönderildi; doğrulama alınamadı':selectedLostItem.status==='restore_queued'?'Agent kuyruğunda':selectedLostItem.status==='restored'?'Minecraft çıktısıyla doğrulandı':'Henüz geri verilmedi'}/>
                      {selectedLostItem.restoreRequestedAt&&<LostItemDetailRow icon={RotateCcw} label="Geri Verme İsteği" value={new Date(selectedLostItem.restoreRequestedAt).toLocaleString('tr-TR')} sub={selectedLostItem.status==='restore_queued'?'Agent kuyruğunda':selectedLostItem.status==='restore_sent'?'Komut gönderildi; doğrulama alınamadı':undefined}/>} 
                      {selectedLostItem.restoredAt&&<LostItemDetailRow icon={CheckCircle2} label="Geri Verilme Zamanı" value={new Date(selectedLostItem.restoredAt).toLocaleString('tr-TR')}/>} 
                      {selectedLostItem.restoredAt&&<LostItemDetailRow icon={Users} label="Geri Veren" value={selectedLostItem.restoredByName??(selectedLostItem.restoredByUserId===data?.actor?.id?(data?.actor?.name??'Yetkili'):(data?.users?.find(member=>member.id===selectedLostItem.restoredByUserId)?.name??'Yetkili'))}/>} 
                    </div>
                    {selectedLostItem.restoreError&&<div className="rounded-lg border border-red-500/25 bg-red-500/[.06] p-3 text-xs leading-4 text-red-200"><AlertTriangle className="mr-1 inline size-3.5"/>{selectedLostItem.restoreError}</div>}
                    {selectedLostItem.status==='restore_sent'&&<div className="rounded-lg border border-amber-500/25 bg-amber-500/[.06] p-3 text-xs leading-4 text-amber-100">Minecraft komutu sunucuya gönderildi ancak başarı satırı agent tarafından doğrulanamadı. Tekrar vermek eşyanın iki kez verilmesine yol açabileceği için otomatik tekrar kapalıdır.</div>}
                    <div className="grid grid-cols-2 gap-2"><Button disabled={busy||!canManageLostItems||!running||!selectedLostItem.playerName||['restored','restore_queued','restore_sent'].includes(String(selectedLostItem.status??'pending'))} className="bg-sky-600 text-white hover:bg-sky-500" onClick={()=>restoreLostItem(selectedLostItem)}><RotateCcw className="mr-2 size-4"/>Oyuncuya Ver</Button><Button disabled={busy||!canManageLostItems||selectedLostItem.status==='restore_queued'} variant="outline" className="border-red-500/30 text-red-300 hover:bg-red-500/10" onClick={()=>deleteLostItem(selectedLostItem)}><Trash2 className="mr-2 size-4"/>Sil</Button></div>
                    {!canManageLostItems&&<p className="text-xs leading-4 text-slate-500">Bu kayıtları görüntüleyebilirsiniz; geri verme ve silme için Kayıp Eşya Yönetimi yetkisi gerekir.</p>}
                    {canManageLostItems&&!running&&<p className="text-xs leading-4 text-amber-300">Oyuncuya geri vermek için Minecraft sunucusunun çalışıyor olması gerekir.</p>}
                  </div>}
                </DashboardCard>
              </div>








              <div className="grid gap-3 lg:grid-cols-2"><DashboardCard title="Tracker Durumu"><div className="space-y-1"><OverviewStatusRow label="Takip" state={server.itemTrackingEnabled?'ok':'neutral'} value={server.itemTrackingEnabled?'Açık':'Kapalı'}/><OverviewStatusRow label="Runtime doğrulaması" state={trackerRuntimeVerified?'ok':'warn'} value={trackerRuntimeVerified?'Doğrulandı':'Bekleniyor'}/><OverviewStatusRow label="Adapter" state={trackerState} value={trackerRuntime?.trackerAdapter??'Doğrulanmadı'}/><OverviewStatusRow label="Control channel" state={trackerRuntime?.controlChannelReady?'ok':running?'warn':'neutral'} value={trackerRuntime?.controlChannelReady?'Hazır':running?'Doğrulanmadı':'Sunucu kapalı'}/></div></DashboardCard><DashboardCard title="Takip ve Geri Verme Notu"><p className="text-xs leading-5 text-slate-400">Event-adapter destekli loaderlarda kayıtlar gerçek item yaşam döngüsünden gelir. Geri verme işlemi agent üzerinden Minecraft konsoluna güvenli <code className="text-sky-300">give</code> komutu gönderir ve mümkünse sunucu çıktısından sonucu doğrular. Doğrulanamayan komutlar tekrar otomatik gönderilmez.</p>{trackerRuntime?.trackerWarning&&<div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[.06] p-3 text-xs text-amber-200">{trackerRuntime.trackerWarning}</div>}</DashboardCard></div>
            </>}
          </>}
















          {section==='sftp'&&<>
            <PageHeading title="SFTP" text="Sunucu dosyalarına kullanıcı dostu ve sunucuya özel SFTP erişimini yönetin." right={<div className="rounded-lg border border-[#23405e] bg-[#0d1c2c] px-3 py-2 text-xs text-slate-400">{onlineNode?'Node bağlı':'Node doğrulanmadı'}</div>}/>
            {manager?<ServerSftpManager serverId={id} host={server.publicHost} nodeOnline={onlineNode} sftp={data?.sftp??null} onRefresh={()=>mutate()}/>:<DashboardCard title="SFTP erişimi"><EmptyDashboardState text="SFTP hesap bilgileri güvenlik nedeniyle yalnız yönetici tarafından görüntülenebilir ve değiştirilebilir."/></DashboardCard>}
          </>}








          {section==='support'&&<>
            <PageHeading title="Destek" text="Destek talepleri, özel görüşmeler, duyurular ve bilgilendirme merkezi."/>
            <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
              <DashboardCard title="BLOCKCTRL Destek Merkezi" subtitle="Sunucu teknik bilgileri otomatik eklenerek destek talebi oluşturulur."><div className="rounded-xl border border-sky-500/20 bg-[radial-gradient(circle_at_10%_10%,rgba(14,165,233,.14),transparent_45%),#0a1826] p-5"><div className="grid size-12 place-items-center rounded-xl bg-sky-500/10 text-sky-300"><LifeBuoy className="size-6"/></div><h4 className="mt-4 text-lg font-semibold text-white">Yardıma mı ihtiyacınız var?</h4><p className="mt-2 max-w-xl text-xs leading-5 text-slate-400">Bu sunucunun ID, adres, yazılım, sürüm, node ve son hata özetini talebe otomatik ekleyebilir; ardından açıklamanızı yazıp destek ekibine gönderebilirsiniz.</p><Button className="mt-4 bg-sky-600 text-white hover:bg-sky-500" onClick={()=>window.dispatchEvent(new CustomEvent('blockctrl:open-support',{detail:{view:'new-request',requestType:'support',serverContext:{serverId:id,serverName:server.name,address:connectionAddress,loader:server.loader,mcVersion:server.mcVersion,status:server.status,nodeName:node?.name,recentErrors:errorCount}}}))}><LifeBuoy className="mr-2 size-4"/>Sunucu için destek talebi</Button></div></DashboardCard>
              <DashboardCard title="Hızlı Yardım"><div className="grid gap-2"><OverviewQuickButton icon={Terminal} label="Konsol sorunları" onClick={()=>setSection('console')}/><OverviewQuickButton icon={Network} label="Bağlantı / port kontrolü" onClick={()=>setSection('network')}/><OverviewQuickButton icon={ShieldCheck} label="Güvenlik merkezi" onClick={()=>canOpenSection('security')&&setSection('security')} disabled={!canOpenSection('security')}/><OverviewQuickButton icon={FileText} label="Günlükleri incele" onClick={()=>setSection('logs')}/></div><p className="mt-3 text-xs leading-4 text-slate-600">Destek merkezi `/api/support` altyapısını kullanır; bu sayfa sahte talep veya sabit destek durumu üretmez.</p></DashboardCard>
            </div>
          </>}








          {section==='integrations'&&<>
            <ServerIntegrationsCenter serverId={id} serverName={server.name} canManage={canReset}/>
          </>}








          {section==='schedules'&&<>
            <PageHeading title="Zamanlamalar" text="Sunucunuzda otomatik olarak çalışacak görevleri yönetin."/>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={CheckCircle2} title="Aktif görev sayısı" value={`${activeSchedules} / ${data?.schedules?.length??0}`} detail="Tanımlı görevler"/><MetricCard icon={Clock3} title="Son çalışan görev" value={lastSchedule?.name??'—'} detail={lastSchedule?.lastRunAt?new Date(lastSchedule.lastRunAt).toLocaleString('tr-TR'):'Henüz çalışmadı'}/><MetricCard icon={AlertTriangle} title="Başarısız görevler" value={String(scheduledOperations.filter(o=>o.status==='failed').length)} detail="Yalnız zamanlanmış görev kayıtları"/><MetricCard icon={Clock3} title="Bekleyen işler" value={String(scheduledOperations.filter(o=>o.status==='queued'||o.status==='running').length)} detail="Bekleyen zamanlama işlemleri"/></div>
            {manager&&<PanelCard title="Yeni zamanlanmış görev oluştur" subtitle="Sunucunuzda belirli aralıklarla çalışacak otomatik bir görev tanımlayın."><div className="grid gap-3 lg:grid-cols-3"><Field label="Görev adı" value={scheduleName} set={setScheduleName}/><SelectField label="İşlem türü" value={scheduleTask} set={v=>setScheduleTask(v as typeof scheduleTask)} options={['restart','backup','log-cleanup']} labels={{restart:'Sunucu komutu / restart',backup:'Yedek oluştur', 'log-cleanup':'Log temizliği'}}/><SelectField label="Zamanlama türü" value={scheduleCadence} set={v=>setScheduleCadence(v as typeof scheduleCadence)} options={['daily','weekly','interval']} labels={{daily:'Her gün',weekly:'Her hafta',interval:'Belirli aralıkla'}}/>{scheduleCadence!=='interval'&&<div className="space-y-2"><Label>Saat</Label><Input type="time" value={scheduleTime} onChange={e=>setScheduleTime(e.target.value)} className="border-[#28445f] bg-[#091725]"/></div>}{scheduleCadence==='weekly'&&<SelectField label="Gün" value={scheduleWeekday} set={setScheduleWeekday} options={['1','2','3','4','5','6','0']} labels={{'1':'Pazartesi','2':'Salı','3':'Çarşamba','4':'Perşembe','5':'Cuma','6':'Cumartesi','0':'Pazar'}}/>}{scheduleCadence==='interval'&&<Field label="Aralık (dakika)" value={scheduleInterval} set={setScheduleInterval}/>} {scheduleTask==='log-cleanup'&&<Field label="Saklama süresi (gün)" value={retentionDays} set={setRetentionDays}/>}</div><Button className="mt-4 bg-sky-600 text-slate-950" disabled={busy||scheduleName.trim().length<2} onClick={()=>panelAction('create-schedule',{name:scheduleName.trim(),taskType:scheduleTask,cadence:scheduleCadence,timeOfDay:scheduleTime,weekday:Number(scheduleWeekday),intervalMinutes:Number(scheduleInterval),retentionDays:Number(retentionDays),timezoneOffsetMinutes:new Date().getTimezoneOffset()})}><Plus className="mr-2 size-4"/>Görev oluştur</Button></PanelCard>}
            <PanelCard title="Mevcut zamanlanmış görevler" subtitle="Oluşturduğunuz zamanlanmış görevleri görüntüleyin ve yönetin."><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-xs"><thead className="border-y border-[#203a55] bg-white/[.02] text-left text-slate-400"><tr><th className="p-3">Görev adı</th><th className="p-3">İşlem türü</th><th className="p-3">Zamanlama</th><th className="p-3">Sonraki çalışma</th><th className="p-3">Son çalışma</th><th className="p-3">Durum</th><th className="p-3">İşlemler</th></tr></thead><tbody>{data?.schedules?.length?data.schedules.map(s=><tr key={s.id} className="border-b border-[#1f3851]"><td className="p-3"><b className="text-white">{s.name}</b><div className="mt-0.5 text-xs text-slate-500">Otomatik görev</div></td><td className="p-3">{s.taskType==='restart'?'Sunucu komutu':s.taskType==='backup'?'Yedek oluştur':'Dosya temizleme'}</td><td className="p-3">{s.cadence==='daily'?`Her gün ${s.timeOfDay??''}`:s.cadence==='weekly'?`Her hafta ${s.timeOfDay??''}`:`Her ${s.intervalMinutes} dk`}</td><td className="p-3 text-slate-300">{new Date(s.nextRunAt).toLocaleString('tr-TR')}</td><td className="p-3 text-slate-400">{s.lastRunAt?new Date(s.lastRunAt).toLocaleString('tr-TR'):'Hiç çalışmadı'}</td><td className="p-3"><span className={s.enabled?'rounded-full bg-sky-500/10 px-2 py-1 text-sky-300':'rounded-full bg-red-500/10 px-2 py-1 text-red-300'}>● {s.enabled?'Aktif':'Pasif'}</span></td><td className="p-3">{manager&&<div className="flex gap-1.5"><Button size="sm" variant="outline" className="h-7" onClick={()=>panelAction('toggle-schedule',{scheduleId:s.id,enabled:!s.enabled})}>{s.enabled?'Durdur':'Etkinleştir'}</Button><Button size="icon" variant="destructive" className="size-7" onClick={async()=>{if(await actionConfirm.ask('Bu zamanlanmış görev kalıcı olarak silinecek.',{title:'Zamanlamayı sil',confirmLabel:'Sil',danger:true}))await panelAction('delete-schedule',{scheduleId:s.id})}}><Trash2 className="size-3.5"/></Button></div>}</td></tr>):<tr><td colSpan={7} className="p-8 text-center text-slate-500">Henüz zamanlanmış görev yok.</td></tr>}</tbody></table></div></PanelCard>
          </>}








          {section==='databases'&&<>
            <PageHeading title="Veritabanları" text="Minecraft eklentileri için MariaDB/MySQL veritabanlarını node üzerinde yönetin."/>
            <div className="grid gap-3 xl:grid-cols-[1.15fr_.85fr]">{manager&&<PanelCard title="Yeni veritabanı" subtitle="Parola agent tarafından üretilir ve yalnız VPS üzerindeki güvenli alana kaydedilir." icon={Database}><div className="grid gap-3 sm:grid-cols-2"><Field label="Veritabanı adı" value={databaseName} set={setDatabaseName}/><Field label="Kullanıcı adı" value={databaseUser} set={setDatabaseUser}/><MiniValue label="Motor" value="MariaDB"/><MiniValue label="Karakter seti" value="utf8mb4"/></div><Button className="mt-4 bg-sky-600 text-slate-950" disabled={busy||databaseName.length<2||databaseUser.length<2} onClick={()=>panelAction('create-database',{databaseName:databaseName.trim(),databaseUser:databaseUser.trim()})}><Database className="mr-2 size-4"/>Veritabanı oluştur</Button></PanelCard>}<PanelCard title="Güvenlik ve erişim" subtitle="Veritabanlarınızın güvenliği ve erişim ayarları." icon={Shield}><StatusLine icon={KeyRound} label="Kimlik bilgisi dosyası" sub="Agent tarafından oluşturulan credentials path" status={primaryDatabase?.credentialsPath?'Hazır':'Doğrulanmadı'}/><StatusLine icon={Network} label="Bağlantı kapsamı" sub={primaryDatabase?`${primaryDatabase.host}:${primaryDatabase.port}`:'Veritabanı yok'} status={primaryDatabase&&(primaryDatabase.host==='127.0.0.1'||primaryDatabase.host==='localhost')?'Yerel':primaryDatabase?'Uzak / özel':'Veri yok'}/><StatusLine icon={RotateCcw} label="Veritabanı yedeği" sub={primaryDatabase?.lastBackup?.filename?`${primaryDatabase.lastBackup.filename} · ${formatFileBytes(Number(primaryDatabase.lastBackup.sizeBytes??0))}`:'Henüz doğrulanmış DB yedeği yok'} status={primaryDatabase?.lastBackup?'Hazır':'Yedek yok'}/><StatusLine icon={ShieldCheck} label="SSL bağlantı" sub={primaryDatabase?.telemetry?.tls?`have_ssl=${primaryDatabase.telemetry.tls.available?'YES':'NO'} · require_secure_transport=${primaryDatabase.telemetry.tls.required?'ON':'OFF'}`:'Telemetri çalıştırılmalı'} status={!primaryDatabase?.telemetry?.tls?'Test gerekli':primaryDatabase.telemetry.tls.required?'Zorunlu':primaryDatabase.telemetry.tls.available?'Destekli':'Kapalı'}/><StatusLine icon={FileText} label="Slow query" sub={primaryDatabase?.telemetry?.slowQuery?`slow_query_log=${primaryDatabase.telemetry.slowQuery.enabled?'ON':'OFF'} · ${primaryDatabase.telemetry.slowQuery.slowQueries??0} slow query · eşik ${primaryDatabase.telemetry.slowQuery.longQueryTime??0}s`:'Telemetri çalıştırılmalı'} status={!primaryDatabase?.telemetry?.slowQuery?'Test gerekli':primaryDatabase.telemetry.slowQuery.enabled?'Aktif':'Kapalı'}/></PanelCard></div>
            <PanelCard title="Yönetilen veritabanları" subtitle="Oluşturduğunuz veritabanlarını yönetin, yedek alın ve bağlantı bilgilerini görüntüleyin."><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="border-y border-[#203a55] bg-white/[.02] text-left text-slate-400"><tr><th className="p-3">Veritabanı adı</th><th className="p-3">Host / Port</th><th className="p-3">Kullanıcı adı</th><th className="p-3">Motor / Sürüm</th><th className="p-3">Durum</th><th className="p-3">İşlemler</th></tr></thead><tbody>{data?.databases?.length?data.databases.map(db=><tr key={db.id} className="border-b border-[#1f3851]"><td className="p-3 font-semibold text-white">{db.databaseName}</td><td className="p-3 font-mono">{db.host}:{db.port}</td><td className="p-3">{db.databaseUser}</td><td className="p-3">{db.engine}</td><td className="p-3"><span className={db.status==='ready'?'text-sky-300':db.status==='failed'?'text-red-300':'text-amber-300'}>● {db.status}</span></td><td className="p-3">{manager&&<div className="flex flex-wrap gap-1.5"><Button size="sm" variant="outline" className="h-7" disabled={busy||db.status!=='ready'} onClick={()=>void databaseAction(db.id,'database-status')}>Telemetri</Button><Button size="sm" variant="outline" className="h-7" disabled={busy||db.status!=='ready'} onClick={()=>void databaseAction(db.id,'database-backup')}>Yedek al</Button><Button size="sm" variant="outline" className="h-7" disabled={busy||db.status!=='ready'} onClick={()=>void databaseAction(db.id,'database-optimize')}>Optimize</Button><Button size="sm" variant="outline" className="h-7" disabled={busy||db.status!=='ready'} onClick={async()=>{if(await actionConfirm.ask('Tablo onarımı veritabanında bakım işlemleri çalıştıracak.',{title:'Veritabanını onar',confirmLabel:'Onar'}))await databaseAction(db.id,'database-repair',{confirm:true})}}>Repair</Button>{db.lastBackup?.downloadUrl&&<Button size="sm" variant="outline" className="h-7" onClick={()=>window.open(db.lastBackup?.downloadUrl,'_blank','noopener,noreferrer')}>Son yedeği indir</Button>}{db.lastBackup?.filename&&<Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={async()=>{if(await actionConfirm.ask(`${db.lastBackup?.filename} yedeği ${db.databaseName} üzerine geri yüklenecek.`,{title:'Veritabanını geri yükle',confirmLabel:'Geri yükle',danger:true,requiredText:'RESTORE'}))await databaseAction(db.id,'database-restore',{filename:db.lastBackup?.filename,confirm:true})}}>Geri yükle</Button>}<Button size="sm" variant="outline" className="h-7" disabled={busy||db.status!=='ready'} onClick={async()=>{if(await actionConfirm.ask('Veritabanı parolası yenilenecek; eski bağlantı bilgileri geçersiz olacaktır.',{title:'Parolayı döndür',confirmLabel:'Parolayı yenile'}))await panelAction('rotate-database-password',{databaseId:db.id})}}>Şifre döndür</Button><Button size="sm" variant="destructive" className="h-7" disabled={busy||db.status==='deleting'} onClick={async()=>{if(await actionConfirm.ask(`${db.databaseName} veritabanı ve yönetilen kullanıcı kalıcı olarak silinecek.`,{title:'Veritabanını sil',confirmLabel:'Kalıcı sil',danger:true,requiredText:db.databaseName}))await panelAction('delete-database',{databaseId:db.id})}}>Sil</Button></div>}</td></tr>):<tr><td colSpan={6} className="p-8 text-center text-slate-500">Henüz yönetilen veritabanı yok.</td></tr>}</tbody></table></div></PanelCard>
            <div className="grid gap-3 xl:grid-cols-2"><PanelCard title="Bağlantı bilgileri" subtitle="Sunucunuzdaki veritabanlarına bağlanmak için aşağıdaki bilgileri kullanın." icon={Network}><div className="grid gap-3 sm:grid-cols-3 sm:gap-4"><MiniValue label="Host" value={primaryDatabase?.host??'—'}/><MiniValue label="Port" value={primaryDatabase?String(primaryDatabase.port):'—'}/><MiniValue label="Motor" value={primaryDatabase?.engine??'Veritabanı seçilmedi'}/></div></PanelCard><PanelCard title="Sorgu ve bakım geçmişi" subtitle="Veritabanlarınızla ilgili son işlemler ve sistem olayları." icon={Clock3}><div className="space-y-2">{(data?.operations??[]).filter(o=>/database|db/i.test(o.operation)).slice(0,5).map(o=><EventRow key={o.id} title={o.operation} text={o.message??o.status} date={new Date(o.createdAt).toLocaleString('tr-TR')}/>)}{!(data?.operations??[]).some(o=>/database|db/i.test(o.operation))&&<EmptyText text="Veritabanı işlem kaydı bulunmadı."/>}</div></PanelCard></div>
          </>}








          {manager&&section==='access'&&<ServerAccessSection
            users={data?.users??[]}
            permissions={data?.permissions??[]}
            selectedUserId={selectedUserId}
            userQuery={userQuery}
            busy={busy}
            onSelectUser={setSelectedUserId}
            onQueryChange={setUserQuery}
            onNotice={setNotice}
            onPermissionAction={permissionAction}
          />}








          {manager&&section==='security'&&<>
            <PageHeading title="Güvenlik" text="Firewall, ağ, erişim, dosya bütünlüğü, SFTP ve hile korumasını gerçek agent verileriyle yönetin."/>
            <ServerSecurityCenter serverId={id} running={running} onNavigate={target=>setSection(target as ServerNavKey)}/>
          </>}
        </div>
        <ServerDetailFooter onlineNode={onlineNode}/>
      </section>
    </div>
  </main>
}








function DashboardCard({title,subtitle,action,children,className=''}:{title?:string;subtitle?:string;action?:React.ReactNode;children?:React.ReactNode;className?:string}){return <section className={`rounded-lg border border-[#1c3044] bg-[#0b1827] p-3.5 shadow-[0_8px_24px_rgba(0,0,0,.12)] transition hover:border-[#29445f] ${className}`}>{(title||subtitle||action)&&<div className="mb-3 flex items-start justify-between gap-3"><div>{title&&<h4 className="text-[13px] font-semibold tracking-[-.01em] text-white">{title}</h4>}{subtitle&&<p className="mt-1 text-[10px] leading-4 text-slate-500">{subtitle}</p>}</div>{action}</div>}{children}</section>}
function OverviewKpi({icon:Icon,title,value,detail,progress,tone='blue'}:{icon:React.ComponentType<{className?:string}>;title:string;value:string;detail:string;progress?:number;tone?:'blue'|'green'|'amber'}){const iconTone=tone==='green'?'text-emerald-300':tone==='amber'?'text-amber-300':'text-sky-300';const barTone=tone==='green'?'bg-emerald-400':tone==='amber'?'bg-amber-400':'bg-sky-400';return <DashboardCard className="min-h-[96px] p-3"><div className="flex items-start gap-2.5"><div className={`grid size-8 shrink-0 place-items-center ${iconTone}`}><Icon className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-[10px] text-slate-500">{title}</p><p className="mt-1 truncate text-[15px] font-semibold text-white">{value}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{detail}</p>{progress!==undefined&&<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#26384c]"><div className={`h-full rounded-full ${barTone}`} style={{width:`${Math.max(0,Math.min(100,progress))}%`}}/></div>}</div></div></DashboardCard>}
function chartPath(values:Array<number|null>,max:number){if(values.length<2||max<=0)return'';let path='';let drawing=false;values.forEach((value,index)=>{if(value===null||!Number.isFinite(value)){drawing=false;return}const x=18+(index/Math.max(1,values.length-1))*604;const y=164-(Math.max(0,Math.min(max,value))/max)*130;path+=`${drawing?' L':' M'} ${x.toFixed(1)} ${y.toFixed(1)}`;drawing=true});return path.trim()}
function chartLabel(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'—'}
function TelemetryChart({metrics,mode}:{metrics:ServerMetric[];mode:'players'|'resources'}){
  if(!metrics.length)return <EmptyDashboardState text="Grafik için henüz gerçek telemetri örneği yok."/>
  const playerValues=metrics.map(metric=>Number.isFinite(metric.players)?metric.players:null)
  const cpuValues=metrics.map(metric=>Number.isFinite(metric.cpuPercent)?metric.cpuPercent:null)
  const ramValues=metrics.map(metric=>metric.memoryTotalMb>0?Math.min(100,metric.memoryUsedMb/metric.memoryTotalMb*100):null)
  const diskValues=metrics.map(metric=>metric.diskTotalGb>0?Math.min(100,metric.diskUsedGb/metric.diskTotalGb*100):null)
  const maxPlayers=Math.max(5,...playerValues.filter((value):value is number=>value!==null))
  const first=metrics[0],last=metrics[metrics.length-1]
  const marks=[0,.25,.5,.75,1].map((ratio,index)=>metrics[Math.min(metrics.length-1,Math.round((metrics.length-1)*ratio))]??metrics[index]??first)
  return <div>
    <div className="mb-1 flex min-h-5 items-center justify-end gap-3 text-[10px] text-slate-400">
      {mode==='resources'?<>
        <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-emerald-400"/>CPU</span>
        <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-sky-400"/>RAM</span>
        <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-violet-400"/>Disk</span>
      </>:<span className="flex items-center gap-1"><i className="size-2 rounded-full bg-sky-400"/>Çevrimiçi Oyuncu</span>}
    </div>
    <div className="relative">
      <svg viewBox="0 0 640 180" className="h-[156px] w-full" role="img" aria-label={mode==='players'?'Oyuncu aktivitesi grafiği':'Kaynak kullanımı grafiği'}>
        {[34,66.5,99,131.5,164].map((y,index)=><g key={y}><line x1="18" x2="622" y1={y} y2={y} className="stroke-[#203247]" strokeWidth="1"/><text x="2" y={y+3} className="fill-slate-600 text-[9px]">{mode==='players'?Math.round(maxPlayers*(4-index)/4):100-index*25}</text></g>)}
        {[18,169,320,471,622].map(x=><line key={x} x1={x} x2={x} y1="34" y2="164" className="stroke-[#16283a]" strokeWidth="1"/>)}
        {mode==='players'?<>
          <path d={`${chartPath(playerValues,maxPlayers)} L 622 164 L 18 164 Z`} className="fill-sky-500/15"/>
          <path d={chartPath(playerValues,maxPlayers)} fill="none" className="stroke-sky-400" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </>:<>
          <path d={`${chartPath(ramValues,100)} L 622 164 L 18 164 Z`} className="fill-sky-500/[.08]"/>
          <path d={`${chartPath(diskValues,100)} L 622 164 L 18 164 Z`} className="fill-violet-500/[.08]"/>
          <path d={chartPath(cpuValues,100)} fill="none" className="stroke-emerald-400" strokeWidth="2" strokeLinecap="round"/>
          <path d={chartPath(ramValues,100)} fill="none" className="stroke-sky-400" strokeWidth="2" strokeLinecap="round"/>
          <path d={chartPath(diskValues,100)} fill="none" className="stroke-violet-400" strokeWidth="2" strokeLinecap="round"/>
        </>}
      </svg>
      <div className="flex justify-between px-1 text-[9px] text-slate-600">{marks.map((item,index)=><span key={index}>{item?chartLabel(item.createdAt):index===0?chartLabel(first.createdAt):chartLabel(last.createdAt)}</span>)}</div>
    </div>
  </div>
}
function OverviewPropertyRow({label,value,good}:{label:string;value:string;good?:boolean}){return <div className="flex items-center justify-between gap-3 rounded-md bg-[#102033] px-3 py-2 text-[10px]"><span className="text-slate-400">{label}</span><span className={`max-w-[60%] truncate text-right font-medium ${good?'text-emerald-300':'text-slate-200'}`}>{value}</span></div>}
function OverviewStatusRow({label,state,value}:{label:string;state:'ok'|'warn'|'bad'|'neutral';value:string}){const dot=state==='ok'?'bg-emerald-400':state==='warn'?'bg-amber-400':state==='bad'?'bg-red-400':'bg-slate-500';const text=state==='ok'?'text-emerald-300':state==='warn'?'text-amber-300':state==='bad'?'text-red-300':'text-slate-400';return <div className="flex items-center gap-2 border-b border-[#1a2b3d] py-1.5 last:border-0"><span className={`size-2 shrink-0 rounded-full ${dot}`}/><span className="min-w-0 flex-1 truncate text-[10px] text-slate-400">{label}</span><span className={`text-[10px] font-medium ${text}`}>{value}</span></div>}
function OverviewQuickButton({icon:Icon,label,onClick,disabled}:{icon:React.ComponentType<{className?:string}>;label:string;onClick?:()=>void;disabled?:boolean}){return <button type="button" onClick={onClick} disabled={disabled} className="group flex min-h-[68px] flex-col items-center justify-center gap-2 rounded-md border border-[#1f354b] bg-[#102033] px-1.5 text-[10px] font-medium text-slate-200 transition hover:border-sky-400/35 hover:bg-[#142842] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><Icon className="size-5 text-slate-300 transition group-hover:text-sky-300"/>{label}</button>}
function CompactDashboardRow({left,middle,right,tone}:{left:string;middle:string;right:string;tone:'ok'|'warn'|'bad'|'info'}){const badge=tone==='ok'?'bg-sky-500/10 text-sky-300':tone==='warn'?'bg-amber-500/10 text-amber-300':tone==='bad'?'bg-red-500/10 text-red-300':'bg-sky-500/10 text-sky-300';return <div className="grid grid-cols-[minmax(72px,.7fr)_minmax(0,1.4fr)_auto] items-center gap-2 border-b border-[#172a3e] py-2 last:border-0"><span className={`w-fit max-w-full truncate rounded-md px-2 py-1 text-xs ${badge}`}>{left}</span><span className="truncate text-xs text-slate-300" title={middle}>{middle}</span><span className="whitespace-nowrap text-xs text-slate-600">{right}</span></div>}
function EmptyDashboardState({text}:{text:string}){return <div className="rounded-lg border border-dashed border-[#24405c] bg-[#091725] p-5 text-center text-xs text-slate-500">{text}</div>}
function OverviewTopStat({label,value,sub}:{label:string;value:string;sub:string}){return <div className="min-w-0 border-b border-[#203a55] p-3.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">{label}</p><p className="mt-1 truncate text-[15px] font-semibold text-white">{value}</p><p className="mt-0.5 truncate text-xs text-slate-600">{sub}</p></div>}
function ResourceGauge({label,value,detail}:{label:string;value:number|null;detail:string}){const safe=value===null?0:Math.max(0,Math.min(100,value));const tone=value===null?'bg-slate-600':value>=90?'bg-red-400':value>=75?'bg-amber-400':'bg-cyan-400';return <div><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-300">{label}</span><span className="text-slate-500">{detail}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800/80"><div className={`h-full rounded-full transition-all ${tone}`} style={{width:`${safe}%`}}/></div></div>}
function SignalTile({label,value,sub}:{label:string;value:string;sub:string}){return <div className="rounded-lg border border-[#203a55] bg-black/10 p-3"><p className="text-xs uppercase tracking-[.14em] text-slate-600">{label}</p><p className="mt-1 text-xs font-semibold text-slate-200">{value}</p><p className="mt-1 truncate text-xs text-slate-600">{sub}</p></div>}
function ConfigTile({label,value,good,warn}:{label:string;value:string;good?:boolean;warn?:boolean}){return <div className="rounded-lg border border-[#203a55] bg-black/10 p-3"><p className="text-xs uppercase tracking-[.14em] text-slate-600">{label}</p><div className="mt-1.5 flex items-center gap-2"><span className={`size-1.5 rounded-full ${good?'bg-cyan-400':warn?'bg-amber-400':'bg-slate-600'}`}/><p className="truncate text-xs font-medium text-slate-200">{value}</p></div></div>}
function ServiceState({label,state,value,detail}:{label:string;state:'ok'|'warn'|'bad'|'neutral';value:string;detail:string}){const dot=state==='ok'?'bg-cyan-400':state==='warn'?'bg-amber-400':state==='bad'?'bg-red-400':'bg-slate-500';return <div className="flex items-start gap-3 rounded-lg border border-[#203a55] bg-black/10 p-3"><span className={`mt-1 size-2 shrink-0 rounded-full ${dot}`}/><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 text-xs font-semibold text-slate-200">{value}</p><p className="mt-1 truncate text-xs text-slate-600">{detail}</p></div></div>}
function OverviewAlert({tone,title,text}:{tone:'critical'|'warn'|'info';title:string;text:string}){const style=tone==='critical'?'border-red-500/25 bg-red-500/[.07] text-red-200':tone==='warn'?'border-amber-500/25 bg-amber-500/[.07] text-amber-200':'border-blue-500/25 bg-blue-500/[.07] text-blue-200';return <div className={`flex items-start gap-3 rounded-lg border p-3 ${style}`}><AlertTriangle className="mt-0.5 size-4 shrink-0"/><div><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-xs opacity-70">{text}</p></div></div>}
function PageHeading({title,text,right}:{title:string;text:string;right?:React.ReactNode}){return <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(7,31,50,.90),rgba(3,15,27,.90))] px-5 py-5 shadow-[0_18px_55px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.025)] backdrop-blur-xl"><div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-cyan-400/[.055] blur-3xl"/><div className="relative flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.24em] text-cyan-300/70">BLOCKCTRL · SUNUCU YÖNETİMİ</p><h3 className="mt-1.5 text-[24px] font-bold tracking-[-.025em] text-white">{title}</h3><p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-slate-400">{text}</p></div>{right}</div></div>}
function PanelCard({title,subtitle,icon:Icon,action,children,className=''}:{title?:string;subtitle?:string;icon?:React.ComponentType<{className?:string}>;action?:React.ReactNode;children?:React.ReactNode;className?:string}){return <section className={`rounded-2xl border border-cyan-400/15 bg-[linear-gradient(145deg,rgba(7,26,43,.90),rgba(3,15,27,.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.025),0_16px_44px_rgba(0,0,0,.18)] backdrop-blur-xl ${className}`}>{(title||subtitle||action)&&<div className="mb-3.5 flex items-start justify-between gap-3"><div className="flex items-start gap-3">{Icon&&<div className="grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[.07] text-cyan-300"><Icon className="size-4.5"/></div>}<div>{title&&<h4 className="text-sm font-semibold tracking-[-.01em] text-white">{title}</h4>}{subtitle&&<p className="mt-1 text-[11px] leading-4 text-slate-500">{subtitle}</p>}</div></div>{action}</div>}{children}</section>}
function MetricCard({icon:Icon,title,value,detail,progress,accent=false}:{icon:React.ComponentType<{className?:string}>;title:string;value:string;detail:string;progress?:number;accent?:boolean}){return <PanelCard className="min-h-[100px]"><div className="flex gap-3"><div className={`grid size-10 shrink-0 place-items-center rounded-lg ${accent?'bg-sky-500/12 text-sky-300':'bg-sky-500/[.08] text-sky-300'}`}><Icon className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-xs text-slate-400">{title}</p><p className="mt-1 truncate text-[19px] font-semibold text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p>{progress!==undefined&&<div className="mt-2 h-1.5 rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{width:`${Math.max(0,Math.min(100,progress))}%`}}/></div>}</div></div></PanelCard>}
function CompactMetric({label,value,sub,good}:{label:string;value:string;sub:string;good?:boolean}){return <PanelCard className="min-h-[96px]"><div className="flex items-center justify-between"><p className="text-[10px] font-medium uppercase tracking-[.14em] text-slate-500">{label}</p><span className={`size-2 rounded-full ${good?'bg-emerald-400 shadow-[0_0_10px_#34d399]':'bg-slate-600'}`}/></div><p className="mt-2 text-[18px] font-semibold tracking-[-.02em] text-white">{value}</p><p className="mt-1 text-[11px] text-slate-500">{sub}</p></PanelCard>}
function MiniStat({icon:Icon,label,value,sub,mono}:{icon:React.ComponentType<{className?:string}>;label:string;value:string;sub:string;mono?:boolean}){return <div className="flex gap-3 rounded-lg border border-[#1f3851] bg-black/10 p-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-500/[.08] text-sky-300"><Icon className="size-4"/></div><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 truncate text-sm font-semibold ${mono?'font-mono':''}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div></div>}
function QuickAction({icon:Icon,label,onClick,disabled}:{icon:React.ComponentType<{className?:string}>;label:string;onClick?:()=>void;disabled?:boolean}){return <button onClick={onClick} disabled={disabled} className="flex min-h-10 items-center gap-2 rounded-lg border border-[#203a55] bg-black/10 px-3 text-left text-xs font-medium text-slate-200 transition hover:bg-[#0d2034]/25 disabled:cursor-not-allowed disabled:opacity-35"><Icon className="size-4 text-slate-300"/>{label}</button>}
function HealthRow({label,value}:{label:string;value:number|null}){return <div className="flex items-center gap-3 border-b border-[#1d344c] py-2.5 last:border-0"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-200">{label}</p><div className="mt-1.5 h-1.5 rounded-full bg-slate-800">{value!==null&&<div className="h-full rounded-full bg-cyan-400" style={{width:`${Math.max(0,Math.min(100,value))}%`}}/>}</div></div><span className="text-xs font-semibold">{value===null?'—':`${value}%`}</span></div>}
function StatusLine({icon:Icon,label,sub,status}:{icon:React.ComponentType<{className?:string}>;label:string;sub:string;status:string}){const ok=/^(active|aktif|açık|ready|hazır|standard|strict|public|private)$/i.test(status);const bad=/^(off|kapalı|error|failed)$/i.test(status);return <div className="flex items-center gap-3 border-b border-[#1d344c] py-2 last:border-0"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/[.08] text-sky-300"><Icon className="size-4"/></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-200">{label}</p><p className="text-xs text-slate-500">{sub}</p></div><span className="flex items-center gap-1.5 text-xs text-slate-300"><span className={`size-1.5 rounded-full ${ok?'bg-cyan-400':bad?'bg-red-400':'bg-slate-500'}`}/>{status}</span></div>}
function NoticeRow({tone,title,text}:{tone:'warn'|'info';title:string;text:string}){return <div className="flex gap-3 border-b border-[#1d344c] py-2.5 last:border-0"><div className={`grid size-7 shrink-0 place-items-center rounded-full ${tone==='warn'?'bg-amber-500/15 text-amber-300':'bg-blue-500/15 text-blue-300'}`}>{tone==='warn'?<AlertTriangle className="size-3.5"/>:<Info className="size-3.5"/>}</div><div className="min-w-0"><p className="text-xs font-medium text-slate-200">{title}</p><p className="mt-0.5 text-xs text-slate-500">{text}</p></div></div>}
function OperationTable({rows}:{rows:Operation[]}){return <div className="space-y-1">{rows.length?rows.map(o=><div key={o.id} className="grid items-center gap-2 border-b border-[#1d344c] py-2 text-xs last:border-0 md:grid-cols-[90px_180px_1fr_150px]"><span className={`w-fit rounded-full px-2 py-1 ${o.status==='completed'?'bg-sky-500/10 text-sky-300':o.status==='failed'?'bg-red-500/10 text-red-300':'bg-amber-500/10 text-amber-300'}`}>{o.status}</span><code className="truncate text-slate-300">{o.operation}</code><span className="truncate text-slate-500">{o.message??'İşlem kaydı'}</span><span className="text-right text-slate-500">{new Date(o.createdAt).toLocaleString('tr-TR')}</span></div>):<EmptyText text="Henüz işlem kaydı yok."/>}</div>}
function Field({label,value,set}:{label:string;value:string;set:(v:string)=>void}){return <div className="space-y-1.5"><Label className="text-xs text-slate-300">{label}</Label><Input value={value} onChange={e=>set(e.target.value)} className="h-9 border-[#28445f] bg-[#091725] text-xs focus-visible:ring-sky-500/40"/></div>}
function SelectField({label,value,set,options,labels}:{label:string;value:string;set:(v:string)=>void;options:string[];labels?:Record<string,string>}){return <div className="space-y-1.5"><Label className="text-xs text-slate-300">{label}</Label><select value={value} onChange={e=>set(e.target.value)} className="h-9 w-full rounded-md border border-[#28445f] bg-[#091725] px-3 text-xs text-slate-200 outline-none focus:border-sky-500/50">{options.map(o=><option key={o} value={o}>{labels?.[o]??o}</option>)}</select></div>}
function ToggleRow({label,sub,checked,onChange}:{label:string;sub:string;checked:boolean;onChange:(value:boolean)=>void}){return <div className="flex items-center gap-3 border-b border-[#1d344c] py-2.5 last:border-0"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-200">{label}</p><p className="mt-0.5 text-xs text-slate-500">{sub}</p></div><button type="button" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)} className={`relative h-5 w-9 rounded-full transition ${checked?'bg-sky-500':'bg-slate-700'}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${checked?'left-[18px]':'left-0.5'}`}/></button></div>}
function TabPill({active=false,icon:Icon,label,onClick}:{active?:boolean;icon:React.ComponentType<{className?:string}>;label:string;onClick?:()=>void}){return <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${active?'bg-sky-500 text-slate-950':'text-slate-300 hover:bg-sky-950/20'}`}><Icon className="size-3.5"/>{label}</button>}
function LevelBadge({level}:{level:string}){const style=level==='ERROR'?'bg-red-500/15 text-red-300':level==='WARN'?'bg-amber-500/15 text-amber-300':'bg-sky-500/15 text-sky-300';return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${style}`}>{level}</span>}
function SideStat({icon:Icon,label,value,sub,danger,progress}:{icon:React.ComponentType<{className?:string}>;label:string;value:string;sub:string;danger?:boolean;progress?:number}){return <PanelCard><div className="flex gap-3"><div className={`grid size-10 place-items-center rounded-lg ${danger?'bg-red-500/10 text-red-300':'bg-sky-500/[.08] text-sky-300'}`}><Icon className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p>{progress!==undefined&&<div className="mt-2 h-1.5 rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{width:`${progress}%`}}/></div>}</div></div></PanelCard>}
function EventRow({title,text,date}:{title:string;text:string;date:string}){return <div className="flex items-start gap-3 border-b border-[#1d344c] py-2.5 last:border-0"><div className="mt-0.5 grid size-6 place-items-center rounded-full bg-amber-500/15 text-amber-300"><AlertTriangle className="size-3"/></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-200">{title}</p><p className="mt-0.5 truncate text-xs text-slate-500">{text}</p></div><span className="text-xs text-slate-500">{date}</span></div>}
function DiagnosticCard({label,value,detail,good}:{label:string;value:string;detail:string;good?:boolean}){return <div className="rounded-xl border border-[#203a55] bg-[#071522] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs uppercase tracking-[.12em] text-slate-500">{label}</p><span className={`size-2 rounded-full ${good?'bg-cyan-400':'bg-amber-400'}`}/></div><p className="mt-2 truncate text-sm font-semibold text-slate-100">{value}</p><p className="mt-1 text-xs leading-4 text-slate-500">{detail}</p></div>}
function SystemValue({label,value}:{label:string;value:string}){return <div className="flex items-center justify-between gap-4 border-b border-[#1d344c] px-4 py-3 odd:bg-white/[.012]"><span className="text-slate-500">{label}</span><span className="max-w-[60%] truncate text-right font-mono text-xs text-slate-300" title={value}>{value}</span></div>}
function minecraftItemDisplayName(item:LostItemRow){const raw=String(item.itemName??'').trim();if(raw&& !/^(item|block)\.[a-z0-9_.-]+$/i.test(raw))return raw;const slug=String(item.itemId??'minecraft:unknown').split(':').pop()??'unknown';return slug.split(/[_./-]+/).filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ')||item.itemId}
function lostReasonLabel(reason:string){const value=String(reason??'').toLowerCase();const labels:Record<string,string>={death:'Ölüm',despawn:'Yok olma',lava:'Lava',fire:'Ateş',cactus:'Kaktüs',explosion:'Patlama',void:"Void'e düşme",drop:'Düşürme','manual-drop':'Düşürme',unknown:'Bilinmeyen'};return labels[value]??String(reason||'Bilinmeyen').replaceAll('_',' ')}
function lostItemStatusLabel(status?:string|null){const value=status??'pending';if(value==='restored')return'Geri Verildi';if(value==='restore_queued')return'Kuyrukta';if(value==='restore_sent')return'Doğrulanmadı';if(value==='restore_failed')return'Başarısız';return'Bekliyor'}
function LostItemStatusBadge({status}:{status?:string|null}){const value=status??'pending';const style=value==='restored'?'border-sky-500/30 bg-sky-500/10 text-sky-300':value==='restore_failed'?'border-red-500/30 bg-red-500/10 text-red-300':value==='restore_queued'?'border-sky-500/30 bg-sky-500/10 text-sky-300':value==='restore_sent'?'border-amber-500/30 bg-amber-500/10 text-amber-200':'border-slate-600/50 bg-slate-700/20 text-slate-400';return <span title={lostItemStatusLabel(status)} className={`inline-flex max-w-[105px] items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${style}`}><span className="size-1.5 shrink-0 rounded-full bg-current"/><span className="truncate">{lostItemStatusLabel(status)}</span></span>}
function MinecraftItemIcon({itemId,version,size=30}:{itemId:string;version:string;size?:number}){const [attempt,setAttempt]=useState(0);const [failed,setFailed]=useState(false);useEffect(()=>{setAttempt(0);setFailed(false)},[itemId,version]);const [namespace,rawSlug]=String(itemId||'minecraft:air').toLowerCase().split(':');const slug=(rawSlug??namespace??'air').replace(/[^a-z0-9_./-]/g,'');if(namespace!=='minecraft'||failed)return <span className="grid shrink-0 place-items-center rounded-md border border-[#28445f] bg-[#0b1b2a] text-slate-500" style={{width:size+10,height:size+10}} title={namespace!=='minecraft'?'Modlu eşya dokusu panel varlıklarında bulunamadı':'Minecraft eşya dokusu bulunamadı'}><Box style={{width:Math.max(14,size*.55),height:Math.max(14,size*.55)}}/></span>;const root=`https://assets.mcasset.cloud/${encodeURIComponent(version)}/assets/minecraft/textures`;const src=attempt===0?`${root}/item/${slug}.png`:`${root}/block/${slug}.png`;return <span className="grid shrink-0 place-items-center rounded-md border border-[#28445f] bg-[radial-gradient(circle_at_center,rgba(23,71,108,.45),rgba(5,16,27,.92))]" style={{width:size+10,height:size+10}}><img src={src} alt="" width={size} height={size} loading="lazy" className="object-contain [image-rendering:pixelated]" onError={()=>attempt===0?setAttempt(1):setFailed(true)}/></span>}
function LostItemDetailRow({icon:Icon,label,value,sub}:{icon:React.ComponentType<{className?:string}>;label:string;value:string;sub?:string}){return <div className="flex items-start gap-3 border-b border-[#1b3045] px-3 py-2.5 last:border-0"><Icon className="mt-0.5 size-4 shrink-0 text-slate-500"/><div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-[.1em] text-slate-600">{label}</p><p className="mt-0.5 break-words text-xs font-medium text-slate-200">{value}</p>{sub&&<p className="mt-0.5 break-all text-xs text-slate-600">{sub}</p>}</div></div>}
function relativeDate(value:string){const time=new Date(value).getTime();if(!Number.isFinite(time))return'—';const diff=Math.max(0,Date.now()-time);const minute=60_000,hour=60*minute,day=24*hour;if(diff<minute)return'az önce';if(diff<hour)return`${Math.floor(diff/minute)} dakika önce`;if(diff<day)return`${Math.floor(diff/hour)} saat önce`;if(diff<30*day)return`${Math.floor(diff/day)} gün önce`;return new Date(value).toLocaleDateString('tr-TR')}
function formatFileBytes(bytes:number){if(!Number.isFinite(bytes)||bytes<0)return'—';if(bytes<1024)return`${bytes} B`;if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1024/1024).toFixed(1)} MB`}
function EmptyText({text}:{text:string}){return <div className="rounded-lg border border-dashed border-[#203a55] bg-black/10 p-6 text-center text-xs text-slate-500">{text}</div>}
function InfoCard({icon:Icon,label,value,detail,action,good}:{icon:React.ComponentType<{className?:string}>;label:string;value:string;detail:string;action?:string;good?:boolean}){return <PanelCard><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-sky-500/[.08] text-sky-300"><Icon className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-[16px] font-semibold ${good?'text-sky-300':'text-white'}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>{action&&<button className="rounded-md border border-[#28445f] px-3 py-2 text-xs text-slate-300">{action}</button>}</div></PanelCard>}
function MiniValue({label,value,good}:{label:string;value:string;good?:boolean}){return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 truncate text-xs font-medium ${good?'text-sky-300':'text-slate-200'}`}>{value}</p></div>}
function PortRow({icon:Icon,name,port,state,text}:{icon:React.ComponentType<{className?:string}>;name:string;port:number|string;state:'open'|'closed'|'unknown';text:string}){const label=state==='open'?'Açık':state==='closed'?'Kapalı':'Doğrulanmadı';const style=state==='open'?'text-sky-300':state==='closed'?'text-slate-500':'text-amber-300';return <tr className="border-b border-[#1f3851]"><td className="p-3"><span className="inline-flex items-center gap-2 font-semibold text-white"><Icon className="size-4 text-slate-400"/>{name}</span></td><td className="p-3 font-mono">{port}</td><td className="p-3"><span className={style}>● {label}</span></td><td className="p-3 text-slate-400">{text}</td></tr>}
function SecurityTile({icon:Icon,title,value,detail,good}:{icon:React.ComponentType<{className?:string}>;title:string;value:string;detail:string;good?:boolean}){return <PanelCard><div className="flex items-center gap-3"><div className={`grid size-9 place-items-center rounded-lg ${good?'bg-sky-500/10 text-sky-300':'bg-amber-500/10 text-amber-300'}`}><Icon className="size-4.5"/></div><div><p className="text-xs text-slate-500">{title}</p><p className="mt-1 text-sm font-semibold">{value}</p><p className="mt-0.5 text-xs text-slate-600">{detail}</p></div></div></PanelCard>}
function parseLog(line:string){const level=/\b(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\b/i.exec(line)?.[1]?.toUpperCase().replace('WARNING','WARN')??(/Exception|failed|fatal/i.test(line)?'ERROR':'INFO');const source=/\[([^\]]+)\]/g;const matches=[...line.matchAll(source)].map(m=>m[1]);const picked=matches.find(x=>!/^(INFO|WARN|ERROR|DEBUG|TRACE)$/i.test(x)&&!/^\d{1,2}:\d{2}/.test(x))??'Server';const message=line.replace(/^\[[^\]]+\]\s*/,'').replace(/^\[(INFO|WARN|ERROR|DEBUG|TRACE)\]\s*/i,'');return {level,source:picked,message}}
function formatDuration(ms:number){if(!Number.isFinite(ms)||ms<0)return'—';const mins=Math.floor(ms/60000);const h=Math.floor(mins/60);const m=mins%60;return h?`${h} sa ${m} dk`:`${m} dk`}
function formatWorldSize(sizeMb:number){return sizeMb>=1024?`${(sizeMb/1024).toFixed(1)} GB`:`${sizeMb.toFixed(0)} MB`}
