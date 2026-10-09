import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { constants, createReadStream, createWriteStream, existsSync, statSync } from 'node:fs'
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat, statfs, realpath, writeFile, cp } from 'node:fs/promises'
import { cpus, freemem, totalmem, loadavg, uptime as osUptime, hostname } from 'node:os'
import { createServer } from 'node:http'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { applyPerformance, restorePerformance, performanceStatus } from './performance.js'
import { parseTickMetrics, parseProcessStat, totalCpuTicks } from './performance-metrics.js'
import { runtimeOptimizationStatus, enableRuntimeOptimization, disableRuntimeOptimization, prepareOptimizedLaunch, markOptimizedLaunch } from './runtime-optimizer.js'
import { optimizationModStatus, installOptimizationMod, removeOptimizationMod } from './optimization-mods.js'
































































const PANEL_URL=process.env.PANEL_URL?.replace(/\/$/,'');const NODE_ID=process.env.NODE_ID;const NODE_TOKEN=process.env.NODE_TOKEN;const DATA_DIR=resolve(process.env.DATA_DIR??'./data');if(!PANEL_URL||!NODE_ID||!NODE_TOKEN)throw new Error('PANEL_URL, NODE_ID and NODE_TOKEN are required');const SITE_SERVER_BRIDGE_KEY=process.env.BLOCKCTRL_SITE_SERVER_BRIDGE_KEY??''
const headers={authorization:`Bearer ${NODE_TOKEN}`,'x-node-id':NODE_ID,'content-type':'application/json'}
const processes=new Map<string,ChildProcess>()
const managedPids=new Map<string,number>()
const stopping=new Set<string>()
const trackerTokens=new Map<string,string>()
const playerUuidCache=new Map<string,string>()
const playerPresenceCache=new Map<string,{playerName:string;playerUuid:string|null;isOnline:boolean;at:number}>()
const playerReconciledServers=new Set<string>()
type DownloadTokenMeta={path:string;filename:string;expiresAt:number;temporary:boolean}
const downloadTokens=new Map<string,DownloadTokenMeta>()
const DOWNLOAD_TTL_MS=15*60_000
function downloadRoot(){return join(DATA_DIR,'.downloads')}
function cleanDownloadFilename(value:string){return basename(value).replace(/[^A-Za-z0-9._-]/g,'_').slice(0,180)||'download.bin'}
async function cleanupExpiredDownloads(){const now=Date.now();for(const[token,meta]of downloadTokens){if(meta.expiresAt>now)continue;downloadTokens.delete(token);if(meta.temporary)await rm(meta.path,{force:true}).catch(()=>{})}}
async function createDownloadToken(path:string,filename:string,temporary=false){await cleanupExpiredDownloads();const token=randomBytes(32).toString('base64url');const expiresAt=Date.now()+DOWNLOAD_TTL_MS;downloadTokens.set(token,{path,filename:cleanDownloadFilename(filename),expiresAt,temporary});return{downloadToken:token,expiresAt:new Date(expiresAt).toISOString()}}
type LogTailState={timer:NodeJS.Timeout;stdoutOffset:number;stderrOffset:number;stdoutPartial:string;stderrPartial:string;busy:boolean;loader:string;trackingMode:string}
const logTailers=new Map<string,LogTailState>()
const bruteForceAttempts=new Map<string,{at:number[];blockedUntil:number}>()
const connectionBursts=new Map<string,{at:number[];blockedUntil:number}>()
const reputationCache=new Map<string,{checkedAt:number;risky:boolean;detail:string}>()
const BOT_WINDOW_MS=Math.max(10_000,Number(process.env.BLOCKCTRL_BOT_WINDOW_MS??60_000))
const BOT_THRESHOLD=Math.max(10,Math.min(500,Number(process.env.BLOCKCTRL_BOT_THRESHOLD??40)))
const BOT_BLOCK_MS=Math.max(60_000,Number(process.env.BLOCKCTRL_BOT_BLOCK_MS??300_000))
const IP_REPUTATION_URL=String(process.env.BLOCKCTRL_IP_REPUTATION_URL??'').trim()
const IP_REPUTATION_TOKEN=String(process.env.BLOCKCTRL_IP_REPUTATION_TOKEN??'').trim()
function connectionIp(line:string){const ipv4=line.match(/\/((?:\d{1,3}\.){3}\d{1,3}):\d+/)?.[1];if(ipv4&&ipv4.split('.').every(part=>Number(part)>=0&&Number(part)<=255))return ipv4;return line.match(/\/\[([0-9a-f:]+)\]:\d+/i)?.[1]??null}
async function checkIpReputation(serverId:string,ip:string){
  if(!IP_REPUTATION_URL)return
  const cached=reputationCache.get(ip);if(cached&&Date.now()-cached.checkedAt<60*60_000)return
  const url=IP_REPUTATION_URL.includes('{ip}')?IP_REPUTATION_URL.replaceAll('{ip}',encodeURIComponent(ip)):`${IP_REPUTATION_URL}${IP_REPUTATION_URL.includes('?')?'&':'?'}ip=${encodeURIComponent(ip)}`
  try{const response=await fetch(url,{headers:{accept:'application/json',...(IP_REPUTATION_TOKEN?{authorization:`Bearer ${IP_REPUTATION_TOKEN}`}:{})},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json() as Record<string,any>;const risk=Number(data.risk??data.riskScore??data.score??0);const risky=Boolean(data.vpn||data.proxy||data.tor||data.hosting||data.risky||risk>=70);const detail=[data.vpn?'VPN':null,data.proxy?'Proxy':null,data.tor?'Tor':null,data.hosting?'Hosting':null,Number.isFinite(risk)&&risk?`risk=${risk}`:null].filter(Boolean).join(', ')||'temiz';reputationCache.set(ip,{checkedAt:Date.now(),risky,detail});await report({type:'security-event',serverId,severity:risky?'medium':'info',source:'ip-reputation',event:risky?'Riskli ağ kaynağı tespit edildi':'IP reputation kontrolü temiz',ip,details:{detail,risk}});if(risky&&existsSync(SECURITY_HELPER)){const port=await minecraftPortFor(serverId),expiresAt=Date.now()+BOT_BLOCK_MS;await securityHelper('block-ip',ip,String(port),String(expiresAt));await report({type:'security-event',serverId,severity:'high',source:'ip-reputation',event:'Riskli IP geçici engellendi',ip,details:{detail,expiresAt:new Date(expiresAt).toISOString()}})}}catch(error){agentEvent('warn',serverId,'IP reputation sorgusu başarısız',error instanceof Error?error.message:error)}
}
async function handleConnectionBurstLine(serverId:string,line:string){
  const ip=connectionIp(line);if(!ip)return
  if(/logged in with entity id/i.test(line))void checkIpReputation(serverId,ip)
  if(!/(lost connection|logged in with entity id|disconnected)/i.test(line))return
  const now=Date.now(),key=`${serverId}:${ip}`,state=connectionBursts.get(key)??{at:[],blockedUntil:0};state.at=state.at.filter(at=>now-at<=BOT_WINDOW_MS);state.at.push(now);connectionBursts.set(key,state)
  if(state.at.length<BOT_THRESHOLD||state.blockedUntil>now||!existsSync(SECURITY_HELPER))return
  const port=await minecraftPortFor(serverId),expiresAt=now+BOT_BLOCK_MS
  try{await securityHelper('block-ip',ip,String(port),String(expiresAt));state.blockedUntil=expiresAt;state.at=[];connectionBursts.set(key,state);await report({type:'security-event',serverId,severity:'high',source:'bot-protection',event:'Bağlantı patlaması geçici engellendi',ip,details:{threshold:BOT_THRESHOLD,windowMs:BOT_WINDOW_MS,expiresAt:new Date(expiresAt).toISOString()}})}catch(error){agentEvent('warn',serverId,'Bot burst engelleme başarısız',error)}
}
const BRUTE_FORCE_WINDOW_MS=Math.max(60_000,Number(process.env.BLOCKCTRL_BRUTE_FORCE_WINDOW_MS??600_000))
const BRUTE_FORCE_THRESHOLD=Math.max(3,Math.min(50,Number(process.env.BLOCKCTRL_BRUTE_FORCE_THRESHOLD??8)))
const BRUTE_FORCE_BLOCK_MS=Math.max(60_000,Number(process.env.BLOCKCTRL_BRUTE_FORCE_BLOCK_MS??900_000))
function authFailureIp(line:string){
  if(!/(failed to verify username|invalid session|not authenticated with minecraft\.net|unverified[_ ]username|too many login attempts|invalid profile public key|profile public key is invalid)/i.test(line))return null
  const ipv4=line.match(/\/((?:\d{1,3}\.){3}\d{1,3}):\d+/)?.[1]??line.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/)?.[1]
  if(ipv4&&ipv4.split('.').every(part=>Number(part)>=0&&Number(part)<=255))return ipv4
  const ipv6=line.match(/\/\[([0-9a-f:]+)\]:\d+/i)?.[1]
  return ipv6??null
}
async function minecraftPortFor(serverId:string){const raw=await readFile(join(serverDir(serverId),'server.properties'),'utf8').catch(()=> '');const port=Number(parsePropertiesText(raw)['server-port']||25565);return Number.isInteger(port)&&port>=1&&port<=65535?port:25565}
async function handleBruteForceLine(serverId:string,line:string){
  const ip=authFailureIp(line);if(!ip)return
  const now=Date.now(),key=`${serverId}:${ip}`,current=bruteForceAttempts.get(key)??{at:[],blockedUntil:0};current.at=current.at.filter(at=>now-at<=BRUTE_FORCE_WINDOW_MS);current.at.push(now);bruteForceAttempts.set(key,current)
  await report({type:'security-event',serverId,severity:current.at.length>=BRUTE_FORCE_THRESHOLD?'high':'low',source:'auth',event:'Başarısız Minecraft kimlik doğrulama',ip,details:{attempts:current.at.length,windowMs:BRUTE_FORCE_WINDOW_MS}})
  if(current.at.length<BRUTE_FORCE_THRESHOLD||current.blockedUntil>now||!existsSync(SECURITY_HELPER))return
  const port=await minecraftPortFor(serverId),expiresAt=now+BRUTE_FORCE_BLOCK_MS
  try{await securityHelper('block-ip',ip,String(port),String(expiresAt));current.blockedUntil=expiresAt;current.at=[];bruteForceAttempts.set(key,current);agentEvent('warn',serverId,`Brute-force IP geçici engellendi · ${ip} · ${Math.ceil(BRUTE_FORCE_BLOCK_MS/60000)} dk`);await report({type:'security-event',serverId,severity:'high',source:'auth',event:'Brute-force IP geçici engellendi',ip,details:{port,expiresAt:new Date(expiresAt).toISOString(),threshold:BRUTE_FORCE_THRESHOLD}})}catch(error){agentEvent('warn',serverId,'Brute-force IP engelleme başarısız',error)}
}
type AgentEventLevel='info'|'warn'|'error'
type AgentEvent={at:string;level:AgentEventLevel;message:string;serverId:string|null}
const agentEventBuffer:AgentEvent[]=[]
function stringifyLogPart(value:unknown){if(value instanceof Error)return `${value.name}: ${value.message}`;if(typeof value==='string')return value;try{return JSON.stringify(value)}catch{return String(value)}}
function pushAgentEvent(level:AgentEventLevel,message:string,serverId?:string|null){
  const event:AgentEvent={at:new Date().toISOString(),level,message:message.slice(0,4000),serverId:serverId??null}
  agentEventBuffer.push(event);if(agentEventBuffer.length>1200)agentEventBuffer.splice(0,agentEventBuffer.length-1200)
  const output=`[${event.at}] ${event.serverId?`[${event.serverId}] `:''}${event.message}`
  if(level==='error')console.error(output);else if(level==='warn')console.warn(output);else console.log(output)
}
function agentEvent(level:AgentEventLevel,serverId:string|null,...parts:unknown[]){pushAgentEvent(level,parts.map(stringifyLogPart).join(' '),serverId)}
let previousCpuSample:{idle:number;total:number}|null=null
let lastPublicSnapshotAt=0
function cpuTotals(){const rows=cpus();return{idle:rows.reduce((s,i)=>s+i.times.idle,0),total:rows.reduce((s,i)=>s+(Object.values(i.times) as number[]).reduce((a,b)=>a+b,0),0)}}
function sampleCpuPercent(){const next=cpuTotals();const prev=previousCpuSample;previousCpuSample=next;if(!prev)return 0;const idle=Math.max(0,next.idle-prev.idle),total=Math.max(1,next.total-prev.total);return Math.max(0,Math.min(100,Math.round((1-idle/total)*100)))}
async function api(method:string,body?:unknown){const response=await fetch(`${PANEL_URL}/api/agent`,{method,headers,body:body?JSON.stringify(body):undefined});if(!response.ok)throw new Error(`Panel returned ${response.status}: ${await response.text()}`);return response.json()}
async function report(body:unknown){try{await api('POST',body)}catch(error){agentEvent('error',null,'[agent] report failed',error)}}
async function heartbeat(){await reconcileServers();let diskUsedGb=0,diskTotalGb=0;try{const fs=await statfs(DATA_DIR);const totalBytes=Number(fs.blocks)*Number(fs.bsize);const freeBytes=Number(fs.bavail)*Number(fs.bsize);diskTotalGb=totalBytes/1073741824;diskUsedGb=(totalBytes-freeBytes)/1073741824}catch{}await report({type:'heartbeat',cpuPercent:sampleCpuPercent(),memoryUsedMb:Math.round((totalmem()-freemem())/1048576),memoryTotalMb:Math.round(totalmem()/1048576),diskUsedGb:Number(diskUsedGb.toFixed(2)),diskTotalGb:Number(diskTotalGb.toFixed(2))});if(Date.now()-lastPublicSnapshotAt>=60_000){lastPublicSnapshotAt=Date.now();const snapshots=await collectServerPublicSnapshots();if(snapshots.length)await report({type:'server-public-data',snapshots})}}

const performanceSamples=new Map<string,{pid:number;start:number;cpu:number;host:number}>()
let metricCollectionRunning=false
let performanceClockTicks=0
async function minecraftProcessPid(id:string){
  const rootPid=await validatedManagedPid(id)
  if(!rootPid)return null
  const root=await realpath(serverDir(id))
  const pending=[rootPid];const seen=new Set<number>()
  while(pending.length&&seen.size<32){
    const pid=pending.shift()!;if(seen.has(pid))continue;seen.add(pid)
    try{
      const [cmd,cwd]=await Promise.all([readFile(`/proc/${pid}/cmdline`,'utf8'),realpath(`/proc/${pid}/cwd`)])
      if(cwd===root&&/(?:^|\/)java(?:\0|$)/.test(cmd.split('\0')[0]+'\0'))return pid
      const children=await readFile(`/proc/${pid}/task/${pid}/children`,'utf8').catch(()=> '')
      pending.push(...children.trim().split(/\s+/).map(Number).filter(value=>Number.isInteger(value)&&value>1))
    }catch{}
  }
  return null
}
async function queryTickMetrics(id:string,meta:Record<string,unknown>){
  const loader=String(meta.loader??'vanilla').toLowerCase()
  const parts=String(meta.version??'').split('.').map(Number)
  const modern=parts[0]===1&&(parts[1]>20||(parts[1]===20&&(parts[2]??0)>=3))||parts[0]>=26
  const commands=['paper','purpur'].includes(loader)?'tps\nmspt':loader==='spigot'?'tps':modern?'tick query':''
  if(!commands||!existsSync(join(serverDir(id),'.blockctrl-stdin')))return{tps:null,mspt:null}
  const stdout=join(serverDir(id),'.blockctrl-stdout.log')
  const offset=(await stat(stdout).catch(()=>null))?.size??0
  try{
    await writeConsole(id,commands)
    for(let attempt=0;attempt<8;attempt++){
      await new Promise(resolve=>setTimeout(resolve,150))
      const result=parseTickMetrics(await readLogSince(stdout,offset,64*1024))
      if(commands==='tps'?result.tps!==null:commands==='tick query'?result.mspt!==null:result.tps!==null&&result.mspt!==null)return result
    }
    return parseTickMetrics(await readLogSince(stdout,offset,64*1024))
  }catch{return{tps:null,mspt:null}}
}
async function reportServerPerformance(){
  if(metricCollectionRunning)return
  metricCollectionRunning=true
  try{
    if(!performanceClockTicks)performanceClockTicks=Number((await runCapture('getconf',['CLK_TCK'],DATA_DIR)).trim())
    if(!Number.isFinite(performanceClockTicks)||performanceClockTicks<=0)throw new Error('Linux clock tick rate unavailable')
    const fs=await statfs(DATA_DIR)
    const diskTotalGb=Number(fs.blocks)*Number(fs.bsize)/1073741824
    const diskUsedGb=(Number(fs.blocks)-Number(fs.bavail))*Number(fs.bsize)/1073741824
    const entries=await readdir(join(DATA_DIR,'servers'),{withFileTypes:true,encoding:'utf8'})
    const metrics:Record<string,unknown>[]=[]
    const active=new Set<string>()
    for(const entry of entries){
      if(!entry.isDirectory()||!validServerId(entry.name))continue
      const id=entry.name
      try{
        const pid=await minecraftProcessPid(id);if(!pid){performanceSamples.delete(id);continue}
        active.add(id)
        const [raw,status,meta,hostRaw,uptimeRaw]=await Promise.all([readFile(`/proc/${pid}/stat`,'utf8'),readFile(`/proc/${pid}/status`,'utf8'),readServerMeta(id),readFile('/proc/stat','utf8'),readFile('/proc/uptime','utf8')])
        const host=totalCpuTicks(hostRaw)
        const sample=parseProcessStat(raw)
        const previous=performanceSamples.get(id)
        performanceSamples.set(id,{pid,start:sample.startTicks,cpu:sample.cpuTicks,host})
        if(!previous||previous.pid!==pid||previous.start!==sample.startTicks||host<=previous.host)continue
        const rss=status.match(/^VmRSS:\s+(\d+)\s+kB/m)
        if(!rss)continue
        const ticks=await queryTickMetrics(id,meta)
        // CPU is the JVM share of total node capacity, consistent with the panel's 0-100 scale.
        const cpuPercent=Math.max(0,Math.min(100,100*(sample.cpuTicks-previous.cpu)/(host-previous.host)))
        const presence=await queryOnlinePlayers(id);const online=presence.count??[...playerPresenceCache.entries()].filter(([key,row])=>key.startsWith(`${id}:`)&&row.isOnline).length
        metrics.push({serverId:id,cpuPercent:Number(cpuPercent.toFixed(2)),memoryUsedMb:Math.round(Number(rss[1])/1024),memoryTotalMb:Number(meta.memoryMb)||0,diskUsedGb:Number(diskUsedGb.toFixed(2)),diskTotalGb:Number(diskTotalGb.toFixed(2)),uptimeSeconds:Math.max(0,Math.floor(Number(uptimeRaw.split(' ')[0])-sample.startTicks/performanceClockTicks)),...ticks,players:online})
        if(metrics.length===100){await report({type:'server-metrics',metrics:metrics.splice(0)})}
      }catch(error){agentEvent('warn',id,'Sunucu performans ölçümü alınamadı',error)}
    }
    for(const id of performanceSamples.keys())if(!active.has(id))performanceSamples.delete(id)
    if(metrics.length)await report({type:'server-metrics',metrics})
  }catch(error){agentEvent('warn',null,'Performans ölçüm döngüsü başarısız',error)}
  finally{metricCollectionRunning=false}
}
function serverDir(id:string){if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid server id');return join(DATA_DIR,'servers',id)}
function safePath(id:string,requested:string){const root=serverDir(id);const normalized=requested.replaceAll('\\','/');if(normalized.includes('\0')||normalized.startsWith('/')||/^[A-Za-z]:/.test(normalized))throw new Error('Path traversal blocked');const target=resolve(root,normalized);if(target!==root&&!target.startsWith(`${root}${sep}`))throw new Error('Path traversal blocked');return target}
async function readServerMeta(id:string){try{return JSON.parse(await readFile(join(serverDir(id),'blockctrl.json'),'utf8')) as Record<string,unknown>}catch{return {} as Record<string,unknown>}}
async function validatedManagedPid(id:string){const pidFile=join(serverDir(id),'.blockctrl-pid');const candidate=managedPids.get(id)??Number((await readFile(pidFile,'utf8').catch(()=>'' )).trim());if(!Number.isInteger(candidate)||candidate<=1)return null;try{const [cmdline,cwd,expected]=await Promise.all([readFile(`/proc/${candidate}/cmdline`,'utf8'),realpath(`/proc/${candidate}/cwd`),realpath(serverDir(id))]);if(cwd!==expected||!/java|minecraft|run\.sh|bash/i.test(cmdline))return null;managedPids.set(id,candidate);return candidate}catch{return null}}
function isServerRunningKnown(id:string){return processes.has(id)||managedPids.has(id)}
function signalManagedPid(pid:number,signal:NodeJS.Signals){try{process.kill(-pid,signal);return}catch{}try{process.kill(pid,signal)}catch{}}
async function waitForServerExit(id:string,timeoutMs:number){const until=Date.now()+timeoutMs;while(Date.now()<until){if(!(await validatedManagedPid(id)))return true;await new Promise(r=>setTimeout(r,250))}return !(await validatedManagedPid(id))}
async function writeConsole(id:string,line:string){const pid=await validatedManagedPid(id);if(!pid)throw new Error('Sunucu çalışmıyor');const fifo=join(serverDir(id),'.blockctrl-stdin');if(!existsSync(fifo))throw new Error('Bu sunucu eski agent launcher ile çalışıyor. Konsol kontrolünü geri kazanmak için sunucuyu bir kez yeniden başlatın.');let handle;try{handle=await open(fifo,constants.O_WRONLY|constants.O_NONBLOCK);await handle.write(`${line.replace(/[\r\n]+$/,'')}\n`)}catch(error){throw new Error(`Sunucu konsol kanalı kullanılamıyor: ${error instanceof Error?error.message:'FIFO error'}`,{cause:error})}finally{await handle?.close().catch(()=>{})}}
async function readLogSince(path:string,offset:number,maxBytes=256*1024){const info=await stat(path).catch(()=>null);if(!info?.isFile()||info.size<=offset)return'';const start=Math.max(offset,info.size-maxBytes);const size=Math.max(0,info.size-start);if(!size)return'';const handle=await open(path,'r');try{const buffer=Buffer.alloc(size);const{bytesRead}=await handle.read(buffer,0,size,start);return buffer.subarray(0,bytesRead).toString('utf8')}finally{await handle.close()}}
function regexEscape(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
async function restoreLostItem(id:string,payload:Record<string,unknown>){
  const playerName=String(payload.playerName??'').trim();const itemId=String(payload.itemId??'').trim().toLowerCase();const amount=Math.trunc(Number(payload.amount??0))
  if(!/^[A-Za-z0-9_]{1,16}$/.test(playerName))throw new Error('Geçerli bir Minecraft oyuncu adı gerekli')
  if(!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(itemId))throw new Error('Geçerli bir Minecraft eşya kimliği gerekli')
  if(!Number.isInteger(amount)||amount<1||amount>100000)throw new Error('Geçersiz eşya adedi')
  if(!(await validatedManagedPid(id)))throw new Error('Eşyayı geri vermek için Minecraft sunucusu çalışıyor olmalıdır')
  const stdout=join(serverDir(id),'.blockctrl-stdout.log'),stderr=join(serverDir(id),'.blockctrl-stderr.log')
  const outOffset=(await stat(stdout).catch(()=>null))?.size??0;const errOffset=(await stat(stderr).catch(()=>null))?.size??0
  const command=`give ${playerName} ${itemId} ${amount}`
  agentEvent('info',id,`Kayıp eşya geri verme komutu gönderiliyor · ${playerName} · ${amount}x ${itemId}`)
  await writeConsole(id,command)
  const success=new RegExp(`Gave\\s+\\d+\\s+\\[[^\\]]+\\]\\s+to\\s+${regexEscape(playerName)}\\b`,'i')
  const failure=/(No player was found|Unknown item|Unknown or incomplete command|Incorrect argument|Expected whitespace|Can't find element|Player not found|Invalid item)/i
  const deadline=Date.now()+5000;let transcript=''
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,250))
    const [out,err]=await Promise.all([readLogSince(stdout,outOffset),readLogSince(stderr,errOffset)])
    transcript=`${out}\n${err}`.slice(-16000)
    const bad=transcript.split(/\r?\n/).find(line=>failure.test(line));if(bad)throw new Error(`Minecraft geri verme komutunu reddetti: ${bad.slice(-500)}`)
    if(success.test(transcript)){agentEvent('info',id,`Kayıp eşya geri verildi ve Minecraft çıktısı doğrulandı · ${playerName} · ${amount}x ${itemId}`);return{sent:true,verified:true,playerName,itemId,amount}}
  }
  agentEvent('warn',id,`Kayıp eşya komutu gönderildi ancak çıktı doğrulanamadı · ${playerName} · ${amount}x ${itemId}`)
  return{sent:true,verified:false,playerName,itemId,amount,verification:'timeout'}
}
async function trackerTokenFor(serverId:string){const cached=trackerTokens.get(serverId);if(cached)return cached;const token=(await readFile(join(serverDir(serverId),'.blockctrl-tracker-token'),'utf8').catch(()=>'' )).trim();if(token)trackerTokens.set(serverId,token);return token}
function safeTokenEqual(a:string,b:string){if(!a||!b)return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}
async function reconcileServers(){const root=resolve(DATA_DIR,'servers');let entries:Array<{name:string;isDirectory:()=>boolean}>=[];try{entries=await readdir(root,{withFileTypes:true,encoding:'utf8'})}catch{return}for(const entry of entries){if(!entry.isDirectory()||!/^[0-9a-f-]{36}$/i.test(entry.name))continue;const id=entry.name;const pid=await validatedManagedPid(id);if(pid){managedPids.set(id,pid);const runtime=await validatedRuntimeTracking(id,await readServerMeta(id));const loader=runtime.loader;const trackingMode=runtime.mode;startLogTailer(id,loader,trackingMode,true);if(trackingMode==='death-snapshot'&&!vanillaTrackers.has(id)&&existsSync(join(serverDir(id),'.blockctrl-stdin')))startVanillaDeathTracker(id,loader);if(!playerReconciledServers.has(id)&&existsSync(join(serverDir(id),'.blockctrl-stdin'))){playerReconciledServers.add(id);setTimeout(()=>{void writeConsole(id,'list').catch(()=>{playerReconciledServers.delete(id)})},750)}await report({type:'server-status',serverId:id,status:'running',pid});continue}managedPids.delete(id);playerReconciledServers.delete(id);stopLogTailer(id);stopVanillaDeathTracker(id);const pidFile=join(root,id,'.blockctrl-pid');if(existsSync(pidFile))await rm(pidFile,{force:true});agentEvent('info',id,'Minecraft process durduruldu');await report({type:'server-status',serverId:id,status:'stopped',pid:null})}}
async function download(url:string,destination:string,expectedSha1?:string){const response=await fetch(url);if(!response.ok||!response.body)throw new Error(`Download failed ${response.status}: ${url}`);await pipeline(response.body as never,createWriteStream(destination));if(expectedSha1){const actual=createHash('sha1').update(await readFile(destination)).digest('hex');if(actual!==expectedSha1)throw new Error('Checksum verification failed')}}
async function run(program:string,args:string[],cwd:string,input?:string){await new Promise<void>((ok,fail)=>{const child=spawn(program,args,{cwd,stdio:'pipe'});if(input!==undefined)child.stdin.end(input);let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',fail);child.on('exit',code=>code===0?ok():fail(new Error(`${program} exited ${code}: ${output.slice(-3000)}`)))})}
async function runCapture(program:string,args:string[],cwd:string,env:NodeJS.ProcessEnv=process.env){return new Promise<string>((ok,fail)=>{const child=spawn(program,args,{cwd,stdio:'pipe',env});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',fail);child.on('exit',code=>code===0?ok(output.trim()):fail(new Error(`${program} exited ${code}: ${output.slice(-3000)}`)))})}
async function runCaptureInput(program:string,args:string[],cwd:string,input:string,env:NodeJS.ProcessEnv=process.env){return new Promise<string>((ok,fail)=>{const child=spawn(program,args,{cwd,stdio:'pipe',env});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',fail);child.on('exit',code=>code===0?ok(output.trim()):fail(new Error(`${program} exited ${code}: ${output.slice(-3000)}`)));child.stdin.end(input)})}
const SFTP_HELPER='/usr/local/sbin/blockctrl-sftp-helper'
function validServerId(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)}
function sftpUsername(serverId:string){return `mc_${serverId.replaceAll('-','').slice(0,12).toLowerCase()}`}
function parseHelperJson(output:string){try{return output?JSON.parse(output) as Record<string,unknown>:{ok:true}}catch{throw new Error(`SFTP helper geçersiz yanıt döndürdü: ${output.slice(0,300)}`)}}
async function sftpHelper(operation:string,serverId:string,extra?:string,input?:string){if(!validServerId(serverId))throw new Error('Geçersiz serverId');const username=sftpUsername(serverId);if(!existsSync(SFTP_HELPER))throw new Error('SFTP helper kurulu değil. deploy/install-sftp-helper.sh dosyasını root olarak çalıştırın.');const args=['-n',SFTP_HELPER,operation,serverId,username];if(extra)args.push(extra);const output=input===undefined?await runCapture('sudo',args,DATA_DIR):await runCaptureInput('sudo',args,DATA_DIR,input);return parseHelperJson(output)}
async function ensureSftpServerRoot(serverId:string){const info=await stat(serverDir(serverId)).catch(()=>null);if(!info?.isDirectory())throw new Error('Sunucu klasörü bulunamadı; SFTP yalnız mevcut sunucular için oluşturulabilir.')}
async function readJsonRequest(req:import('node:http').IncomingMessage,max=64*1024){const raw=await readRequestBody(req,max);try{return raw.length?JSON.parse(raw.toString('utf8')) as Record<string,unknown>:{} }catch{throw new Error('Geçersiz JSON gövdesi')}}
function sendJson(res:import('node:http').ServerResponse,status:number,data:unknown){res.writeHead(status,{'content-type':'application/json','cache-control':'private, no-store'}).end(JSON.stringify(data))}
function neoForgePrefix(mcVersion:string){const parts=mcVersion.split('.');if(parts[0]==='1'&&parts.length>=3)return `${parts[1]}.${parts[2]}.`;throw new Error('Unsupported Minecraft version')}
































































type TrackerLoader='paper'|'fabric'|'forge'|'neoforge'
function trackerEnv(loader:TrackerLoader){
  if(loader==='paper')return process.env.PAPER_TRACKER_JAR??process.env.TRACKER_JAR
  if(loader==='fabric')return process.env.FABRIC_TRACKER_JAR
  if(loader==='forge')return process.env.FORGE_TRACKER_JAR
  return process.env.NEOFORGE_TRACKER_JAR
}
function trackerCandidates(loader:TrackerLoader,mcVersion:string){
  const result:string[]=[];const configured=trackerEnv(loader);if(configured)result.push(resolve(configured))
  const root=process.env.BLOCKCTRL_TRACKER_DIR?resolve(process.env.BLOCKCTRL_TRACKER_DIR):''
  if(root){
    result.push(join(root,loader,mcVersion,'blockctrl-tracker.jar'))
    result.push(join(root,loader,`blockctrl-tracker-${mcVersion}.jar`))
    result.push(join(root,loader,'blockctrl-tracker.jar'))
    result.push(join(root,`blockctrl-tracker-${loader}-${mcVersion}.jar`))
    result.push(join(root,`blockctrl-tracker-${loader}.jar`))
  }
  return [...new Set(result)]
}
async function resolveTrackerArtifact(loader:TrackerLoader,mcVersion:string){
  const candidates=trackerCandidates(loader,mcVersion);const found=candidates.find(existsSync)
  if(!found)return null
  try{await runCapture('unzip',['-tqq',found],DATA_DIR)}catch{throw new Error(`${loader} kayıp eşya takip paketi geçerli bir JAR değil: ${found}`)}
  const marker=await runCapture('unzip',['-p',found,'blockctrl-tracker-protocol.properties'],DATA_DIR).catch(()=> '')
  if(!/^protocol=2\s*$/m.test(marker))return null
  return found
}
async function installTrackerAdapter(root:string,id:string,loader:string,mcVersion:string,trackerToken:string){
  if(!['vanilla','paper','fabric','forge','neoforge'].includes(loader))throw new Error(`Kayıp eşya takibi bu loader için yapılandırılmadı: ${loader}`)
  await mkdir(join(root,'config'),{recursive:true})
  if(loader==='vanilla'){
    const mode='death-snapshot'
    await writeFile(join(root,'config','blockctrl-tracker.json'),JSON.stringify({protocolVersion:2,serverId:id,loader,mcVersion,mode,approximate:true},null,2),'utf8')
    return {mode,adapter:'agent',artifact:undefined,warning:'Vanilla event API sağlamadığı için yalnız ölüm öncesi envanter snapshot takibi kullanılıyor.'}
  }
  const tracker=await resolveTrackerArtifact(loader as TrackerLoader,mcVersion)
  if(!tracker){
    const mode='death-snapshot'
    await writeFile(join(root,'config','blockctrl-tracker.json'),JSON.stringify({protocolVersion:2,serverId:id,loader,mcVersion,mode,approximate:true,fallbackReason:'tracker-artifact-missing'},null,2),'utf8')
    return {mode,adapter:'agent-fallback',artifact:undefined,warning:`${loader} için ${mcVersion} event tracker JAR'ı bulunamadı; kurulum durdurulmadı ve ölüm snapshot takibine geçildi.`}
  }
  const mode='event-adapter'
  const common={protocolVersion:2,serverId:id,endpoint:'http://127.0.0.1:8788/item-loss',loader,mcVersion,mode,authenticated:true}
  await writeFile(join(root,'config','blockctrl-tracker.json'),JSON.stringify(common,null,2),'utf8')
  if(loader==='paper'){
    await mkdir(join(root,'plugins','BlockCtrlTracker'),{recursive:true});await cp(tracker,join(root,'plugins','BlockCtrlTracker.jar'))
    await writeFile(join(root,'plugins','BlockCtrlTracker','config.yml'),`server-id: "${id}"
endpoint: "http://127.0.0.1:8788/item-loss"
`)
  }else{
    await mkdir(join(root,'mods'),{recursive:true});await cp(tracker,join(root,'mods',`blockctrl-tracker-${loader}.jar`))
  }
  trackerTokens.set(id,trackerToken)
  return {mode,adapter:loader,artifact:basename(tracker),warning:undefined}
}
































































































































function installedTrackerPath(id:string,loader:string){const root=serverDir(id);return loader==='paper'?join(root,'plugins','BlockCtrlTracker.jar'):join(root,'mods',`blockctrl-tracker-${loader}.jar`)}
async function jarHasTrackerProtocol2(path:string){if(!existsSync(path))return false;const marker=await runCapture('unzip',['-p',path,'blockctrl-tracker-protocol.properties'],DATA_DIR).catch(()=> '');return /^protocol=2\s*$/m.test(marker)}
async function persistTrackingFallback(id:string,meta:Record<string,unknown>,loader:string,reason:string){const next={...meta,itemTrackingEnabled:true,itemTrackingMode:'death-snapshot',trackerAdapter:'agent-fallback',trackerArtifact:null,trackerAuth:false,trackerWarning:reason};const path=join(serverDir(id),'blockctrl.json');await writeFile(path,JSON.stringify(next,null,2),'utf8');await chmod(path,0o600);trackerTokens.delete(id);await rm(join(serverDir(id),'.blockctrl-tracker-token'),{force:true});return next}
async function validatedRuntimeTracking(id:string,meta:Record<string,unknown>){const loader=String(meta.loader??'vanilla').toLowerCase();const enabled=meta.itemTrackingEnabled===true;let mode=String(meta.itemTrackingMode??(enabled?'death-snapshot':'disabled'));if(!enabled)return{meta,loader,mode:'disabled'};if(mode==='event-adapter'){
  const supported=['paper','fabric','forge','neoforge'].includes(loader);const jar=supported?installedTrackerPath(id,loader):'';const protocolOk=Boolean(jar)&&await jarHasTrackerProtocol2(jar);const token=await trackerTokenFor(id);
  if(!protocolOk||!token){const reason=!protocolOk?`${loader} event tracker doğrulanamadı; ölüm snapshot moduna geçildi.`:`${loader} tracker kimlik bilgisi eksik; ölüm snapshot moduna geçildi.`;meta=await persistTrackingFallback(id,meta,loader,reason);mode='death-snapshot'}
 }return{meta,loader,mode}
}
































































type VanillaTrackedItem={itemId:string;itemName:string;amount:number}
type VanillaInventorySnapshot={items:VanillaTrackedItem[];at:number}
type VanillaTrackerState={timer:NodeJS.Timeout;scores:Map<string,number>;inventories:Map<string,VanillaInventorySnapshot>;positions:Map<string,{x:number;y:number;z:number;at:number}>;worlds:Map<string,{world:string;at:number}>;lastDeaths:Map<string,number>;keepInventory:boolean;ruleTick:number;loader:string}
const vanillaTrackers=new Map<string,VanillaTrackerState>()
function splitTopLevelCompounds(input:string){const out:string[]=[];let depth=0,start=-1;let quoted=false,escaped=false;for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}if(c==='"'){quoted=true;continue}if(c==='{'){if(depth===0)start=i;depth++}else if(c==='}'&&depth>0){depth--;if(depth===0&&start>=0){out.push(input.slice(start,i+1));start=-1}}}return out}
function parseVanillaInventory(raw:string):VanillaTrackedItem[]{const items:VanillaTrackedItem[]=[];for(const part of splitTopLevelCompounds(raw)){const id=part.match(/(?:^|[,\s])id\s*:\s*"([a-z0-9_.-]+:[a-z0-9_./-]+)"/i)?.[1];if(!id)continue;const countRaw=part.match(/(?:^|[,\s])(?:Count|count)\s*:\s*(-?\d+)(?:[bBsSlL])?/i)?.[1]??'1';const amount=Math.max(0,Math.min(100000,Number(countRaw)||1));if(amount>0)items.push({itemId:id,itemName:id,amount})}return items}
function vanillaLossReasonMetadata(state:VanillaTrackerState,snapshotAgeMs:number,extra:Record<string,unknown>={}){return{sourceLoader:state.loader,trackingMode:'death-snapshot',approximate:true,snapshotAgeMs,...extra}}
function emitVanillaDeath(serverId:string,playerName:string,state:VanillaTrackerState,deathsDelta:number,reason='death'){if(state.keepInventory)return;const now=Date.now();const last=state.lastDeaths.get(playerName)??0;if(now-last<3500)return;const snapshot=state.inventories.get(playerName);if(!snapshot||now-snapshot.at>15000||!snapshot.items.length){agentEvent('warn',serverId,`Kayıp eşya snapshot bulunamadı · ${playerName} · yaş=${snapshot?now-snapshot.at:-1}ms`);return;}state.lastDeaths.set(playerName,now);const pos=state.positions.get(playerName);const world=state.worlds.get(playerName);for(const stack of snapshot.items){itemQueue.push({eventId:randomUUID(),serverId,playerName,itemId:stack.itemId,itemName:stack.itemName,amount:stack.amount,reason,world:world?.world??'minecraft:overworld',x:Math.floor(pos?.x??0),y:Math.floor(pos?.y??0),z:Math.floor(pos?.z??0),occurredAt:new Date(now).toISOString(),metadata:vanillaLossReasonMetadata(state,now-snapshot.at,{positionKnown:Boolean(pos),worldKnown:Boolean(world),deathsDelta,detectedBy:reason==='death'?'scoreboard-or-log':'death-log'})})}if(itemQueue.length>10000)itemQueue.splice(0,itemQueue.length-10000)}
function handleVanillaTrackerLine(serverId:string,line:string){const state=vanillaTrackers.get(serverId);if(!state)return false;const text=line.trim();const clean=text.replace(/^.*?\]:\s*/,'');const deathReason=(value:string)=>/lava|swim in lava/i.test(value)?'lava':/fire|flames|burned/i.test(value)?'fire':/void|fell out of the world/i.test(value)?'void':/blew up|explod|blown up/i.test(value)?'explosion':/cactus|pricked/i.test(value)?'cactus':'death';for(const name of state.inventories.keys()){if(!clean.startsWith(name+' '))continue;if(/\b(?:was slain|was shot|was killed|died|fell|drowned|starved|suffocated|burned|burnt|went up in flames|tried to swim in lava|blew up|was blown up|hit the ground too hard|fell out of the world|was pricked to death|froze to death|was impaled|experienced kinetic energy|was squashed|discovered the floor was lava|walked into fire|went off with a bang)\b/i.test(clean)){emitVanillaDeath(serverId,name,state,1,deathReason(clean));break}}const rule=text.match(/Gamerule keepInventory is currently set to: (true|false)/i);if(rule){state.keepInventory=rule[1].toLowerCase()==='true';return true}const score=text.match(/(?:\]:\s*)?([A-Za-z0-9_]{1,16}) has (-?\d+) \[blockctrl_deaths\]/i);if(score){const name=score[1],next=Number(score[2]);const prev=state.scores.get(name);state.scores.set(name,next);if(prev!==undefined&&next>prev)emitVanillaDeath(serverId,name,state,next-prev);return true}const data=text.match(/(?:\]:\s*)?([A-Za-z0-9_]{1,16}) has the following entity data:\s*(.+)$/i);if(!data)return false;const name=data[1],value=data[2].trim();const pos=value.match(/^\[\s*(-?\d+(?:\.\d+)?)[dDfF]?,\s*(-?\d+(?:\.\d+)?)[dDfF]?,\s*(-?\d+(?:\.\d+)?)[dDfF]?\s*\]$/);if(pos){state.positions.set(name,{x:Number(pos[1]),y:Number(pos[2]),z:Number(pos[3]),at:Date.now()});return true}const dimension=value.match(/^"?([a-z0-9_.-]+:[a-z0-9_./-]+)"?$/i);if(dimension){state.worlds.set(name,{world:dimension[1],at:Date.now()});return true}if(value.startsWith('[')){state.inventories.set(name,{items:parseVanillaInventory(value),at:Date.now()});return true}return false}
function stopVanillaDeathTracker(serverId:string){const state=vanillaTrackers.get(serverId);if(state)clearInterval(state.timer);vanillaTrackers.delete(serverId)}
function startVanillaDeathTracker(serverId:string,loader='vanilla'){stopVanillaDeathTracker(serverId);const state={} as VanillaTrackerState;state.scores=new Map();state.inventories=new Map();state.positions=new Map();state.worlds=new Map();state.lastDeaths=new Map();state.keepInventory=false;state.ruleTick=0;state.loader=loader;const sample=()=>{if(!isServerRunningKnown(serverId))return;const commands:string[]=[];if(state.ruleTick++%60===0)commands.push('gamerule keepInventory');commands.push('execute as @a run scoreboard players get @s blockctrl_deaths','execute as @a run data get entity @s Inventory','execute as @a at @s run data get entity @s Pos','execute as @a run data get entity @s Dimension');void writeConsole(serverId,commands.join('\n')).catch(error=>agentEvent('warn',serverId,'Kayıp eşya snapshot örneklemesi başarısız',error))};void writeConsole(serverId,'scoreboard objectives add blockctrl_deaths deathCount').catch(()=>{});state.timer=setInterval(sample,500);vanillaTrackers.set(serverId,state);setTimeout(sample,300);agentEvent('info',serverId,`Kayıp eşya death-snapshot tracker aktif · ${loader}`)}
































































function stopLogTailer(serverId:string){const state=logTailers.get(serverId);if(state)clearInterval(state.timer);logTailers.delete(serverId)}
function playerPresenceFromLine(serverId:string,line:string){
  const uuid=line.match(/UUID of player\s+([A-Za-z0-9_]{1,16})\s+is\s+([0-9a-f-]{32,36})/i)
  if(uuid)playerUuidCache.set(`${serverId}:${uuid[1].toLowerCase()}`,uuid[2])
  const joined=line.match(/\]:\s*([A-Za-z0-9_]{1,16}) joined the game\b/i)
if(joined){const playerUuid=playerUuidCache.get(`${serverId}:${joined[1].toLowerCase()}`)??null;playerPresenceCache.set(`${serverId}:${joined[1].toLowerCase()}`,{playerName:joined[1],playerUuid,isOnline:true,at:Date.now()});return{event:'join' as const,playerName:joined[1],playerUuid}}
  const left=line.match(/\]:\s*([A-Za-z0-9_]{1,16}) left the game\b/i)
  if(left){const playerUuid=playerUuidCache.get(`${serverId}:${left[1].toLowerCase()}`)??null;playerPresenceCache.set(`${serverId}:${left[1].toLowerCase()}`,{playerName:left[1],playerUuid,isOnline:false,at:Date.now()});return{event:'leave' as const,playerName:left[1],playerUuid}}
  return null
}
async function reportServerLogLine(serverId:string,stream:'stdout'|'stderr',line:string,state:LogTailState){
  if(!line)return
  const internal=stream==='stdout'&&state.trackingMode==='death-snapshot'&&handleVanillaTrackerLine(serverId,line)
  if(!internal)await report({type:'log',serverId,stream,line:line.slice(0,16000)})
  if(stream!=='stdout')return
  void handleBruteForceLine(serverId,line).catch(error=>agentEvent('warn',serverId,'Brute-force log analizi başarısız',error))
  void handleConnectionBurstLine(serverId,line).catch(error=>agentEvent('warn',serverId,'Bağlantı risk analizi başarısız',error))
  const presence=playerPresenceFromLine(serverId,line)
  if(presence)await report({type:'player-presence',serverId,...presence,occurredAt:new Date().toISOString()})
  const players=line.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)$/i)
  if(players){
    const names=String(players[3]??'').split(',').map(name=>name.trim()).filter(name=>/^[A-Za-z0-9_]{1,16}$/.test(name))
    await report({type:'server-status',serverId,status:'running',pid:managedPids.get(serverId)??null,playerCount:Number(players[1])})
    if(names.length===Number(players[1]))await report({type:'player-list',serverId,names,playerCount:Number(players[1]),maxPlayers:Number(players[2]),observedAt:new Date().toISOString()})
  }
}
async function readLogAppend(serverId:string,stream:'stdout'|'stderr',state:LogTailState){const file=join(serverDir(serverId),stream==='stdout'?'.blockctrl-stdout.log':'.blockctrl-stderr.log');const info=await stat(file).catch(()=>null);if(!info?.isFile())return;let offset=stream==='stdout'?state.stdoutOffset:state.stderrOffset;if(info.size<offset)offset=0;if(info.size===offset)return;const size=Math.min(512*1024,info.size-offset);const handle=await open(file,'r');try{const buffer=Buffer.alloc(size);const{bytesRead}=await handle.read(buffer,0,size,offset);offset+=bytesRead;let text=(stream==='stdout'?state.stdoutPartial:state.stderrPartial)+buffer.subarray(0,bytesRead).toString('utf8');const lines=text.split(/\r?\n/);const partial=lines.pop()??'';if(stream==='stdout'){state.stdoutOffset=offset;state.stdoutPartial=partial.slice(-16000)}else{state.stderrOffset=offset;state.stderrPartial=partial.slice(-16000)}for(const line of lines)await reportServerLogLine(serverId,stream,line,state)}finally{await handle.close()}}
async function pollLogTailer(serverId:string,state:LogTailState){if(state.busy)return;state.busy=true;try{await readLogAppend(serverId,'stdout',state);await readLogAppend(serverId,'stderr',state)}catch(error){agentEvent('warn',serverId,'[agent] log tail error',error instanceof Error?error.message:error)}finally{state.busy=false}}
function startLogTailer(serverId:string,loader:string,trackingMode:string,fromEnd=false){const current=logTailers.get(serverId);if(current){current.loader=loader;current.trackingMode=trackingMode;return}const stdout=join(serverDir(serverId),'.blockctrl-stdout.log'),stderr=join(serverDir(serverId),'.blockctrl-stderr.log');const state:LogTailState={timer:null as unknown as NodeJS.Timeout,stdoutOffset:fromEnd&&existsSync(stdout)?statSync(stdout).size:0,stderrOffset:fromEnd&&existsSync(stderr)?statSync(stderr).size:0,stdoutPartial:'',stderrPartial:'',busy:false,loader,trackingMode};state.timer=setInterval(()=>void pollLogTailer(serverId,state),400);logTailers.set(serverId,state);void pollLogTailer(serverId,state)}
































































