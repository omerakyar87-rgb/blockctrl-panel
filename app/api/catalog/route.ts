import { NextRequest, NextResponse } from 'next/server'
import { getPanelActor } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { servers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nodeFetch } from '@/lib/node-bridge'
import { neoForgePrefix } from '@/lib/neoforge-version'

export const revalidate = 0

type AddonSource='modrinth'|'curseforge'
type AddonKind='mods'|'plugins'
type AddonSearchResult={source:AddonSource;projectId:string;title:string;description:string;author:string;iconUrl:string|null;downloads:number;slug?:string|null;categories:string[];versions:string[]}
type InstallFile={source:AddonSource;projectId:string;versionId:string;title:string;fileName:string;url:string;size:number;sha1?:string|null;sha512?:string|null;kind:AddonKind}

async function fetchMetadata(url: string, loader: string, mcVersion: string) {
  const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/xml,text/xml;q=0.9' } })
  const contentType = response.headers.get('content-type') ?? 'unknown'
  console.info('[catalog:metadata]', { loader, mcVersion, host: new URL(url).hostname, status: response.status, contentType })
  if (!response.ok) throw new Error(`${loader === 'neoforge' ? 'NeoForge' : 'Forge'} katalog isteği başarısız: HTTP ${response.status}`)
  return { body: await response.text(), status: response.status, contentType }
}

type MojangManifest = { versions: Array<{ id: string; type: string }> }

function cleanQuery(value:string|null,max=80){return String(value??'').trim().slice(0,max)}
function normalizeLoader(loader:string){return ['vanilla','paper','fabric','forge','neoforge'].includes(loader)?loader:'vanilla'}
function addonKind(value:string|null):AddonKind{return value==='plugins'?'plugins':'mods'}
function sourceName(value:string|null):AddonSource{return value==='curseforge'?'curseforge':'modrinth'}

async function modrinthSearch(query:string,kind:AddonKind,loader:string,mcVersion:string):Promise<AddonSearchResult[]> {
  const facets:string[][]=[]
  if(mcVersion)facets.push([`versions:${mcVersion}`])
  if(kind==='plugins'){
    facets.push(['all_project_types:plugin'])
    if(loader==='paper')facets.push(['categories:paper','categories:spigot','categories:bukkit'])
  }else{
    facets.push(['project_type:mod'])
    if(['fabric','forge','neoforge'].includes(loader))facets.push([`categories:${loader}`])
  }
  const url=new URL('https://api.modrinth.com/v2/search')
  url.searchParams.set('query',query)
  url.searchParams.set('limit','24')
  url.searchParams.set('index','downloads')
  url.searchParams.set('facets',JSON.stringify(facets))
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json','user-agent':'BlockCtrl/1.0'}})
  if(!response.ok)throw new Error(`Modrinth araması başarısız (HTTP ${response.status})`)
  const body=await response.json() as {hits?:Array<Record<string,unknown>>}
  return (body.hits??[]).map(hit=>({
    source:'modrinth' as const,projectId:String(hit.project_id??''),title:String(hit.title??'Adsız proje'),description:String(hit.description??''),author:String(hit.author??''),iconUrl:typeof hit.icon_url==='string'?hit.icon_url:null,downloads:Number(hit.downloads??0)||0,slug:null,
    categories:Array.isArray(hit.categories)?hit.categories.map(String):[],versions:Array.isArray(hit.versions)?hit.versions.map(String):[]
  })).filter(item=>item.projectId)
}

