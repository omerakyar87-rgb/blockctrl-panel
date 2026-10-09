import { NextRequest, NextResponse } from 'next/server'
import { getPanelActor } from '@/lib/api-auth'
import { and, desc, eq } from 'drizzle-orm'
import { db, ensurePanelSchema } from '@/lib/db'
import { agentCommands, auditLog, serverPermissions, serverSettings, servers } from '@/lib/db/schema'
import { getNodeConfig, nodeFetch, nodeDiagnosticMessage } from '@/lib/node-bridge'
















const SAFE_ACTIONS = new Set([
  'file-inventory','bulk-download','file-create','folder-create','file-rename','file-move','file-copy','file-delete','file-download','folder-download','file-read','file-write','file-permissions','file-bulk-delete','file-bulk-move','upload-retry','upload-history-clear','security-scan','scan-files','scan-mods','scan-plugins','scan-config','scan-zip','jar-metadata','hash-files','quarantine-file','restore-quarantine','delete-quarantine','anticheat-status','anticheat-update','anticheat-configure','login-security-status','network-security-status','firewall-status','port-scan','player-details','player-inventory','player-enderchest','player-history','player-note','player-action','database-backup','database-restore','database-export','database-import','database-optimize','database-repair','database-user','database-permissions','backup-verify','backup-copy','software-compatibility','addon-scan','addon-update','addon-toggle','schedule-run','logs-export','crash-reports','agent-logs','server-startup-logs','sftp-test','sftp-disable','sftp-enable','sftp-session-list','sftp-session-terminate'
])
















const ACTION_CAP:Record<string,string>={
 'scan-files':'file-security','scan-mods':'file-security','scan-plugins':'file-security','scan-config':'file-security','scan-zip':'file-security','jar-metadata':'file-security','hash-files':'file-security','quarantine-file':'file-security','restore-quarantine':'file-security','delete-quarantine':'file-security',
 'anticheat-status':'anticheat','anticheat-update':'anticheat','anticheat-configure':'anticheat','login-security-status':'security-agent','network-security-status':'security-agent','firewall-status':'firewall','port-scan':'firewall',
 'player-details':'players','player-inventory':'players','player-enderchest':'players','player-history':'players','player-note':'players','player-action':'players',
 'software-compatibility':'addons','addon-scan':'addons','addon-update':'addons','addon-toggle':'addons','crash-reports':'logs','agent-logs':'logs','server-startup-logs':'logs','logs-export':'logs',
 'bulk-download':'bulk-download','file-inventory':'file-browser','file-create':'file-browser','folder-create':'file-browser','file-rename':'file-browser','file-move':'file-browser','file-copy':'file-browser','file-delete':'file-browser','file-download':'file-browser','folder-download':'bulk-download','file-read':'file-browser','file-write':'file-browser','file-permissions':'file-browser','file-bulk-delete':'file-browser','file-bulk-move':'file-browser','upload-retry':'upload','upload-history-clear':'upload',
 'database-backup':'database','database-restore':'database','database-export':'database','database-import':'database','database-optimize':'database','database-repair':'database','database-user':'database','database-permissions':'database','backup-verify':'backup','backup-copy':'backup','schedule-run':'scheduler','sftp-test':'sftp','sftp-disable':'sftp','sftp-enable':'sftp','sftp-session-list':'sftp','sftp-session-terminate':'sftp'
}
const BASE_CAPS=new Set(['properties','port','sftp','files','console','audit','rbac','loader','logs','firewall','security-agent','file-browser','bulk-download','addons','anticheat','database','backup','players'])
const ACTION_AGENT_TYPE:Record<string,string>={'login-security-status':'security-scan','network-security-status':'port-scan','firewall-status':'port-scan','software-compatibility':'software-compatibility','addon-scan':'addon-scan','anticheat-status':'anticheat-status','scan-files':'file-integrity','scan-mods':'security-scan','scan-plugins':'security-scan','scan-config':'security-scan','hash-files':'file-integrity','file-create':'write-file','folder-create':'create-folder','file-rename':'move-file','file-move':'move-file','file-delete':'delete-file','file-read':'read-file','file-write':'write-file'}
const IMPLEMENTED_AGENT_ACTIONS=new Set(['file-inventory','bulk-download','file-create','folder-create','file-rename','file-move','file-copy','file-delete','file-download','folder-download','file-read','file-write','file-permissions','file-bulk-delete','file-bulk-move','security-scan','port-scan','file-integrity','logs-export','crash-reports','agent-logs','server-startup-logs','software-compatibility','addon-scan','anticheat-status','sftp-test','sftp-disable','sftp-enable','sftp-session-list','sftp-session-terminate','create-folder','move-file','delete-file','read-file','write-file','player-details','player-inventory','player-enderchest','player-history','player-action','database-backup','database-restore','database-export','database-import','database-optimize','database-repair','backup-verify','backup-copy'])
















