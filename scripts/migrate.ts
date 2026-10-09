import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createPostgresPool } from '../lib/db/postgres'

const migrationsDir=path.join(process.cwd(),'migrations')
const auto=process.argv.includes('--auto')
const migrationDatabaseUrl=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL
const connectionConfigured=Boolean(migrationDatabaseUrl)
const pool=createPostgresPool(migrationDatabaseUrl?{connectionString:migrationDatabaseUrl}:{})

type DbClient={query:(sql:string,params?:unknown[])=>Promise<{rows:any[]}>}

async function hasTable(db:DbClient,name:string){
  const result=await db.query(`SELECT to_regclass($1)::text AS name`,[`public.${name}`])
  return Boolean(result.rows[0]?.name)
}
async function hasColumn(db:DbClient,table:string,column:string){
  const result=await db.query(`SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 AND column_name=$2
  ) AS ok`,[table,column])
  return Boolean(result.rows[0]?.ok)
}
async function hasIndex(db:DbClient,name:string){
  const result=await db.query(`SELECT to_regclass($1)::text AS name`,[`public.${name}`])
  return Boolean(result.rows[0]?.name)
}
async function hasConstraint(db:DbClient,name:string){
  const result=await db.query(`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=$1) AS ok`,[name])
  return Boolean(result.rows[0]?.ok)
}
async function all(values:Array<Promise<boolean>>){return (await Promise.all(values)).every(Boolean)}

async function migrationFingerprint(db:DbClient,version:string){
  switch(version){
    case '0001_runtime_ddl_baseline': return true
    case '0002_metrics_alerts_notifications':
      return all([hasTable(db,'server_metrics'),hasTable(db,'alert_rules'),hasTable(db,'notifications'),hasIndex(db,'server_metrics_server_created_idx')])
    case '0003_information_pages': return hasTable(db,'information_pages')
    case '0004_support_announcements':
      return all([hasTable(db,'support_settings'),hasTable(db,'announcements'),hasTable(db,'announcement_reads')])
    case '0005_lost_item_restore':
      return all(['status','restoreCommandId','restoreRequestedAt','restoredAt','restoredByUserId','restoreError'].map(column=>hasColumn(db,'lost_items',column)))
    case '0006_member_owner_permissions': return hasColumn(db,'server_permissions','ownerUserId')
    case '0007_websites':
      return all(['id','userId','name','slug','projectName','template','status'].map(column=>hasColumn(db,'websites',column)))
    case '0008_website_builder':
      return all([hasColumn(db,'websites','builderData'),hasColumn(db,'websites','publishedAt')])
    case '0009_website_runtime':
      return all([hasTable(db,'website_members'),hasTable(db,'website_member_sessions'),hasTable(db,'website_form_submissions')])
    case '0010_website_auth_access':
      return all([
        hasTable(db,'website_auth_settings'),
        ...['playerUuid','serverId','authSource','role','allowedPages','metadata','lastLoginAt'].map(column=>hasColumn(db,'website_members',column)),
        ...['ipAddress','userAgent','lastSeenAt'].map(column=>hasColumn(db,'website_member_sessions',column)),
      ])
    case '0011_website_integrity_security':
      return all([
        hasTable(db,'website_auth_rate_limits'),
        hasConstraint(db,'website_auth_settings_websiteId_websites_id_fk'),
        hasConstraint(db,'website_members_websiteId_websites_id_fk'),
        hasConstraint(db,'website_member_sessions_websiteId_websites_id_fk'),
        hasConstraint(db,'website_member_sessions_memberId_website_members_id_fk'),
        hasConstraint(db,'website_form_submissions_websiteId_websites_id_fk'),
        hasConstraint(db,'website_form_submissions_memberId_website_members_id_fk'),
        hasConstraint(db,'website_auth_rate_limits_websiteId_websites_id_fk'),
      ])
    case '0012_website_runtime_hardening':
      return all([
        hasColumn(db,'server_permissions','canWebsiteData'),
        hasIndex(db,'website_members_site_email_ci_unique'),
        hasIndex(db,'website_members_site_minecraft_ci_unique'),
        hasIndex(db,'server_permissions_website_data_idx'),
      ])
    case '0013_player_moderation': return hasTable(db,'player_moderation_notes')
    case '0014_server_website_data': return hasTable(db,'server_website_data')
    case '0015_server_players': return hasTable(db,'server_players')
    case '0016_website_server_binding':
      return all([
        hasColumn(db,'websites','serverId'),
        hasColumn(db,'website_form_submissions','serverId'),
        hasConstraint(db,'websites_server_id_fk'),
        hasConstraint(db,'website_form_submissions_server_id_fk'),
        hasIndex(db,'websites_server_id_idx'),
        hasIndex(db,'website_form_submissions_server_id_idx'),
      ])
    case '0017_panel_media_fallback':
      return all([
        hasTable(db,'panel_media_objects'),
        hasIndex(db,'panel_media_objects_scope_idx'),
        hasIndex(db,'panel_media_objects_owner_idx'),
      ])
    default: return false
  }
}

function statements(sql:string){
  return sql.split(/^(?:-- statement:.*|--> statement-breakpoint)\s*$/m).map(part=>part.trim()).filter(Boolean)
}

async function main(){
  if(auto&&String(process.env.BLOCKCTRL_AUTO_MIGRATE||'').toLowerCase()!=='true'){
    console.log('BlockCtrl migration auto-run skipped: BLOCKCTRL_AUTO_MIGRATE is not enabled.')
    return
  }
  if(!connectionConfigured){
    if(auto){console.log('BlockCtrl migration auto-run skipped: database connection is not configured.');return}
    throw new Error('MIGRATION_DATABASE_URL, DATABASE_URL_UNPOOLED, DATABASE_URL, POSTGRES_URL or NEON_DATABASE_URL is required.')
  }

  const guard=await pool.connect()
  try{
    await guard.query(`SELECT pg_advisory_lock(hashtext('blockctrl:migrations'))`)
    await guard.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)

    const applied=new Set((await guard.query('SELECT version FROM schema_migrations')).rows.map(row=>String(row.version)))
    const files=(await readdir(migrationsDir)).filter(file=>file.endsWith('.sql')).sort()

    for(const file of files){
      const version=file.replace(/\.sql$/,'')
      if(applied.has(version))continue

      if(await migrationFingerprint(guard,version)){
        await guard.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',[version])
        applied.add(version)
        console.log(`Reconciled ${version} from existing schema`)
        continue
      }

      const sql=await readFile(path.join(migrationsDir,file),'utf8')
      if(!sql.trim())throw new Error(`Migration ${version} is empty.`)

      await guard.query('BEGIN')
      try{
        for(const statement of statements(sql))await guard.query(statement)
        if(!(await migrationFingerprint(guard,version)))throw new Error(`Migration ${version} ran but its schema fingerprint is still incomplete.`)
        await guard.query('INSERT INTO schema_migrations (version) VALUES ($1)',[version])
        await guard.query('COMMIT')
        applied.add(version)
        console.log(`Applied ${version}`)
      }catch(error){
        await guard.query('ROLLBACK')
        throw error
      }
    }

    const latest=(await guard.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')).rows[0]?.version
    console.log(`BlockCtrl migrations ready: ${latest??'none'}`)
  }finally{
    await guard.query(`SELECT pg_advisory_unlock(hashtext('blockctrl:migrations'))`).catch(()=>{})
    guard.release()
    await pool.end()
  }
}

main().catch(async error=>{
  console.error(error)
  await pool.end().catch(()=>{})
  process.exitCode=1
})