function curseLoaderType(loader:string){return loader==='forge'?1:loader==='fabric'?4:loader==='neoforge'?6:null}
async function curseFetch(path:string){
  const apiKey=process.env.CURSEFORGE_API_KEY?.trim()
  if(!apiKey)throw new Error('CurseForge araması için CURSEFORGE_API_KEY yapılandırılmalıdır')
  const response=await fetch(`https://api.curseforge.com${path}`,{cache:'no-store',headers:{accept:'application/json','x-api-key':apiKey}})
  if(!response.ok)throw new Error(`CurseForge isteği başarısız (HTTP ${response.status})`)
  return response.json() as Promise<any>
}
async function curseforgeSearch(query:string,kind:AddonKind,loader:string,mcVersion:string):Promise<AddonSearchResult[]> {
  const url=new URL('https://api.curseforge.com/v1/mods/search')
  url.searchParams.set('gameId','432')
  url.searchParams.set('pageSize','24')
  if(query)url.searchParams.set('searchFilter',query)
  if(mcVersion)url.searchParams.set('gameVersion',mcVersion)
  if(kind==='plugins')url.searchParams.set('classId','5')
  const loaderType=curseLoaderType(loader)
  if(kind==='mods'&&loaderType&&mcVersion)url.searchParams.set('modLoaderType',String(loaderType))
  const apiKey=process.env.CURSEFORGE_API_KEY?.trim()
  if(!apiKey)throw new Error('CurseForge araması için CURSEFORGE_API_KEY yapılandırılmalıdır')
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json','x-api-key':apiKey}})
  if(!response.ok)throw new Error(`CurseForge araması başarısız (HTTP ${response.status})`)
  const body=await response.json() as {data?:Array<any>}
  return (body.data??[]).map(row=>({
    source:'curseforge' as const,projectId:String(row.id??''),title:String(row.name??'Adsız proje'),description:String(row.summary??''),author:String(row.authors?.[0]?.name??''),iconUrl:typeof row.logo?.thumbnailUrl==='string'?row.logo.thumbnailUrl:typeof row.logo?.url==='string'?row.logo.url:null,downloads:Number(row.downloadCount??0)||0,slug:typeof row.slug==='string'?row.slug:null,
    categories:Array.isArray(row.categories)?row.categories.map((x:any)=>String(x?.name??'')).filter(Boolean):[],versions:Array.isArray(row.latestFilesIndexes)?[...new Set(row.latestFilesIndexes.map((x:any)=>String(x?.gameVersion??'')).filter(Boolean))] as string[]:[]
  })).filter(item=>item.projectId)
}

async function modrinthVersion(projectId:string,loader:string,mcVersion:string){
  const url=new URL(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`)
  const loaders=loader==='paper'?['paper','spigot','bukkit']:[loader]
  if(loader!=='vanilla')url.searchParams.set('loaders',JSON.stringify(loaders))
  if(mcVersion)url.searchParams.set('game_versions',JSON.stringify([mcVersion]))
  url.searchParams.set('include_changelog','false')
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json','user-agent':'BlockCtrl/1.0'}})
  if(!response.ok)throw new Error(`Modrinth sürümü alınamadı (HTTP ${response.status})`)
  const rows=await response.json() as any[]
  return rows.find(row=>row.version_type==='release'&&row.status!=='archived')??rows.find(row=>row.status!=='archived')??rows[0]??null
}
async function modrinthProjectTitle(projectId:string){
  try{const r=await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}`,{cache:'no-store',headers:{accept:'application/json','user-agent':'BlockCtrl/1.0'}});if(!r.ok)return projectId;const b=await r.json() as any;return String(b.title??projectId)}catch{return projectId}
}
async function modrinthPlan(projectId:string,kind:AddonKind,loader:string,mcVersion:string){
  const seen=new Set<string>();const plan:InstallFile[]=[]
  async function walk(id:string,depth:number){
    if(seen.has(id))return;if(depth>5)throw new Error('Bağımlılık zinciri güvenli sınırı aştı')
    seen.add(id)
    const version=await modrinthVersion(id,loader,mcVersion)
    if(!version)throw new Error(`${id} için ${mcVersion} / ${loader} uyumlu sürüm bulunamadı`)
    const deps=Array.isArray(version.dependencies)?version.dependencies.filter((d:any)=>d?.dependency_type==='required'&&d?.project_id):[]
    for(const dep of deps)await walk(String(dep.project_id),depth+1)
    const file=(Array.isArray(version.files)?version.files:[]).find((f:any)=>f?.primary)??version.files?.[0]
    if(!file?.url||!file?.filename)throw new Error(`${id} için indirilebilir dosya bulunamadı`)
    plan.push({source:'modrinth' as const,projectId:id,versionId:String(version.id??''),title:await modrinthProjectTitle(id),fileName:String(file.filename),url:String(file.url),size:Number(file.size??0)||0,sha1:typeof file.hashes?.sha1==='string'?file.hashes.sha1:null,sha512:typeof file.hashes?.sha512==='string'?file.hashes.sha512:null,kind})
  }
  await walk(projectId,0)
  return plan
}