async function jsonFetch<T>(url:string){const response=await fetch(url,{headers:{accept:'application/json'}});const text=await response.text();if(!response.ok)throw new Error(`Kaynak yanıt vermedi (${response.status}): ${url}`);if(!text.trim())throw new Error(`Kaynak boş yanıt verdi: ${url}`);try{return JSON.parse(text) as T}catch{throw new Error(`Kaynak geçersiz JSON döndürdü: ${url}`)}}
async function vanillaDownload(version:string){const manifest=await jsonFetch<{versions:{id:string,url:string}[]}>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');const entry=manifest.versions.find(v=>v.id===version);if(!entry)throw new Error('Minecraft version not found');const detail=await jsonFetch<{downloads:{server:{url:string;sha1:string}}}>(entry.url);if(!detail.downloads?.server?.url)throw new Error('Minecraft server dosyası bulunamadı');return detail.downloads.server}
async function paperDownload(version:string){const project=await jsonFetch<{builds:number[]}>(`https://api.papermc.io/v2/projects/paper/versions/${version}`);if(!project.builds?.length)throw new Error(`Paper ${version} için build bulunamadı`);const build=Math.max(...project.builds);return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/paper-${version}-${build}.jar`}
async function install(payload:Record<string,unknown>,id:string){const finalDir=serverDir(id);await report({type:'progress',serverId:id,status:'preparing',progress:5});const temp=`${finalDir}.installing`;await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});const loader=String(payload.loader??'vanilla').toLowerCase();const version=String(payload.mcVersion??'');const loaderVersion=String(payload.loaderVersion??'');if(!/^\d+\.\d+(\.\d+)?$/.test(version))throw new Error('Invalid Minecraft version');if(loader==='neoforge'&&(!loaderVersion||!loaderVersion.startsWith(neoForgePrefix(version))))throw new Error('NeoForge sürümü Minecraft sürümüyle uyumsuz');await report({type:'progress',serverId:id,status:'downloading',progress:10})
try{if(loader==='vanilla'){const artifact=await vanillaDownload(version);await download(artifact.url,join(temp,'server.jar'),artifact.sha1)}else if(loader==='paper')await download(await paperDownload(version),join(temp,'server.jar'));else if(loader==='fabric'){if(!loaderVersion)throw new Error('Fabric loader version required');await download(`https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVersion}/1.0.3/server/jar`,join(temp,'server.jar'))}else{if(!loaderVersion||!/^[0-9][0-9A-Za-z.+_-]*$/.test(loaderVersion))throw new Error('Loader version required');const coordinate=loader==='forge'?(loaderVersion.startsWith(`${version}-`)?loaderVersion:`${version}-${loaderVersion}`):loaderVersion;const url=loader==='forge'?`https://maven.minecraftforge.net/net/minecraftforge/forge/${coordinate}/forge-${coordinate}-installer.jar`:`https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;await download(url,join(temp,'installer.jar'));await report({type:'progress',serverId:id,status:'installing',progress:55});await run('java',['-jar','installer.jar','--installServer'],temp)}
await report({type:'progress',serverId:id,status:'configuring',progress:70});await writeFile(join(temp,'eula.txt'),'eula=true\n');const world=String(payload.worldName??'world').replace(/[^A-Za-z0-9_-]/g,'_');const seed=String(payload.seed??'');await writeFile(join(temp,'server.properties'),`server-port=${Number(payload.port)||25565}\nlevel-name=${world}\nlevel-seed=${seed}\nenable-rcon=false\n`);const trackingEnabled=payload.itemTrackingEnabled===true;const bridgeCapable=['paper','fabric','forge','neoforge'].includes(loader);const trackerToken=bridgeCapable||trackingEnabled?randomBytes(32).toString('hex'):'';let tracking:{mode:string;adapter:string;artifact?:string;warning?:string}={mode:trackingEnabled?'death-snapshot':'disabled',adapter:'none'};let websiteBridge={enabled:false,adapter:'none',warning:undefined as string|undefined};if(bridgeCapable){const installed=await installTrackerAdapter(temp,id,loader,version,trackerToken);websiteBridge={enabled:installed.mode==='event-adapter',adapter:installed.adapter,warning:installed.warning};if(trackingEnabled)tracking=installed;else if(installed.mode==='event-adapter')tracking={mode:'disabled',adapter:installed.adapter,artifact:installed.artifact,warning:installed.warning}}else if(trackingEnabled){tracking=await installTrackerAdapter(temp,id,loader,version,trackerToken)}const metaPath=join(temp,'blockctrl.json');await writeFile(metaPath,JSON.stringify({loader,version,loaderVersion,memoryMb:Number(payload.memoryMb)||4096,itemTrackingEnabled:trackingEnabled,itemTrackingMode:tracking.mode,trackerAdapter:tracking.adapter,trackerArtifact:tracking.artifact??null,trackerWarning:tracking.warning??null,trackerAuth:websiteBridge.enabled||tracking.mode==='event-adapter',websiteRegisterBridge:websiteBridge},null,2));await chmod(metaPath,0o600);if(trackerToken&&(websiteBridge.enabled||tracking.mode==='event-adapter')){const secretPath=join(temp,'.blockctrl-tracker-token');await writeFile(secretPath,trackerToken,'utf8');await chmod(secretPath,0o600)}await rm(finalDir,{recursive:true,force:true});await rename(temp,finalDir);if(trackerToken&&(websiteBridge.enabled||tracking.mode==='event-adapter'))trackerTokens.set(id,trackerToken);await report({type:'progress',serverId:id,status:'ready',progress:100,trackingMode:tracking.mode,trackingWarning:tracking.warning??null,websiteRegisterBridge:websiteBridge.enabled})}catch(error){const message=error instanceof Error?error.message:'Kurulum başarısız';await report({type:'progress',serverId:id,status:'failed',progress:0,error:message.slice(0,500)});await rm(temp,{recursive:true,force:true});throw error}}
async function configureJvmMemory(dir:string,memory:number){const path=join(dir,'user_jvm_args.txt');const existing=await readFile(path,'utf8').catch(()=> '');const kept=existing.split(/\r?\n/).filter(line=>line.trim()&&!/^\s*-Xm[sx]\d+[kKmMgG]?\s*$/.test(line));await writeFile(path,[`-Xms${memory}M`,`-Xmx${memory}M`,...kept].join('\n')+'\n','utf8')}
async function ensureControlFifo(dir:string){const fifo=join(dir,'.blockctrl-stdin');await rm(fifo,{force:true});await run('mkfifo',['.blockctrl-stdin'],dir);await chmod(fifo,0o600);return fifo}
async function launch(id:string,payload:Record<string,unknown>){agentEvent('info',id,'Minecraft başlatma isteği alındı');if(await validatedManagedPid(id))throw new Error('Server already running');const dir=serverDir(id);let meta=await readServerMeta(id);const memory=Math.max(1024,Math.min(Number(payload.memoryMb??meta.memoryMb)||4096,65536));const runtime=await validatedRuntimeTracking(id,meta);meta=runtime.meta;const loader=String(payload.loader??runtime.loader??'vanilla').toLowerCase();const trackingEnabled=payload.itemTrackingEnabled===true||meta.itemTrackingEnabled===true;const trackingMode=trackingEnabled?runtime.mode:'disabled';const runScript=existsSync(join(dir,'run.sh'));const optimizationStatePath=join(DATA_DIR,'runtime-optimization',id+'.json');const optimizedArgs=await prepareOptimizedLaunch(dir,optimizationStatePath,memory);if(runScript&&!optimizedArgs)await configureJvmMemory(dir,memory);await ensureControlFifo(dir);await writeFile(join(dir,'.blockctrl-stdout.log'),'','utf8');await writeFile(join(dir,'.blockctrl-stderr.log'),'','utf8');const out=await open(join(dir,'.blockctrl-stdout.log'),'a'),err=await open(join(dir,'.blockctrl-stderr.log'),'a');const bridgeEnabled=meta.websiteRegisterBridge&&typeof meta.websiteRegisterBridge==='object'?(meta.websiteRegisterBridge as Record<string,unknown>).enabled===true:false;const bridgeToken=bridgeEnabled||trackingMode==='event-adapter'?await trackerTokenFor(id):'';const trackerEnv={...process.env,BLOCKCTRL_SERVER_ID:id,BLOCKCTRL_TRACKER_ENDPOINT:'http://127.0.0.1:8788/item-loss',BLOCKCTRL_WEBSITE_REGISTER_ENDPOINT:'http://127.0.0.1:8788/website-register',BLOCKCTRL_TRACKER_TOKEN:bridgeToken,BLOCKCTRL_ITEM_TRACKING_ENABLED:trackingEnabled?'true':'false',JVM_ARGS:optimizedArgs?optimizedArgs.join(' '):`-Xms${memory}M -Xmx${memory}M`};const program=runScript?'bash':'java';const args=runScript?['run.sh','nogui']:[...(optimizedArgs??[`-Xms${memory}M`,`-Xmx${memory}M`]),'-jar','server.jar','nogui'];const wrapper='exec 3<> .blockctrl-stdin; exec "$@" <&3';const child=spawn('bash',['-lc',wrapper,'blockctrl-launch',program,...args],{cwd:dir,stdio:['ignore',out.fd,err.fd],env:trackerEnv,detached:true});await out.close();await err.close();if(!child.pid)throw new Error('Minecraft process PID alınamadı');processes.set(id,child);managedPids.set(id,child.pid);if(optimizedArgs)await markOptimizedLaunch(optimizationStatePath,child.pid,optimizedArgs).catch(error=>agentEvent('warn',id,'Optimizasyon baslatma kaydi yazilamadi',error));playerReconciledServers.delete(id);await writeFile(join(dir,'.blockctrl-pid'),String(child.pid));startLogTailer(id,loader,trackingMode,false);if(trackingEnabled&&trackingMode==='death-snapshot')startVanillaDeathTracker(id,loader);child.unref();child.on('error',error=>{stopVanillaDeathTracker(id);stopLogTailer(id);processes.delete(id);managedPids.delete(id);void rm(join(dir,'.blockctrl-pid'),{force:true});void report({type:'server-status',serverId:id,status:'failed',error:(error as NodeJS.ErrnoException).code==='ENOENT'?'Java çalıştırılamadı. Java installation/PATH kontrol edin.':(error as NodeJS.ErrnoException).code==='EACCES'?'Java çalıştırılamadı. Dosya izinlerini kontrol edin.':'Java process başlatılamadı.'})});child.on('close',code=>{stopVanillaDeathTracker(id);stopLogTailer(id);processes.delete(id);managedPids.delete(id);void rm(join(dir,'.blockctrl-pid'),{force:true});const expected=stopping.delete(id);void report({type:'server-status',serverId:id,status:expected||code===0?'stopped':'crashed',pid:null})});agentEvent('info',id,`Minecraft process başlatıldı · PID ${child.pid}`);await report({type:'server-status',serverId:id,status:'running',pid:child.pid})}
async function stop(id:string,force=false){const pid=await validatedManagedPid(id);if(!pid){agentEvent('warn',id,'Durdurma istendi ancak çalışan process doğrulanamadı');return}agentEvent('info',id,force?'Zorla durdurma başlatıldı':'Güvenli durdurma başlatıldı');stopping.add(id);if(force){signalManagedPid(pid,'SIGKILL');await waitForServerExit(id,5000)}else{let graceful=true;try{await writeConsole(id,'stop')}catch{graceful=false;signalManagedPid(pid,'SIGTERM')}let exited=await waitForServerExit(id,30000);if(!exited){signalManagedPid(pid,'SIGKILL');exited=await waitForServerExit(id,5000)}if(!exited)throw new Error(graceful?'Sunucu stop komutundan sonra kapanmadı':'Sunucu process sonlandırılamadı')}stopVanillaDeathTracker(id);stopLogTailer(id);processes.delete(id);managedPids.delete(id);await rm(join(serverDir(id),'.blockctrl-pid'),{force:true});await report({type:'server-status',serverId:id,status:'stopped',pid:null})}
async function backup(id:string,label='full',kind='full'){const source=serverDir(id);const target=join(DATA_DIR,'backups',`${id}-${Date.now()}-${label}.tar.gz`);await mkdir(join(DATA_DIR,'backups'),{recursive:true});await report({type:'backup-progress',serverId:id,status:'running',progress:10});const properties=await readFile(join(source,'server.properties'),'utf8').catch(()=>''),levelMatch=properties.match(/^level-name=(.+)$/m),level=levelMatch?.[1]?.trim()||'world';const entries=kind==='world'?[level,`${level}_nether`,`${level}_the_end`]:kind==='config'?['server.properties','whitelist.json','ops.json','banned-players.json','banned-ips.json']:kind==='addons'?['mods','plugins']:['.'];const args=['-czf',target,'--exclude=.blockctrl-pid','--exclude=.blockctrl-stdin','--exclude=.blockctrl-stdout.log','--exclude=.blockctrl-stderr.log','--exclude=.blockctrl-tracker-token','-C',source,...entries];await run('tar',args,DATA_DIR);await report({type:'backup-progress',serverId:id,status:'completed',progress:100,path:target});return target}
function backupRoot(){return resolve(DATA_DIR,'backups')}
function safeBackup(requested:string){const root=backupRoot();const target=resolve(root,basename(requested));if(target!==root&&!target.startsWith(`${root}${sep}`))throw new Error('Backup path traversal blocked');return target}
async function serverBackup(id:string,p:Record<string,unknown>){
  const requested=String(p.path??p.filename??'').trim()
  let archive:string
  if(requested)archive=safeBackup(requested)
  else{
    const rows=[] as Array<{path:string;mtime:number}>
    for(const entry of await readdir(backupRoot(),{withFileTypes:true}).catch(()=>[] as any[])){
      if(!entry.isFile?.()||!entry.name.startsWith(`${id}-`)||!entry.name.endsWith('.tar.gz'))continue
      const path=join(backupRoot(),entry.name);const info=await stat(path).catch(()=>null);if(info?.isFile())rows.push({path,mtime:info.mtimeMs})
    }
    rows.sort((a,b)=>b.mtime-a.mtime);archive=rows[0]?.path??''
  }
  if(!archive||!existsSync(archive))throw new Error('Backup not found')
  const name=basename(archive);if(!name.startsWith(`${id}-`)||!name.endsWith('.tar.gz'))throw new Error('Backup bu sunucuya ait değil')
  return archive
}
async function backupArchiveListing(archive:string){const listing=await new Promise<string>((ok,fail)=>{const child=spawn('tar',['-tzf',archive],{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('exit',code=>code===0?ok(out):fail(new Error(`Invalid archive: ${err.slice(-500)}`))) });const rows=listing.split('\n').filter(Boolean);if(rows.some(x=>x.startsWith('/')||x.split('/').includes('..')))throw new Error('Unsafe archive path');return rows}
async function hashFileSha256(path:string){return new Promise<string>((ok,fail)=>{const hash=createHash('sha256'),stream=createReadStream(path);stream.on('data',chunk=>hash.update(chunk));stream.on('error',fail);stream.on('end',()=>ok(hash.digest('hex')))})}
async function verifyBackup(id:string,p:Record<string,unknown>){const archive=await serverBackup(id,p);const [entries,info,sha256]=await Promise.all([backupArchiveListing(archive),stat(archive),hashFileSha256(archive)]);return{verified:true,filename:basename(archive),sizeBytes:info.size,entries:entries.length,sha256,modifiedAt:info.mtime.toISOString()}}
async function copyBackup(id:string,p:Record<string,unknown>){const source=await serverBackup(id,p);await backupArchiveListing(source);const label=String(p.label??'copy').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,50)||'copy';const target=join(backupRoot(),`${id}-${Date.now()}-${label}.tar.gz`);await cp(source,target,{force:false});const info=await stat(target);return{copied:true,source:basename(source),filename:basename(target),path:target,sizeBytes:info.size,sha256:await hashFileSha256(target)}}
async function restoreBackup(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))await stop(id);const archive=await serverBackup(id,p);await backupArchiveListing(archive);await backup(id,'pre-restore','full');await run('tar',['-xzf',archive,'-C',serverDir(id),'--no-same-owner'],DATA_DIR);return {restored:basename(archive),validated:true}}
async function deleteBackup(id:string,p:Record<string,unknown>){const archive=await serverBackup(id,p);await rm(archive,{force:true});return {deleted:basename(archive)}}
async function uploadWorld(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Server must be stopped');const pathname=String(p.pathname??'');if(!pathname)throw new Error('World upload missing');const temp=join(DATA_DIR,`${id}-world-upload.zip`);const response=await fetch(`${PANEL_URL}/api/agent/file?pathname=${encodeURIComponent(pathname)}&serverId=${id}`,{headers:{authorization:`Bearer ${NODE_TOKEN}`,'x-node-id':NODE_ID!}});if(!response.ok||!response.body)throw new Error('World upload could not be downloaded');await pipeline(response.body as never,createWriteStream(temp));const listing=await new Promise<string>((ok,fail)=>{const child=spawn('unzip',['-Z1',temp],{stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',d=>out+=d);child.on('exit',c=>c===0?ok(out):fail(new Error('World must be a valid zip')))}) ;if(listing.split('\n').some(x=>x.startsWith('/')||x.split('/').includes('..')))throw new Error('Unsafe world archive');const name=String(p.worldName??'uploaded-world').replace(/[^A-Za-z0-9_-]/g,'_');const target=safePath(id,name);await mkdir(target,{recursive:true});await run('unzip',['-q','-o',temp,'-d',target],DATA_DIR);await rm(temp,{force:true});return {world:name,uploaded:true}}
































































