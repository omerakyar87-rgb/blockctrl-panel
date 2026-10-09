import { list } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { operationalAlert, operationalEvent } from '@/lib/observability'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


const EXPECTED_MIGRATION = '0017_panel_media_fallback'


type CheckStatus='unknown'|'ok'|'error'|'outdated'|'offline'|'not-configured'
function errorMessage(error:unknown,fallback:string){return error instanceof Error?error.message:fallback}
function markDegraded(health:{status:'ok'|'degraded'|'error'}){if(health.status==='ok')health.status='degraded'}


export async function GET() {
  const startedAt=Date.now()
  const health={
    service:'blockctrl-panel',
    status:'ok' as 'ok'|'degraded'|'error',
    timestamp:new Date().toISOString(),
    responseTimeMs:0,
    database:{status:'unknown' as CheckStatus,latencyMs:null as number|null,error:null as string|null,pool:{total:0,idle:0,waiting:0,max:Number(process.env.PG_POOL_MAX||10)}},
    migration:{status:'unknown' as CheckStatus,expected:EXPECTED_MIGRATION,latest:null as string|null,error:null as string|null},
    agent:{status:'unknown' as CheckStatus,totalNodes:0,onlineNodes:0,latestHeartbeat:null as string|null,error:null as string|null},
    auth:{status:'unknown' as CheckStatus,supabaseUrlConfigured:false,publishableKeyConfigured:false,error:null as string|null},
    vercelWebsite:{status:'unknown' as CheckStatus,mode:'internal' as 'internal'|'vercel',latencyMs:null as number|null,teamConfigured:false,externalConfigured:false,error:null as string|null},
    blobStorage:{status:'unknown' as CheckStatus,mode:'database-fallback' as 'blob'|'database-fallback',latencyMs:null as number|null,fallbackMaxBytes:Number(process.env.BLOCKCTRL_DB_MEDIA_MAX_BYTES)||3*1024*1024,error:null as string|null},
    websiteRuntime:{status:'unknown' as CheckStatus,publicUrlConfigured:false,serverBridgeConfigured:false,error:null as string|null},
    security:{status:'unknown' as CheckStatus,cspMode:'report-only' as 'enforced'|'report-only',environment:String(process.env.VERCEL_ENV||process.env.NODE_ENV||'unknown'),error:null as string|null},
    alerting:{status:'unknown' as CheckStatus,mode:'internal' as 'internal'|'external',webhookConfigured:false,emailConfigured:false,error:null as string|null},
    integrations:{status:'unknown' as CheckStatus,discordWebhook:true,discordBotWorker:false,liveStreamGateway:false,encryptionConfigured:false,oauth:{youtube:false,twitch:false,kick:false},error:null as string|null},
    readiness:{status:'ready' as 'ready'|'ready-with-warnings'|'blocked',blockers:[] as string[],warnings:[] as string[]},
  }


  try{
    const dbStarted=Date.now()
    await pool.query('SELECT 1')
    health.database.status='ok';health.database.latencyMs=Date.now()-dbStarted;health.database.error=null;health.database.pool={total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount,max:Number(process.env.PG_POOL_MAX||10)}
  }catch(error){
    health.database.status='error';health.database.latencyMs=null;health.database.error=errorMessage(error,'Database connection failed');health.database.pool={total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount,max:Number(process.env.PG_POOL_MAX||10)}
    health.status='error'
  }


  if(health.database.status==='ok'){
    try{
      const migration=await pool.query<{version:string}>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
      const latest=String(migration.rows[0]?.version||'')
      health.migration.latest=latest||null
      health.migration.status=latest>=EXPECTED_MIGRATION?'ok':'outdated'
      if(health.migration.status!=='ok')health.status='error'
    }catch(error){
      const message=errorMessage(error,'Migration status unavailable')
      const migrationTableMissing=/schema_migrations/i.test(message)&&/does not exist|undefined table|relation/i.test(message)
      health.migration.status=migrationTableMissing?'outdated':'error'
      health.migration.error=migrationTableMissing?'Migration zinciri henüz başlatılmamış; pnpm db:migrate çalıştırılmalı.':message
      health.status='error'
    }


    try{
      const agent=await pool.query<{total:string;online:string;latest:Date|null}>(`SELECT count(*)::text AS total,count(*) FILTER (WHERE "lastHeartbeat">=now()-interval '90 seconds')::text AS online,max("lastHeartbeat") AS latest FROM nodes`)
      const row=agent.rows[0]
      health.agent.totalNodes=Number(row?.total||0)
      health.agent.onlineNodes=Number(row?.online||0)
      health.agent.latestHeartbeat=row?.latest?new Date(row.latest).toISOString():null
      health.agent.status=health.agent.totalNodes===0?'not-configured':health.agent.onlineNodes>0?'ok':'offline'
      if(health.agent.status==='offline')markDegraded(health)
    }catch(error){
      health.agent.status='error'
      health.agent.error=errorMessage(error,'Agent status unavailable')
      markDegraded(health)
    }
  }


  const supabaseUrl=String(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||'').trim()
  const supabaseKey=String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'').trim()
  health.auth.supabaseUrlConfigured=/^https:\/\//i.test(supabaseUrl)
  health.auth.publishableKeyConfigured=supabaseKey.length>=20
  if(health.auth.supabaseUrlConfigured&&health.auth.publishableKeyConfigured){
    health.auth.status='ok'
  }else{
    health.auth.status='error'
    const missing=[] as string[]
    if(!health.auth.supabaseUrlConfigured)missing.push('NEXT_PUBLIC_SUPABASE_URL')
    if(!health.auth.publishableKeyConfigured)missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    health.auth.error=`Eksik auth ayarı: ${missing.join(', ')}`
    health.status='error'
  }


  const vercelToken=process.env.VERCEL_TOKEN||''
  const teamId=process.env.VERCEL_TEAM_ID||process.env.VERCEL_ORG_ID||''
  const teamSlug=process.env.VERCEL_TEAM_SLUG||''
  health.vercelWebsite.teamConfigured=Boolean(teamId||teamSlug)
  health.vercelWebsite.externalConfigured=Boolean(vercelToken&&(teamId||teamSlug))
  if(!health.vercelWebsite.externalConfigured){
    health.vercelWebsite.status='ok'
    health.vercelWebsite.mode='internal'
    health.vercelWebsite.error=null
  }else{
    try{
      const vercelStarted=Date.now()
      const query=new URLSearchParams({limit:'1'})
      if(teamId)query.set('teamId',teamId)
      else if(teamSlug)query.set('slug',teamSlug)
      const response=await fetch(`https://api.vercel.com/v6/deployments?${query.toString()}`,{headers:{authorization:`Bearer ${vercelToken}`},cache:'no-store',signal:AbortSignal.timeout(5000)})
      health.vercelWebsite.latencyMs=Date.now()-vercelStarted
      if(!response.ok)throw new Error(`Vercel API returned HTTP ${response.status}`)
      await response.json()
      health.vercelWebsite.status='ok'
      health.vercelWebsite.mode='vercel'
    }catch(error){
      health.vercelWebsite.status='ok'
      health.vercelWebsite.mode='internal'
      health.vercelWebsite.error=`Ayrı Vercel proje yayını kullanılamıyor; dahili yayın aktif. ${errorMessage(error,'Vercel API unavailable')}`
      health.readiness.warnings.push('Ayrı Vercel proje yayını kullanılamıyor; BlockCtrl dahili yayın modu aktif.')
    }
  }


  const blobToken=process.env.BLOB_READ_WRITE_TOKEN||''
  if(!blobToken){
    health.blobStorage.status=health.database.status==='ok'&&health.migration.status==='ok'?'ok':'not-configured'
    health.blobStorage.mode='database-fallback'
    health.blobStorage.error=health.blobStorage.status==='ok'?null:'DB medya fallback henüz hazır değil.'
  }else{
    try{
      const blobStarted=Date.now()
      await list({limit:1,token:blobToken})
      health.blobStorage.latencyMs=Date.now()-blobStarted
      health.blobStorage.status='ok'
      health.blobStorage.mode='blob'
    }catch(error){
      health.blobStorage.status=health.database.status==='ok'&&health.migration.status==='ok'?'ok':'error'
      health.blobStorage.mode='database-fallback'
      health.blobStorage.error=health.blobStorage.status==='ok'
        ?'Blob kullanılamıyor; PostgreSQL medya fallback aktif. '+errorMessage(error,'Blob unavailable')
        :errorMessage(error,'Blob storage unavailable')
      if(health.blobStorage.status==='error')markDegraded(health)
    }
  }


  const vercelRuntimeHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL||'').trim()
  const publicUrl=String(process.env.BLOCKCTRL_PUBLIC_URL||process.env.NEXT_PUBLIC_APP_URL||(vercelRuntimeHost?'https://'+vercelRuntimeHost:'')).trim()
  const serverBridgeKey=String(process.env.BLOCKCTRL_SITE_SERVER_BRIDGE_KEY||'').trim()
  health.websiteRuntime.publicUrlConfigured=/^https:\/\//i.test(publicUrl)
  health.websiteRuntime.serverBridgeConfigured=health.agent.totalNodes>0||serverBridgeKey.length>=24
  if(health.websiteRuntime.publicUrlConfigured&&health.websiteRuntime.serverBridgeConfigured){
    health.websiteRuntime.status='ok'
  }else{
    health.websiteRuntime.status='not-configured'
    const missing=[] as string[]
    if(!health.websiteRuntime.publicUrlConfigured)missing.push('Vercel runtime URL')
    if(!health.websiteRuntime.serverBridgeConfigured)missing.push('kayıtlı node veya legacy bridge key')
    health.websiteRuntime.error=`Eksik website runtime ayarı: ${missing.join(', ')}`
    markDegraded(health)
  }


  health.security.cspMode=(process.env.NODE_ENV==='production'||String(process.env.BLOCKCTRL_CSP_ENFORCE||'').toLowerCase()==='true')?'enforced':'report-only'
  health.security.status='ok'


  health.alerting.webhookConfigured=Boolean(String(process.env.BLOCKCTRL_ALERT_WEBHOOK_URL||'').trim())
  health.alerting.emailConfigured=Boolean(String(process.env.BLOCKCTRL_ALERT_EMAIL_TO||'').trim()&&String(process.env.RESEND_API_KEY||'').trim()&&String(process.env.EMAIL_FROM||'').trim())
  health.alerting.status='ok'
  health.alerting.mode=health.alerting.webhookConfigured||health.alerting.emailConfigured?'external':'internal'
  health.alerting.error=null


  health.integrations.discordBotWorker=Boolean(process.env.DISCORD_BOT_WORKER_URL)
  health.integrations.liveStreamGateway=Boolean(process.env.LIVE_STREAM_GATEWAY_URL)
  health.integrations.encryptionConfigured=String(process.env.INTEGRATION_ENCRYPTION_KEY||'').length>=24
  health.integrations.oauth={
    youtube:Boolean(process.env.YOUTUBE_CLIENT_ID&&process.env.YOUTUBE_CLIENT_SECRET),
    twitch:Boolean(process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_CLIENT_SECRET),
    kick:Boolean(process.env.KICK_CLIENT_ID&&process.env.KICK_CLIENT_SECRET),
  }
  const optionalIntegrationReady=health.integrations.discordBotWorker||health.integrations.liveStreamGateway||Object.values(health.integrations.oauth).some(Boolean)
  if(health.integrations.encryptionConfigured){
    health.integrations.status=optionalIntegrationReady?'ok':'not-configured'
    if(!optionalIntegrationReady)health.integrations.error='Opsiyonel bot/gateway/OAuth entegrasyonları henüz yapılandırılmadı.'
  }else{
    health.integrations.status='not-configured'
    health.integrations.error='INTEGRATION_ENCRYPTION_KEY yapılandırılmadı; secret kullanan entegrasyonlar güvenle etkinleştirilemez.'
    markDegraded(health)
  }

  if(health.database.status!=='ok')health.readiness.blockers.push('Veritabanı bağlantısı hazır değil.')
  if(health.migration.status!=='ok')health.readiness.blockers.push(`Veritabanı migration seviyesi ${health.migration.expected} düzeyinde değil.`)
  if(health.auth.status!=='ok')health.readiness.blockers.push('Supabase kimlik doğrulama ortam değişkenleri eksik veya geçersiz.')
  if(health.agent.status==='offline')health.readiness.warnings.push('Kayıtlı node var ancak çevrimiçi agent heartbeat alınamıyor.')
  if(health.agent.status==='not-configured')health.readiness.warnings.push('Henüz node/agent bağlanmamış.')
  if(health.blobStorage.status!=='ok')health.readiness.warnings.push('Medya depolama hazır değil.')
  if(health.websiteRuntime.status!=='ok')health.readiness.warnings.push('Yayınlanan sitelerin canlı BlockCtrl köprüsü eksik.')
  if(health.integrations.encryptionConfigured===false)health.readiness.warnings.push('Secret kullanan entegrasyonlar için INTEGRATION_ENCRYPTION_KEY eksik.')
  if(health.security.environment==='production'&&health.security.cspMode!=='enforced')health.readiness.warnings.push('Production CSP hâlâ Report-Only modunda.')
  health.readiness.status=health.readiness.blockers.length?'blocked':health.readiness.warnings.length?'ready-with-warnings':'ready'


  health.responseTimeMs=Date.now()-startedAt
  operationalEvent({level:health.status==='ok'?'info':health.status==='degraded'?'warning':'error',event:'health.check',message:`BlockCtrl health ${health.status}`,details:{responseTimeMs:health.responseTimeMs,database:health.database.status,migration:health.migration.status,agent:health.agent.status,auth:health.auth.status,vercelWebsite:health.vercelWebsite.status,blobStorage:health.blobStorage.status,websiteRuntime:health.websiteRuntime.status,alerting:health.alerting.status,integrations:health.integrations.status,readiness:health.readiness.status}})
  if(health.status!=='ok')void operationalAlert({level:health.status==='error'?'error':'warning',event:'health.degraded',message:`BlockCtrl health ${health.status}`,dedupeKey:`health:${health.status}:${health.database.status}:${health.agent.status}`,dedupeMs:5*60_000,details:{responseTimeMs:health.responseTimeMs,database:health.database.status,migration:health.migration.status,agent:health.agent.status,vercelWebsite:health.vercelWebsite.status,blobStorage:health.blobStorage.status,websiteRuntime:health.websiteRuntime.status,integrations:health.integrations.status}})
  return NextResponse.json(health,{status:health.status==='error'?503:200,headers:{'Cache-Control':'no-store, max-age=0'}})
}