async function curseforgeFile(projectId:string,loader:string,mcVersion:string){
  const params=new URLSearchParams();if(mcVersion)params.set('gameVersion',mcVersion);params.set('pageSize','50')
  const loaderType=curseLoaderType(loader);if(loaderType&&mcVersion)params.set('modLoaderType',String(loaderType))
  const body=await curseFetch(`/v1/mods/${encodeURIComponent(projectId)}/files?${params.toString()}`)
  const rows=Array.isArray(body.data)?body.data:[]
  return rows.find((x:any)=>x.releaseType===1&&x.isAvailable!==false)??rows.find((x:any)=>x.isAvailable!==false)??rows[0]??null
}
async function curseforgeTitle(projectId:string){try{const b=await curseFetch(`/v1/mods/${encodeURIComponent(projectId)}`);return String(b.data?.name??projectId)}catch{return projectId}}
async function curseforgeDownloadUrl(projectId:string,file:any){
  if(typeof file.downloadUrl==='string'&&file.downloadUrl)return file.downloadUrl
  const body=await curseFetch(`/v1/mods/${encodeURIComponent(projectId)}/files/${encodeURIComponent(String(file.id))}/download-url`)
  if(typeof body.data!=='string'||!body.data)throw new Error(`${projectId} dosyası için indirme URL'si alınamadı`)
  return body.data
}
async function curseforgePlan(projectId:string,kind:AddonKind,loader:string,mcVersion:string){
  const seen=new Set<string>();const plan:InstallFile[]=[]
  async function walk(id:string,depth:number){
    if(seen.has(id))return;if(depth>5)throw new Error('Bağımlılık zinciri güvenli sınırı aştı')
    seen.add(id)
    const file=await curseforgeFile(id,loader,mcVersion)
    if(!file)throw new Error(`${id} için ${mcVersion} / ${loader} uyumlu CurseForge dosyası bulunamadı`)
    const deps=Array.isArray(file.dependencies)?file.dependencies.filter((d:any)=>Number(d?.relationType)===3&&d?.modId):[]
    for(const dep of deps)await walk(String(dep.modId),depth+1)
    const sha1=Array.isArray(file.hashes)?file.hashes.find((h:any)=>Number(h?.algo)===1)?.value:null
    plan.push({source:'curseforge' as const,projectId:id,versionId:String(file.id??''),title:await curseforgeTitle(id),fileName:String(file.fileName??file.displayName??`${id}.jar`),url:await curseforgeDownloadUrl(id,file),size:Number(file.fileLength??file.fileSizeOnDisk??0)||0,sha1:typeof sha1==='string'?sha1:null,sha512:null,kind})
  }
  await walk(projectId,0)
  return plan
}