const DANGEROUS = new Set(['file-delete','file-write','file-bulk-delete','delete-quarantine','database-restore','database-import','database-repair','player-action','sftp-disable','sftp-session-terminate'])
const READ_ONLY_ACTIONS=new Set(['file-inventory','bulk-download','file-download','folder-download','file-read','security-scan','scan-files','scan-mods','scan-plugins','scan-config','scan-zip','jar-metadata','hash-files','login-security-status','network-security-status','firewall-status','port-scan','anticheat-status','player-details','player-inventory','player-enderchest','player-history','software-compatibility','addon-scan','backup-verify','logs-export','crash-reports','agent-logs','server-startup-logs'])
async function actor(){return getPanelActor()}
async function access(serverId:string,a:NonNullable<Awaited<ReturnType<typeof actor>>>) { const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0]; if(!server)return null; if(a.role==='manager'||server.userId===a.id)return {server,manager:true,permission:null}; const permission=(await db.select().from(serverPermissions).where(and(eq(serverPermissions.serverId,serverId),eq(serverPermissions.userId,a.id))).limit(1))[0]; return permission?{server,manager:false,permission}:null }
function permissionSections(x:NonNullable<Awaited<ReturnType<typeof access>>>){return Array.isArray(x.permission?.sections)?x.permission.sections.map(String):[]}
function canReadAction(x:NonNullable<Awaited<ReturnType<typeof access>>>,action:string){if(x.manager)return true;const sections=permissionSections(x);if(action.startsWith('player'))return sections.includes('players')||!!x.permission?.canConsole;if(action.includes('backup'))return sections.includes('backups')||!!x.permission?.canBackup;if(action.includes('database'))return sections.includes('databases');if(action.includes('schedule'))return sections.includes('schedules');if(action.includes('log')||action.includes('crash'))return sections.includes('logs')||sections.includes('console');if(action==='network-security-status'||action.includes('firewall')||action==='port-scan')return sections.includes('security')||sections.includes('network');if(action.includes('security')||action.includes('anticheat')||action.includes('quarantine')||action.startsWith('scan-')||action==='jar-metadata'||action==='hash-files')return sections.includes('security');if(action==='software-compatibility'||action.includes('addon'))return sections.includes('software')||!!x.permission?.canFiles;if(action.includes('file')||action.includes('folder')||action.includes('upload')||action.includes('sftp')||action==='bulk-download')return sections.includes('files')||!!x.permission?.canFiles;return sections.includes('overview')}
function allowed(x:NonNullable<Awaited<ReturnType<typeof access>>>,action:string){if(x.manager)return true;if(READ_ONLY_ACTIONS.has(action))return canReadAction(x,action);const sections=permissionSections(x);if(action.startsWith('player'))return !!x.permission?.canConsole;if(action.includes('backup'))return !!x.permission?.canBackup;if(action.includes('log')||action.includes('crash'))return !!x.permission?.canConsole||sections.includes('console')||sections.includes('logs');if(action.includes('file')||action.includes('folder')||action.includes('quarantine')||action.includes('addon')||action.includes('upload'))return !!x.permission?.canFiles;return false}
















export async function GET(request:NextRequest){await ensurePanelSchema();const a=await actor();if(!a)return NextResponse.json({error:'Unauthorized'},{status:401});if(!a.approved)return NextResponse.json({error:'Approval required'},{status:403});const serverId=request.nextUrl.searchParams.get('serverId')||'';const x=await access(serverId,a);if(!x)return NextResponse.json({error:'Forbidden'},{status:403});const [rows,settingsRow]=await Promise.all([db.select().from(agentCommands).where(eq(agentCommands.serverId,serverId)).orderBy(desc(agentCommands.createdAt)).limit(100),db.select().from(serverSettings).where(eq(serverSettings.serverId,serverId)).limit(1).then(rows=>rows[0])]);const caps=new Set([...(settingsRow?.capabilities??[]),...BASE_CAPS]);const supportedActions=[...SAFE_ACTIONS].filter(action=>{const agentType=ACTION_AGENT_TYPE[action]??action;const required=ACTION_CAP[action];return IMPLEMENTED_AGENT_ACTIONS.has(agentType)&&(!required||caps.has(required))&&allowed(x,action)});const visibleRows=rows.filter(r=>canReadAction(x,r.type));const canFiles=x.manager||permissionSections(x).includes('files')||!!x.permission?.canFiles;let fileIndex=canFiles?visibleRows.find(r=>r.type==='file-inventory'&&r.status==='completed')?.result??null:null
  let inventoryError: string | null = null
  if (canFiles && !fileIndex) {
    try {
      const response = await nodeFetch(x.server.nodeId, `/internal/content/inventory?serverId=${encodeURIComponent(serverId)}`)
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) throw new Error(String(body.error ?? `Inventory alınamadı (${response.status})`))
      fileIndex = body
    } catch (error) {
      inventoryError = nodeDiagnosticMessage(error)
    }
  }
  const withDownload=(row:typeof visibleRows[number])=>{const raw=(row.result&&typeof row.result==='object'?row.result:{}) as Record<string,unknown>;let base='';try{base=getNodeConfig(row.nodeId).baseUrl}catch{}const token=String(raw.downloadToken??'');const files=Array.isArray(raw.files)?raw.files.map(item=>{const data=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;const childToken=String(data.downloadToken??'');return{...data,downloadUrl:base&&childToken?`${base}/public/download/${encodeURIComponent(childToken)}`:undefined}}):undefined;return{...row,result:{...raw,downloadUrl:base&&token?`${base}/public/download/${encodeURIComponent(token)}`:undefined,files}}};const bundles=canFiles?visibleRows.filter(r=>['bulk-download','folder-download','file-download'].includes(r.type)).slice(0,20).map(withDownload):[];const actions=visibleRows.map(row=>['logs-export','folder-download','file-download'].includes(row.type)?withDownload(row):row);return NextResponse.json({actions,fileIndex,inventoryError,bundles,supportedActions},{headers:{'Cache-Control':'private, no-store'}})}
