async function reset(type:string,id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Server must be stopped');if(p.backupFirst)await backup(id,type);const dir=serverDir(id);if(type==='reset-world'){const world=String(p.worldName??'world');for(const suffix of ['','_nether','_the_end'])await rm(safePath(id,`${world}${suffix}`),{recursive:true,force:true})}else if(type==='reset-config'){for(const file of ['server.properties','whitelist.json','ops.json','banned-players.json','banned-ips.json'])await rm(join(dir,file),{force:true});await writeFile(join(dir,'server.properties'),`server-port=${Number(p.port)||25565}\nlevel-name=${String(p.worldName??'world')}\n`)}else if(type==='clear-addons'){await rm(join(dir,'mods'),{recursive:true,force:true});await rm(join(dir,'plugins'),{recursive:true,force:true})}else if(type==='factory-reset'||type==='reinstall'){await rm(dir,{recursive:true,force:true});await install(p,id)}}
async function listFiles(id:string,requested='.'){const root=serverDir(id);const dir=safePath(id,requested);return Promise.all((await readdir(dir,{withFileTypes:true})).map(async e=>{const path=join(dir,e.name);const info=await stat(path);return{name:e.name,path:relative(root,path),directory:e.isDirectory(),size:info.size,updatedAt:info.mtime.toISOString()}}))}
async function readPlayerJsonList(path:string){
  try{const parsed=JSON.parse(await readFile(path,'utf8'));return Array.isArray(parsed)?parsed.filter(item=>item&&typeof item==='object') as Array<Record<string,unknown>>:[]}
  catch{return [] as Array<Record<string,unknown>>}
}
function safePlayerName(value:unknown){const name=String(value??'').trim();return /^[A-Za-z0-9_]{1,16}$/.test(name)?name:null}
function safePlayerText(value:unknown,max=160){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
async function queryOnlinePlayers(id:string){
  const props=parsePropertiesText(await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=>''))
  const configuredMax=Number(props['max-players']||0)||null
  const pid=await validatedManagedPid(id)
  if(!pid)return{verified:true,names:[] as string[],count:0,maxPlayers:configuredMax,source:'server-stopped'}
  if(!existsSync(join(serverDir(id),'.blockctrl-stdin')))return{verified:false,names:[] as string[],count:null as number|null,maxPlayers:configuredMax,source:'control-channel-unavailable'}
  const stdout=join(serverDir(id),'.blockctrl-stdout.log');const offset=(await stat(stdout).catch(()=>null))?.size??0
  try{await writeConsole(id,'list')}catch{const names=[...playerPresenceCache.entries()].filter(([key,row])=>key.startsWith(`${id}:`)&&row.isOnline&&row.at>Date.now()-120_000).map(([,row])=>row.playerName);return{verified:names.length>0,names,count:names.length,maxPlayers:configuredMax,source:names.length?'log-presence-fallback':'online-query-unavailable'}}
  const deadline=Date.now()+2500
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,150))
    const fresh=await readLogSince(stdout,offset,128*1024)
    const matches=[...fresh.matchAll(/There are (\d+) of a max of (\d+) players online:?\s*(.*)$/gim)]
    const hit=matches.at(-1)
    if(hit){const names=String(hit[3]??'').split(',').map(name=>name.trim()).filter(name=>/^[A-Za-z0-9_]{1,16}$/.test(name));const count=Number(hit[1]);if(names.length===count)return{verified:true,names,count,maxPlayers:Number(hit[2])||configuredMax,source:'minecraft-list'};const cached=[...playerPresenceCache.entries()].filter(([key,row])=>key.startsWith(`${id}:`)&&row.isOnline).map(([,row])=>row.playerName);return{verified:cached.length===count,names:cached.length===count?cached:[],count,maxPlayers:Number(hit[2])||configuredMax,source:cached.length===count?'log-presence-fallback':'minecraft-list-incomplete'}}
  }
  const names=[...playerPresenceCache.entries()].filter(([key,row])=>key.startsWith(`${id}:`)&&row.isOnline&&row.at>Date.now()-120_000).map(([,row])=>row.playerName);return{verified:names.length>0,names,count:names.length,maxPlayers:configuredMax,source:names.length?'log-presence-fallback':'online-query-timeout'}
}
async function playersStatus(id:string){
  if(!validServerId(id))throw new Error('Geçersiz serverId')
  const root=serverDir(id);const info=await stat(root).catch(()=>null);if(!info?.isDirectory())throw new Error('Sunucu klasörü bulunamadı')
  const [cache,ops,whitelist,bans,online]=await Promise.all([
    readPlayerJsonList(join(root,'usercache.json')),
    readPlayerJsonList(join(root,'ops.json')),
    readPlayerJsonList(join(root,'whitelist.json')),
    readPlayerJsonList(join(root,'banned-players.json')),
    queryOnlinePlayers(id),
  ])
  const props=parsePropertiesText(await readFile(join(root,'server.properties'),'utf8').catch(()=>''))
  const map=new Map<string,Record<string,unknown>>()
  const ensure=(nameRaw:unknown,uuidRaw?:unknown)=>{const name=safePlayerName(nameRaw);if(!name)return null;const key=name.toLowerCase();const uuid=safePlayerText(uuidRaw,40)||playerUuidCache.get(`${id}:${key}`)||null;const row=map.get(key)??{playerName:name,playerUuid:uuid,isOnline:false,isOp:false,opLevel:null,whitelisted:false,banned:false,banReason:null,banExpiresAt:null};if(uuid&&!row.playerUuid)row.playerUuid=uuid;map.set(key,row);return row}
  for(const item of cache)ensure(item.name,item.uuid)
  for(const item of whitelist){const row=ensure(item.name,item.uuid);if(row)row.whitelisted=true}
  for(const item of ops){const row=ensure(item.name,item.uuid);if(row){row.isOp=true;row.opLevel=Number(item.level)||null;row.bypassesPlayerLimit=item.bypassesPlayerLimit===true}}
  for(const item of bans){const row=ensure(item.name,item.uuid);if(row){row.banned=true;row.banReason=safePlayerText(item.reason,300)||null;const expires=safePlayerText(item.expires,80);row.banExpiresAt=expires&&expires.toLowerCase()!=='forever'&&!Number.isNaN(Date.parse(expires))?new Date(expires).toISOString():null;row.banSource=safePlayerText(item.source,120)||null}}
  for(const name of online.names){const row=ensure(name);if(row)row.isOnline=true}
  const players=[...map.values()].sort((a,b)=>Number(Boolean(b.isOnline))-Number(Boolean(a.isOnline))||String(a.playerName).localeCompare(String(b.playerName),'tr'))
  return{running:isServerRunningKnown(id),onlineVerified:online.verified,onlineSource:online.source,onlineNames:online.names,playerCount:online.count,maxPlayers:online.maxPlayers,whitelistEnabled:String(props['white-list']??'false')==='true',players,syncedAt:new Date().toISOString()}
}
async function playerAction(id:string,p:Record<string,unknown>){
  const playerName=safePlayerName(p.playerName);if(!playerName)throw new Error('Geçerli Minecraft oyuncu adı gerekli')
  const action=String(p.action??'');const reason=safePlayerText(p.reason,160);const message=safePlayerText(p.message,256)
  const commands:Record<string,string>={
    'kick':`kick ${playerName}${reason?` ${reason}`:''}`,
    'message':`tell ${playerName} ${message}`,
    'whitelist-add':`whitelist add ${playerName}`,
    'whitelist-remove':`whitelist remove ${playerName}`,
    'op':`op ${playerName}`,
    'deop':`deop ${playerName}`,
    'ban':`ban ${playerName}${reason?` ${reason}`:''}`,
    'unban':`pardon ${playerName}`,
  }
  if(!commands[action])throw new Error('Desteklenmeyen oyuncu işlemi')
  if(action==='message'&&!message)throw new Error('Mesaj boş olamaz')
  await writeConsole(id,commands[action])
  return{sent:true,action,playerName,at:new Date().toISOString()}
}
type PlayerStorageItem={slot:number|null;itemId:string;itemName:string;amount:number}
function parsePlayerStorage(raw:string):PlayerStorageItem[]{const items:PlayerStorageItem[]=[];for(const part of splitTopLevelCompounds(raw)){const id=part.match(/(?:^|[,\\s])id\\s*:\\s*"([a-z0-9_.-]+:[a-z0-9_./-]+)"/i)?.[1];if(!id)continue;const countRaw=part.match(/(?:^|[,\\s])(?:Count|count)\\s*:\\s*(-?\\d+)(?:[bBsSlL])?/i)?.[1]??'1';const slotRaw=part.match(/(?:^|[,\\s])(?:Slot|slot)\\s*:\\s*(-?\\d+)(?:[bBsSlL])?/i)?.[1];const amount=Math.max(0,Math.min(100000,Number(countRaw)||1));if(amount>0)items.push({slot:slotRaw==null?null:Number(slotRaw),itemId:id,itemName:id,amount})}return items.sort((a,b)=>(a.slot??999)-(b.slot??999)||a.itemId.localeCompare(b.itemId))}
async function playerStorage(id:string,p:Record<string,unknown>,field:'Inventory'|'EnderItems'){
  const playerName=safePlayerName(p.playerName);if(!playerName)throw new Error('Geçerli Minecraft oyuncu adı gerekli')
  if(!(await validatedManagedPid(id)))throw new Error('Envanter okumak için Minecraft sunucusu çalışıyor olmalıdır')
  if(!existsSync(join(serverDir(id),'.blockctrl-stdin')))throw new Error('Canlı oyuncu veri kanalı hazır değil; sunucuyu agent ile bir kez yeniden başlatın')
  const storage=`blockctrl:inspect_${randomBytes(6).toString('hex')}`;const stdout=join(serverDir(id),'.blockctrl-stdout.log');const offset=(await stat(stdout).catch(()=>null))?.size??0
  await writeConsole(id,[`data modify storage ${storage} items set from entity ${playerName} ${field}`,`data get storage ${storage} items`,`data remove storage ${storage} items`].join('\\n'))
  const deadline=Date.now()+5000
  while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,120));const fresh=await readLogSince(stdout,offset,512*1024);const lines=fresh.split(/\\r?\\n/).filter(Boolean);for(let i=lines.length-1;i>=0;i--){const line=lines[i];const marker=`${storage} has the following contents:`;const at=line.indexOf(marker);if(at<0)continue;const raw=line.slice(at+marker.length).trim();return{playerName,kind:field==='Inventory'?'inventory':'enderchest',items:parsePlayerStorage(raw),observedAt:new Date().toISOString(),source:'minecraft-data-storage'}}const failure=lines.find(line=>/(No entity was found|No player was found|Found no elements matching|Unable to modify storage|Unknown or incomplete command)/i.test(line));if(failure)throw new Error(`Minecraft oyuncu verisini okuyamadı: ${failure.slice(-500)}`)}
  throw new Error('Oyuncu envanteri sorgusu zaman aşımına uğradı')
}
async function playerHistory(id:string,p:Record<string,unknown>){
  const playerName=safePlayerName(p.playerName);if(!playerName)throw new Error('Geçerli Minecraft oyuncu adı gerekli')
  const lines=[...(await tailTextLines(join(serverDir(id),'.blockctrl-stdout.log'),800,1024*1024)),...(await tailTextLines(join(serverDir(id),'.blockctrl-stderr.log'),300,512*1024))].filter(line=>line.toLowerCase().includes(playerName.toLowerCase())).slice(-200)
  return{playerName,lines,at:new Date().toISOString()}
}
function worldTemplateRoot(){return resolve(process.env.BLOCKCTRL_WORLD_TEMPLATE_DIR??join(DATA_DIR,'world-templates'))}
async function worldTemplateAvailability(){const root=worldTemplateRoot();await mkdir(root,{recursive:true});const packages:string[]=[];for(const entry of await readdir(root,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[])){if(!entry.isFile?.()||!/^[a-z0-9-]{1,80}\.zip$/i.test(entry.name))continue;packages.push(entry.name.replace(/\.zip$/i,''))}return{root,packages:packages.sort(),checkedAt:new Date().toISOString()}}
async function patchServerPropertiesFile(id:string,updates:Record<string,string>){const path=join(serverDir(id),'server.properties');const existing=await readFile(path,'utf8').catch(()=> '');const map=new Map(Object.entries(updates));const seen=new Set<string>();const lines=existing.split(/\r?\n/).filter(Boolean).map(line=>{const index=line.indexOf('=');if(index<1)return line;const key=line.slice(0,index);if(!map.has(key))return line;seen.add(key);return `${key}=${map.get(key)}`});for(const[key,value]of map)if(!seen.has(key))lines.push(`${key}=${value}`);await writeFile(path,lines.join('\n')+'\n','utf8')}
async function worldsStatus(id:string){if(!validServerId(id))throw new Error('Geçersiz serverId');const root=serverDir(id);const info=await stat(root).catch(()=>null);if(!info?.isDirectory())throw new Error('Sunucu klasörü bulunamadı');const props=parsePropertiesText(await readFile(join(root,'server.properties'),'utf8').catch(()=>''));const active=String(props['level-name']||'world');const entries=await readdir(root,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[]);const worlds:any[]=[];for(const entry of entries){if(!entry.isDirectory?.()||entry.isSymbolicLink?.())continue;const name=String(entry.name);if(!/^[A-Za-z0-9_-]{1,80}$/.test(name))continue;const dir=join(root,name);const level=existsSync(join(dir,'level.dat'));const profilePath=join(dir,'.blockctrl-world-profile.json');const prepared=existsSync(profilePath)&&!level;if(!level&&!prepared)continue;let profile:any={};if(existsSync(profilePath)){try{profile=JSON.parse(await readFile(profilePath,'utf8'))}catch{}}let bytes=0;try{const out=await runCapture('du',['-sb','--',dir],DATA_DIR);bytes=Number(out.split(/\s+/)[0])||0}catch{const st=await stat(dir).catch(()=>null);bytes=st?.size||0}worlds.push({name,isActive:name===active,sizeMb:Number((bytes/1048576).toFixed(2)),seed:profile.seed||null,prepared,templateId:profile.templateId||null,templateName:profile.templateName||null,updatedAt:(await stat(dir)).mtime.toISOString()})}worlds.sort((a,b)=>Number(b.isActive)-Number(a.isActive)||a.name.localeCompare(b.name,'tr'));return{worlds,activeWorld:active,scannedAt:new Date().toISOString()}}
async function createWorldProfile(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Dünya oluşturmak için sunucuyu durdurun');const name=String(p.worldName??'').trim();if(!/^[A-Za-z0-9_-]{1,40}$/.test(name))throw new Error('Geçersiz dünya adı');const target=safePath(id,name);if(existsSync(target))throw new Error('Bu isimde dünya veya klasör zaten var');const mode=String(p.mode??'native');const templateId=String(p.templateId??'klasik-survival');const templateName=String(p.templateName??templateId).slice(0,120);const seed=String(p.seed??'').slice(0,100);const activate=p.activateAfterCreate!==false;let installedPackage=false;const rawProfile=(p.profile&&typeof p.profile==='object'&&!Array.isArray(p.profile)?p.profile:null) as Record<string,unknown>|null;let profile:Record<string,unknown>|null=null;if(mode==='package'){const packageKey=String(p.packageKey??templateId);if(!/^[a-z0-9-]{1,80}$/i.test(packageKey))throw new Error('Geçersiz şablon paket kimliği');const source=join(worldTemplateRoot(),`${packageKey}.zip`);if(!existsSync(source))throw new Error(`Dünya şablon paketi kurulu değil: ${packageKey}`);const temp=join(DATA_DIR,`.world-template-${id}-${Date.now()}.zip`);await cp(source,temp);await installWorldArchive(id,temp,name);installedPackage=true}else if(mode==='native'){await mkdir(target,{recursive:false});const allowedGamemode=new Set(['survival','creative','adventure']);const allowedDifficulty=new Set(['peaceful','easy','normal','hard']);const allowedLevelType=new Set(['default','flat','largeBiomes','amplified']);const input=rawProfile??{};profile={gamemode:allowedGamemode.has(String(input.gamemode))?String(input.gamemode):'survival',difficulty:allowedDifficulty.has(String(input.difficulty))?String(input.difficulty):'normal',hardcore:input.hardcore===true,levelType:allowedLevelType.has(String(input.levelType))?String(input.levelType):'default',generateStructures:input.generateStructures!==false}}else throw new Error('Geçersiz dünya şablon modu');await writeFile(join(target,'.blockctrl-world-profile.json'),JSON.stringify({templateId,templateName,seed,mode,profile,createdAt:new Date().toISOString()},null,2),'utf8');if(activate){const updates:Record<string,string>={'level-name':name};if(mode==='native'&&profile){updates['level-seed']=seed;updates['level-type']=profile.levelType==='largeBiomes'?'minecraft:large_biomes':profile.levelType==='amplified'?'minecraft:amplified':profile.levelType==='flat'?'minecraft:flat':'minecraft:normal';updates.gamemode=String(profile.gamemode);updates.difficulty=String(profile.difficulty);updates.hardcore=String(profile.hardcore===true);updates['generate-structures']=String(profile.generateStructures!==false)}await patchServerPropertiesFile(id,updates)}return{world:name,seed,templateId,templateName,mode,active:activate,prepared:mode==='native',installedPackage,path:relative(serverDir(id),target)}}
async function createWorld(id:string,p:Record<string,unknown>){return createWorldProfile(id,{...p,mode:'native',templateId:'klasik-survival',templateName:'Klasik Survival',profile:{gamemode:'survival',difficulty:'normal',hardcore:false,levelType:'default',generateStructures:true},activateAfterCreate:true})}
async function activateManagedWorld(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Aktif dünyayı değiştirmek için sunucuyu durdurun');const world=String(p.worldName??'').trim();if(!/^[A-Za-z0-9_-]{1,40}$/.test(world))throw new Error('Geçersiz dünya adı');const dir=safePath(id,world);const info=await stat(dir).catch(()=>null);if(!info?.isDirectory())throw new Error('Dünya klasörü bulunamadı');if(!existsSync(join(dir,'level.dat'))&&!existsSync(join(dir,'.blockctrl-world-profile.json')))throw new Error('Bu klasör geçerli veya hazırlanmış bir dünya değil');const updates:Record<string,string>={'level-name':world};const metaPath=join(dir,'.blockctrl-world-profile.json');if(existsSync(metaPath)){try{const meta=JSON.parse(await readFile(metaPath,'utf8')) as Record<string,unknown>;if(meta.mode==='native'&&meta.profile&&typeof meta.profile==='object'){const profile=meta.profile as Record<string,unknown>;const levelType=String(profile.levelType??'default');updates['level-seed']=String(meta.seed??'').slice(0,100);updates['level-type']=levelType==='largeBiomes'?'minecraft:large_biomes':levelType==='amplified'?'minecraft:amplified':levelType==='flat'?'minecraft:flat':'minecraft:normal';updates.gamemode=['survival','creative','adventure'].includes(String(profile.gamemode))?String(profile.gamemode):'survival';updates.difficulty=['peaceful','easy','normal','hard'].includes(String(profile.difficulty))?String(profile.difficulty):'normal';updates.hardcore=String(profile.hardcore===true);updates['generate-structures']=String(profile.generateStructures!==false)}}catch{}}await patchServerPropertiesFile(id,updates);return{world,profileApplied:Object.keys(updates).length>1}}
async function resetManagedWorld(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Dünya sıfırlamak için sunucuyu durdurun');if(p.confirm!==true)throw new Error('World reset requires confirmation');const world=String(p.worldName??'world').trim();if(!/^[A-Za-z0-9_-]{1,40}$/.test(world))throw new Error('Geçersiz dünya adı');const props=parsePropertiesText(await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=>''));const active=String(props['level-name']||'world')===world;const metaPath=join(safePath(id,world),'.blockctrl-world-profile.json');let meta:Record<string,unknown>|null=null;try{meta=JSON.parse(await readFile(metaPath,'utf8')) as Record<string,unknown>}catch{}if(p.backupFirst!==false)await backup(id,`pre-reset-${world}`,'world');for(const suffix of ['','_nether','_the_end'])await rm(safePath(id,`${world}${suffix}`),{recursive:true,force:true});if(meta){return createWorldProfile(id,{worldName:world,seed:String(meta.seed??''),templateId:String(meta.templateId??'reset-world'),templateName:String(meta.templateName??'Sıfırlanan dünya'),mode:String(meta.mode??'native'),profile:meta.profile??null,packageKey:String(meta.templateId??''),activateAfterCreate:active})}return createWorldProfile(id,{worldName:world,seed:'',templateId:'reset-default',templateName:'Sıfırlanmış standart dünya',mode:'native',profile:{gamemode:'survival',difficulty:'normal',hardcore:false,levelType:'default',generateStructures:true},activateAfterCreate:active})}
async function deleteManagedWorld(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Dünya silmek için sunucuyu durdurun');const world=String(p.worldName??'').trim();if(!/^[A-Za-z0-9_-]{1,40}$/.test(world))throw new Error('Geçersiz dünya adı');const props=parsePropertiesText(await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=>''));if(String(props['level-name']||'world')===world)throw new Error('Aktif dünya silinemez. Önce başka bir dünyayı aktif yapın.');const target=safePath(id,world);const info=await stat(target).catch(()=>null);if(!info?.isDirectory())throw new Error('Dünya bulunamadı');await rm(target,{recursive:true,force:true});for(const suffix of ['_nether','_the_end'])await rm(safePath(id,`${world}${suffix}`),{recursive:true,force:true});return{deleted:world}}
async function applyWorldLiveSettings(id:string,p:Record<string,unknown>){if(!isServerRunningKnown(id))throw new Error('Canlı dünya ayarları için sunucu çalışıyor olmalıdır');const world=String(p.worldName??'');const props=parsePropertiesText(await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=>''));if(String(props['level-name']||'world')!==world)throw new Error('Canlı ayarlar yalnız aktif dünyaya uygulanabilir');const commands:string[]=[];const finite=(v:unknown)=>Number.isFinite(Number(v));const difficulty=String(p.difficulty??'');if(difficulty){if(!['peaceful','easy','normal','hard'].includes(difficulty))throw new Error('Geçersiz zorluk');commands.push(`difficulty ${difficulty}`)}const border=Number(p.borderSize);if(Number.isFinite(border)&&String(p.borderSize??'').trim()){if(border<1||border>59999968)throw new Error('World border 1-59999968 aralığında olmalıdır');commands.push(`worldborder set ${Math.floor(border)}`)}if(p.borderCenter&&typeof p.borderCenter==='object'){const center=p.borderCenter as Record<string,unknown>;const x=Number(center.x),z=Number(center.z);if(![x,z].every(Number.isFinite)||Math.abs(x)>29999984||Math.abs(z)>29999984)throw new Error('Geçersiz world border merkezi');commands.push(`worldborder center ${Math.floor(x)} ${Math.floor(z)}`)}if(String(p.borderWarningDistance??'').trim()){const v=Number(p.borderWarningDistance);if(!finite(v)||v<0||v>30000000)throw new Error('Geçersiz border uyarı mesafesi');commands.push(`worldborder warning distance ${Math.floor(v)}`)}if(String(p.borderWarningTime??'').trim()){const v=Number(p.borderWarningTime);if(!finite(v)||v<0||v>3600)throw new Error('Geçersiz border uyarı süresi');commands.push(`worldborder warning time ${Math.floor(v)}`)}if(String(p.borderDamageAmount??'').trim()){const v=Number(p.borderDamageAmount);if(!finite(v)||v<0||v>1000)throw new Error('Geçersiz border hasarı');commands.push(`worldborder damage amount ${v}`)}if(String(p.borderDamageBuffer??'').trim()){const v=Number(p.borderDamageBuffer);if(!finite(v)||v<0||v>30000000)throw new Error('Geçersiz border hasar tamponu');commands.push(`worldborder damage buffer ${v}`)}if(p.spawn&&typeof p.spawn==='object'){const sp=p.spawn as Record<string,unknown>;const x=Number(sp.x),y=Number(sp.y),z=Number(sp.z);if(![x,y,z].every(Number.isFinite)||Math.abs(x)>30000000||Math.abs(z)>30000000||y<-64||y>320)throw new Error('Geçersiz spawn koordinatı');commands.push(`setworldspawn ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`)}const time=String(p.time??'');if(time){if(!['day','noon','night','midnight'].includes(time))throw new Error('Geçersiz zaman ayarı');commands.push(`time set ${time}`)}const weather=String(p.weather??'');if(weather){if(!['clear','rain','thunder'].includes(weather))throw new Error('Geçersiz hava ayarı');commands.push(`weather ${weather}`)}const allowedRules=new Set(['keepInventory','mobGriefing','doDaylightCycle','doWeatherCycle','naturalRegeneration','doMobSpawning','doFireTick','announceAdvancements','doImmediateRespawn','showDeathMessages','disableRaids','doInsomnia','doPatrolSpawning','doTraderSpawning','doWardenSpawning','universalAnger']);if(p.gamerules&&typeof p.gamerules==='object'&&!Array.isArray(p.gamerules)){for(const[key,value]of Object.entries(p.gamerules as Record<string,unknown>)){if(!allowedRules.has(key)||typeof value!=='boolean')continue;commands.push(`gamerule ${key} ${value}`)}}if(!commands.length)throw new Error('Uygulanacak canlı dünya ayarı yok');for(const command of commands)await writeConsole(id,command);return{world,applied:commands.length,commands:commands.map(x=>x.split(' ')[0]),at:new Date().toISOString()}}
async function fetchPanelFile(pathname:string,destination:string,id:string){const response=await fetch(`${PANEL_URL}/api/agent/file?pathname=${encodeURIComponent(pathname)}&serverId=${id}`,{headers:{authorization:`Bearer ${NODE_TOKEN}`,'x-node-id':NODE_ID!}});if(!response.ok||!response.body)throw new Error('Panel upload could not be downloaded');await mkdir(join(destination,'..'),{recursive:true});await pipeline(response.body as never,createWriteStream(destination))}
const CONTENT_TEXT_EXTENSIONS=new Set(['.yml','.yaml','.json','.json5','.properties','.toml','.ini','.cfg','.conf','.txt','.md','.xml','.mcmeta','.mcfunction'])
function extensionOf(value:string){const base=basename(value).toLowerCase();const index=base.lastIndexOf('.');return index>=0?base.slice(index):''}
function normalizeRelative(value:string){const normalized=value.replaceAll('\\','/').split('/').filter(Boolean);if(!normalized.length||normalized.some(part=>part==='.'||part==='..'||part.includes('\0')||part.startsWith('-')))throw new Error('Unsafe content path');return normalized.join('/')}
function fileCategory(filename:string){const normalized=filename.replaceAll('\\','/').replace(/^\.\//,'');const lower=normalized.toLowerCase();const parts=lower.split('/').filter(Boolean);const first=parts[0]??'';if(first==='plugins'){return parts.length>2||CONTENT_TEXT_EXTENSIONS.has(extensionOf(lower))?'plugin-config':'plugins'}if(first==='mods'||lower.endsWith('.jar'))return 'mods';if(first==='resourcepacks'||first==='resource-packs')return 'resource-packs';if(first==='config'||first==='configs'||CONTENT_TEXT_EXTENSIONS.has(extensionOf(lower)))return 'config';if(first==='worlds'||first==='world'||first.startsWith('world_'))return 'worlds';return 'other'}
function managedPathCategory(path:string){const normalized=normalizeRelative(path);const lower=normalized.toLowerCase();const first=lower.split('/')[0];if(first==='mods')return 'mods';if(first==='plugins')return lower.endsWith('.jar')&&lower.split('/').length===2?'plugins':'plugin-config';if(first==='resourcepacks'||first==='resource-packs')return 'resource-packs';if(first==='config'||first==='configs'||['server.properties','spigot.yml','bukkit.yml','paper.yml','purpur.yml','commands.yml','permissions.yml'].includes(lower))return 'config';return 'worlds'}
function isEditableContentPath(path:string){const normalized=normalizeRelative(path);const category=managedPathCategory(normalized);return (category==='config'||category==='plugin-config')&&CONTENT_TEXT_EXTENSIONS.has(extensionOf(normalized))}
async function managedWorldRoot(id:string,path:string){const normalized=normalizeRelative(path);const first=normalized.split('/')[0];if(!/^[A-Za-z0-9_-]{1,40}$/.test(first))return null;const root=safePath(id,first);const info=await stat(root).catch(()=>null);if(!info?.isDirectory())return null;if(!existsSync(join(root,'level.dat'))&&!existsSync(join(root,'.blockctrl-world-profile.json')))return null;return first}
async function isEditableManagedContentPath(id:string,path:string){if(isEditableContentPath(path))return true;const normalized=normalizeRelative(path);return !!(await managedWorldRoot(id,normalized))&&normalized.includes('/')&&CONTENT_TEXT_EXTENSIONS.has(extensionOf(normalized))}
async function verifiedExistingContentPath(id:string,requested:string){const root=await realpath(serverDir(id));const target=safePath(id,normalizeRelative(requested));const real=await realpath(target);if(real!==root&&!real.startsWith(`${root}${sep}`))throw new Error('Symlink/path traversal blocked');return target}
async function verifiedWritableContentPath(id:string,requested:string){const normalized=normalizeRelative(requested);const target=safePath(id,normalized);const root=await realpath(serverDir(id));let ancestor=dirname(target);while(!existsSync(ancestor)&&ancestor!==root)ancestor=dirname(ancestor);const realAncestor=await realpath(ancestor);if(realAncestor!==root&&!realAncestor.startsWith(`${root}${sep}`))throw new Error('Symlink/path traversal blocked');if(existsSync(target)){const real=await realpath(target);if(real!==root&&!real.startsWith(`${root}${sep}`))throw new Error('Symlink/path traversal blocked')}return target}
async function walkManagedFiles(id:string,base:string,category:string,maxDepth:number,out:Array<Record<string,unknown>>,depth=0){const absolute=safePath(id,base);let entries:any[]=[];try{entries=await readdir(absolute,{withFileTypes:true,encoding:'utf8'})}catch{return}for(const entry of entries){if(entry.isSymbolicLink?.())continue;const rel=join(base,entry.name).replaceAll('\\','/');const full=safePath(id,rel);if(entry.isDirectory()){if(depth<maxDepth)await walkManagedFiles(id,rel,category,maxDepth,out,depth+1);continue}if(!entry.isFile())continue;const ext=extensionOf(entry.name);if(category==='mods'&&ext!=='.jar')continue;if(category==='plugins'&&depth===0&&ext==='.jar'){const info=await stat(full);out.push({name:entry.name,path:rel,category:'plugins',directory:false,size:info.size,updatedAt:info.mtime.toISOString(),editable:false,source:'disk'});continue}if(category==='plugins'&&!CONTENT_TEXT_EXTENSIONS.has(ext))continue;if(category==='config'&&!CONTENT_TEXT_EXTENSIONS.has(ext))continue;if(category==='resource-packs'&&ext!=='.zip')continue;const info=await stat(full);out.push({name:entry.name,path:rel,category:category==='plugins'?'plugin-config':category,directory:false,size:info.size,updatedAt:info.mtime.toISOString(),editable:isEditableContentPath(rel),source:'disk'})}}
async function walkWorldFiles(id:string,base:string,out:Array<Record<string,unknown>>,depth=0,state={count:0}){if(depth>7||state.count>=600)return;const absolute=safePath(id,base);let entries:any[]=[];try{entries=await readdir(absolute,{withFileTypes:true,encoding:'utf8'})}catch{return}for(const entry of entries){if(state.count>=600||entry.isSymbolicLink?.()||String(entry.name).includes('.bak-'))continue;const rel=join(base,entry.name).replaceAll('\\','/');const full=safePath(id,rel);if(entry.isDirectory()){if(depth<7)await walkWorldFiles(id,rel,out,depth+1,state);continue}if(!entry.isFile())continue;const info=await stat(full);state.count++;out.push({name:entry.name,path:rel,category:'world-file',directory:false,size:info.size,updatedAt:info.mtime.toISOString(),editable:CONTENT_TEXT_EXTENSIONS.has(extensionOf(rel)),source:'disk'})}}
async function managedContentInventory(id:string,worldName?:string){const root=serverDir(id);const rootInfo=await stat(root).catch(()=>null);if(!rootInfo?.isDirectory())throw new Error('Sunucu klasörü bulunamadı');const items:Array<Record<string,unknown>>=[];await walkManagedFiles(id,'mods','mods',1,items);await walkManagedFiles(id,'plugins','plugins',4,items);await walkManagedFiles(id,'config','config',5,items);await walkManagedFiles(id,'resourcepacks','resource-packs',2,items);for(const name of ['server.properties','spigot.yml','bukkit.yml','paper.yml','purpur.yml','commands.yml','permissions.yml']){const full=safePath(id,name);const info=await stat(full).catch(()=>null);if(info?.isFile())items.push({name,path:name,category:'config',directory:false,size:info.size,updatedAt:info.mtime.toISOString(),editable:true,source:'disk'})}let rootEntries:any[]=[];try{rootEntries=await readdir(root,{withFileTypes:true,encoding:'utf8'})}catch{}for(const entry of rootEntries){if(!entry.isDirectory?.()||entry.isSymbolicLink?.())continue;const rel=String(entry.name);if(['mods','plugins','config','resourcepacks','uploads'].includes(rel.toLowerCase())||rel.includes('.bak-'))continue;const worldRoot=safePath(id,rel);if(existsSync(join(worldRoot,'level.dat'))||existsSync(join(worldRoot,'.blockctrl-world-profile.json'))){const info=await stat(worldRoot);items.push({name:rel,path:rel,category:'worlds',directory:true,size:0,updatedAt:info.mtime.toISOString(),editable:false,source:'disk'})}}if(worldName){if(!/^[A-Za-z0-9_-]{1,40}$/.test(worldName))throw new Error('Geçersiz dünya adı');const validated=await managedWorldRoot(id,worldName);if(!validated)throw new Error('Seçili dünya klasörü bulunamadı');for(const candidate of [worldName,`${worldName}_nether`,`${worldName}_the_end`]){const info=await stat(safePath(id,candidate)).catch(()=>null);if(info?.isDirectory())await walkWorldFiles(id,candidate,items)}}items.sort((a,b)=>String(a.category).localeCompare(String(b.category),'tr')||String(a.path).localeCompare(String(b.path),'tr'));return items}
async function readManagedContent(id:string,path:string){if(!(await isEditableManagedContentPath(id,path)))throw new Error('Yalnız plugin/config veya seçili dünyanın metin dosyaları görüntülenebilir');const target=await verifiedExistingContentPath(id,path);const info=await stat(target);if(!info.isFile()||info.size>2_000_000)throw new Error('Dosya düzenleme sınırı 2 MB');return {path:normalizeRelative(path),content:await readFile(target,'utf8'),size:info.size,updatedAt:info.mtime.toISOString()}}
async function writeManagedContent(id:string,path:string,content:string){if(isServerRunningKnown(id))throw new Error('Plugin/config veya dünya dosyası düzenlemek için sunucuyu durdurun');if(!(await isEditableManagedContentPath(id,path)))throw new Error('Yalnız plugin/config veya dünya içindeki güvenli metin dosyaları düzenlenebilir');if(Buffer.byteLength(content,'utf8')>2_000_000)throw new Error('Dosya düzenleme sınırı 2 MB');const target=await verifiedWritableContentPath(id,path);await mkdir(dirname(target),{recursive:true});if(existsSync(target))await rename(target,`${target}.bak-${Date.now()}`);await writeFile(target,content,'utf8');return {saved:true,path:normalizeRelative(path),backupCreated:true}}
async function deleteManagedContent(id:string,path:string){if(isServerRunningKnown(id))throw new Error('İçerik silmek için sunucuyu durdurun');const normalized=normalizeRelative(path);const lower=normalized.toLowerCase();if(['mods','plugins','config','resourcepacks'].includes(lower))throw new Error('Ana içerik klasörü silinemez');if(lower==='server.properties')throw new Error('server.properties dosyası silinemez; düzenleyebilirsiniz');let category:string|null=null;if(lower.startsWith('mods/'))category='mods';else if(lower.startsWith('plugins/'))category=lower.endsWith('.jar')&&lower.split('/').length===2?'plugins':'plugin-config';else if(lower.startsWith('config/'))category='config';else if(lower.startsWith('resourcepacks/'))category='resource-packs';else if(['spigot.yml','bukkit.yml','paper.yml','purpur.yml','commands.yml','permissions.yml'].includes(lower))category='config';else {const worldRoot=await managedWorldRoot(id,normalized);if(worldRoot){if(!normalized.includes('/'))category='worlds';else{const critical=new Set(['level.dat','session.lock','.blockctrl-world-profile.json']);if(critical.has(basename(normalized).toLowerCase()))throw new Error('Kritik Minecraft dünya dosyası doğrudan silinemez');category='world-file'}}}if(!category)throw new Error('Bu yol panelden silinemez');const target=await verifiedExistingContentPath(id,normalized);if(target===serverDir(id))throw new Error('Sunucu kökü silinemez');await rm(target,{recursive:true,force:true});return {deleted:true,path:normalized,category}}
function archiveDestination(entry:string,worldRoots:Set<string>){const normalized=normalizeRelative(entry);const parts=normalized.split('/');const lowerParts=parts.map(x=>x.toLowerCase());const first=lowerParts[0];if(first==='mods'&&parts.length>1)return {path:['mods',...parts.slice(1)].join('/'),category:'mods'};if(first==='plugins'&&parts.length>1)return {path:['plugins',...parts.slice(1)].join('/'),category:extensionOf(normalized)==='.jar'&&parts.length===2?'plugins':'plugin-config'};if((first==='config'||first==='configs')&&parts.length>1)return {path:['config',...parts.slice(1)].join('/'),category:'config'};if((first==='resourcepacks'||first==='resource-packs')&&parts.length>1)return {path:['resourcepacks',...parts.slice(1)].join('/'),category:'resource-packs'};if(first==='worlds'&&parts.length>2)return {path:parts.slice(1).join('/'),category:'worlds'};if(worldRoots.has(first))return {path:normalized,category:'worlds'};if(parts.length===1){const ext=extensionOf(normalized);if(ext==='.jar')return {path:`mods/${parts[0]}`,category:'mods'};if(ext==='.zip')return {path:`resourcepacks/${parts[0]}`,category:'resource-packs'};if(normalized.toLowerCase()==='server.properties')return {path:'server.properties',category:'config'};if(CONTENT_TEXT_EXTENSIONS.has(ext))return {path:`config/${parts[0]}`,category:'config'}}return null}
async function extractZipEntry(archive:string,entry:string,destination:string){await mkdir(resolve(destination,'..'),{recursive:true});const temp=`${destination}.upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;const child=spawn('unzip',['-p',archive,entry],{stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',d=>err+=d);const stream=pipeline(child.stdout,createWriteStream(temp));const exit=new Promise<void>((ok,fail)=>{child.on('error',fail);child.on('exit',code=>code===0?ok():fail(new Error(`ZIP entry okunamadı: ${entry}: ${err.slice(-300)}`)))});try{await Promise.all([stream,exit]);if(existsSync(destination))await rename(destination,`${destination}.bak-${Date.now()}`);await rename(temp,destination)}catch(error){await rm(temp,{force:true});throw error}}
async function installMixedArchive(id:string,archive:string){const safety=await validateZipSafety(archive);const listing=safety.listing;const allEntries=listing.split(/\r?\n/).filter(Boolean);if(!allEntries.length)throw new Error('ZIP boş');const normalized:string[]=[];for(const raw of allEntries){if(raw.endsWith('/'))continue;normalized.push(normalizeRelative(raw))}const worldRoots=new Set<string>();for(const entry of normalized){const parts=entry.split('/');if(parts.length>=2&&parts[parts.length-1].toLowerCase()==='level.dat')worldRoots.add(parts[0].toLowerCase())}const installed:Array<{source:string;path:string;category:string}>=[];const rejected:string[]=[];const counts:Record<string,number>={mods:0,plugins:0,'plugin-config':0,'resource-packs':0,config:0,worlds:0};for(const source of normalized){const mapped=archiveDestination(source,worldRoots);if(!mapped){rejected.push(source);continue}const destination=await verifiedWritableContentPath(id,mapped.path);await extractZipEntry(archive,source,destination);installed.push({source,path:mapped.path,category:mapped.category});counts[mapped.category]=(counts[mapped.category]??0)+1}if(!installed.length)throw new Error('ZIP içinde yönetilebilir mod, plugin, config, resource pack veya dünya içeriği bulunamadı');await rm(archive,{force:true});return {uploaded:installed.length,installed,rejected,counts,backupBeforeReplace:true}}
async function installWorldArchive(id:string,archive:string,worldName:string){const safety=await validateZipSafety(archive);const listing=safety.listing;const entries=listing.split(/\r?\n/).filter(Boolean).filter(x=>!x.endsWith('/')).map(normalizeRelative);if(!entries.length)throw new Error('Dünya ZIP dosyası boş');const top=new Set(entries.map(x=>x.split('/')[0]));let strip='';if(top.size===1){const candidate=[...top][0];if(entries.some(x=>x.toLowerCase()===`${candidate.toLowerCase()}/level.dat`))strip=`${candidate}/`}const targetRoot=await verifiedWritableContentPath(id,worldName);if(existsSync(targetRoot))await rename(targetRoot,`${targetRoot}.bak-${Date.now()}`);await mkdir(targetRoot,{recursive:true});try{for(const source of entries){const relativeEntry=strip&&source.startsWith(strip)?source.slice(strip.length):source;if(!relativeEntry)continue;const destination=safePath(id,join(worldName,relativeEntry));await extractZipEntry(archive,source,destination)}await rm(archive,{force:true});return{world:worldName,uploaded:entries.length,direct:true}}catch(error){await rm(targetRoot,{recursive:true,force:true});throw error}}
async function uploadFile(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Server must be stopped');const filename=basename(String(p.filename??'uploaded-file')).replace(/[^A-Za-z0-9._-]/g,'_');const requested=String(p.category??'auto');const detected=requested==='plugins'?'plugins':requested==='mods'?'mods':requested==='configs'?'config':requested==='resource-packs'?'resource-packs':fileCategory(filename);const target=detected==='plugins'?'plugins':detected==='mods'?'mods':detected==='resource-packs'?'resourcepacks':detected==='config'?'config':'uploads';const destination=safePath(id,join(target,filename));await mkdir(resolve(destination,'..'),{recursive:true});if(existsSync(destination))await rename(destination,`${destination}.bak-${Date.now()}`);await fetchPanelFile(String(p.pathname??''),destination,id);return {filename,category:detected,path:relative(serverDir(id),destination),backupCreated:true}}
async function uploadArchive(id:string,p:Record<string,unknown>){if(isServerRunningKnown(id))throw new Error('Server must be stopped');const temp=join(DATA_DIR,`${id}-upload-${Date.now()}.zip`);await fetchPanelFile(String(p.pathname??''),temp,id);return installMixedArchive(id,temp)}
async function installAddon(id:string,p:Record<string,unknown>){const url=String(p.url??'');const pathname=String(p.pathname??'');const filename=basename(String(p.filename??'addon.jar')).replace(/[^A-Za-z0-9._-]/g,'_');if((!/^https:\/\//.test(url)&&!pathname)||!filename.endsWith('.jar'))throw new Error('Only HTTPS jar URLs or panel uploads are allowed');const dir=join(serverDir(id),String(p.kind??'mods')==='plugins'?'plugins':'mods');await mkdir(dir,{recursive:true});const target=join(dir,filename),part=`${target}.part-${Date.now()}`;const expectedSha1=String(p.sha1??'').trim().toLowerCase();const expectedSize=Number(p.size??0);try{if(pathname){const response=await fetch(`${PANEL_URL}/api/agent/file?pathname=${encodeURIComponent(pathname)}&serverId=${id}`,{headers:{authorization:`Bearer ${NODE_TOKEN}`,'x-node-id':NODE_ID!}});if(!response.ok||!response.body)throw new Error('Panel upload could not be downloaded');await pipeline(response.body as never,createWriteStream(part))}else await download(url,part,expectedSha1||undefined);const size=(await stat(part)).size;if(size<=0||size>512*1024*1024)throw new Error('Addon dosyası geçersiz veya 512 MB sınırını aşıyor');if(expectedSize>0&&size!==expectedSize)throw new Error(`Addon boyut doğrulaması başarısız: ${size} != ${expectedSize}`);if(expectedSha1&&pathname){const actual=createHash('sha1').update(await readFile(part)).digest('hex');if(actual!==expectedSha1)throw new Error('Checksum verification failed')}if(existsSync(target))await rename(target,`${target}.bak-${Date.now()}`);await rename(part,target);return {filename,kind:String(p.kind??'mods'),sizeBytes:size,sha1Verified:Boolean(expectedSha1),source:String(p.source??'manual'),projectId:p.projectId??null,versionId:p.versionId??null}}catch(error){await rm(part,{force:true}).catch(()=>{});throw error}}
































































function databaseCredentialPath(serverId:string,databaseId:string){if(!/^[0-9a-f-]{36}$/i.test(serverId)||!/^[0-9a-f-]{36}$/i.test(databaseId))throw new Error('Invalid database id');return join(DATA_DIR,'.secrets','databases',serverId,`${databaseId}.env`)}
function databaseIdentifier(value:unknown,max:number){const text=String(value??'').trim();if(!new RegExp(`^[A-Za-z0-9_]{2,${max}}$`).test(text))throw new Error('Geçersiz veritabanı veya kullanıcı adı');return text}
function sqlString(value:string){return value.replace(/\\/g,'\\\\').replace(/'/g,"''")}
async function mysqlExec(sql:string){
  const configured=String(process.env.DB_CLIENT??'').trim()
  const clients=[configured,'mariadb','mysql'].filter((v,i,a)=>v&&a.indexOf(v)===i)
  const adminUser=String(process.env.DB_ADMIN_USER??'root')
  const adminHost=String(process.env.DB_ADMIN_HOST??'').trim()
  const adminPort=Number(process.env.DB_ADMIN_PORT??3306)
  const password=process.env.DB_ADMIN_PASSWORD
  let last:unknown
  for(const client of clients){
    const args:string[]=[]
    if(adminHost){args.push('-h',adminHost,'-P',String(adminPort))}
    args.push('-u',adminUser,'-NBe',sql)
    const env={...process.env}
    if(password)env.MYSQL_PWD=password
    try{return await runCapture(client,args,DATA_DIR,env)}
    catch(error){
      last=error
      const code=(error as NodeJS.ErrnoException)?.code
      if(code==='ENOENT')continue
      throw error
    }
  }
  throw new Error(`MariaDB/MySQL istemcisi bulunamadı. Oracle node üzerine MariaDB Server kurulmalı veya DB_CLIENT tanımlanmalı. ${last instanceof Error?last.message:''}`.trim())
}
async function writeDatabaseCredentials(serverId:string,databaseId:string,databaseName:string,databaseUser:string,password:string){
  const target=databaseCredentialPath(serverId,databaseId)
  await mkdir(resolve(target,'..'),{recursive:true})
  const body=[
    '# BlockCtrl managed database credentials',
    'DB_HOST=127.0.0.1',
    `DB_PORT=${Number(process.env.DB_PORT??3306)}`,
    `DB_NAME=${databaseName}`,
    `DB_USER=${databaseUser}`,
    `DB_PASSWORD=${password}`,
    ''
  ].join('\n')
  await writeFile(target,body,{encoding:'utf8',mode:0o600})
  await chmod(target,0o600)
  return relative(DATA_DIR,target)
}
async function createManagedDatabase(serverId:string,p:Record<string,unknown>){
  const databaseId=String(p.databaseId??'')
  const databaseName=databaseIdentifier(p.databaseName,48)
  const databaseUser=databaseIdentifier(p.databaseUser,28)
  const password=randomBytes(24).toString('base64url')
  const db=`\`${databaseName}\``, user=sqlString(databaseUser), pwd=sqlString(password)
  await mysqlExec(`CREATE DATABASE IF NOT EXISTS ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS '${user}'@'localhost' IDENTIFIED BY '${pwd}'; ALTER USER '${user}'@'localhost' IDENTIFIED BY '${pwd}'; CREATE USER IF NOT EXISTS '${user}'@'127.0.0.1' IDENTIFIED BY '${pwd}'; ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${pwd}'; GRANT ALL PRIVILEGES ON ${db}.* TO '${user}'@'localhost'; GRANT ALL PRIVILEGES ON ${db}.* TO '${user}'@'127.0.0.1'; FLUSH PRIVILEGES;`)
  const credentialsPath=await writeDatabaseCredentials(serverId,databaseId,databaseName,databaseUser,password)
  return {databaseId,databaseName,databaseUser,engine:'mariadb',host:'127.0.0.1',port:Number(process.env.DB_PORT??3306),credentialsPath}
}
async function rotateManagedDatabasePassword(serverId:string,p:Record<string,unknown>){
  const databaseId=String(p.databaseId??'')
  const databaseName=databaseIdentifier(p.databaseName,48)
  const databaseUser=databaseIdentifier(p.databaseUser,28)
  const password=randomBytes(24).toString('base64url')
  const user=sqlString(databaseUser),pwd=sqlString(password)
  await mysqlExec(`ALTER USER '${user}'@'localhost' IDENTIFIED BY '${pwd}'; ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${pwd}'; FLUSH PRIVILEGES;`)
  const credentialsPath=await writeDatabaseCredentials(serverId,databaseId,databaseName,databaseUser,password)
  return {databaseId,databaseName,databaseUser,rotated:true,credentialsPath}
}
async function deleteManagedDatabase(serverId:string,p:Record<string,unknown>){
  const databaseId=String(p.databaseId??'')
  const databaseName=databaseIdentifier(p.databaseName,48)
  const databaseUser=databaseIdentifier(p.databaseUser,28)
  const db=`\`${databaseName}\``,user=sqlString(databaseUser)
  await mysqlExec(`DROP DATABASE IF EXISTS ${db}; DROP USER IF EXISTS '${user}'@'localhost'; DROP USER IF EXISTS '${user}'@'127.0.0.1'; FLUSH PRIVILEGES;`)
  await rm(databaseCredentialPath(serverId,databaseId),{force:true})
  return {databaseId,databaseName,databaseUser,deleted:true}
}
































function parseEnvText(raw:string){const out:Record<string,string>={};for(const line of raw.split(/\r?\n/)){const trimmed=line.trim();if(!trimmed||trimmed.startsWith('#'))continue;const i=trimmed.indexOf('=');if(i<1)continue;out[trimmed.slice(0,i)]=trimmed.slice(i+1)}return out}
async function managedDatabaseCredentials(serverId:string,databaseId:string){const raw=await readFile(databaseCredentialPath(serverId,databaseId),'utf8').catch(()=> '');if(!raw)throw new Error('Yönetilen veritabanı kimlik bilgileri bulunamadı');const env=parseEnvText(raw);return{host:env.DB_HOST||'127.0.0.1',port:Number(env.DB_PORT||3306),database:databaseIdentifier(env.DB_NAME,48),user:databaseIdentifier(env.DB_USER,28),password:String(env.DB_PASSWORD||'')}}
function databaseBackupRoot(serverId:string,databaseId:string){return join(DATA_DIR,'database-backups',serverId,databaseId)}
async function databaseClient(kind:'client'|'dump'){const configured=String(kind==='dump'?process.env.DB_DUMP_CLIENT??'':process.env.DB_CLIENT??'').trim();const names=(kind==='dump'?[configured,'mariadb-dump','mysqldump']:[configured,'mariadb','mysql']).filter((v,i,a)=>v&&a.indexOf(v)===i);for(const name of names){try{await runCapture(name,['--version'],DATA_DIR);return name}catch(error){if((error as NodeJS.ErrnoException)?.code==='ENOENT')continue}}throw new Error(kind==='dump'?'mariadb-dump/mysqldump bulunamadı':'mariadb/mysql istemcisi bulunamadı')}
async function dumpManagedDatabase(serverId:string,p:Record<string,unknown>){const databaseId=String(p.databaseId??'');const c=await managedDatabaseCredentials(serverId,databaseId);const dir=databaseBackupRoot(serverId,databaseId);await mkdir(dir,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');const filename=`${c.database}-${stamp}.sql`;const target=join(dir,filename);const client=await databaseClient('dump');const args=['-h',c.host,'-P',String(c.port),'-u',c.user,'--single-transaction','--routines','--events','--triggers','--default-character-set=utf8mb4',c.database];const env={...process.env,MYSQL_PWD:c.password};await new Promise<void>((ok,fail)=>{const child=spawn(client,args,{cwd:DATA_DIR,stdio:['ignore','pipe','pipe'],env});let err='';child.stderr?.on('data',d=>err+=d.toString());const output=createWriteStream(target,{mode:0o600});child.stdout?.pipe(output);child.on('error',fail);child.on('exit',code=>{output.end();if(code===0)ok();else fail(new Error(`${client} exited ${code}: ${err.slice(-2000)}`))})});await chmod(target,0o600);const statRow=await stat(target);if(!statRow.size){await rm(target,{force:true});throw new Error('Veritabanı dump dosyası boş oluştu')}const entries=(await readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&e.name.endsWith('.sql')).map(e=>e.name).sort().reverse();for(const old of entries.slice(20))await rm(join(dir,old),{force:true});const download=await createDownloadToken(target,filename,false);return{databaseId,databaseName:c.database,filename,sizeBytes:statRow.size,createdAt:new Date().toISOString(),...download}}
async function restoreManagedDatabase(serverId:string,p:Record<string,unknown>){const databaseId=String(p.databaseId??'');const c=await managedDatabaseCredentials(serverId,databaseId);const rawName=basename(String(p.filename??''));if(!rawName||!rawName.endsWith('.sql'))throw new Error('Geçerli bir .sql yedek adı gerekli');const root=databaseBackupRoot(serverId,databaseId);const target=resolve(root,rawName);if(target!==join(root,rawName))throw new Error('Geçersiz yedek yolu');const info=await stat(target).catch(()=>null);if(!info?.isFile())throw new Error('Veritabanı yedeği bulunamadı');const client=await databaseClient('client');const args=['-h',c.host,'-P',String(c.port),'-u',c.user,c.database];const env={...process.env,MYSQL_PWD:c.password};await new Promise<void>((ok,fail)=>{const child=spawn(client,args,{cwd:DATA_DIR,stdio:['pipe','pipe','pipe'],env});let err='';child.stderr?.on('data',d=>err+=d.toString());createReadStream(target).pipe(child.stdin!);child.on('error',fail);child.on('exit',code=>{if(code===0)ok();else fail(new Error(`${client} restore exited ${code}: ${err.slice(-2000)}`))}) });return{databaseId,databaseName:c.database,restored:true,filename:rawName,sizeBytes:info.size}}
async function importManagedDatabase(serverId:string,p:Record<string,unknown>){const databaseId=String(p.databaseId??'');const c=await managedDatabaseCredentials(serverId,databaseId);const requested=String(p.path??'');if(!requested)throw new Error('İçe aktarılacak SQL dosya yolu gerekli');const target=safePath(serverId,requested);if(!target.toLowerCase().endsWith('.sql'))throw new Error('Yalnız .sql dosyaları içe aktarılabilir');const info=await stat(target).catch(()=>null);if(!info?.isFile()||info.size>2*1024*1024*1024)throw new Error('SQL dosyası bulunamadı veya çok büyük');const client=await databaseClient('client');const env={...process.env,MYSQL_PWD:c.password};await new Promise<void>((ok,fail)=>{const child=spawn(client,['-h',c.host,'-P',String(c.port),'-u',c.user,c.database],{cwd:DATA_DIR,stdio:['pipe','pipe','pipe'],env});let err='';child.stderr?.on('data',d=>err+=d.toString());createReadStream(target).pipe(child.stdin!);child.on('error',fail);child.on('exit',code=>{if(code===0)ok();else fail(new Error(`${client} import exited ${code}: ${err.slice(-2000)}`))}) });return{databaseId,databaseName:c.database,imported:true,path:relative(serverDir(serverId),target),sizeBytes:info.size}}
async function databaseMaintenance(serverId:string,p:Record<string,unknown>,operation:'optimize'|'repair'){const databaseId=String(p.databaseId??'');const c=await managedDatabaseCredentials(serverId,databaseId);const tableRows=await mysqlExec(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='${sqlString(c.database)}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`);const tables=tableRows.split(/\r?\n/).map(x=>x.trim()).filter(x=>/^[A-Za-z0-9_$-]+$/.test(x)).slice(0,1000);if(!tables.length)return{databaseId,databaseName:c.database,operation,tables:0,detail:'Bakım yapılacak tablo yok'};const statements=tables.map(t=>`${operation==='optimize'?'OPTIMIZE':'REPAIR'} TABLE \`${c.database}\`.\`${t.replace(/`/g,'')}\`;`).join(' ');const output=await mysqlExec(statements);return{databaseId,databaseName:c.database,operation,tables:tables.length,output:output.slice(-12000)}}
async function managedDatabaseStatus(serverId:string,p:Record<string,unknown>){const databaseId=String(p.databaseId??'');const c=await managedDatabaseCredentials(serverId,databaseId);const version=(await mysqlExec('SELECT VERSION();')).trim();const vars=await mysqlExec("SHOW VARIABLES WHERE Variable_name IN ('have_ssl','require_secure_transport','slow_query_log','long_query_time','log_output');");const status=await mysqlExec("SHOW GLOBAL STATUS WHERE Variable_name IN ('Ssl_cipher','Slow_queries','Threads_connected','Uptime');");const parse=(raw:string)=>Object.fromEntries(raw.split(/\r?\n/).filter(Boolean).map(line=>{const [k,...rest]=line.split(/\t/);return[k,rest.join('\t')]}));const v=parse(vars),st=parse(status);const root=databaseBackupRoot(serverId,databaseId);const files=await readdir(root,{withFileTypes:true}).catch(()=>[]);const backups=[] as Array<{filename:string;sizeBytes:number;modifiedAt:string}>;for(const entry of files.filter(e=>e.isFile()&&e.name.endsWith('.sql')).slice(0,30)){const info=await stat(join(root,entry.name));backups.push({filename:entry.name,sizeBytes:info.size,modifiedAt:info.mtime.toISOString()})}backups.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));return{databaseId,databaseName:c.database,engine:'mariadb',version,tls:{available:String(v.have_ssl||'').toUpperCase()==='YES',required:String(v.require_secure_transport||'').toUpperCase()==='ON',cipher:st.Ssl_cipher||null},slowQuery:{enabled:String(v.slow_query_log||'').toUpperCase()==='ON',longQueryTime:Number(v.long_query_time||0),slowQueries:Number(st.Slow_queries||0),logOutput:v.log_output||null},connections:Number(st.Threads_connected||0),uptimeSeconds:Number(st.Uptime||0),backups:backups.slice(0,20),checkedAt:new Date().toISOString()}}
































































function safeJsonArray(value:unknown){return Array.isArray(value)?value:[]}
type PublicWebsiteSnapshotSource='bans'|'leaderboard-kills'|'leaderboard-money'|'leaderboard-health'|'leaderboard-playtime'|'support'|'store'|'wiki'
type PublicWebsiteSnapshotItem={title:string;description:string;value:string;image?:string|null;href?:string|null}
type PublicWebsiteSnapshot={serverId:string;source:PublicWebsiteSnapshotSource;data:{items:PublicWebsiteSnapshotItem[]}}
function publicHttpsUrl(value:unknown){const raw=String(value??'').trim().slice(0,2000);if(!raw)return null;try{const url=new URL(raw);return url.protocol==='https:'?url.toString():null}catch{return null}}
function normalizePublicAdapterItems(value:unknown){
  const root=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
  const rows=Array.isArray(root.items)?root.items:Array.isArray(value)?value:[]
  const items:PublicWebsiteSnapshotItem[]=[]
  for(const raw of rows.slice(0,25)){
    if(!raw||typeof raw!=='object')continue
    const row=raw as Record<string,unknown>
    const title=String(row.title??'').trim().slice(0,80)
    if(!title)continue
    items.push({title,description:String(row.description??'').trim().slice(0,500),value:String(row.value??'').trim().slice(0,120),image:publicHttpsUrl(row.image),href:publicHttpsUrl(row.href)})
  }
  return items
}
async function readPublicAdapter(root:string,source:Exclude<PublicWebsiteSnapshotSource,'bans'|'leaderboard-kills'|'leaderboard-playtime'>){
  const candidates=[join(root,'blockctrl','website',`${source}.json`),join(root,'plugins','BlockCtrlWebsite',`${source}.json`)]
  for(const path of candidates){
    const raw=await readFile(path,'utf8').catch(()=>'')
    if(!raw)continue
    try{return normalizePublicAdapterItems(JSON.parse(raw))}catch(error){agentEvent('warn',null,`Website veri adaptörü okunamadı: ${source}`,error)}
  }
  return null
}
async function collectPublicSnapshotForServer(id:string){
  const root=serverDir(id)
  const snapshots:PublicWebsiteSnapshot[]=[]
  const bansRaw=await readFile(join(root,'banned-players.json'),'utf8').catch(()=> '')
  if(bansRaw){
    try{
      const rows=safeJsonArray(JSON.parse(bansRaw)).slice(0,25) as Array<Record<string,unknown>>
      const items=rows.map(row=>({title:String(row.name??row.uuid??'Oyuncu').slice(0,80),description:[row.reason?String(row.reason):'',row.source?`Kaynak: ${String(row.source)}`:''].filter(Boolean).join(' · ').slice(0,500),value:row.expires&&String(row.expires)!=='forever'?`Bitiş: ${String(row.expires).slice(0,80)}`:'Kalıcı',image:null,href:null}))
      snapshots.push({serverId:id,source:'bans',data:{items}})
    }catch{}
  }else snapshots.push({serverId:id,source:'bans',data:{items:[]}})
































  const users=new Map<string,string>()
  try{for(const row of safeJsonArray(JSON.parse(await readFile(join(root,'usercache.json'),'utf8')))){if(row&&typeof row==='object'){const rec=row as Record<string,unknown>;const uuid=String(rec.uuid??'').replaceAll('-','').toLowerCase();const name=String(rec.name??'');if(uuid&&name)users.set(uuid,name)}}}catch{}
  const props=parsePropertiesText(await readFile(join(root,'server.properties'),'utf8').catch(()=>''))
  const level=String(props['level-name']||'world').replace(/[^A-Za-z0-9_-]/g,'_')
  const statsDir=join(root,level,'stats')
  const scores:Array<{name:string;kills:number;playTicks:number}>=[]
  for(const entry of await readdir(statsDir,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[])){
    if(!entry.isFile?.()||!entry.name.endsWith('.json'))continue
    try{
      const raw=JSON.parse(await readFile(join(statsDir,entry.name),'utf8')) as Record<string,unknown>
      const stats=raw.stats&&typeof raw.stats==='object'?raw.stats as Record<string,unknown>:{}
      const custom=stats['minecraft:custom']&&typeof stats['minecraft:custom']==='object'?stats['minecraft:custom'] as Record<string,unknown>:{}
      const killsRaw=Number(custom['minecraft:player_kills']??0)
      const playTicksRaw=Number(custom['minecraft:play_time']??0)
      const kills=Number.isFinite(killsRaw)&&killsRaw>=0?Math.trunc(killsRaw):0
      const playTicks=Number.isFinite(playTicksRaw)&&playTicksRaw>=0?Math.trunc(playTicksRaw):0
      const uuid=entry.name.replace(/\.json$/,'').replaceAll('-','').toLowerCase()
      scores.push({name:users.get(uuid)||entry.name.replace(/\.json$/,''),kills,playTicks})
    }catch{}
  }
  scores.sort((a,b)=>b.kills-a.kills||a.name.localeCompare(b.name,'tr'))
  snapshots.push({serverId:id,source:'leaderboard-kills',data:{items:scores.filter(row=>row.kills>0).slice(0,25).map((row,index)=>({title:row.name.slice(0,80),description:`#${index+1} · Oyuncu öldürme sıralaması`,value:String(row.kills),image:null,href:null}))}})
  const playtime=[...scores].filter(row=>row.playTicks>0).sort((a,b)=>b.playTicks-a.playTicks||a.name.localeCompare(b.name,'tr'))
  snapshots.push({serverId:id,source:'leaderboard-playtime',data:{items:playtime.slice(0,25).map((row,index)=>{const seconds=Math.floor(row.playTicks/20);const hours=Math.floor(seconds/3600);const minutes=Math.floor((seconds%3600)/60);return {title:row.name.slice(0,80),description:`#${index+1} · Toplam oynama süresi`,value:hours>0?`${hours} sa ${minutes} dk`:`${minutes} dk`,image:null,href:null}})}})
































  for(const source of ['leaderboard-money','leaderboard-health','support','store','wiki'] as const){
    const items=await readPublicAdapter(root,source)
    if(items)snapshots.push({serverId:id,source,data:{items}})
  }
  return snapshots
}
async function collectServerPublicSnapshots(){
  const root=resolve(DATA_DIR,'servers');const snapshots:PublicWebsiteSnapshot[]=[]
  for(const entry of await readdir(root,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[])){
    if(!entry.isDirectory?.()||!validServerId(entry.name))continue
    try{snapshots.push(...await collectPublicSnapshotForServer(entry.name))}catch(error){agentEvent('warn',entry.name,'Website public snapshot üretilemedi',error)}
  }
  return snapshots.slice(0,250)
}
































































function fileKind(path:string){const lower=path.toLowerCase();if(lower.startsWith('mods/'))return'Mods';if(lower.startsWith('plugins/'))return'Plugins';if(lower.startsWith('config/')||/\.(yml|yaml|json|properties|toml|ini|cfg|conf|txt)$/i.test(lower))return'Config';if(lower.startsWith('world'))return'Worlds';if(lower.startsWith('logs/')||lower.includes('crash-reports'))return'Logs';if(lower.includes('backup'))return'Backups';return'Server files'}
async function fileInventory(id:string){
  const root=serverDir(id);const out:Array<{path:string;name:string;type:string;sizeBytes:number;modifiedAt:string;permissions:string}>=[];let scanned=0
  async function walk(dir:string,depth:number){if(depth>16||out.length>=5000)return;for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[] as any[])){if(out.length>=5000)break;const abs=join(dir,entry.name);const rel=relative(root,abs).replaceAll('\\','/');if(!rel||rel.startsWith('.blockctrl-')||rel.startsWith('.direct-uploads/')||rel.startsWith('.blockctrl-quarantine/'))continue;scanned++;if(scanned>12000)break;const info=await stat(abs).catch(()=>null);if(!info)continue;if(entry.isSymbolicLink?.())continue;if(entry.isDirectory()){out.push({path:rel,name:entry.name,type:'Folder',sizeBytes:0,modifiedAt:info.mtime.toISOString(),permissions:(info.mode&0o777).toString(8).padStart(3,'0')});await walk(abs,depth+1);continue}if(!entry.isFile())continue;out.push({path:rel,name:entry.name,type:fileKind(rel),sizeBytes:info.size,modifiedAt:info.mtime.toISOString(),permissions:(info.mode&0o777).toString(8).padStart(3,'0')})}}
  await walk(root,0);return{items:out,scannedAt:new Date().toISOString(),truncated:out.length>=5000}
}
async function bulkDownload(id:string,p:Record<string,unknown>){
  const raw=Array.isArray(p.paths)?p.paths.map(String):[];const paths=[...new Set(raw.map(x=>x.replaceAll('\\','/')).filter(Boolean))]
  if(!paths.length)throw new Error('İndirilecek dosya seçilmedi');if(paths.length>100)throw new Error('Tek işlemde en fazla 100 dosya indirilebilir')
  const files:Array<{rel:string;abs:string;size:number}>=[];let total=0
  for(const rel of paths){if(rel.includes('..')||rel.startsWith('/')||rel.includes('\0'))throw new Error('Geçersiz indirme yolu');const abs=safePath(id,rel);const info=await stat(abs).catch(()=>null);if(!info?.isFile())throw new Error(`Dosya bulunamadı: ${rel}`);total+=info.size;if(total>4*1024*1024*1024)throw new Error('Toplu indirme boyutu 4 GB sınırını aşıyor');files.push({rel,abs,size:info.size})}
  const mode=String(p.mode??'archive')
  if(mode==='separate'){
    const rows=[] as Array<Record<string,unknown>>
    for(const file of files){const token=await createDownloadToken(file.abs,basename(file.rel),false);rows.push({filename:basename(file.rel),path:file.rel,sizeBytes:file.size,...token})}
    return{mode:'separate',files:rows,sizeBytes:total,progress:100}
  }
  await mkdir(downloadRoot(),{recursive:true});const filename=`blockctrl-${id.slice(0,8)}-${Date.now()}.tar.gz`;const target=join(downloadRoot(),filename)
  await run('tar',['-czf',target,'-C',serverDir(id),'--',...files.map(file=>file.rel)],serverDir(id));const info=await stat(target);const token=await createDownloadToken(target,filename,true)
  return{mode:'archive',filename,sizeBytes:info.size,sourceBytes:total,progress:100,...token}
}
function fileRel(value:unknown,label='Dosya yolu'){const rel=String(value??'').trim().replaceAll('\\\\','/').replace(/^\.\//,'');if(!rel||rel==='.'||rel.includes('\0')||rel.startsWith('/')||/^[A-Za-z]:/.test(rel)||rel.split('/').some(part=>part==='..'))throw new Error(`${label} geçersiz`);return rel}
async function existingServerPath(id:string,value:unknown){const rel=fileRel(value);const rootReal=await realpath(serverDir(id));const abs=safePath(id,rel);const real=await realpath(abs).catch(()=>null);if(!real)throw new Error(`Dosya veya klasör bulunamadı: ${rel}`);if(real!==rootReal&&!real.startsWith(`${rootReal}${sep}`))throw new Error('Path traversal blocked');return{rel,abs,real,info:await stat(real)}}
async function writableTargetPath(id:string,value:unknown){const rel=fileRel(value,'Hedef yol');const abs=safePath(id,rel);const rootReal=await realpath(serverDir(id));const parentReal=await realpath(dirname(abs)).catch(()=>null);if(!parentReal||parentReal!==rootReal&&!parentReal.startsWith(`${rootReal}${sep}`))throw new Error('Hedef klasör sunucu dizini içinde olmalıdır');return{rel,abs}}
async function requireStoppedForFiles(id:string){if(await validatedManagedPid(id))throw new Error('Dosya sistemi değişiklikleri için Minecraft sunucusunu durdurun')}
async function requireMissingTarget(path:string){if(await stat(path).catch(()=>null))throw new Error('Hedef zaten mevcut; üzerine yazma engellendi')}
async function createServerFile(id:string,p:Record<string,unknown>){const target=await writableTargetPath(id,p.path);await requireMissingTarget(target.abs);const content=String(p.content??'');if(Buffer.byteLength(content,'utf8')>2*1024*1024)throw new Error('Yeni dosya içeriği 2 MB sınırını aşıyor');await writeFile(target.abs,content,'utf8');return{created:true,path:target.rel,liveSafe:Boolean(await validatedManagedPid(id))}}
async function createServerFolder(id:string,p:Record<string,unknown>){const target=await writableTargetPath(id,p.path);await requireMissingTarget(target.abs);await mkdir(target.abs);return{created:true,path:target.rel,directory:true,liveSafe:Boolean(await validatedManagedPid(id))}}
async function moveServerPath(id:string,p:Record<string,unknown>){await requireStoppedForFiles(id);const source=await existingServerPath(id,p.path);const target=await writableTargetPath(id,p.newPath??p.destination);await requireMissingTarget(target.abs);if(source.info.isDirectory()&&target.abs.startsWith(`${source.abs}${sep}`))throw new Error('Klasör kendi altına taşınamaz');await rename(source.abs,target.abs);return{moved:true,from:source.rel,to:target.rel}}
async function copyServerPath(id:string,p:Record<string,unknown>){await requireStoppedForFiles(id);const source=await existingServerPath(id,p.path);const target=await writableTargetPath(id,p.newPath??p.destination);await requireMissingTarget(target.abs);if(source.info.isDirectory()&&target.abs.startsWith(`${source.abs}${sep}`))throw new Error('Klasör kendi altına kopyalanamaz');await cp(source.abs,target.abs,{recursive:source.info.isDirectory(),errorOnExist:true,force:false});return{copied:true,from:source.rel,to:target.rel}}
async function deleteServerPath(id:string,p:Record<string,unknown>){await requireStoppedForFiles(id);const source=await existingServerPath(id,p.path);if(source.real===await realpath(serverDir(id)))throw new Error('Sunucu kök klasörü silinemez');await rm(source.abs,{recursive:true,force:false});return{deleted:true,path:source.rel}}
async function readServerFileAction(id:string,p:Record<string,unknown>){const source=await existingServerPath(id,p.path);if(!source.info.isFile())throw new Error('Yalnız dosyalar okunabilir');if(source.info.size>512*1024)throw new Error('Bu dosya panel okuması için 512 KB sınırını aşıyor');if(!/\.(yml|yaml|json|properties|toml|ini|cfg|conf|txt|md|log)$/i.test(source.rel))throw new Error('Bu dosya türü metin olarak açılamaz');return{path:source.rel,content:await readFile(source.abs,'utf8'),sizeBytes:source.info.size}}
async function writeServerFileAction(id:string,p:Record<string,unknown>){await requireStoppedForFiles(id);const source=await existingServerPath(id,p.path);if(!source.info.isFile())throw new Error('Yalnız dosyalar düzenlenebilir');if(!/\.(yml|yaml|json|properties|toml|ini|cfg|conf|txt|md)$/i.test(source.rel))throw new Error('Bu dosya türü metin olarak düzenlenemez');const content=String(p.content??'');if(Buffer.byteLength(content,'utf8')>2*1024*1024)throw new Error('Dosya içeriği 2 MB sınırını aşıyor');const backup=`${source.abs}.bak-${Date.now()}`;await cp(source.abs,backup,{errorOnExist:true,force:false});await writeFile(source.abs,content,'utf8');return{saved:true,path:source.rel,backupCreated:relative(serverDir(id),backup).replaceAll('\\\\','/')}}
async function changeServerPermissions(id:string,p:Record<string,unknown>){await requireStoppedForFiles(id);const source=await existingServerPath(id,p.path);const raw=String(p.mode??p.permissions??'').trim().replace(/^0o?/,'');if(!/^[0-7]{3,4}$/.test(raw))throw new Error('İzin değeri 644 veya 0755 biçiminde olmalıdır');const mode=parseInt(raw,8);await chmod(source.abs,mode);return{updated:true,path:source.rel,permissions:(mode&0o777).toString(8).padStart(3,'0')}}
async function bulkDeleteServerPaths(id:string,p:Record<string,unknown>){await requireStoppedForFiles(id);const paths=Array.isArray(p.paths)?[...new Set(p.paths.map(String))]:[];if(!paths.length||paths.length>100)throw new Error('Toplu silme için 1-100 öğe seçin');const rows=[];for(const path of paths)rows.push(await deleteServerPath(id,{path}));return{deleted:rows.length,items:rows}}
async function bulkMoveServerPaths(id:string,p:Record<string,unknown>){await requireStoppedForFiles(id);const paths=Array.isArray(p.paths)?[...new Set(p.paths.map(String))]:[];if(!paths.length||paths.length>100)throw new Error('Toplu taşıma için 1-100 öğe seçin');const destination=fileRel(p.destination,'Hedef klasör');const targetDir=await existingServerPath(id,destination);if(!targetDir.info.isDirectory())throw new Error('Hedef bir klasör olmalıdır');const rows=[];for(const path of paths){const rel=fileRel(path);const to=`${destination}/${basename(rel)}`;rows.push(await moveServerPath(id,{path:rel,newPath:to}))}return{moved:rows.length,items:rows}}
async function singleFileDownload(id:string,p:Record<string,unknown>){const source=await existingServerPath(id,p.path);if(!source.info.isFile())throw new Error('Yalnız dosyalar doğrudan indirilebilir');const token=await createDownloadToken(source.abs,basename(source.rel),false);return{path:source.rel,filename:basename(source.rel),sizeBytes:source.info.size,...token}}
async function folderDownload(id:string,p:Record<string,unknown>){const source=await existingServerPath(id,p.path);if(!source.info.isDirectory())throw new Error('Klasör bulunamadı');await mkdir(downloadRoot(),{recursive:true});const filename=`blockctrl-${basename(source.rel)}-${Date.now()}.tar.gz`;const target=join(downloadRoot(),filename);await run('tar',['-czf',target,'-C',serverDir(id),'--',source.rel],serverDir(id));const info=await stat(target);const token=await createDownloadToken(target,filename,true);return{path:source.rel,filename,sizeBytes:info.size,...token}}
































async function execute(command:{id:string;type:string;serverId?:string;payload?:Record<string,unknown>}){const scopedId=command.serverId??null;if(scopedId)agentEvent('info',scopedId,`Agent görevi alındı: ${command.type}`);try{if(!command.serverId)throw new Error('serverId required');const id=command.serverId,p=command.payload??{};const livePid=await validatedManagedPid(id);if(!livePid)managedPids.delete(id);let result:unknown={};if(command.type==='settings-status'){result=await settingsStatus(id,p.includeOptimizationMods===true)}else if(command.type==='reconnect-node'||command.type==='refresh-node'){await heartbeat();result={refreshed:true,at:new Date().toISOString()}}else if(command.type==='provision-sftp'){await ensureSftpServerRoot(id);const password=randomBytes(24).toString('base64url');const info=await sftpHelper('create',id,undefined,`${password}\n`);await report({type:'sftp-status',serverId:id,status:'ready'});result={...info,ready:true,username:sftpUsername(id),rootPath:'/files'}}else if(command.type==='sftp-test'){await ensureSftpServerRoot(id);result=await sftpHelper('status',id);await report({type:'sftp-status',serverId:id,status:(result as any).ready?'ready':'failed',error:(result as any).ready?undefined:'SFTP yapılandırma doğrulaması başarısız'})}else if(command.type==='sftp-disable'){result=await sftpHelper('disable',id);await report({type:'sftp-status',serverId:id,status:'disabled'})}else if(command.type==='sftp-enable'){await ensureSftpServerRoot(id);const enabled=await sftpHelper('enable',id);const status=await sftpHelper('status',id);await report({type:'sftp-status',serverId:id,status:(status as any).ready?'ready':'failed',error:(status as any).ready?undefined:'SFTP yeniden etkinleştirildi ancak doğrulama başarısız'});result={...enabled,status}}else if(command.type==='sftp-delete'){result=await sftpHelper('delete',id);await report({type:'sftp-status',serverId:id,status:'deleted'})}else if(command.type==='sftp-session-list'){result=await sftpHelper('sessions',id)}else if(command.type==='sftp-session-terminate'){const pid=Number(p.pid);if(!Number.isInteger(pid)||pid<=1)throw new Error('Geçersiz SFTP oturum PID değeri');result=await sftpHelper('terminate-session',id,String(pid))}else if(command.type==='backup-list')result=await listBackups(id);else if(command.type==='worlds-status')result=await discoverWorlds(id);else if(command.type==='file-inventory')result=await fileInventory(id);else if(command.type==='bulk-download')result=await bulkDownload(id,p);else if(command.type==='file-create')result=await createServerFile(id,p);else if(command.type==='folder-create')result=await createServerFolder(id,p);else if(command.type==='file-rename'||command.type==='file-move')result=await moveServerPath(id,p);else if(command.type==='file-copy')result=await copyServerPath(id,p);else if(command.type==='file-delete')result=await deleteServerPath(id,p);else if(command.type==='file-download')result=await singleFileDownload(id,p);else if(command.type==='folder-download')result=await folderDownload(id,p);else if(command.type==='file-read')result=await readServerFileAction(id,p);else if(command.type==='file-write')result=await writeServerFileAction(id,p);else if(command.type==='file-permissions')result=await changeServerPermissions(id,p);else if(command.type==='file-bulk-delete')result=await bulkDeleteServerPaths(id,p);else if(command.type==='file-bulk-move')result=await bulkMoveServerPaths(id,p);else if(command.type==='security-scan'){result=await securitySnapshot(id,'full',Number(p.serverPort)||undefined,(p.previousHashes&&typeof p.previousHashes==='object'?p.previousHashes:{}) as Record<string,string>)}else if(command.type==='file-integrity'){result=await securitySnapshot(id,'files',Number(p.serverPort)||undefined,(p.previousHashes&&typeof p.previousHashes==='object'?p.previousHashes:{}) as Record<string,string>)}else if(command.type==='firewall-status'){result=await firewallStatus()}else if(command.type==='port-scan'){result=await securitySnapshot(id,'ports',Number(p.serverPort)||undefined)}else if(command.type==='install'){await install(p,id);await report({type:'progress',serverId:id,status:'starting',progress:95});await launch(id,p)}else if(command.type==='create-world')result=await createWorld(id,p);else if(command.type==='create-world-profile')result=await createWorldProfile(id,p);else if(command.type==='world-live-settings')result=await applyWorldLiveSettings(id,p);else if(command.type==='install-addon')result=await installAddon(id,p);else if(command.type==='upload-file')result=await uploadFile(id,p);else if(command.type==='upload-archive')result=await uploadArchive(id,p);else if(command.type==='write-file'){const target=safePath(id,String(p.path??p.filename??''));if(p.pathname){await fetchPanelFile(String(p.pathname),target,id);result={saved:true,path:relative(serverDir(id),target).replaceAll('\\','/'),binary:true}}else{if(!/\.(yml|yaml|json|properties|toml|ini|cfg|conf|txt)$/i.test(target)||String(p.content??'').length>2000000)throw new Error('Only small text files can be edited');if(existsSync(target))await rename(target,`${target}.bak-${Date.now()}`);await mkdir(dirname(target),{recursive:true});await writeFile(target,String(p.content??''),'utf8');result={saved:true,path:relative(serverDir(id),target).replaceAll('\\','/'),backupCreated:true}}}else if(command.type==='delete-file'){const target=safePath(id,String(p.path??''));if(target===serverDir(id))throw new Error('Cannot delete server root');await rm(target,{recursive:true,force:true});result={deleted:true}}else if(['runtime-enable','runtime-disable','optimization-mod-install','optimization-mod-remove'].includes(command.type)){if(isServerRunningKnown(id))throw new Error('Optimizasyon icin Minecraft sunucusunu durdurun');const root=serverDir(id),meta=await readServerMeta(id),statePath=join(DATA_DIR,'runtime-optimization',id+'.json'),manifestPath=join(DATA_DIR,'optimization-mods',id+'.json');if(command.type==='runtime-enable')result=await enableRuntimeOptimization(root,statePath,Number(p.memoryMb??meta.memoryMb??4096),String(p.profile??''));else if(command.type==='runtime-disable')result=await disableRuntimeOptimization(root,statePath);else if(command.type==='optimization-mod-install')result=await installOptimizationMod(root,manifestPath,String(p.key??''),String(p.versionId??''),String(meta.loader??'').toLowerCase(),String(meta.version??''));else result=await removeOptimizationMod(root,manifestPath,String(p.key??''))}else if(command.type==='performance-apply'||command.type==='performance-restore'){if(command.type==='performance-apply')throw new Error('Mesafe profilleri kaldirildi; CPU/RAM calisma profilini kullanin');if(isServerRunningKnown(id))throw new Error('Performans ayarlarini uygulamak icin sunucuyu durdurun');const propsPath=await safePath(id,'server.properties');const backupPath=join(DATA_DIR,'performance-backups',id+'.json');result=await restorePerformance(propsPath,backupPath)}else if(command.type==='set-properties'){if(isServerRunningKnown(id))throw new Error('Sunucu çalışırken ayarlar değiştirilemez');const propsPath=join(serverDir(id),'server.properties');const existing=await readFile(propsPath,'utf8').catch(()=> '');const updates=new Map(Object.entries(p).filter(([key])=>key!=='serverId').map(([key,value])=>[key,String(value).slice(0,500)]));const seen=new Set<string>();const lines=existing.split(/\r?\n/).filter(Boolean).map(line=>{const idx=line.indexOf('=');if(idx<1)return line;const key=line.slice(0,idx);if(!updates.has(key))return line;seen.add(key);return `${key}=${updates.get(key)}`});for(const [key,value] of updates)if(!seen.has(key))lines.push(`${key}=${value}`);await writeFile(propsPath,lines.join('\n')+'\n');result={saved:updates.size,offlineMode:updates.get('online-mode')==='false'}}else if(command.type==='change-port'){if(isServerRunningKnown(id))throw new Error('Port değişikliği için sunucu kapalı olmalıdır');const port=Number(p.port);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Geçersiz port');const propsPath=join(serverDir(id),'server.properties');const existing=await readFile(propsPath,'utf8').catch(()=> '');const next=/^server-port=.*$/m.test(existing)?existing.replace(/^server-port=.*$/m,`server-port=${port}`):`${existing.trim()}\nserver-port=${port}\n`;await writeFile(propsPath,next);result={port}}else if(command.type==='delete-server'){if(isServerRunningKnown(id))await stop(id);if(existsSync(SFTP_HELPER)){try{await sftpHelper('delete',id)}catch(error){agentEvent('warn',id,'[agent] SFTP cleanup warning',error instanceof Error?error.message:'cleanup failed')}}await rm(serverDir(id),{recursive:true,force:true});result={deleted:true}}else if(command.type==='start')await launch(id,p);else if(command.type==='stop')await stop(id);else if(command.type==='kill')await stop(id,true);else if(command.type==='restart'){await stop(id);for(let i=0;i<35&&isServerRunningKnown(id);i++)await new Promise(r=>setTimeout(r,1000));await launch(id,p)}else if(command.type==='console'||command.type==='send-command'){const line=String(p.line??'').trim().slice(0,512);if(!line)throw new Error('Komut boş olamaz');await writeConsole(id,line);result={sent:true,line}}else if(command.type==='list-players'){await writeConsole(id,'list');result={requested:true}}else if(command.type==='player-details')result=await playersStatus(id);else if(command.type==='player-inventory')result=await playerStorage(id,p,'Inventory');else if(command.type==='player-enderchest')result=await playerStorage(id,p,'EnderItems');else if(command.type==='player-history')result=await playerHistory(id,p);else if(command.type==='player-action')result=await playerAction(id,p);else if(command.type==='lost-item-restore')result=await restoreLostItem(id,p);else if(command.type==='agent-logs'){const diagnostic=await consoleDiagnostics(id);result={events:diagnostic.events,node:diagnostic.node,server:diagnostic.server,at:diagnostic.at}}else if(command.type==='server-startup-logs'){const diagnostic=await consoleDiagnostics(id);result={startup:diagnostic.startup,at:diagnostic.at}}else if(command.type==='crash-reports'){result={reports:await listCrashReports(id),at:new Date().toISOString()}}else if(command.type==='logs-export'){result=await exportServerLogs(id)}else if(command.type==='software-compatibility'||command.type==='addon-scan'){result=await addonSecurity(id,(p.previousHashes&&typeof p.previousHashes==='object'?p.previousHashes:{}) as Record<string,string>)}else if(command.type==='anticheat-status'){result=await anticheatStatus(id)}else if(command.type==='backup-verify')result=await verifyBackup(id,p);else if(command.type==='backup-copy')result=await copyBackup(id,p);else if(command.type==='backup'||command.type==='CREATE_BACKUP'){const path=await backup(id,String(p.label??'manual'),String(p.kind??'full'));result={path,sizeBytes:(await stat(path)).size}}else if(command.type==='CREATE_WORLD_BACKUP'){const path=await backup(id,'world','world');result={path,sizeBytes:(await stat(path)).size}}else if(command.type==='UPLOAD_WORLD')result=await uploadWorld(id,p);else if(command.type==='RESTORE_BACKUP'||command.type==='restore-backup')result=await restoreBackup(id,p);else if(command.type==='DELETE_BACKUP'||command.type==='delete-backup')result=await deleteBackup(id,p);else if(command.type==='RESET_WORLD')result=await resetManagedWorld(id,p);else if(command.type==='DELETE_WORLD')result=await deleteManagedWorld(id,p);else if(command.type==='CHANGE_WORLD')result=await activateManagedWorld(id,p);else if(command.type==='change-software'){if(isServerRunningKnown(id))throw new Error('Yazılım değişikliği için sunucu kapalı olmalıdır');await reset('reinstall',id,{...p,backupFirst:true});result={softwareChanged:true}}else if(['reset-world','reset-config','clear-addons','reinstall','factory-reset'].includes(command.type))await reset(command.type,id,p);else if(command.type==='database-create')result=await createManagedDatabase(id,p);else if(command.type==='database-rotate-password')result=await rotateManagedDatabasePassword(id,p);else if(command.type==='database-delete')result=await deleteManagedDatabase(id,p);else if(command.type==='database-backup'||command.type==='database-export')result=await dumpManagedDatabase(id,p);else if(command.type==='database-restore')result=await restoreManagedDatabase(id,p);else if(command.type==='database-import')result=await importManagedDatabase(id,p);else if(command.type==='database-optimize')result=await databaseMaintenance(id,p,'optimize');else if(command.type==='database-repair')result=await databaseMaintenance(id,p,'repair');else if(command.type==='database-status')result=await managedDatabaseStatus(id,p);else if(command.type==='list-files')result={files:await listFiles(id,String(p.path??'.'))};else if(command.type==='create-folder'){await mkdir(safePath(id,String(p.path??'')),{recursive:false});result={created:true}}else if(command.type==='create-archive'){const target=safePath(id,String(p.path??'.'));const name=basename(String(p.name??'archive.tar.gz')).replace(/[^A-Za-z0-9._-]/g,'_');await run('tar',['-czf',safePath(id,name),'-C',target,'.'],serverDir(id));result={archive:name}}else if(command.type==='read-file')result={content:await readFile(safePath(id,String(p.path)),'utf8')};else if(command.type==='write-file'){const target=safePath(id,String(p.path??p.filename??'uploaded-file'));if(p.pathname){const response=await fetch(`${PANEL_URL}/api/agent/file?pathname=${encodeURIComponent(String(p.pathname))}&serverId=${id}`,{headers:{authorization:`Bearer ${NODE_TOKEN}`,'x-node-id':NODE_ID!}});if(!response.ok||!response.body)throw new Error('Panel upload could not be downloaded');await mkdir(join(target,'..'),{recursive:true});await pipeline(response.body as never,createWriteStream(target))}else await writeFile(target,String(p.content).slice(0,2_000_000),'utf8')}else if(command.type==='delete-file')await rm(safePath(id,String(p.path)),{recursive:true});else if(command.type==='move-file')await rename(safePath(id,String(p.from)),safePath(id,String(p.to)));else throw new Error('Unsupported command');if(scopedId)agentEvent('info',scopedId,`Agent görevi tamamlandı: ${command.type}`);await report({type:'result',commandId:command.id,ok:true,result})}catch(error){if(scopedId)agentEvent('error',scopedId,`Agent görevi başarısız: ${command.type}`,error);await report({type:'result',commandId:command.id,ok:false,result:{error:error instanceof Error?error.message:'Unknown error'}})}}
const itemQueue:Array<Record<string,unknown>>=[]
type DirectUploadMeta={uploadId:string;commandId:string;serverId:string;filename:string;category:string;size:number;totalParts:number;chunkSize:number;createdAt:string;lastActivityAt?:string}
const DIRECT_UPLOAD_CHUNK_LIMIT=3*1024*1024;const DIRECT_UPLOAD_MAX=2*1024*1024*1024
function directUploadRoot(){return join(DATA_DIR,'.direct-uploads')}
function validUploadId(value:string){return /^[0-9a-f-]{36}$/i.test(value)}
function directUploadDir(uploadId:string){if(!validUploadId(uploadId))throw new Error('Invalid upload id');return join(directUploadRoot(),uploadId)}
async function readRequestBody(req:import('node:http').IncomingMessage,limit:number){const chunks:Buffer[]=[];let total=0;for await(const raw of req){const chunk=Buffer.isBuffer(raw)?raw:Buffer.from(raw);total+=chunk.length;if(total>limit)throw new Error('Request body too large');chunks.push(chunk)}return Buffer.concat(chunks)}
async function readDirectMeta(uploadId:string){const parsed=JSON.parse(await readFile(join(directUploadDir(uploadId),'meta.json'),'utf8')) as DirectUploadMeta;if(parsed.uploadId!==uploadId||!validUploadId(parsed.serverId)||!validUploadId(parsed.commandId))throw new Error('Invalid upload metadata');return parsed}
async function zipListing(path:string){return new Promise<string>((ok,fail)=>{const child=spawn('unzip',['-Z1',path],{stdio:['ignore','pipe','pipe']});let out='';let err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('exit',code=>code===0?ok(out):fail(new Error(`Geçersiz ZIP arşivi: ${err.slice(-500)}`)))})}
async function backupAndMove(source:string,destination:string){await mkdir(resolve(destination,'..'),{recursive:true});if(existsSync(destination))await rename(destination,`${destination}.bak-${Date.now()}`);await rename(source,destination)}
function quarantineRoot(id:string){return join(serverDir(id),'.blockctrl-quarantine')}
function quarantineToken(){return `${Date.now()}-${randomBytes(6).toString('hex')}`}
function validQuarantineToken(value:string){return /^\d{10,}-[0-9a-f]{12}$/i.test(value)}
async function quarantineIncoming(id:string,source:string,intendedPath:string,reason:string,sha256?:string){const root=quarantineRoot(id);await mkdir(root,{recursive:true});const token=quarantineToken();const stored=`${token}-${basename(intendedPath)}`;const target=join(root,stored);await rename(source,target);const meta={token,stored,originalPath:normalizeRelative(intendedPath),reason,sha256:sha256||await hashPath(target),createdAt:new Date().toISOString()};await writeFile(join(root,`${token}.json`),JSON.stringify(meta,null,2),'utf8');return{quarantined:true,...meta}}
async function listQuarantine(id:string){const root=quarantineRoot(id);await mkdir(root,{recursive:true});const out:any[]=[];for(const name of await readdir(root).catch(()=>[] as string[])){if(!/^\d{10,}-[0-9a-f]{12}\.json$/i.test(name))continue;try{const meta=JSON.parse(await readFile(join(root,name),'utf8')) as Record<string,unknown>;const stored=String(meta.stored||'');const info=stored?await stat(join(root,stored)).catch(()=>null):null;if(info?.isFile())out.push({...meta,size:info.size})}catch{}}return out.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
async function restoreQuarantine(id:string,token:string){if(isServerRunningKnown(id))throw new Error('Karantinadan geri yüklemek için sunucuyu durdurun');if(!validQuarantineToken(token))throw new Error('Geçersiz karantina kaydı');const root=quarantineRoot(id);const metaPath=join(root,`${token}.json`);const meta=JSON.parse(await readFile(metaPath,'utf8')) as Record<string,unknown>;const stored=String(meta.stored||'');const original=normalizeRelative(String(meta.originalPath||''));if(!stored||basename(stored)!==stored)throw new Error('Geçersiz karantina meta verisi');const source=join(root,stored);const destination=await verifiedWritableContentPath(id,original);if(existsSync(destination))await rename(destination,`${destination}.bak-${Date.now()}`);await mkdir(dirname(destination),{recursive:true});await rename(source,destination);await rm(metaPath,{force:true});return{restored:true,path:original,backupBeforeReplace:true}}
async function deleteQuarantine(id:string,token:string){if(!validQuarantineToken(token))throw new Error('Geçersiz karantina kaydı');const root=quarantineRoot(id);const metaPath=join(root,`${token}.json`);const meta=JSON.parse(await readFile(metaPath,'utf8').catch(()=> '{}')) as Record<string,unknown>;const stored=String(meta.stored||'');if(stored&&basename(stored)===stored)await rm(join(root,stored),{force:true});await rm(metaPath,{force:true});return{deleted:true,token}}
async function clamScanFile(path:string){const has=await runCapture('bash',['-lc','command -v clamscan || true'],DATA_DIR).catch(()=> '');if(!has.trim())return{available:false,engine:null,status:'unavailable',infected:false};return new Promise<Record<string,unknown>>((ok)=>{const child=spawn(has.trim(),['--infected','--no-summary',path],{stdio:['ignore','pipe','pipe']});let output='';let finished=false;let timer:NodeJS.Timeout;const done=(result:Record<string,unknown>)=>{if(finished)return;finished=true;if(timer)clearTimeout(timer);ok(result)};child.stdout.on('data',d=>{if(output.length<20000)output+=d.toString()});child.stderr.on('data',d=>{if(output.length<20000)output+=d.toString()});child.on('error',e=>done({available:true,engine:'ClamAV',status:'error',infected:false,error:e.message}));child.on('exit',code=>done(code===0?{available:true,engine:'ClamAV',status:'clean',infected:false}:code===1?{available:true,engine:'ClamAV',status:'infected',infected:true,detail:output.slice(-4000)}:{available:true,engine:'ClamAV',status:'error',infected:false,detail:output.slice(-4000)}));timer=setTimeout(()=>{child.kill('SIGKILL');done({available:true,engine:'ClamAV',status:'timeout',infected:false})},120000)})}
async function validateJarUpload(id:string,source:string,intendedPath:string){let valid=true;try{await runCapture('unzip',['-tqq',source],DATA_DIR)}catch{valid=false}const sha=await hashPath(source);if(!valid)return quarantineIncoming(id,source,intendedPath,'Bozuk veya geçersiz JAR arşivi',sha);const malware=await clamScanFile(source);if(malware.infected)return quarantineIncoming(id,source,intendedPath,'ClamAV zararlı içerik tespit etti',sha);return{quarantined:false,sha256:sha,malware}}
async function validateZipSafety(path:string){const listing=await zipListing(path);const entries=listing.split(/\r?\n/).filter(Boolean);if(entries.length>10000)throw new Error(`ZIP çok fazla giriş içeriyor (${entries.length}/10000)`);for(const raw of entries){if(raw.startsWith('/')||raw.includes('\\')||raw.split('/').some(part=>part==='..'))throw new Error('ZIP Slip/path traversal engellendi')}const info=await stat(path);const table=await runCapture('unzip',['-l',path],DATA_DIR);const matches=[...table.matchAll(/\s(\d+)\s+\d+\s+files?\s*$/gim)];const summary=matches.length?matches[matches.length-1]:null;const extracted=summary?Number(summary[1]):0;const maxExpanded=Math.min(8*1024*1024*1024,Math.max(512*1024*1024,info.size*100));if(extracted>maxExpanded)throw new Error(`ZIP açılmış boyutu güvenlik sınırını aşıyor (${extracted} > ${maxExpanded})`);return{listing,entries,compressedBytes:info.size,uncompressedBytes:extracted}}
async function finalizeDirectUpload(meta:DirectUploadMeta,assembled:string){const id=meta.serverId;if(isServerRunningKnown(id))throw new Error('Server must be stopped');const filename=basename(meta.filename).replace(/[^A-Za-z0-9._-]/g,'_');const category=meta.category
  if(category==='mods'||category==='plugins'){if(!filename.toLowerCase().endsWith('.jar'))throw new Error('Mod/plugin yüklemesi .jar olmalıdır');const intended=join(category,filename).replaceAll('\\','/');const validation=await validateJarUpload(id,assembled,intended);if(validation.quarantined)return{filename,category,sizeBytes:meta.size,direct:true,...validation};const destination=safePath(id,intended);await backupAndMove(assembled,destination);return{filename,category,sizeBytes:meta.size,direct:true,sha256:validation.sha256,malware:(validation as any).malware}}
  if(category==='configs'){const ext=extensionOf(filename);if(['.exe','.dll','.bat','.cmd','.ps1','.vbs','.scr','.sh'].includes(ext))return{filename,category,sizeBytes:meta.size,direct:true,...await quarantineIncoming(id,assembled,filename,'Yasaklı/çalıştırılabilir dosya uzantısı')};const target=filename==='server.properties'?filename:join('config',filename);const destination=safePath(id,target);await backupAndMove(assembled,destination);return{filename,category,path:relative(serverDir(id),destination),sizeBytes:meta.size,direct:true}}
  if(category==='resource-packs'){if(!filename.toLowerCase().endsWith('.zip'))throw new Error('Resource pack .zip olmalıdır');await validateZipSafety(assembled);const malware=await clamScanFile(assembled);if(malware.infected)return{filename,category,sizeBytes:meta.size,direct:true,...await quarantineIncoming(id,assembled,join('resourcepacks',filename),'ClamAV zararlı içerik tespit etti')};const destination=safePath(id,join('resourcepacks',filename));await backupAndMove(assembled,destination);return{filename,category,sizeBytes:meta.size,direct:true,malware}}
  if(category==='worlds'){if(!filename.toLowerCase().endsWith('.zip'))throw new Error('Dünya yüklemesi .zip olmalıdır');await validateZipSafety(assembled);const malware=await clamScanFile(assembled);if(malware.infected)return{filename,category,sizeBytes:meta.size,direct:true,...await quarantineIncoming(id,assembled,filename,'ClamAV zararlı içerik tespit etti')};const worldName=filename.replace(/\.zip$/i,'').replace(/[^A-Za-z0-9_-]/g,'_')||'uploaded-world';const result=await installWorldArchive(id,assembled,worldName);return{...result,sizeBytes:meta.size}}
  if(category==='auto'&&filename.toLowerCase().endsWith('.zip')){await validateZipSafety(assembled);const malware=await clamScanFile(assembled);if(malware.infected)return{filename,category,sizeBytes:meta.size,direct:true,...await quarantineIncoming(id,assembled,filename,'ClamAV zararlı içerik tespit etti')};const result=await installMixedArchive(id,assembled);return{...result,sizeBytes:meta.size,direct:true}}
  const detected=category==='auto'?fileCategory(filename):category;const target=detected==='plugins'?'plugins':detected==='mods'?'mods':detected==='resource-packs'?'resourcepacks':detected==='config'?(filename==='server.properties'?'.':'config'):'uploads';const intended=join(target,filename).replaceAll('\\','/');if(['.exe','.dll','.bat','.cmd','.ps1','.vbs','.scr','.sh'].includes(extensionOf(filename)))return{filename,category:detected,sizeBytes:meta.size,direct:true,...await quarantineIncoming(id,assembled,intended,'Yasaklı/çalıştırılabilir dosya uzantısı')};if(filename.toLowerCase().endsWith('.jar')){const validation=await validateJarUpload(id,assembled,intended);if(validation.quarantined)return{filename,category:detected,sizeBytes:meta.size,direct:true,...validation}}const destination=safePath(id,intended);await backupAndMove(assembled,destination);return{filename,category:detected,path:relative(serverDir(id),destination),sizeBytes:meta.size,direct:true}
}
async function completeDirectUpload(uploadId:string){const meta=await readDirectMeta(uploadId);const dir=directUploadDir(uploadId);const assembled=join(dir,'assembled.bin');let total=0;const output=await open(assembled,'w');try{for(let part=0;part<meta.totalParts;part++){const partPath=join(dir,`${part}.part`);const info=await stat(partPath);if(!info.isFile()||info.size<=0||info.size>meta.chunkSize)throw new Error(`Eksik veya geçersiz parça: ${part}`);total+=info.size;const data=await readFile(partPath);await output.write(data)}}finally{await output.close()}if(total!==meta.size)throw new Error(`Dosya boyutu eşleşmedi (${total}/${meta.size})`);return{meta,result:await finalizeDirectUpload(meta,assembled)}}
































































const SECURITY_HELPER='/usr/local/sbin/blockctrl-security-helper'
const ANTICHEAT_CHECKS=['speed','fly','reach','killaura','aimassist','autoclicker','fastplace','fastbreak','nofall','jesus','step','timer','xray','inventorymove','scaffold','blink','phase','noslow','velocity','criticals','rotations','packet','invalidmovement','teleport','elytra','boatfly','fastbow','fastheal','fastuse','noswing','sprint','sneak','badpackets','nuker','ghosthand','blockreach','entityreach','inventoryclick','groundspoof','timerbalance','crashclient'] as const
function parsePropertiesText(raw:string){const out:Record<string,string>={};for(const line of raw.split(/\r?\n/)){const trimmed=line.trim();if(!trimmed||trimmed.startsWith('#'))continue;const i=trimmed.indexOf('=');if(i>0)out[trimmed.slice(0,i)]=trimmed.slice(i+1)}return out}
async function patchProperties(id:string,updates:Record<string,string>){if(isServerRunningKnown(id))throw new Error('Bu güvenlik ayarını değiştirmek için sunucuyu durdurun');const path=join(serverDir(id),'server.properties');const raw=await readFile(path,'utf8').catch(()=> '');const current=parsePropertiesText(raw);Object.assign(current,updates);const comments=raw.split(/\r?\n/).filter(x=>x.trim().startsWith('#'));const body=Object.entries(current).map(([k,v])=>`${k}=${v}`);await writeFile(path,[...comments,...body].join('\n')+'\n','utf8')}
async function securityHelper(operation:string,...args:string[]){if(!existsSync(SECURITY_HELPER))throw new Error('Güvenlik helper kurulu değil. deploy/install-security-helper.sh dosyasını root olarak çalıştırın.');return parseHelperJson(await runCapture('sudo',['-n',SECURITY_HELPER,operation,...args],DATA_DIR))}
async function firewallStatus(){const ufw=await runCapture('bash',['-lc','command -v ufw || true'],DATA_DIR).catch(()=>'');if(ufw.trim()){const out=await runCapture('bash',['-lc','ufw status 2>&1 || true'],DATA_DIR).catch(()=> '');const low=out.toLowerCase();if(low.includes('status: active'))return{status:'active',provider:'ufw',detail:out.slice(0,1000)};if(low.includes('status: inactive'))return{status:'inactive',provider:'ufw',detail:out.slice(0,1000)};return{status:'unknown',provider:'ufw',detail:out.slice(0,1000)}}const firewalld=await runCapture('bash',['-lc','command -v firewall-cmd || true'],DATA_DIR).catch(()=>'');if(firewalld.trim()){const state=await runCapture('bash',['-lc','firewall-cmd --state 2>&1 || true'],DATA_DIR).catch(()=> 'unknown');return{status:state.trim()==='running'?'active':state.trim()==='not running'?'inactive':'unknown',provider:'firewalld',detail:state.slice(0,1000)}}const nft=await runCapture('bash',['-lc','command -v nft || true'],DATA_DIR).catch(()=>'');if(nft.trim()){const rules=await runCapture('bash',['-lc','nft list ruleset 2>&1 || true'],DATA_DIR).catch(()=> '');const hasRules=/\btable\s+(inet|ip|ip6)\b/i.test(rules)&&/\bchain\s+\w+/i.test(rules);return{status:hasRules?'active':'inactive',provider:'nftables',detail:rules.slice(0,1000)}}return{status:'unknown',provider:'none',detail:'Desteklenen firewall aracı bulunamadı'}}
function publicBind(bind:string){const b=bind.replace(/^\[|\]$/g,'');return b==='0.0.0.0'||b==='::'||b==='*'}
async function listeningPorts(props:Record<string,string>,serverPort:number){const text=await runCapture('ss',['-H','-lnt'],DATA_DIR).catch(()=> '');const queryPort=Number(props['query.port']||props['server-port']||serverPort);const rconPort=Number(props['rcon.port']||25575);const sftpPort=22;const agentPort=Number(process.env.AGENT_DOWNLOAD_PORT??8789);const expected=new Set([22,serverPort,agentPort]);if(props['enable-query']==='true')expected.add(queryPort);if(props['enable-rcon']==='true')expected.add(rconPort);const seen=new Map<string,{port:number;bind:string;service:string;expected:boolean;public:boolean}>();for(const line of text.split(/\r?\n/)){const tokens=line.trim().split(/\s+/);if(tokens.length<4)continue;const local=tokens[3]||tokens[2]||'';const m=local.match(/^(.*):(\d+)$/);if(!m)continue;let bind=m[1];if(bind.startsWith('[')&&bind.endsWith(']'))bind=bind.slice(1,-1);const port=Number(m[2]);if(!Number.isInteger(port))continue;const service=port===serverPort?'Minecraft':port===sftpPort?'SFTP / SSH':port===agentPort?'Agent bridge':port===queryPort&&props['enable-query']==='true'?'Query':port===rconPort&&props['enable-rcon']==='true'?'RCON':'Diğer';seen.set(`${bind}:${port}`,{port,bind,service,expected:expected.has(port),public:publicBind(bind)})}const ports=[...seen.values()].sort((a,b)=>a.port-b.port);return{ports,unexpectedPublicPorts:ports.filter(p=>p.public&&!p.expected).map(p=>p.port),agentPort,queryPort,rconPort}}
async function hashPath(path:string){return new Promise<string>((ok,fail)=>{const h=createHash('sha256');const stream=createReadStream(path);stream.on('data',d=>h.update(d));stream.on('error',fail);stream.on('end',()=>ok(h.digest('hex')))})}
async function jarText(path:string,entry:string){return runCapture('unzip',['-p',path,entry],DATA_DIR).catch(()=> '')}
function yamlScalar(raw:string,key:string){const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=raw.match(new RegExp(`^\\s*${escaped}\\s*:\\s*["']?([^"'\\r\\n#]+)`,`mi`));return m?.[1]?.trim()||null}
async function anticheatStatus(id:string){const root=serverDir(id);const locations=[['plugins','plugin'],['mods','mod']] as const;const known:[RegExp,string,boolean][]=[[/blockctrl[-_ ]?anti.?cheat/i,'BlockCtrl AntiCheat',true],[/grim(ac)?/i,'GrimAC',false],[/vulcan/i,'Vulcan',false],[/matrix/i,'Matrix',false],[/spartan/i,'Spartan',false],[/nocheatplus|ncp/i,'NoCheatPlus',false],[/themis/i,'Themis',false],[/negativity/i,'Negativity',false]];for(const [folder,kind] of locations){let entries:any[]=[];try{entries=await readdir(join(root,folder),{withFileTypes:true,encoding:'utf8'})}catch{}for(const entry of entries){if(!entry.isFile?.()||!entry.name.toLowerCase().includes('.jar'))continue;const path=join(root,folder,entry.name);let metadata='';for(const candidate of ['plugin.yml','paper-plugin.yml','fabric.mod.json','META-INF/mods.toml','META-INF/neoforge.mods.toml']){const text=await jarText(path,candidate);if(text){metadata+=`\n${text.slice(0,12000)}`}}for(const [rx,name,configurable] of known){if(rx.test(entry.name)||rx.test(metadata)){const disabled=/\.disabled(?:\.jar)?$/i.test(entry.name);let version:string|null=null;const pluginText=await jarText(path,'plugin.yml')||await jarText(path,'paper-plugin.yml');version=yamlScalar(pluginText,'version');if(!version){try{const fabric=JSON.parse(await jarText(path,'fabric.mod.json')||'{}') as Record<string,unknown>;version=typeof fabric.version==='string'?fabric.version:null}catch{}}const runtimePath=join(root,'.blockctrl-anticheat-status.json');let runtimeVerified=false;let runtime:any=null;try{runtime=JSON.parse(await readFile(runtimePath,'utf8'));const info=await stat(runtimePath);runtimeVerified=Date.now()-info.mtimeMs<120000&&runtime?.provider===name&&runtime?.running===true}catch{}return{available:true,provider:name,version,configurable,enabled:!disabled,kind,path:`${folder}/${entry.name}`,detail:`${entry.name} disk üzerinde algılandı`,integrationStatus:runtimeVerified?'runtime-verified':'detected',runtimeVerified,runtime,supportedChecks:configurable?[...ANTICHEAT_CHECKS]:[]}}}}}return{available:false,provider:null,version:null,configurable:false,enabled:false,kind:null,path:null,detail:'Sunucu içi anti-cheat plugin/mod bulunamadı',integrationStatus:'missing',runtimeVerified:false,runtime:null,supportedChecks:[]}}
function blockctrlAnticheatConfigText(config:Record<string,any>){const checks=config.checks||{};return `enabled: ${config.enabled!==false}\nprofile: ${String(config.profile||'balanced')}\nfalse-positive-threshold: ${Math.max(1,Number(config.falsePositiveThreshold)||3)}\nviolation-level: ${Math.max(1,Number(config.violationLevel)||10)}\naction: ${String(config.action||'warn')}\nchecks:\n${ANTICHEAT_CHECKS.map(k=>`  ${k}: ${checks[k]!==false}`).join('\n')}\n`}
































































type XrayProfileName='performance'|'balanced'|'strict'|'custom'
const XRAY_OVERWORLD_HIDDEN=['copper_ore','deepslate_copper_ore','raw_copper_block','diamond_ore','deepslate_diamond_ore','gold_ore','deepslate_gold_ore','iron_ore','deepslate_iron_ore','raw_iron_block','lapis_ore','deepslate_lapis_ore','redstone_ore','deepslate_redstone_ore'] as const
const XRAY_OVERWORLD_REPLACEMENTS=['chest','amethyst_block','andesite','budding_amethyst','calcite','coal_ore','deepslate_coal_ore','deepslate','diorite','dirt','emerald_ore','deepslate_emerald_ore','granite','gravel','oak_planks','smooth_basalt','stone','tuff'] as const
const XRAY_NETHER_HIDDEN=['ancient_debris','bone_block','glowstone','magma_block','nether_bricks','nether_gold_ore','nether_quartz_ore','polished_blackstone_bricks'] as const
const XRAY_NETHER_REPLACEMENTS=['basalt','blackstone','gravel','netherrack','soul_sand','soul_soil'] as const
function yamlScalarInAntiXray(block:string,key:string){const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return block.match(new RegExp(`^\\s{4}${escaped}:\\s*([^#\\r\\n]+)`,`mi`))?.[1]?.trim()??null}
function yamlListInAntiXray(block:string,key:string){const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=block.match(new RegExp(`^\\s{4}${escaped}:\\s*\\n((?:\\s{6}-[^\\n]*(?:\\n|$))*)`,`mi`));return m?m[1].split(/\r?\n/).map(x=>x.replace(/^\s*-\s*/,'').trim()).filter(Boolean):[]}
function yamlSectionRange(lines:string[],key:string,indent:number,from=0,to=lines.length){const prefix=' '.repeat(indent);const rx=new RegExp(`^${prefix}${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}:\\s*(?:#.*)?$`);let start=-1;for(let i=from;i<to;i++){if(rx.test(lines[i])){start=i;break}}if(start<0)return null;let end=start+1;for(;end<to;end++){const line=lines[end];const trimmed=line.trim();if(!trimmed||trimmed.startsWith('#'))continue;const current=(line.match(/^ */)?.[0].length??0);if(current<=indent)break}return{start,end}}
function antiXrayBlock(raw:string){const lines=raw.replace(/\r\n/g,'\n').split('\n');const parent=yamlSectionRange(lines,'anticheat',0);if(!parent)return'';const child=yamlSectionRange(lines,'anti-xray',2,parent.start+1,parent.end);return child?lines.slice(child.start,child.end).join('\n').replace(/\s*$/,'')+'\n':''}
function upsertAntiXray(raw:string,block:string){const normalized=raw.replace(/\r\n/g,'\n');const hadFinalNewline=normalized.endsWith('\n');const lines=normalized.split('\n');if(hadFinalNewline&&lines.at(-1)==='')lines.pop();const blockLines=block.replace(/\r\n/g,'\n').replace(/\s*$/,'').split('\n');const parent=yamlSectionRange(lines,'anticheat',0);if(!parent){if(lines.length&&lines.at(-1)?.trim())lines.push('');lines.push('anticheat:',...blockLines);return lines.join('\n')+'\n'}const child=yamlSectionRange(lines,'anti-xray',2,parent.start+1,parent.end);if(child)lines.splice(child.start,child.end-child.start,...blockLines);else lines.splice(parent.end,0,...blockLines);return lines.join('\n')+(hadFinalNewline?'\n':'')}
function xrayYamlBlock(input:{enabled:boolean;engineMode:number;maxBlockHeight:number;updateRadius:number;hideAir:boolean;usePermission:boolean;nether?:boolean;end?:boolean}){if(input.end)return`  anti-xray:\n    enabled: false\n`;const hidden=input.nether?[...XRAY_NETHER_HIDDEN]:[...(input.hideAir?['air']:[]),...XRAY_OVERWORLD_HIDDEN];const replacements=input.engineMode===1?[]:(input.nether?[...XRAY_NETHER_REPLACEMENTS]:[...XRAY_OVERWORLD_REPLACEMENTS]);return`  anti-xray:\n    enabled: ${input.enabled}\n    engine-mode: ${input.engineMode}\n    hidden-blocks:\n${hidden.map(x=>`      - ${x}`).join('\n')}\n    lava-obscures: false\n    max-block-height: ${input.maxBlockHeight}\n    replacement-blocks:${replacements.length?'\n'+replacements.map(x=>`      - ${x}`).join('\n'):' []'}\n    update-radius: ${input.updateRadius}\n    use-permission: ${input.usePermission}\n`}
async function serverLoader(id:string){try{const meta=JSON.parse(await readFile(join(serverDir(id),'blockctrl.json'),'utf8')) as Record<string,unknown>;return String(meta.loader||'').toLowerCase()}catch{return''}}
function xrayProfileFrom(values:{enabled:boolean;engineMode:number;maxBlockHeight:number;hideAir:boolean}){if(!values.enabled)return'off';if(values.engineMode===1&&values.maxBlockHeight<=64&&!values.hideAir)return'performance';if(values.engineMode===2&&values.maxBlockHeight>=128&&values.hideAir)return'strict';if(values.engineMode===2&&!values.hideAir)return'balanced';return'custom'}
async function paperAntiXrayStatus(id:string){const loader=await serverLoader(id);const supported=['paper','purpur'].includes(loader);const configPath=join(serverDir(id),'config','paper-world-defaults.yml');const raw=await readFile(configPath,'utf8').catch(()=> '');const block=antiXrayBlock(raw);const hidden=yamlListInAntiXray(block,'hidden-blocks');const enabled=yamlScalarInAntiXray(block,'enabled')==='true';const engineMode=Math.max(1,Math.min(2,Number(yamlScalarInAntiXray(block,'engine-mode')||1)));const maxBlockHeight=Math.max(0,Number(yamlScalarInAntiXray(block,'max-block-height')||64));const updateRadius=Math.max(0,Math.min(2,Number(yamlScalarInAntiXray(block,'update-radius')||2)));const usePermission=yamlScalarInAntiXray(block,'use-permission')==='true';const hideAir=hidden.includes('air');const props=parsePropertiesText(await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=>''));const worldName=String(props['level-name']||'world');const netherCandidates=[join(serverDir(id),`${worldName}_nether`,'paper-world.yml'),join(serverDir(id),worldName,'dimensions','minecraft','the_nether','paper-world.yml')];let netherBlock='';let netherPath:string|null=null;for(const candidate of netherCandidates){const text=await readFile(candidate,'utf8').catch(()=> '');if(text){netherBlock=antiXrayBlock(text);netherPath=candidate;break}}const endCandidates=[join(serverDir(id),`${worldName}_the_end`,'paper-world.yml'),join(serverDir(id),worldName,'dimensions','minecraft','the_end','paper-world.yml')];let endBlock='';let endPath:string|null=null;for(const candidate of endCandidates){const text=await readFile(candidate,'utf8').catch(()=> '');if(text){endBlock=antiXrayBlock(text);endPath=candidate;break}}const netherEnabled=yamlScalarInAntiXray(netherBlock,'enabled')==='true';return{supported,loader,provider:supported?'Paper Anti-Xray':null,configured:Boolean(block),enabled:supported&&enabled,engineMode,maxBlockHeight,updateRadius,usePermission,hideAir,profile:xrayProfileFrom({enabled,engineMode,maxBlockHeight,hideAir}),configPath:supported?'config/paper-world-defaults.yml':null,netherConfigured:Boolean(netherBlock),netherEnabled:supported&&netherEnabled,endConfigured:Boolean(endBlock),dimensions:[{dimension:'overworld',path:`${worldName}/paper-world.yml`,configured:existsSync(join(serverDir(id),worldName,'paper-world.yml'))},{dimension:'nether',path:netherPath?relative(serverDir(id),netherPath):null,configured:Boolean(netherBlock),enabled:netherEnabled},{dimension:'end',path:endPath?relative(serverDir(id),endPath):null,configured:Boolean(endBlock),enabled:yamlScalarInAntiXray(endBlock,'enabled')==='true'}],requiresRestart:true,detail:supported?(block?'Paper/Purpur yerleşik chunk obfuscation yapılandırması algılandı.':'Paper/Purpur yerleşik Anti-Xray kullanılabilir ancak henüz yapılandırılmamış.'):'Bu loader yerleşik Paper Anti-Xray sağlamıyor; gerçek chunk obfuscation için uyumlu sunucu mod/plugin entegrasyonu gerekir.'}}
async function configurePaperAntiXray(id:string,input:Record<string,any>){if(isServerRunningKnown(id))throw new Error('X-Ray korumasını değiştirmek için sunucuyu durdurun');const current=await paperAntiXrayStatus(id);if(!current.supported)throw new Error(`Yerleşik X-Ray obfuscation ${current.loader||'bu loader'} üzerinde desteklenmiyor. Paper/Purpur kullanın veya uyumlu server-side Anti-Xray mod/plugin kurun.`);const profile=(['performance','balanced','strict','custom'].includes(String(input.profile))?String(input.profile):'balanced') as XrayProfileName;const defaults=profile==='performance'?{engineMode:1,maxBlockHeight:64,updateRadius:2,hideAir:false}:profile==='strict'?{engineMode:2,maxBlockHeight:128,updateRadius:2,hideAir:true}:{engineMode:2,maxBlockHeight:64,updateRadius:2,hideAir:false};const enabled=input.enabled!==false;const engineMode=profile==='custom'?Math.max(1,Math.min(2,Number(input.engineMode)||2)):defaults.engineMode;let maxBlockHeight=profile==='custom'?Math.max(16,Math.min(320,Number(input.maxBlockHeight)||64)):defaults.maxBlockHeight;maxBlockHeight=Math.floor(maxBlockHeight/16)*16;const updateRadius=profile==='custom'?Math.max(1,Math.min(2,Number(input.updateRadius)||2)):defaults.updateRadius;const hideAir=profile==='custom'?Boolean(input.hideAir):defaults.hideAir;const usePermission=Boolean(input.usePermission);const configPath=join(serverDir(id),'config','paper-world-defaults.yml');await mkdir(dirname(configPath),{recursive:true});let raw=await readFile(configPath,'utf8').catch(()=> '');if(raw)await writeFile(`${configPath}.bak-${Date.now()}`,raw,'utf8');raw=upsertAntiXray(raw,xrayYamlBlock({enabled,engineMode,maxBlockHeight,updateRadius,hideAir,usePermission}));await writeFile(configPath,raw,'utf8');const props=parsePropertiesText(await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=> ''));const worldName=String(props['level-name']||'world');const version=raw.match(/^_version:\s*(\d+)/m)?.[1];const overrides=[{dimension:'overworld',paths:[join(serverDir(id),worldName,'paper-world.yml')],block:xrayYamlBlock({enabled,engineMode,maxBlockHeight,updateRadius,hideAir,usePermission})},{dimension:'nether',paths:[join(serverDir(id),`${worldName}_nether`,'paper-world.yml'),join(serverDir(id),worldName,'dimensions','minecraft','the_nether','paper-world.yml')],block:xrayYamlBlock({enabled,engineMode,hideAir,maxBlockHeight:128,updateRadius,usePermission,nether:true})},{dimension:'end',paths:[join(serverDir(id),`${worldName}_the_end`,'paper-world.yml'),join(serverDir(id),worldName,'dimensions','minecraft','the_end','paper-world.yml')],block:xrayYamlBlock({enabled:false,engineMode,maxBlockHeight:64,updateRadius,hideAir:false,usePermission,end:true})}];const appliedDimensions:string[]=[];for(const item of overrides){const path=item.paths.find(p=>existsSync(p)||existsSync(dirname(p)));if(!path)continue;let worldRaw=await readFile(path,'utf8').catch(()=>version?`_version: ${version}\n`:'');if(worldRaw)await writeFile(`${path}.bak-${Date.now()}`,worldRaw,'utf8');worldRaw=upsertAntiXray(worldRaw,item.block);await mkdir(dirname(path),{recursive:true});await writeFile(path,worldRaw,'utf8');appliedDimensions.push(item.dimension)}await writeFile(join(serverDir(id),'.blockctrl-xray-config.json'),JSON.stringify({enabled,profile,engineMode,maxBlockHeight,updateRadius,hideAir,usePermission,sensitivity:['low','normal','high'].includes(String(input.sensitivity))?String(input.sensitivity):(profile==='strict'?'high':profile==='performance'?'low':'normal'),minSampleMinutes:Math.max(5,Math.min(120,Number(input.minSampleMinutes)||10)),appliedAt:new Date().toISOString(),appliedDimensions},null,2),'utf8');return{...(await paperAntiXrayStatus(id)),profile,applied:true,appliedDimensions,warning:hideAir?'air gizleme açık: bazı istemcilerde FPS düşüşü oluşturabilir.':null}}
type XrayCounts={rare:number;tunnel:number;diamonds:number;ancientDebris:number;emeralds:number}
function xrayCounts(stats:any):XrayCounts{const mined=stats?.stats?.['minecraft:mined']||{};const n=(key:string)=>Number(mined[`minecraft:${key}`]||0);const diamonds=n('diamond_ore')+n('deepslate_diamond_ore');const ancientDebris=n('ancient_debris');const emeralds=n('emerald_ore')+n('deepslate_emerald_ore');const rare=diamonds+ancientDebris+emeralds;const tunnel=['stone','deepslate','netherrack','tuff','granite','diorite','andesite','blackstone','basalt'].reduce((sum,k)=>sum+n(k),0);return{rare,tunnel,diamonds,ancientDebris,emeralds}}
async function xrayMiningAnalytics(id:string){const props=parsePropertiesText(await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=>''));const worldName=String(props['level-name']||'world');const statsDir=join(serverDir(id),worldName,'stats');const baselinePath=join(serverDir(id),'.blockctrl-xray-baseline.json');const previous=JSON.parse(await readFile(baselinePath,'utf8').catch(()=> '{"capturedAt":null,"players":{}}')) as {capturedAt?:string|null;players?:Record<string,XrayCounts>};const names:Record<string,string>={};try{const cache=JSON.parse(await readFile(join(serverDir(id),'usercache.json'),'utf8')) as Array<{uuid?:string;name?:string}>;for(const row of cache||[])if(row.uuid&&row.name)names[row.uuid.toLowerCase()]=row.name}catch{}let entries:any[]=[];try{entries=await readdir(statsDir,{withFileTypes:true,encoding:'utf8'})}catch{return{available:false,worldName,baselineReady:Boolean(previous.capturedAt),players:[],detail:'Dünya oyuncu istatistikleri henüz oluşmamış.'}}const current:Record<string,XrayCounts>={};const rows:any[]=[];for(const entry of entries){if(!entry.isFile?.()||!entry.name.endsWith('.json'))continue;const uuid=entry.name.replace(/\.json$/i,'').toLowerCase();let stats:any;try{stats=JSON.parse(await readFile(join(statsDir,entry.name),'utf8'))}catch{continue}const now=xrayCounts(stats);current[uuid]=now;const before=previous.players?.[uuid];if(!before)continue;const rareDelta=Math.max(0,now.rare-before.rare);const tunnelDelta=Math.max(0,now.tunnel-before.tunnel);const diamondsDelta=Math.max(0,now.diamonds-before.diamonds);const debrisDelta=Math.max(0,now.ancientDebris-before.ancientDebris);const emeraldDelta=Math.max(0,now.emeralds-before.emeralds);const total=Math.max(1,rareDelta+tunnelDelta);const ratio=rareDelta/total;let severity:'normal'|'low'|'medium'|'high'='normal';if(rareDelta>=12&&tunnelDelta>=64&&ratio>=0.14)severity='high';else if(rareDelta>=8&&tunnelDelta>=64&&ratio>=0.09)severity='medium';else if(rareDelta>=5&&tunnelDelta>=32&&ratio>=0.06)severity='low';rows.push({uuid,name:names[uuid]||uuid,rareDelta,tunnelDelta,diamondsDelta,debrisDelta,emeraldDelta,rareRatio:Number(ratio.toFixed(4)),per1000:Number((rareDelta/total*1000).toFixed(1)),severity})}await writeFile(baselinePath,JSON.stringify({capturedAt:new Date().toISOString(),worldName,players:current},null,2),'utf8');const rank=(s:string)=>s==='high'?3:s==='medium'?2:s==='low'?1:0;rows.sort((a,b)=>rank(b.severity)-rank(a.severity)||b.rareRatio-a.rareRatio);return{available:true,worldName,baselineReady:Boolean(previous.capturedAt),previousCapturedAt:previous.capturedAt||null,capturedAt:new Date().toISOString(),players:rows.slice(0,100),flagged:rows.filter(x=>x.severity!=='normal').length,high:rows.filter(x=>x.severity==='high').length,detail:previous.capturedAt?'Son iki örnek arasındaki blok kırma istatistikleri analiz edildi. Sonuçlar yalnız şüphe göstergesidir; otomatik ban uygulanmaz.':'İlk baz çizgisi kaydedildi. Anomali analizi sonraki taramada başlayacak.'}}
































































async function configureAnticheat(id:string,config:Record<string,any>){if(isServerRunningKnown(id))throw new Error('Anti-cheat config değiştirmek için sunucuyu durdurun');const status=await anticheatStatus(id);if(!status.available)throw new Error('Anti-cheat entegrasyonu bulunamadı');if(!status.configurable||status.provider!=='BlockCtrl AntiCheat')throw new Error(`${status.provider} algılandı ancak panelden güvenli otomatik config eşlemesi yok; sağlayıcının config dosyasını Yazılım bölümünden düzenleyin.`);const folder=status.kind==='plugin'?join(serverDir(id),'plugins','BlockCtrlAntiCheat'):join(serverDir(id),'config');await mkdir(folder,{recursive:true});const path=status.kind==='plugin'?join(folder,'config.yml'):join(folder,'blockctrl-anticheat.yml');if(existsSync(path))await rename(path,`${path}.bak-${Date.now()}`);await writeFile(path,blockctrlAnticheatConfigText(config),'utf8');return{...status,configured:true,configPath:relative(serverDir(id),path)}}
async function installAnticheatIntegration(id:string){if(isServerRunningKnown(id))throw new Error('Hile koruması eklemek için sunucuyu durdurun');const meta=JSON.parse(await readFile(join(serverDir(id),'blockctrl.json'),'utf8').catch(()=> '{}')) as Record<string,unknown>;const loader=String(meta.loader||'');const pluginLoader=['paper','purpur','spigot'].includes(loader);const source=pluginLoader?process.env.BLOCKCTRL_ANTICHEAT_JAR:process.env.BLOCKCTRL_ANTICHEAT_MOD_JAR;if(!source||!existsSync(source))throw new Error(pluginLoader?'BlockCtrl AntiCheat JAR paketi node üzerinde yapılandırılmamış. BLOCKCTRL_ANTICHEAT_JAR ayarlayın veya Yazılım bölümünden desteklenen anti-cheat JAR yükleyin.':'Bu mod loader için BlockCtrl anti-cheat mod paketi yapılandırılmamış. BLOCKCTRL_ANTICHEAT_MOD_JAR ayarlayın veya uyumlu anti-cheat modunu Yazılım bölümünden yükleyin.');try{await runCapture('unzip',['-tqq',source],DATA_DIR)}catch{throw new Error('Yapılandırılan anti-cheat paketi geçerli bir JAR değil')}const sha256=await hashPath(source);const expected=(pluginLoader?process.env.BLOCKCTRL_ANTICHEAT_SHA256:process.env.BLOCKCTRL_ANTICHEAT_MOD_SHA256)?.trim().toLowerCase();if(expected&&expected!==sha256.toLowerCase())throw new Error('Anti-cheat SHA-256 doğrulaması başarısız');const malware=await clamScanFile(source);if(malware.infected)throw new Error('Anti-cheat paketi ClamAV tarafından zararlı olarak işaretlendi');const targetDir=join(serverDir(id),pluginLoader?'plugins':'mods');await mkdir(targetDir,{recursive:true});const target=join(targetDir,pluginLoader?'BlockCtrlAntiCheat.jar':'blockctrl-anticheat.jar');if(existsSync(target))await rename(target,`${target}.bak-${Date.now()}`);await cp(source,target);return{installed:true,path:relative(serverDir(id),target),loader,provider:'BlockCtrl AntiCheat',sha256,hashVerified:Boolean(expected),malware}}
function normalizeAddonId(value:string){return value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'')}
function yamlList(text:string,key:string){const line=text.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`,`mi`));if(line)return line[1].split(',').map(x=>normalizeAddonId(x.replace(/["']/g,''))).filter(Boolean);const one=text.match(new RegExp(`^${key}:\\s*([^\\n#]+)`,`mi`));if(one&&one[1].trim()&&!one[1].trim().startsWith('['))return[normalizeAddonId(one[1].replace(/["']/g,''))].filter(Boolean);return[]}
function versionParts(value:string){return value.split(/[.+-]/).slice(0,3).map(x=>Number.parseInt(x,10)).map(x=>Number.isFinite(x)?x:0)}
function compareVersions(a:string,b:string){const av=versionParts(a),bv=versionParts(b);for(let i=0;i<3;i++){const d=(av[i]||0)-(bv[i]||0);if(d)return d<0?-1:1}return 0}
function minecraftConstraintMatches(version:string,constraint:string|null):boolean|null{if(!constraint||!/^\d+\.\d+(?:\.\d+)?$/.test(version))return null;let c=constraint.trim().replace(/^['"]|['"]$/g,'');if(!c||c==='*')return null;if(/^\d+\.\d+(?:\.\d+)?$/.test(c))return compareVersions(version,c)===0;if(/^\d+\.\d+\.(?:x|\*)$/i.test(c))return version.split('.').slice(0,2).join('.')===c.split('.').slice(0,2).join('.');let m=c.match(/^>=(\d+\.\d+(?:\.\d+)?)/);if(m&&compareVersions(version,m[1])<0)return false;m=c.match(/<=\s*(\d+\.\d+(?:\.\d+)?)/);if(m&&compareVersions(version,m[1])>0)return false;m=c.match(/^([[(])(\d+\.\d+(?:\.\d+)?)?\s*,\s*(\d+\.\d+(?:\.\d+)?)?([\])])$/);if(m){if(m[2]){const d=compareVersions(version,m[2]);if(d<0||(d===0&&m[1]==='('))return false}if(m[3]){const d=compareVersions(version,m[3]);if(d>0||(d===0&&m[4]===')'))return false}return true}if(c.includes('||')){const parts:boolean[]=c.split('||').map(x=>minecraftConstraintMatches(version,x.trim())).filter((x):x is boolean=>x!==null);return parts.length?parts.some(Boolean):null}return null}
async function jarAddonMetadata(abs:string,category:string,serverLoader:string,mcVersion:string){
  const listing=await runCapture('unzip',['-Z1',abs],DATA_DIR).catch(()=> '')
  const list=listing.split(/\r?\n/).map(x=>x.toLowerCase())
  const has=(x:string)=>list.includes(x.toLowerCase())
  let jarType='unknown',version:string|null=null,name:string|null=null,addonId:string|null=null,minecraftConstraint:string|null=null,environment:string|null=null
  let requiredDependencies:string[]=[]
  if(has('plugin.yml')||has('paper-plugin.yml')){
    jarType='plugin';const text=await jarText(abs,has('plugin.yml')?'plugin.yml':'paper-plugin.yml');version=yamlScalar(text,'version');name=yamlScalar(text,'name');addonId=normalizeAddonId(name||basename(abs).replace(/\.jar$/i,''));requiredDependencies=yamlList(text,'depend');minecraftConstraint=yamlScalar(text,'api-version')
  }else if(has('fabric.mod.json')){
    jarType='fabric-mod';try{const meta=JSON.parse(await jarText(abs,'fabric.mod.json')) as Record<string,any>;version=typeof meta.version==='string'?meta.version:null;name=typeof meta.name==='string'?meta.name:null;addonId=typeof meta.id==='string'?normalizeAddonId(meta.id):null;environment=typeof meta.environment==='string'?meta.environment:null;const deps=meta.depends&&typeof meta.depends==='object'?meta.depends:{};minecraftConstraint=typeof deps.minecraft==='string'?deps.minecraft:Array.isArray(deps.minecraft)?String(deps.minecraft[0]||''):null;requiredDependencies=Object.keys(deps).map(normalizeAddonId).filter(x=>!['minecraft','java','fabricloader','fabric-api'].includes(x))}catch{}
  }else if(has('meta-inf/neoforge.mods.toml')||has('meta-inf/mods.toml')){
    jarType=has('meta-inf/neoforge.mods.toml')?'neoforge-mod':'forge-mod';const path=jarType==='neoforge-mod'?'META-INF/neoforge.mods.toml':'META-INF/mods.toml';const text=await jarText(abs,path);const mods=text.split('[[mods]]')[1]?.split(/\[\[dependencies\./i)[0]||text;const idm=mods.match(/^\s*modId\s*=\s*["']([^"']+)["']/mi);const vm=mods.match(/^\s*version\s*=\s*["']([^"']+)["']/mi);const nm=mods.match(/^\s*displayName\s*=\s*["']([^"']+)["']/mi);addonId=idm?normalizeAddonId(idm[1]):null;version=vm?.[1]||null;name=nm?.[1]||addonId;const depBlocks=text.split(/(?=\[\[dependencies\.)/i).slice(1);for(const block of depBlocks){const did=block.match(/^\s*modId\s*=\s*["']([^"']+)["']/mi)?.[1];const mandatory=block.match(/^\s*(?:mandatory|required)\s*=\s*(true|false)/mi)?.[1];if(!did||mandatory==='false')continue;const dep=normalizeAddonId(did);const range=block.match(/^\s*versionRange\s*=\s*["']([^"']+)["']/mi)?.[1]||null;if(dep==='minecraft')minecraftConstraint=range;else if(!['forge','neoforge','java'].includes(dep))requiredDependencies.push(dep)}
  }
  const pluginServer=['paper','purpur','spigot'].includes(serverLoader),modServer=['fabric','forge','neoforge'].includes(serverLoader)
  let compatibility:'compatible'|'incompatible'|'unknown'='unknown';let compatibilityReason='Metadata yetersiz'
  if(jarType==='plugin'){compatibility=pluginServer?'compatible':'incompatible';compatibilityReason=pluginServer?'Plugin loader ile uyumlu':'Bukkit/Paper plugin mod loader sunucusuna ait değil'}
  else if(jarType.endsWith('-mod')){compatibility=modServer?'compatible':'incompatible';compatibilityReason=modServer?'Mod loader ile genel olarak uyumlu':'Mod JAR plugin/vanilla sunucusuna ait değil';if(jarType==='fabric-mod'&&serverLoader!=='fabric'){compatibility='incompatible';compatibilityReason='Fabric modu yalnız Fabric loader içindir'}if(jarType==='forge-mod'&&serverLoader==='neoforge'){compatibility='unknown';compatibilityReason='Forge/NeoForge uyumluluğu mod sürümüne göre doğrulanmalıdır'}if(jarType==='neoforge-mod'&&serverLoader!=='neoforge'){compatibility='incompatible';compatibilityReason='NeoForge modu NeoForge loader gerektirir'}}
  if(category==='plugins'&&jarType.endsWith('-mod')){compatibility='incompatible';compatibilityReason='Mod JAR plugins/ klasöründe'}
  if(category==='mods'&&jarType==='plugin'){compatibility='incompatible';compatibilityReason='Plugin JAR mods/ klasöründe'}
  if(environment==='client'){compatibility='incompatible';compatibilityReason='Fabric modu yalnız istemci (client) ortamı için işaretlenmiş'}
  const mcMatch=minecraftConstraintMatches(mcVersion,minecraftConstraint);if(mcMatch===false){compatibility='incompatible';compatibilityReason=`Minecraft ${mcVersion}, bildirilen sürüm aralığıyla uyumsuz (${minecraftConstraint})`}
  return{jarType,name,addonId,version,serverLoader,mcVersion,minecraftConstraint,environment,requiredDependencies:[...new Set(requiredDependencies)],compatibility,compatibilityReason}
}
async function addonSecurity(id:string,previousHashes:Record<string,string>={}){
  const inventory=await managedContentInventory(id);const serverMeta=JSON.parse(await readFile(join(serverDir(id),'blockctrl.json'),'utf8').catch(()=> '{}')) as Record<string,unknown>;const serverLoader=String(serverMeta.loader||'unknown').toLowerCase();const mcVersion=String(serverMeta.version||serverMeta.mcVersion||'unknown');const addons:any[]=[];const hashes:Record<string,string>={};const duplicate=new Map<string,string[]>();let brokenJars=0
  for(const item of inventory){const category=String(item.category||'');if(!['mods','plugins'].includes(category))continue;const rel=String(item.path||'');const abs=safePath(id,rel);const sha=await hashPath(abs);hashes[rel]=sha;const list=duplicate.get(sha)||[];list.push(rel);duplicate.set(sha,list);let ok=true;try{await runCapture('unzip',['-tqq',abs],serverDir(id))}catch{ok=false;brokenJars++}const metadata=ok?await jarAddonMetadata(abs,category,serverLoader,mcVersion):{jarType:'unknown',name:null,addonId:null,version:null,serverLoader,mcVersion,minecraftConstraint:null,environment:null,requiredDependencies:[],compatibility:'unknown',compatibilityReason:'Bozuk JAR'};addons.push({...item,...metadata,sha256:sha,changed:Boolean(previousHashes[rel]&&previousHashes[rel]!==sha),ok})}
  const installed=new Set<string>();for(const a of addons){for(const idv of [a.addonId,a.name&&normalizeAddonId(String(a.name))])if(idv)installed.add(String(idv))}
  let incompatible=0,missingDependencyCount=0
  for(const a of addons){const missing=(Array.isArray(a.requiredDependencies)?a.requiredDependencies:[]).filter((dep:string)=>!installed.has(normalizeAddonId(dep)));a.missingDependencies=missing;if(missing.length){missingDependencyCount+=missing.length;a.compatibility='incompatible';a.compatibilityReason=`Eksik zorunlu bağımlılık: ${missing.join(', ')}`}if(a.compatibility==='incompatible')incompatible++}
  const duplicateGroups=[...duplicate.values()].filter(x=>x.length>1);return{addons,hashes,brokenJars,incompatible,missingDependencyCount,duplicateHashes:duplicateGroups.length,duplicateGroups,serverLoader,mcVersion}
}
































































async function clamScanServer(id:string){const has=await runCapture('bash',['-lc','command -v clamscan || true'],DATA_DIR).catch(()=> '');if(!has.trim())return{available:false,engine:null,status:'unavailable',infected:false,infectedFiles:[]};const roots=['mods','plugins','config','resourcepacks','uploads'].map(x=>safePath(id,x)).filter(existsSync);if(!roots.length)return{available:true,engine:'ClamAV',status:'clean',infected:false,infectedFiles:[]};return new Promise<Record<string,unknown>>((ok)=>{const child=spawn(has.trim(),['--recursive=yes','--infected','--no-summary','--max-filesize=512M','--max-scansize=2G',...roots],{stdio:['ignore','pipe','pipe']});let output='';let finished=false;let timer:NodeJS.Timeout;const done=(result:Record<string,unknown>)=>{if(finished)return;finished=true;if(timer)clearTimeout(timer);ok(result)};child.stdout.on('data',d=>{if(output.length<200000)output+=d.toString()});child.stderr.on('data',d=>{if(output.length<200000)output+=d.toString()});child.on('error',e=>done({available:true,engine:'ClamAV',status:'error',infected:false,infectedFiles:[],error:e.message}));child.on('exit',code=>{const infectedFiles=output.split(/\r?\n/).filter(x=>/\sFOUND\s*$/i.test(x)).map(x=>x.replace(/:\s+.*\sFOUND\s*$/i,'').trim()).slice(0,200).map(x=>relative(serverDir(id),x).replaceAll('\\','/'));done(code===0?{available:true,engine:'ClamAV',status:'clean',infected:false,infectedFiles}:code===1?{available:true,engine:'ClamAV',status:'infected',infected:true,infectedFiles}:{available:true,engine:'ClamAV',status:'error',infected:false,infectedFiles,detail:output.slice(-4000)})});timer=setTimeout(()=>{child.kill('SIGKILL');done({available:true,engine:'ClamAV',status:'timeout',infected:false,infectedFiles:[]})},180000)})}
async function permissionSecurity(id:string){const targets=['server.properties','ops.json','whitelist.json','banned-ips.json','banned-players.json','config','mods','plugins','resourcepacks'];let checked=0,worldWritable=0;const problems:string[]=[];for(const rel of targets){const path=safePath(id,rel);const info=await stat(path).catch(()=>null);if(!info)continue;checked++;if((info.mode&0o002)!==0){worldWritable++;problems.push(rel)}}return{checked,worldWritable,problems}}
async function suspiciousFileSummary(id:string){let symlinks=0,riskyFiles=0,checked=0;const riskyExt=new Set(['.exe','.dll','.bat','.cmd','.ps1','.vbs','.scr','.sh']);async function walk(base:string,depth:number){if(depth>5||checked>6000)return;let entries:any[]=[];try{entries=await readdir(safePath(id,base),{withFileTypes:true,encoding:'utf8'})}catch{return}for(const e of entries){if(checked++>6000)break;const rel=join(base,e.name).replaceAll('\\','/');if(e.isSymbolicLink?.()){symlinks++;continue}if(e.isDirectory?.())await walk(rel,depth+1);else if(riskyExt.has(extensionOf(e.name)))riskyFiles++}}for(const root of ['mods','plugins','config','resourcepacks','uploads'])await walk(root,0);await mkdir(quarantineRoot(id),{recursive:true});const malwareEngine=await runCapture('bash',['-lc','command -v clamscan >/dev/null 2>&1 && echo ClamAV || true'],DATA_DIR).catch(()=> '');return{symlinks,riskyFiles,quarantineReady:true,quarantine:await listQuarantine(id),malwareEngine:malwareEngine||null,hashing:true}}
async function backupSecurity(id:string){let entries:any[]=[];try{entries=await readdir(backupRoot(),{withFileTypes:true,encoding:'utf8'})}catch{}let latest:Date|null=null;for(const e of entries){if(!e.isFile?.()||!e.name.startsWith(`${id}-`))continue;const info=await stat(join(backupRoot(),e.name)).catch(()=>null);if(info&&(!latest||info.mtime>latest))latest=info.mtime}return{latestAt:latest?.toISOString()||null,recent:Boolean(latest&&Date.now()-latest.getTime()<7*86400_000)}}
async function diskSecurity(id:string){const fs=await statfs(serverDir(id));const total=Number(fs.blocks)*Number(fs.bsize),free=Number(fs.bavail)*Number(fs.bsize);return{totalBytes:total,freeBytes:free,freePercent:total?Math.round(free/total*100):0}}
async function securitySnapshot(id:string,mode='status',serverPort?:number,previousHashes:Record<string,string>={}){if(!validServerId(id))throw new Error('Geçersiz serverId');const raw=await readFile(join(serverDir(id),'server.properties'),'utf8').catch(()=> '');const props=parsePropertiesText(raw);const mcPort=Number(props['server-port']||serverPort||25565);const properties={onlineMode:props['online-mode']!=='false',whitelist:props['white-list']==='true'||props['enforce-whitelist']==='true',rconEnabled:props['enable-rcon']==='true',queryEnabled:props['enable-query']==='true',serverPort:mcPort,queryPort:Number(props['query.port']||mcPort),rconPort:Number(props['rcon.port']||25575)};const caps=['security-scan','archive-safety','content-hash','quarantine'];if(existsSync(SECURITY_HELPER))caps.push('security-helper','ip-cidr','firewall-ip-rules','connection-rate-limit','auth-bruteforce','bot-burst-protection');if(IP_REPUTATION_URL)caps.push('ip-reputation');const anti=await anticheatStatus(id);if(anti.configurable)caps.push('anticheat-config');const xrayProtection=await paperAntiXrayStatus(id);if(xrayProtection.supported)caps.push('xray-native','xray-config');const base:any={scannedAt:new Date().toISOString(),capabilities:caps,properties,antiCheat:anti,xrayProtection};if(mode==='anticheat')return base;if(mode==='xray'||mode==='full'){base.xrayAnalytics=await xrayMiningAnalytics(id);if(mode==='xray')return base;}if(mode==='sftp'||mode==='status'||mode==='full'){try{base.sftp=await sftpHelper('status',id)}catch(error){base.sftp={ready:false,error:error instanceof Error?error.message:'SFTP durumu alınamadı'}}if(mode==='sftp')return base}if(mode==='ports'||mode==='status'||mode==='full'){Object.assign(base,await listeningPorts(props,mcPort));base.firewall=await firewallStatus();if(existsSync(SECURITY_HELPER)){try{base.networkProtection=await securityHelper('status',String(mcPort))}catch(error){base.networkProtection={ready:false,error:error instanceof Error?error.message:'helper status failed'}}}if(mode==='ports')return base}if(mode==='files'||mode==='full'){const fileSummary=await suspiciousFileSummary(id);const addon=await addonSecurity(id,previousHashes);const malware=await clamScanServer(id);const permissions=await permissionSecurity(id);base.fileSecurity={...fileSummary,malware,permissions,brokenJars:addon.brokenJars,duplicateHashes:addon.duplicateHashes,incompatibleAddons:addon.incompatible,missingDependencies:addon.missingDependencyCount};base.addons=addon.addons;base.hashes=addon.hashes;base.findings=[];if(fileSummary.symlinks)base.findings.push({severity:'high',source:'files',title:'Symlink bulundu',message:`Yönetilen içerik dizinlerinde ${fileSummary.symlinks} symlink bulundu.`});if(fileSummary.riskyFiles)base.findings.push({severity:'high',source:'files',title:'Riskli dosya uzantısı',message:`Yönetilen dizinlerde ${fileSummary.riskyFiles} çalıştırılabilir/riskli dosya bulundu.`});if(Array.isArray((malware as any).infectedFiles)&&(malware as any).infectedFiles.length)base.findings.push({severity:'critical',source:'files',title:'Zararlı dosya tespit edildi',message:`ClamAV ${(malware as any).infectedFiles.length} dosyayı şüpheli/zararlı olarak işaretledi.`});if(permissions.worldWritable)base.findings.push({severity:'high',source:'files',title:'Güvensiz dosya izinleri',message:`${permissions.worldWritable} kritik dosya/dizin herkes tarafından yazılabilir (world-writable).`});if(addon.brokenJars)base.findings.push({severity:'high',source:'files',title:'Bozuk JAR bulundu',message:`${addon.brokenJars} JAR arşiv doğrulamasından geçmedi.`});if(addon.incompatible)base.findings.push({severity:'high',source:'files',title:'Uyumsuz mod/plugin bulundu',message:`${addon.incompatible} JAR sunucu loader, Minecraft sürümü, hedef klasörü veya bağımlılıklarıyla uyumsuz görünüyor.`});if(addon.missingDependencyCount)base.findings.push({severity:'high',source:'files',title:'Eksik mod/plugin bağımlılığı',message:`${addon.missingDependencyCount} zorunlu dependency sunucuda bulunamadı.`});if(addon.duplicateHashes)base.findings.push({severity:'medium',source:'files',title:'Duplicate JAR içeriği',message:`${addon.duplicateHashes} aynı SHA-256 içeriğe sahip JAR grubu bulundu.`});const changed=addon.addons.filter((x:any)=>x.changed);if(changed.length)base.findings.push({severity:'medium',source:'files',title:'Mod/plugin hash değişikliği',message:`${changed.length} mod/plugin önceki taramadan farklı SHA-256 değerine sahip.`});if(mode==='files')return base}if(mode==='status')return base;base.backups=await backupSecurity(id);base.disk=await diskSecurity(id);return base}
async function securityModuleAction(id:string,key:string,enabled:boolean,serverPort:number){if(key==='premium-auth'){await patchProperties(id,{'online-mode':enabled?'true':'false'});return{applied:true,key,enabled}}if(key==='whitelist'){await patchProperties(id,{'white-list':enabled?'true':'false','enforce-whitelist':enabled?'true':'false'});return{applied:true,key,enabled}}if(key==='rcon-protection'){if(!enabled)throw new Error('RCON korumasını kapatmak RCON şifresi ve ayrı güvenli yapılandırma gerektirir; Ağ / Portlar bölümünden yapılandırın.');await patchProperties(id,{'enable-rcon':'false'});return{applied:true,key,enabled:true}}if(key==='sftp-protection'){if(enabled){await ensureSftpServerRoot(id);await sftpHelper('enable',id)}else await sftpHelper('disable',id);return{applied:true,key,enabled}}if(key==='rate-limit'){const op=enabled?'rate-limit-enable':'rate-limit-disable';return securityHelper(op,String(serverPort))}if(key==='bruteforce')throw new Error('Minecraft giriş brute-force koruması için sunucu içi auth/fail2ban entegrasyonu gerekli; UFW connection limit brute-force olarak gösterilmez');if(key==='anticheat'){const status=await anticheatStatus(id);if(!status.available||!status.configurable)throw new Error('Panelden aç/kapat yalnız BlockCtrl AntiCheat entegrasyonunda destekleniyor');if(isServerRunningKnown(id))throw new Error('Anti-cheat aç/kapat için sunucuyu durdurun');const abs=safePath(id,String(status.path));if(enabled&&/\.disabled$/i.test(abs)){await rename(abs,abs.replace(/\.disabled$/i,''));return{applied:true,enabled:true}}if(!enabled&&!/\.disabled$/i.test(abs)){await rename(abs,`${abs}.disabled`);return{applied:true,enabled:false}}return{applied:true,enabled}}throw new Error('Bu koruma modülü agent üzerinde uygulanabilir değil; entegrasyon gerekli')}
































































































































const SETTINGS_SAFE_PROPERTIES = new Set([
  'motd','max-players','gamemode','difficulty','hardcore','pvp','allow-flight','white-list','online-mode','force-gamemode',
  'spawn-protection','enable-command-block','allow-nether','spawn-animals','spawn-monsters','spawn-npcs','generate-structures',
  'view-distance','simulation-distance','player-idle-timeout','max-world-size','entity-broadcast-range-percentage','function-permission-level',
  'op-permission-level','hide-online-players','enforce-whitelist','enforce-secure-profile','accepts-transfers','enable-status','resource-pack',
  'resource-pack-sha1','require-resource-pack','resource-pack-prompt','server-ip','query.port','enable-query','enable-rcon','rcon.port',
  'broadcast-rcon-to-ops','network-compression-threshold','rate-limit','level-name','level-seed','level-type','spawn-radius','max-tick-time',
  'server-port',
])
async function javaRuntimeStatus(id:string){
  let binary='java'
  const pid=await validatedManagedPid(id)
  if(pid){try{binary=await realpath(`/proc/${pid}/exe`)}catch{}}
  if(binary==='java'){try{binary=(await runCapture('bash',['-lc','command -v java'],DATA_DIR)).split(/\r?\n/)[0]?.trim()||'java'}catch{}}
  let raw=''
  try{raw=await runCapture(binary,['-version'],serverDir(id))}catch(error){raw=error instanceof Error?error.message:''}
  const version=raw.match(/version\s+"([^"]+)"/i)?.[1]??raw.match(/openjdk\s+([^\s]+)/i)?.[1]??null
  const major=version?Number((version.startsWith('1.')?version.split('.')[1]:version.split(/[.+-]/)[0]))||null:null
  const vendor=/temurin|adoptium/i.test(raw)?'Eclipse Temurin':/corretto/i.test(raw)?'Amazon Corretto':/graalvm/i.test(raw)?'GraalVM':/openjdk/i.test(raw)?'OpenJDK':null
  return {binary,version,major,vendor,runningPid:pid,raw:raw.split(/\r?\n/).slice(0,3).join(' · ').slice(0,500)}
}
































async function settingsStatus(id:string,includeOptimizationMods=false){
  if(!validServerId(id))throw new Error('Geçersiz serverId')
  const root=serverDir(id)
  const info=await stat(root).catch(()=>null)
  if(!info?.isDirectory())throw new Error('Sunucu klasörü bulunamadı')
  const raw=await readFile(join(root,'server.properties'),'utf8').catch(()=> '')
  const parsed=parsePropertiesText(raw)
  const properties:Record<string,string>={}
  for(const [key,value] of Object.entries(parsed))if(SETTINGS_SAFE_PROPERTIES.has(key))properties[key]=value
  let meta:Record<string,unknown>={}
  try{
    const parsedMeta=JSON.parse(await readFile(join(root,'blockctrl.json'),'utf8')) as Record<string,unknown>
    meta={
      loader:String(parsedMeta.loader??''),
      version:String(parsedMeta.version??''),
      loaderVersion:String(parsedMeta.loaderVersion??''),
      memoryMb:Number(parsedMeta.memoryMb)||undefined,
    }
  }catch{}
  const javaRuntime=await javaRuntimeStatus(id)
  const performance=await performanceStatus(await safePath(id,'server.properties'),join(DATA_DIR,'performance-backups',id+'.json')).catch(error=>({version:1,error:error instanceof Error?error.message:'Performans bilgisi alinamadi'}))
  const runtimeOptimization=await runtimeOptimizationStatus(root,join(DATA_DIR,'runtime-optimization',id+'.json'),Number(meta.memoryMb)||4096,javaRuntime.runningPid).catch(error=>({version:2,error:error instanceof Error?error.message:'Optimizasyon okunamadi'}))
  const optimizationMods=includeOptimizationMods?await optimizationModStatus(root,join(DATA_DIR,'optimization-mods',id+'.json'),String(meta.loader??'').toLowerCase(),String(meta.version??'')):undefined
  return {ready:true,running:isServerRunningKnown(id),properties,meta,javaRuntime,performance,runtimeOptimization,optimizationMods,readAt:new Date().toISOString()}
}
































































































































async function tailTextLines(path:string,limit=240,maxBytes=512*1024){
  const info=await stat(path).catch(()=>null);if(!info?.isFile())return [] as string[]
  const bytes=Math.min(maxBytes,info.size);if(bytes<=0)return []
  const handle=await open(path,'r')
  try{
    const buffer=Buffer.alloc(bytes);await handle.read(buffer,0,bytes,Math.max(0,info.size-bytes))
    const text=buffer.toString('utf8');const lines=text.split(/\r?\n/).filter(Boolean)
    return lines.slice(-Math.max(1,Math.min(limit,1000))).map(line=>line.slice(0,16000))
  }finally{await handle.close()}
}
function parseProcStatus(raw:string){
  const pick=(key:string)=>raw.match(new RegExp(`^${key}:\\s+(.+)$`,'m'))?.[1]?.trim()??null
  return {name:pick('Name'),state:pick('State'),vmRss:pick('VmRSS'),vmSize:pick('VmSize'),threads:Number((pick('Threads')??'').match(/\d+/)?.[0]??0)||null}
}
































































async function listCrashReports(serverId:string){
  if(!validServerId(serverId))throw new Error('Geçersiz serverId')
  const dir=join(serverDir(serverId),'crash-reports');const entries=await readdir(dir,{withFileTypes:true}).catch(()=>[])
  const rows=[] as Array<Record<string,unknown>>
  for(const entry of entries){
    if(!entry.isFile()||!/\.txt$/i.test(entry.name))continue
    const path=join(dir,entry.name);const info=await stat(path).catch(()=>null);if(!info)continue
    const tail=await tailTextLines(path,40,128*1024)
    rows.push({name:entry.name,sizeBytes:info.size,modifiedAt:info.mtime.toISOString(),tail})
  }
  return rows.sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt))).slice(0,30)
}
async function exportServerLogs(serverId:string){
  if(!validServerId(serverId))throw new Error('Geçersiz serverId')
  const root=serverDir(serverId);const candidates=['.blockctrl-stdout.log','.blockctrl-stderr.log','logs','crash-reports'].filter(name=>existsSync(join(root,name)))
  if(!candidates.length)throw new Error('Dışa aktarılacak log bulunamadı')
  const name=`blockctrl-logs-${new Date().toISOString().replace(/[:.]/g,'-')}.tar.gz`;const target=safePath(serverId,name)
  await run('tar',['-czf',target,'-C',root,...candidates],root)
  const info=await stat(target)
  const token=await createDownloadToken(target,name,true)
  return {path:name,sizeBytes:info.size,items:candidates,createdAt:new Date().toISOString(),...token}
}
async function consoleDiagnostics(serverId:string){
  if(!validServerId(serverId))throw new Error('Geçersiz serverId')
  const root=serverDir(serverId);const info=await stat(root).catch(()=>null);if(!info?.isDirectory())throw new Error('Sunucu klasörü bulunamadı')
  const pid=await validatedManagedPid(serverId);const running=!!pid
  const [stdout,stderr,procStatus,fdRows,fs]=await Promise.all([
    tailTextLines(join(root,'.blockctrl-stdout.log'),220),
    tailTextLines(join(root,'.blockctrl-stderr.log'),120),
    pid?readFile(`/proc/${pid}/status`,'utf8').catch(()=> ''):Promise.resolve(''),
    pid?readdir(`/proc/${pid}/fd`).catch(()=> [] as string[]):Promise.resolve([] as string[]),
    statfs(DATA_DIR).catch(()=>null),
  ])
  let diskUsedGb:number|null=null,diskTotalGb:number|null=null
  if(fs){const total=Number(fs.blocks)*Number(fs.bsize);const free=Number(fs.bavail)*Number(fs.bsize);diskTotalGb=Number((total/1073741824).toFixed(2));diskUsedGb=Number(((total-free)/1073741824).toFixed(2))}
  const runtime=await validatedRuntimeTracking(serverId,await readServerMeta(serverId))
  const meta=runtime.meta
  const memoryUsedMb=Math.round((totalmem()-freemem())/1048576),memoryTotalMb=Math.round(totalmem()/1048576)
  const controlChannelReady=running&&existsSync(join(root,'.blockctrl-stdin'))
  const pstatus=procStatus?parseProcStatus(procStatus):null
  const events=agentEventBuffer.filter(event=>event.serverId===serverId).slice(-250)
  return {
    at:new Date().toISOString(),
    events,
    startup:{stdout,stderr},
    node:{
      hostname:hostname(),agentPid:process.pid,nodeVersion:process.version,agentUptimeSeconds:Math.round(process.uptime()),
      systemUptimeSeconds:Math.round(osUptime()),cpuCount:cpus().length,loadAverage:loadavg().map(v=>Number(v.toFixed(2))),
      memoryUsedMb,memoryTotalMb,diskUsedGb,diskTotalGb,
    },
    server:{
      running,pid:pid??null,controlChannelReady,process:pstatus,openFileDescriptors:pid?fdRows.length:null,
      stdoutBytes:(await stat(join(root,'.blockctrl-stdout.log')).catch(()=>null))?.size??0,
      stderrBytes:(await stat(join(root,'.blockctrl-stderr.log')).catch(()=>null))?.size??0,
      loader:String(meta.loader??runtime.loader??''),version:String(meta.version??''),memoryMb:Number(meta.memoryMb)||null,
      trackingMode:runtime.mode,
    },
  }
}
































































function runProcess(program:string,args:string[],cwd:string){return new Promise<void>((resolveProcess,reject)=>{const child=spawn(program,args,{cwd,stdio:'pipe'});let output='';child.stdout?.on('data',chunk=>output+=String(chunk));child.stderr?.on('data',chunk=>output+=String(chunk));child.on('error',reject);child.on('exit',code=>code===0?resolveProcess():reject(new Error(`${program} exited ${code}: ${output.slice(-2000)}`)))})}
async function listBackups(id:string){
  if(!validServerId(id))throw new Error('Geçersiz serverId')
  const rows:Array<Record<string,unknown>>=[]
  const globalRoot=resolve(DATA_DIR,'backups')
  for(const entry of await readdir(globalRoot,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[])){
    if(!entry.isFile()||!entry.name.startsWith(`${id}-`)||!(/\.(tar\.gz|tgz|zip|gz)$/i.test(entry.name)))continue
    const full=join(globalRoot,entry.name);const info=await stat(full).catch(()=>null)
    if(info)rows.push({path:entry.name,name:entry.name,sizeBytes:info.size,createdAt:info.birthtime.toISOString(),modifiedAt:info.mtime.toISOString(),source:'node-backup-root',status:'completed',type:entry.name.includes('-scheduled-')?'scheduled':'manual',restorable:true})
  }
  const serverRoot=serverDir(id)
  for(const folder of ['backups','backup']){
    const dir=join(serverRoot,folder)
    for(const entry of await readdir(dir,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[])){
      if(!entry.isFile()||!(/\.(tar\.gz|tgz|zip|gz)$/i.test(entry.name)))continue
      const full=join(dir,entry.name);const info=await stat(full).catch(()=>null)
      if(info)rows.push({path:`${folder}/${entry.name}`,name:entry.name,sizeBytes:info.size,createdAt:info.birthtime.toISOString(),modifiedAt:info.mtime.toISOString(),source:'server-backup-folder',status:'completed',type:'external',restorable:false})
    }
  }
  const seen=new Set<string>()
  const backups=rows.filter(row=>{const key=String(row.path??row.name??'');if(!key||seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>Date.parse(String(b.modifiedAt??b.createdAt??''))-Date.parse(String(a.modifiedAt??a.createdAt??'')))
  return{backups,source:'agent-backup-disk-scan',scannedAt:new Date().toISOString()}
}
async function createBackup(id:string,label='manual',kind='full'){if(!validServerId(id))throw new Error('Geçersiz serverId');if(isServerRunningKnown(id))throw new Error('Yedek için sunucuyu tamamen durdurun');const source=serverDir(id);const root=resolve(DATA_DIR,'backups');await mkdir(root,{recursive:true});const safeLabel=label.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,40)||'manual';const target=join(root,`${id}-${Date.now()}-${safeLabel}.tar.gz`);const entries=kind==='world'?['world','world_nether','world_the_end']:kind==='config'?['server.properties','whitelist.json','ops.json','banned-players.json','banned-ips.json']:kind==='addons'?['mods','plugins']:['.'];await runProcess('tar',['-czf',target,'--exclude=.blockctrl-pid','-C',source,...entries],DATA_DIR);const info=await stat(target);return{path:basename(target),name:basename(target),sizeBytes:info.size,createdAt:info.birthtime.toISOString(),modifiedAt:info.mtime.toISOString(),source:'node-agent',status:'completed',type:safeLabel==='scheduled'?'scheduled':'manual'}}
async function fullDiskInventory(id:string){
  if(!validServerId(id))throw new Error('Geçersiz serverId')
  const root=serverDir(id);const rows:Array<Record<string,unknown>>=[];const ignored=new Set(['.blockctrl-stdin','.blockctrl-pid','.blockctrl-stdout.log','.blockctrl-stderr.log','.downloads','uploads'])
  const category=(path:string)=>{const top=path.split('/')[0].toLowerCase();if(top==='mods')return 'mods';if(top==='plugins')return 'plugins';if(top==='config')return 'config';if(top==='resourcepacks')return 'resourcepacks';if(top==='backups')return 'backups';if(top==='logs')return 'logs';if(top==='world'||top==='world_nether'||top==='world_the_end'||top.endsWith('_nether')||top.endsWith('_the_end'))return 'worlds';return 'server-files'}
  async function walk(current:string,relativePath:string,depth:number){if(depth>8||rows.length>=5000)return;let entries:any[]=[];try{entries=await readdir(current,{withFileTypes:true,encoding:'utf8'})}catch{return}for(const entry of entries){if(rows.length>=5000||entry.isSymbolicLink?.()||ignored.has(entry.name)||entry.name.includes('.bak-'))continue;const rel=relativePath?`${relativePath}/${entry.name}`:entry.name;const full=safePath(id,rel);const info=await stat(full).catch(()=>null);if(!info)continue;const directory=entry.isDirectory();rows.push({name:entry.name,path:rel,type:directory?'Folder':'File',category:category(rel),directory,sizeBytes:directory?0:info.size,modifiedAt:info.mtime.toISOString(),permissions:(info.mode&0o777).toString(8),editable:!directory&&isEditableContentPath(rel),source:'disk'});if(directory)await walk(full,rel,depth+1)}}
  await walk(root,'',0);rows.sort((a,b)=>String(a.path).localeCompare(String(b.path),'tr'));return{items:rows,scannedAt:new Date().toISOString(),truncated:rows.length>=5000,source:'agent-disk-scan'}
}
async function discoverWorlds(id:string){
  if(!validServerId(id))throw new Error('Geçersiz serverId')
  const root=serverDir(id)
  const ignored=new Set(['mods','plugins','config','logs','backups','crash-reports','libraries','versions','resourcepacks','shaderpacks','uploads','.downloads'])
  const properties=await readFile(join(root,'server.properties'),'utf8').catch(()=> '')
  const props:Record<string,string>={}
  for(const line of properties.split(/\\r?\\n/)){const trimmed=line.trim();if(!trimmed||trimmed.startsWith('#'))continue;const separator=trimmed.indexOf('=');if(separator>0)props[trimmed.slice(0,separator).trim()]=trimmed.slice(separator+1).trim()}
  const defaultName=props['level-name']||'world'
  async function folderSize(path:string,depth=0):Promise<number>{if(depth>10)return 0;const info=await stat(path).catch(()=>null);if(!info)return 0;if(info.isFile())return info.size;let total=0;for(const entry of await readdir(path,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[])){if(entry.isSymbolicLink?.())continue;total+=await folderSize(join(path,entry.name),depth+1)}return total}
  const entries=await readdir(root,{withFileTypes:true,encoding:'utf8'}).catch(()=>[] as any[]);const worlds=[]
  for(const entry of entries){if(!entry.isDirectory()||entry.isSymbolicLink?.()||ignored.has(entry.name)||!validServerId(id))continue;const worldPath=join(root,entry.name);const level=await stat(join(worldPath,'level.dat')).catch(()=>null);const region=await stat(join(worldPath,'region')).catch(()=>null);if(!level&&!region)continue;const bytes=await folderSize(worldPath);const lower=entry.name.toLowerCase();const environment=lower.endsWith('_nether')||lower==='nether'?'the_nether':lower.endsWith('_the_end')||lower==='end'?'the_end':'overworld';worlds.push({name:entry.name,folderName:entry.name,environment,sizeMb:Number((bytes/1024/1024).toFixed(2)),sizeBytes:bytes,seed:props['level-seed']||null,isActive:entry.name===defaultName,defaultWorld:entry.name===defaultName,prepared:false,hasLevelDat:!!level,modifiedAt:(await stat(worldPath)).mtime.toISOString(),source:'agent-disk-scan'})}
  worlds.sort((a,b)=>Number(b.isActive)-Number(a.isActive)||a.name.localeCompare(b.name,'tr'));return{worlds,defaultWorld:defaultName,properties:{'level-name':defaultName,'level-seed':props['level-seed']||null},scannedAt:new Date().toISOString(),source:'agent-disk-scan'}
}
function startDownloadBridge(){const port=Number(process.env.AGENT_DOWNLOAD_PORT??8789);const host=process.env.AGENT_DOWNLOAD_HOST??'0.0.0.0';createServer(async(req,res)=>{const url=new URL(req.url??'/','http://127.0.0.1');if(req.method==='GET'&&url.pathname.startsWith('/public/download/')){await cleanupExpiredDownloads();const publicToken=decodeURIComponent(url.pathname.slice('/public/download/'.length));const meta=downloadTokens.get(publicToken);if(!meta||meta.expiresAt<=Date.now()){res.writeHead(404,{'cache-control':'no-store'}).end('Download expired or not found');return}const info=await stat(meta.path).catch(()=>null);if(!info?.isFile()){downloadTokens.delete(publicToken);res.writeHead(404,{'cache-control':'no-store'}).end('File not found');return}res.writeHead(200,{'content-type':'application/octet-stream','content-length':String(info.size),'content-disposition':`attachment; filename="${cleanDownloadFilename(meta.filename)}"`,'cache-control':'private, no-store'});createReadStream(meta.path).pipe(res);return}const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');const nodeHeader=String(req.headers['x-node-id']??'');if(token!==NODE_TOKEN||(nodeHeader&&nodeHeader!==NODE_ID)){res.writeHead(401).end();return}
  if(req.method==='GET'&&url.pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({ok:true,nodeId:NODE_ID}));return}
  try{
    if(url.pathname==='/internal/backups/list'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');sendJson(res,200,await listBackups(serverId));return}
    if(url.pathname==='/internal/backups/create'&&req.method==='POST'){const body=await readJsonRequest(req,64*1024);sendJson(res,201,await createBackup(String(body.serverId??''),String(body.label??'manual'),String(body.kind??'full')));return}
    if(url.pathname==='/internal/console/status'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');sendJson(res,200,await consoleDiagnostics(serverId));return}
    if(url.pathname==='/internal/settings/status'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');sendJson(res,200,await settingsStatus(serverId,url.searchParams.get('optimizationMods')==='1'));return}
    if(url.pathname==='/internal/worlds/templates'&&req.method==='GET'){sendJson(res,200,await worldTemplateAvailability());return}
    if(url.pathname==='/internal/worlds/status'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');sendJson(res,200,await discoverWorlds(serverId));return}
    
    if(url.pathname==='/internal/players/status'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');sendJson(res,200,await playersStatus(serverId));return}
    if(url.pathname==='/internal/players/action'&&req.method==='POST'){const body=await readJsonRequest(req,64*1024);const serverId=String(body.serverId??'');sendJson(res,200,await playerAction(serverId,body));return}
    if(url.pathname==='/internal/security/status'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');sendJson(res,200,await securitySnapshot(serverId,'status'));return}
    if(url.pathname==='/internal/security/scan'&&req.method==='POST'){const body=await readJsonRequest(req,512*1024);const serverId=String(body.serverId??'');const mode=String(body.mode??'full');const previousHashes=(body.previousHashes&&typeof body.previousHashes==='object'?body.previousHashes:{}) as Record<string,string>;sendJson(res,200,await securitySnapshot(serverId,mode,Number(body.serverPort)||undefined,previousHashes));return}
    if(url.pathname==='/internal/security/module'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');sendJson(res,200,await securityModuleAction(serverId,String(body.key??''),Boolean(body.enabled),Number(body.serverPort)||25565));return}
    if(url.pathname==='/internal/security/ip-rule'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');const operation=String(body.operation??'');const ruleType=String(body.ruleType??'');const cidr=String(body.cidr??'');const port=Number(body.serverPort)||25565;const expiresAt=body.expiresAt===null||body.expiresAt===undefined?'0':String(Number(body.expiresAt));if(!['add','remove'].includes(operation)||!['allow','deny'].includes(ruleType))throw new Error('Geçersiz IP kuralı');const op=operation==='add'?(ruleType==='deny'?'block-ip':'allow-ip'):(ruleType==='deny'?'unblock-ip':'unallow-ip');sendJson(res,200,await securityHelper(op,cidr,String(port),expiresAt));return}
    if(url.pathname==='/internal/security/anticheat/install'&&req.method==='POST'){const body=await readJsonRequest(req);sendJson(res,200,await installAnticheatIntegration(String(body.serverId??'')));return}
    if(url.pathname==='/internal/security/anticheat/config'&&req.method==='POST'){const body=await readJsonRequest(req,256*1024);sendJson(res,200,await configureAnticheat(String(body.serverId??''),(body.config&&typeof body.config==='object'?body.config:{}) as Record<string,any>));return}
    if(url.pathname==='/internal/security/xray/status'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');sendJson(res,200,await paperAntiXrayStatus(serverId));return}
    if(url.pathname==='/internal/security/xray/config'&&req.method==='POST'){const body=await readJsonRequest(req,128*1024);sendJson(res,200,await configurePaperAntiXray(String(body.serverId??''),(body.config&&typeof body.config==='object'?body.config:{}) as Record<string,any>));return}
    if(url.pathname==='/internal/security/xray/analyze'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');sendJson(res,200,await xrayMiningAnalytics(serverId));return}
    
    if(url.pathname==='/internal/security/quarantine'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');sendJson(res,200,{items:await listQuarantine(serverId)});return}
    if(url.pathname==='/internal/security/quarantine/restore'&&req.method==='POST'){const body=await readJsonRequest(req);sendJson(res,200,await restoreQuarantine(String(body.serverId??''),String(body.token??'')));return}
    if(url.pathname==='/internal/security/quarantine/delete'&&req.method==='POST'){const body=await readJsonRequest(req);sendJson(res,200,await deleteQuarantine(String(body.serverId??''),String(body.token??'')));return}
    if(url.pathname==='/internal/sftp/status'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');await ensureSftpServerRoot(serverId);const status=await sftpHelper('status',serverId);sendJson(res,200,status);return}
    if(url.pathname==='/internal/sftp/provision'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');await ensureSftpServerRoot(serverId);const password=randomBytes(24).toString('base64url');const created=await sftpHelper('create',serverId,undefined,`${password}\n`);const status=await sftpHelper('status',serverId);if(!(status as any).ready)throw new Error('SFTP hesabı oluşturuldu ancak sshd/chroot doğrulaması başarısız');sendJson(res,201,{...created,...status,username:sftpUsername(serverId),password,oneTimePassword:true,rootPath:'/files'});return}
    if(url.pathname==='/internal/sftp/rotate-password'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');await ensureSftpServerRoot(serverId);const password=randomBytes(24).toString('base64url');const rotated=await sftpHelper('rotate-password',serverId,undefined,`${password}\n`);const status=await sftpHelper('status',serverId);if(!(status as any).ready)throw new Error('Parola yenilendi ancak SFTP yapılandırması doğrulanamadı');sendJson(res,200,{...rotated,...status,username:sftpUsername(serverId),password,oneTimePassword:true});return}
    if(url.pathname==='/internal/sftp/enable'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');await ensureSftpServerRoot(serverId);await sftpHelper('enable',serverId);const status=await sftpHelper('status',serverId);if(!(status as any).ready)throw new Error('SFTP etkinleştirildi ancak yapılandırma doğrulanamadı');sendJson(res,200,status);return}
    if(url.pathname==='/internal/sftp/disable'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');const result=await sftpHelper('disable',serverId);sendJson(res,200,result);return}
    if(url.pathname==='/internal/sftp/delete'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');const result=await sftpHelper('delete',serverId);sendJson(res,200,result);return}
    if(url.pathname==='/internal/sftp/sessions'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');const result=await sftpHelper('sessions',serverId);sendJson(res,200,result);return}
    if(url.pathname==='/internal/sftp/sessions/terminate'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');const pid=Number(body.pid);if(!Number.isInteger(pid)||pid<=1)throw new Error('Geçersiz SFTP oturum PID değeri');const result=await sftpHelper('terminate-session',serverId,String(pid));sendJson(res,200,result);return}
    const backupMatch=url.pathname.match(/^\/internal\/backups\/([0-9a-f-]{36})\/download$/i);if(req.method==='GET'&&backupMatch){const requested=req.headers['x-backup-path'];if(typeof requested!=='string'||requested.includes('/')||requested.includes('\\')||requested.includes('..')){res.writeHead(403).end();return}const root=backupRoot();const target=resolve(root,basename(requested));const info=await stat(target);if(!info.isFile()){res.writeHead(403).end();return}const realRoot=await realpath(root);const realTarget=await realpath(target);if(realTarget!==realRoot&&!realTarget.startsWith(`${realRoot}${sep}`)){res.writeHead(403).end();return}res.writeHead(200,{'Content-Type':'application/gzip','Content-Disposition':`attachment; filename="${basename(target)}"`,'Content-Length':String(info.size)});createReadStream(target).pipe(res);return}
    if(req.method==='POST'&&url.pathname==='/internal/uploads/start'){const raw=await readRequestBody(req,64*1024);const body=JSON.parse(raw.toString('utf8')) as Partial<DirectUploadMeta>;const uploadId=String(body.uploadId??'');const commandId=String(body.commandId??'');const serverId=String(body.serverId??'');const filename=basename(String(body.filename??'uploaded-file')).replace(/[^A-Za-z0-9._-]/g,'_');const category=String(body.category??'auto');const size=Number(body.size??0);const totalParts=Number(body.totalParts??0);const chunkSize=Number(body.chunkSize??0);if(!validUploadId(uploadId)||!validUploadId(commandId)||!validUploadId(serverId)||!filename||!['mods','plugins','configs','resource-packs','worlds','auto'].includes(category)||!Number.isFinite(size)||size<=0||size>DIRECT_UPLOAD_MAX||!Number.isInteger(totalParts)||totalParts<1||chunkSize!==DIRECT_UPLOAD_CHUNK_LIMIT||totalParts!==Math.ceil(size/chunkSize))throw new Error('Invalid upload metadata');if(isServerRunningKnown(serverId))throw new Error('Server must be stopped');const dir=directUploadDir(uploadId);await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});const meta:DirectUploadMeta={uploadId,commandId,serverId,filename,category,size,totalParts,chunkSize,createdAt:new Date().toISOString(),lastActivityAt:new Date().toISOString()};await writeFile(join(dir,'meta.json'),JSON.stringify(meta),'utf8');res.writeHead(201,{'content-type':'application/json'}).end(JSON.stringify({ok:true,uploadId}));return}
    const statusMatch=url.pathname.match(/^\/internal\/uploads\/([0-9a-f-]{36})\/status$/i);if(req.method==='GET'&&statusMatch){const uploadId=statusMatch[1];const meta=await readDirectMeta(uploadId);const files=await readdir(directUploadDir(uploadId));const receivedParts=files.filter(name=>/^\d+\.part$/.test(name)).map(name=>Number(name.replace('.part',''))).sort((a,b)=>a-b);const receivedBytes=receivedParts.reduce((sum,part)=>{try{return sum+statSync(join(directUploadDir(uploadId),`${part}.part`)).size}catch{return sum}},0);res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({status:'uploading',receivedParts,totalParts:meta.totalParts,receivedBytes}));return}
    const partMatch=url.pathname.match(/^\/internal\/uploads\/([0-9a-f-]{36})\/(\d+)$/i);if(req.method==='PUT'&&partMatch){const uploadId=partMatch[1];const part=Number(partMatch[2]);const meta=await readDirectMeta(uploadId);if(!Number.isInteger(part)||part<0||part>=meta.totalParts)throw new Error('Invalid part number');const announced=Number(req.headers['content-length']??0);if(announced>meta.chunkSize)throw new Error('Chunk too large');const data=await readRequestBody(req,meta.chunkSize);if(!data.length)throw new Error('Empty chunk');await writeFile(join(directUploadDir(uploadId),`${part}.part`),data);await writeFile(join(directUploadDir(uploadId),'meta.json'),JSON.stringify({...meta,lastActivityAt:new Date().toISOString()}),'utf8');res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true,part,size:data.length}));return}
    const completeMatch=url.pathname.match(/^\/internal\/uploads\/([0-9a-f-]{36})\/complete$/i);if(req.method==='POST'&&completeMatch){const uploadId=completeMatch[1];const dir=directUploadDir(uploadId);try{const{meta,result}=await completeDirectUpload(uploadId);await report({type:'result',commandId:meta.commandId,ok:true,result});res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true,result}));await rm(dir,{recursive:true,force:true});return}catch(error){let commandId='';try{commandId=(await readDirectMeta(uploadId)).commandId}catch{}const message=error instanceof Error?error.message:'Upload failed';const missingParts=message.includes('Eksik veya geçersiz parça')?message.match(/(\d+)/)?.[1]?[Number(message.match(/(\d+)/)?.[1])]:[]:[];if(commandId&&missingParts.length===0)await report({type:'result',commandId,ok:false,result:{error:message}});res.writeHead(409,{'content-type':'application/json'}).end(JSON.stringify({error:message,code:missingParts.length?'UPLOAD_PARTS_MISSING':undefined,missingParts}));return}}
    if(url.pathname==='/internal/addons/install'&&req.method==='POST'){const body=await readJsonRequest(req,2_000_000);const serverId=String(body.serverId??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');if(isServerRunningKnown(serverId))throw new Error('Kurulum için sunucuyu tamamen durdurun');const kind=String(body.kind??'');if(!['mods','plugins'].includes(kind))throw new Error('Geçersiz eklenti türü');const files=Array.isArray(body.files)?body.files:[];if(!files.length||files.length>24)throw new Error('Geçersiz kurulum planı');const results=[];for(const item of files){const filename=basename(String(item?.fileName??'')).replace(/[^A-Za-z0-9._-]/g,'_');const source=String(item?.url??'');if(!filename||!/^https:\/\//i.test(source))throw new Error('Güvenli olmayan indirme kaynağı');const response=await fetch(source,{redirect:'follow',signal:AbortSignal.timeout(120_000)});if(!response.ok)throw new Error(`${filename} indirilemedi (HTTP ${response.status})`);const data=Buffer.from(await response.arrayBuffer());if(data.length===0||data.length>512*1024*1024)throw new Error(`${filename} boyut sınırını aşıyor`);const expected=String(item?.sha1??'').toLowerCase();if(expected&&createHash('sha1').update(data).digest('hex')!==expected)throw new Error(`${filename} SHA-1 doğrulaması başarısız`);const target=safePath(serverId,`${kind}/${filename}`);await mkdir(dirname(target),{recursive:true});if(existsSync(target))await rename(target,`${target}.bak-${Date.now()}`);const temp=`${target}.part-${randomUUID()}`;await writeFile(temp,data);await rename(temp,target);results.push({filename,bytes:data.length,path:`${kind}/${filename}`})}const inventory=await fullDiskInventory(serverId);sendJson(res,200,{ok:true,installed:results,inventory,scannedAt:new Date().toISOString()});return}
    if(url.pathname==='/internal/content/inventory'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');const world=String(url.searchParams.get('world')??'').trim();if(world&&!/^[A-Za-z0-9_-]{1,40}$/.test(world))throw new Error('Geçersiz dünya adı');const inventory=await fullDiskInventory(serverId);sendJson(res,200,{...inventory,world:world||null});return}
    if(url.pathname==='/internal/content/create-file'&&req.method==='POST'){const body=await readJsonRequest(req,2_100_000);const serverId=String(body.serverId??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');sendJson(res,201,await createServerFile(serverId,body));return}
    if(url.pathname==='/internal/content/create-folder'&&req.method==='POST'){const body=await readJsonRequest(req,64*1024);const serverId=String(body.serverId??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');sendJson(res,201,await createServerFolder(serverId,body));return}
    if(url.pathname==='/internal/content/read'&&req.method==='GET'){const serverId=String(url.searchParams.get('serverId')??'');const path=String(url.searchParams.get('path')??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');sendJson(res,200,await readManagedContent(serverId,path));return}
    if(url.pathname==='/internal/content/write'&&req.method==='POST'){const body=await readJsonRequest(req,2_100_000);const serverId=String(body.serverId??'');const path=String(body.path??'');const content=String(body.content??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');sendJson(res,200,await writeManagedContent(serverId,path,content));return}
    if(url.pathname==='/internal/content/delete'&&req.method==='POST'){const body=await readJsonRequest(req);const serverId=String(body.serverId??'');const path=String(body.path??'');if(!validServerId(serverId))throw new Error('Geçersiz serverId');sendJson(res,200,await deleteManagedContent(serverId,path));return}
    res.writeHead(404).end()
  }catch(error){const message=error instanceof Error?error.message:'Request failed';res.writeHead(message.includes('too large')?413:400,{'content-type':'application/json'}).end(JSON.stringify({error:message}))}
}).listen(port,host)}
function normalizeLossItem(serverId:string,input:Record<string,unknown>){const amount=Math.max(1,Math.min(100000,Math.trunc(Number(input.amount)||1)));const coord=(value:unknown)=>Math.trunc(Number.isFinite(Number(value))?Number(value):0);const text=(value:unknown,max:number,fallback='')=>String(value??fallback).trim().slice(0,max);const metadata=input.metadata&&typeof input.metadata==='object'&&!Array.isArray(input.metadata)?input.metadata:{};return{eventId:text(input.eventId,100,randomUUID())||randomUUID(),serverId,playerUuid:input.playerUuid?text(input.playerUuid,40):null,playerName:input.playerName?text(input.playerName,40):null,itemId:text(input.itemId,150,'minecraft:air'),itemName:text(input.itemName,200,text(input.itemId,150,'minecraft:air')),amount,reason:text(input.reason,40,'unknown'),world:text(input.world,100,'minecraft:overworld'),x:coord(input.x),y:coord(input.y),z:coord(input.z),metadata,occurredAt:input.occurredAt?String(input.occurredAt):new Date().toISOString()}}
async function provisionWebsiteAccount(serverId:string,payload:Record<string,unknown>){
  const minecraftUsername=String(payload.minecraftUsername??'').trim().slice(0,32)
  const playerUuid=String(payload.playerUuid??'').trim().slice(0,64)
  const password=String(payload.password??'')
  const email=String(payload.email??'').trim().toLowerCase().slice(0,180)
  if(!/^[A-Za-z0-9_]{3,32}$/.test(minecraftUsername)||password.length<8)throw new Error('Invalid website registration payload')
  const response=await fetch(`${PANEL_URL}/api/site-auth`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${NODE_TOKEN}`,'x-node-id':NODE_ID!,...(SITE_SERVER_BRIDGE_KEY?{'x-blockctrl-server-bridge':SITE_SERVER_BRIDGE_KEY}:{})},body:JSON.stringify({action:'server-provision',serverId,minecraftUsername,playerUuid,name:minecraftUsername,password,email})})
  const text=await response.text()
  let data:Record<string,unknown>={}
  try{data=text?JSON.parse(text) as Record<string,unknown>:{} }catch{data={}}
  if(!response.ok)throw new Error(String(data.error||`Panel website registration failed with HTTP ${response.status}`))
  return data
}
function startTrackerIngest(){createServer((req,res)=>{
  if(req.method!=='POST'||(req.url!=='/item-loss'&&req.url!=='/website-register')){res.writeHead(404).end();return}
  let raw='';let tooLarge=false
  req.on('data',d=>{raw+=d;if(raw.length>100_000){tooLarge=true;req.destroy()}})
  req.on('end',()=>{void (async()=>{try{
    if(tooLarge){res.writeHead(413).end();return}
    const item=JSON.parse(raw) as Record<string,unknown>
    const serverId=String(req.headers['x-blockctrl-server-id']??item.serverId??'')
    if(!/^[0-9a-f-]{36}$/i.test(serverId))throw new Error('server id missing')
    const expected=await trackerTokenFor(serverId);const supplied=String(req.headers['x-blockctrl-tracker-token']??'')
    if(!expected||!safeTokenEqual(expected,supplied)){res.writeHead(401).end();return}
    if(req.url==='/website-register'){
      const result=await provisionWebsiteAccount(serverId,item)
      res.writeHead(201,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(result));return
    }
    const normalized=normalizeLossItem(serverId,item);if(normalized.itemId==='minecraft:air')throw new Error('item id missing')
    itemQueue.push(normalized);if(itemQueue.length>10_000)itemQueue.shift();res.writeHead(202).end()
  }catch(error){
    if(!res.headersSent){const message=error instanceof Error?error.message:'Request failed';res.writeHead(message.includes('already')?409:400,{'content-type':'application/json'}).end(JSON.stringify({error:message}))}
  }})()})
}).listen(8788,'127.0.0.1')}
async function flushItems(){if(!itemQueue.length)return;const batch=itemQueue.slice(0,200);try{await api('POST',{type:'lost-items',items:batch});itemQueue.splice(0,batch.length)}catch(error){agentEvent('error',null,'[agent] item queue flush failed',error)}}
async function loop(){await mkdir(join(DATA_DIR,'servers'),{recursive:true});startTrackerIngest();startDownloadBridge();await heartbeat();setInterval(heartbeat,15000);void reportServerPerformance();setInterval(()=>void reportServerPerformance(),15000);setInterval(flushItems,5000);for(;;){try{const{commands}=await api('GET');for(const command of commands){await execute(command)}}catch(error){agentEvent('error',null,'[agent] poll failed',error)}await new Promise(r=>setTimeout(r,2000))}}
process.on('SIGTERM',()=>{for(const id of processes.keys())stop(id);setTimeout(()=>process.exit(0),35000)});loop().catch(error=>{agentEvent('error',null,error);process.exit(1)})