export async function POST(request: NextRequest) {
  const actor=await getPanelActor();if(!actor?.approved)return NextResponse.json({error:'Yetkisiz veya onaysız kullanıcı'},{status:actor?403:401})
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;const serverId=String(body.serverId??'');const kind=addonKind(String(body.kind??'mods'));const loader=normalizeLoader(String(body.loader??'vanilla'));const files=Array.isArray(body.files)?body.files:[]
  const server=(await db.select().from(servers).where(eq(servers.id,serverId)).limit(1))[0];if(!server||server.userId!==actor.id)return NextResponse.json({error:'Sunucu bulunamadı veya erişim yok'},{status:403})
  if(loader==='vanilla'||!files.length||files.length>24)return NextResponse.json({error:'Geçersiz veya uyumsuz kurulum planı'},{status:400})
  if(!['ready','stopped','failed','crashed'].includes(server.status))return NextResponse.json({error:'Kurulum için sunucuyu tamamen durdurun.'},{status:409})
  try{const response=await nodeFetch(server.nodeId,'/internal/addons/install',{method:'POST',body:JSON.stringify({serverId,kind,files})});const data=await response.json().catch(()=>({}));return NextResponse.json(data,{status:response.status,headers:{'Cache-Control':'private, no-store'}})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Kurulum başarısız'},{status:502})}
}

export async function GET(request: NextRequest) {
  const mode=request.nextUrl.searchParams.get('mode')??'versions'
  const loader=normalizeLoader(request.nextUrl.searchParams.get('loader')??'vanilla')
  const mcVersion=cleanQuery(request.nextUrl.searchParams.get('mcVersion'),30)
  if(mode==='addons'){
    const query=cleanQuery(request.nextUrl.searchParams.get('query'))
    const kind=addonKind(request.nextUrl.searchParams.get('kind'))
    const source=sourceName(request.nextUrl.searchParams.get('source'))
    if(loader==='vanilla')return NextResponse.json({results:[],source,capabilities:{curseforge:!!process.env.CURSEFORGE_API_KEY},warning:'Vanilla sunucularda mod/plugin market kurulumu desteklenmiyor.'})
    try{
      const results=source==='curseforge'?await curseforgeSearch(query,kind,loader,mcVersion):await modrinthSearch(query,kind,loader,mcVersion)
      return NextResponse.json({results,source,capabilities:{curseforge:!!process.env.CURSEFORGE_API_KEY},compatibility:{loader,mcVersion,kind}},{headers:{'Cache-Control':'private, max-age=30'}})
    }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Eklenti kataloğu alınamadı',source,capabilities:{curseforge:!!process.env.CURSEFORGE_API_KEY}},{status:502})}
  }
  if(mode==='addon-plan'){
    const projectId=cleanQuery(request.nextUrl.searchParams.get('projectId'),100)
    const kind=addonKind(request.nextUrl.searchParams.get('kind'))
    const source=sourceName(request.nextUrl.searchParams.get('source'))
    if(!projectId)return NextResponse.json({error:'projectId gerekli'},{status:400})
    if(loader==='vanilla')return NextResponse.json({error:'Vanilla sunucularda mod/plugin market kurulumu desteklenmiyor'},{status:400})
    try{
      const plan=source==='curseforge'?await curseforgePlan(projectId,kind,loader,mcVersion):await modrinthPlan(projectId,kind,loader,mcVersion)
      if(!plan.length)throw new Error('Kurulum planı boş')
      if(plan.length>24)throw new Error('Bağımlılık sayısı güvenli kurulum sınırını aşıyor')
      return NextResponse.json({plan,source,compatibility:{loader,mcVersion,kind},dependencyCount:Math.max(0,plan.length-1)},{headers:{'Cache-Control':'private, no-store'}})
    }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Kurulum planı oluşturulamadı'},{status:502})}
  }

  try {
    const manifest = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { next: { revalidate: 3600 } }).then(r => { if (!r.ok) throw new Error('Mojang kataloğu alınamadı'); return r.json() }) as MojangManifest
    const minecraft = manifest.versions.filter(v => v.type === 'release').slice(0, 80).map(v => v.id)
    if (!mcVersion || loader === 'vanilla' || loader === 'paper') return NextResponse.json({ minecraft, loaderVersions: [] })
    if (loader === 'fabric') {
      const rows = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`, { next: { revalidate: 3600 } }).then(r => r.ok ? r.json() : []) as Array<{ loader: { version: string; stable: boolean } }>
      return NextResponse.json({ minecraft, loaderVersions: rows.map(x => x.loader.version).slice(0, 30) })
    }
    const metadataUrl = loader === 'forge' ? 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml' : 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
    const metadata = await fetchMetadata(metadataUrl, loader, mcVersion)
    const allVersions = [...metadata.body.matchAll(/<version>([^<]+)<\/version>/g)].map(x => x[1]).filter(Boolean)
    const prefix = loader === 'neoforge' ? neoForgePrefix(mcVersion) : null
    const versions = allVersions.filter(v => loader === 'forge' ? v.startsWith(`${mcVersion}-`) : v.startsWith(prefix!) && /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(v)).reverse().slice(0, 80)
    console.info('[catalog:versions]', { loader, mcVersion, host: new URL(metadataUrl).hostname, status: metadata.status, contentType: metadata.contentType, total: allVersions.length, filtered: versions.length })
    if (versions.length === 0) return NextResponse.json({ error: loader === 'neoforge' ? 'NeoForge sürüm kataloğu alınamadı' : 'Forge sürüm kataloğu alınamadı', code: loader === 'neoforge' ? 'NEOFORGE_CATALOG_EMPTY' : 'FORGE_CATALOG_EMPTY' }, { status: 502 })
    return NextResponse.json({ minecraft, loaderVersions: versions })
  } catch (error) { console.error('[catalog:error]', { loader, mcVersion, message: error instanceof Error ? error.message : 'Katalog hatası' }); return NextResponse.json({ error: error instanceof Error ? error.message : 'Katalog hatası', code: loader === 'neoforge' ? 'NEOFORGE_CATALOG_ERROR' : 'CATALOG_ERROR' }, { status: 502 }) }
}