export async function POST(request:NextRequest){await ensurePanelSchema();const a=await actor();if(!a)return NextResponse.json({error:'Unauthorized'},{status:401});if(!a.approved)return NextResponse.json({error:'Approval required'},{status:403});const body=await request.json().catch(()=>({}));const serverId=String(body.serverId||'');const action=String(body.action||'');if(!SAFE_ACTIONS.has(action))return NextResponse.json({error:'Desteklenmeyen işlem'},{status:400});const x=await access(serverId,a);if(!x||!allowed(x,action))return NextResponse.json({error:'Bu işlem için yetkiniz yok'},{status:403});if(action==='file-inventory'){try{const response=await nodeFetch(x.server.nodeId,`/internal/content/inventory?serverId=${encodeURIComponent(serverId)}`,{cache:'no-store'});const result=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new Error(String(result.error??`Dosya envanteri alınamadı (${response.status})`));const [command]=await db.insert(agentCommands).values({userId:x.server.userId,nodeId:x.server.nodeId,serverId,type:'file-inventory',payload:{safeMode:true,requestedBy:a.id,requestedAction:action,_panelBridge:true},status:'completed',result}).returning();return NextResponse.json({ok:true,command,result},{status:200})}catch(error){return NextResponse.json({error:nodeDiagnosticMessage(error)},{status:502})}}const settingsRow=(await db.select().from(serverSettings).where(eq(serverSettings.serverId,serverId)).limit(1))[0];const caps=new Set([...(settingsRow?.capabilities??[]),...BASE_CAPS]);const required=ACTION_CAP[action];if(required&&!caps.has(required))return NextResponse.json({error:`Bu özellik için Oracle agent entegrasyonu gerekli: ${required}`},{status:409});if(DANGEROUS.has(action)&&body.confirm!==true)return NextResponse.json({error:'Bu işlem açık onay gerektirir'},{status:400});const payload=body.payload&&typeof body.payload==='object'?body.payload:{};let agentType=ACTION_AGENT_TYPE[action]??action;let agentPayload:Record<string,unknown>={...payload};if(action==='file-create'){agentType='write-file';agentPayload={path:String((payload as any).path??''),content:String((payload as any).content??'')}}else if(action==='folder-create'){agentType='create-folder';agentPayload={path:String((payload as any).path??'')}}else if(action==='file-read'){agentType='read-file';agentPayload={path:String((payload as any).path??'')}}else if(action==='file-write'){agentType='write-file';agentPayload={path:String((payload as any).path??''),content:String((payload as any).content??'')}}else if(action==='file-delete'){agentType='delete-file';agentPayload={path:String((payload as any).path??'')}}else if(action==='file-rename'||action==='file-move'){agentType='move-file';agentPayload={from:String((payload as any).path??''),to:String((payload as any).newPath??(payload as any).destination??'')}};if(!IMPLEMENTED_AGENT_ACTIONS.has(agentType))return NextResponse.json({error:`Bu işlem henüz Oracle agent tarafından desteklenmiyor: ${action}`},{status:409});const [command]=await db.insert(agentCommands).values({userId:x.server.userId,nodeId:x.server.nodeId,serverId,type:agentType,payload:{...agentPayload,safeMode:true,requestedBy:a.id,requestedAction:action},status:'queued'}).returning();await db.insert(auditLog).values({userId:a.id,action:`server.action.${action}`,resourceType:'server',resourceId:serverId,details:{commandId:command.id,confirmed:body.confirm===true}});return NextResponse.json({ok:true,command},{status:202})}
