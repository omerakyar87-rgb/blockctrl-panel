import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { link, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
const exec = promisify(execFile)
export const optimizationProjects = [
  { id: 'gvQqBUqZ', key: 'lithium', name: 'Lithium', purpose: 'Tick, fizik ve yapay zekâ hesaplamalarının CPU maliyetini azaltır.' },
  { id: 'uXXizFIs', key: 'ferritecore', name: 'FerriteCore', purpose: 'Oyun verilerinin bellekte kapladığı alanı azaltır.' },
  { id: 'nmDcB62a', key: 'modernfix', name: 'ModernFix', purpose: 'Modlu sunucularda bellek, yükleme ve bazı hesaplama maliyetlerini azaltır.' },
] as const
export type ModVersion = { id: string; project_id: string; name: string; version_type: string; game_versions: string[]; loaders: string[]; date_published: string; environment?: string; dependencies: { dependency_type: string; project_id?: string | null; version_id?: string | null }[]; files: { filename: string; url: string; size: number; primary: boolean; hashes: { sha512?: string } }[] }
type Installed = { key: string; file: string; sha512: string; versionId: string; installedAt: string }
const cache = new Map<string, { at: number; versions: ModVersion[] }>()
const modLoaders = new Set(['fabric', 'quilt', 'forge', 'neoforge'])
const headers = { 'User-Agent': 'BlockCtrl/2 (github.com/omerakyar87-rgb/minecrfat-server)' }
export function selectOptimizationVersion(versions: ModVersion[], project: string, loader: string, minecraft: string) {
  return versions.filter(v => v.project_id === project && v.version_type === 'release' && v.loaders.includes(loader) && v.game_versions.includes(minecraft)
    && !['client_only', 'client_only_server_optional', 'singleplayer_only'].includes(v.environment ?? '')
    && !(v.dependencies ?? []).some(d => ['required', 'incompatible'].includes(d.dependency_type)))
    .sort((a, b) => Date.parse(b.date_published) - Date.parse(a.date_published))[0] ?? null
}
async function versionsFor(project: string, loader: string, minecraft: string, fresh = false) {
  const key = `${project}:${loader}:${minecraft}`, old = cache.get(key)
  if (!fresh && old && Date.now() - old.at < 300_000) return old.versions
  const query = new URLSearchParams({ loaders: JSON.stringify([loader]), game_versions: JSON.stringify([minecraft]), include_changelog: 'false' })
  const response = await fetch(`https://api.modrinth.com/v2/project/${project}/version?${query}`, { headers, signal: AbortSignal.timeout(8000), redirect: 'error' })
  if (!response.ok) throw new Error(`Modrinth sürüm bilgisi alınamadı (HTTP ${response.status})`)
  const versions = await response.json() as ModVersion[]
  if (!Array.isArray(versions)) throw new Error('Geçersiz Modrinth yanıtı')
  if (cache.size > 128) cache.clear()
  cache.set(key, { at: Date.now(), versions }); return versions
}
async function manifests(path: string): Promise<Installed[]> {
  try {
    const entries = JSON.parse(await readFile(path, 'utf8')) as Installed[]
    if (!Array.isArray(entries) || entries.some(row => !optimizationProjects.some(p => p.key === row.key) || !/^[a-zA-Z0-9._+-]+\.jar$/.test(row.file) || !/^[a-f0-9]{128}$/.test(row.sha512))) throw new Error('Optimizasyon kurulum kaydı geçersiz')
    return entries
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
}
async function saveManifest(path: string, entries: Installed[]) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${randomUUID()}.tmp`
  try { await writeFile(temp, JSON.stringify(entries), { mode: 0o600 }); await rename(temp, path) } finally { await rm(temp, { force: true }) }
}
async function safeMods(root: string) {
  const path = join(root, 'mods'), info = await lstat(path).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error })
  if (info?.isSymbolicLink() || (info && !info.isDirectory())) throw new Error('Mods dizini normal bir klasör olmalı')
  if (info && await realpath(path) !== join(await realpath(root), 'mods')) throw new Error('Mods dizini sunucu dışında')
  return path
}
async function installedModIds(root: string) {
  const path = await safeMods(root)
  const files = await readdir(path).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error })
  if (!files.some(file => file.endsWith('.jar'))) return [] as string[]
  // ZIP metadata only: never load or execute a downloaded JAR during inspection.
  const script = `import json,zipfile,pathlib,re,sys
ids=set()
files=list(pathlib.Path(sys.argv[1]).glob('*.jar'))
if len(files)>512: raise RuntimeError('Mod inventory exceeds limit')
for path in files:
 if path.is_symlink(): raise RuntimeError('Symlinked mod cannot be inspected safely')
 with zipfile.ZipFile(path) as jar:
  for name in ['fabric.mod.json','quilt.mod.json','META-INF/mods.toml','META-INF/neoforge.mods.toml']:
   try: info=jar.getinfo(name)
   except KeyError: continue
   if info.file_size>1048576: raise RuntimeError('Mod metadata too large')
   text=jar.read(info).decode('utf-8')
   if name=='fabric.mod.json': ids.add(str(json.loads(text).get('id','')))
   elif name=='quilt.mod.json': ids.add(str(json.loads(text).get('quilt_loader',{}).get('id','')))
   else: ids.update(re.findall(r"""(?m)^\\s*modId\\s*=\\s*["']([^"']+)""",text))
print(json.dumps(sorted(ids)))`
  const { stdout } = await exec('python3', ['-c', script, path], { timeout: 10_000, maxBuffer: 128 * 1024 })
  return JSON.parse(stdout) as string[]
}
export async function optimizationModStatus(root: string, manifestPath: string, loader: string, minecraft: string) {
  const managed = await manifests(manifestPath)
  if (!modLoaders.has(loader)) return { loader, minecraft, managed, items: [], reason: 'Bu sunucu türü mod yüklemiyor. Java çalışma profili kullanılabilir; oyun motoru değiştirilmez.' }
  let ids: string[]
  try { ids = await installedModIds(root) } catch { return { loader, minecraft, managed, items: [], reason: 'Mevcut JAR envanteri okunamadı. Python 3 ve mod arşivlerini kontrol edin.' } }
  const items = await Promise.all(optimizationProjects.map(async project => {
    if (ids.includes(project.key)) return { ...project, available: false, installed: true, reason: 'Zaten kurulu; ikinci kopya yüklenmez.' }
    if (project.key === 'ferritecore' && ids.includes('hydrogen')) return { ...project, available: false, installed: false, reason: 'Hydrogen ile bellek optimizasyonu çakışabilir; otomatik kurulum kapalı.' }
    try {
      const version = selectOptimizationVersion(await versionsFor(project.id, loader, minecraft), project.id, loader, minecraft)
      return { ...project, available: !!version, installed: false, versionId: version?.id, versionName: version?.name, reason: version ? null : 'Bu sürüm/tür için bağımlılıksız kararlı dosya bulunamadı.' }
    } catch (error) { return { ...project, available: false, installed: false, reason: (error as Error).message } }
  }))
  return { loader, minecraft, managed, items, reason: null }
}
export async function installOptimizationMod(root: string, manifestPath: string, key: string, versionId: string, loader: string, minecraft: string) {
  const project = optimizationProjects.find(p => p.key === key)
  if (!project || !modLoaders.has(loader)) throw new Error('Desteklenmeyen optimizasyon modu')
  const ids = await installedModIds(root)
  if (ids.includes(key)) throw new Error('Bu mod zaten kurulu; ikinci kopya yüklenmedi')
  if (key === 'ferritecore' && ids.includes('hydrogen')) throw new Error('Hydrogen çakışması nedeniyle kurulum durduruldu')
  const version = selectOptimizationVersion((await versionsFor(project.id, loader, minecraft, true)).filter(v => v.id === versionId), project.id, loader, minecraft)
  if (!version) throw new Error('Seçilen dosyanın Minecraft sürümü, sunucu türü veya bağımlılıkları uyumlu değil. Listeyi yenileyin.')
  const file = version.files.find(f => f.primary) ?? version.files[0]
  if (!file || !/^[a-zA-Z0-9._+-]+\.jar$/.test(file.filename) || !/^[a-f0-9]{128}$/i.test(file.hashes.sha512 ?? '') || file.size <= 0 || file.size > 32 * 1024 * 1024) throw new Error('Kurulum dosyası doğrulanamadı')
  const url = new URL(file.url)
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.modrinth.com' || url.port || url.username || url.password || !url.pathname.startsWith(`/data/${project.id}/versions/${version.id}/`)) throw new Error('Dosya güvenilir Modrinth projesine ait değil')
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (!response.ok || !response.body) throw new Error('Optimizasyon modu indirilemedi')
  const chunks: Uint8Array[] = []; let bytes = 0
  const reader = response.body.getReader()
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > file.size || bytes > 32 * 1024 * 1024) throw new Error('Dosya boyutu doğrulanamadı'); chunks.push(value) } } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const content = Buffer.concat(chunks), sha512 = createHash('sha512').update(content).digest('hex')
  if (bytes !== file.size || sha512 !== file.hashes.sha512?.toLowerCase()) throw new Error('SHA-512 doğrulaması başarısız; mod yüklenmedi')
  const path = await safeMods(root); await mkdir(path, { recursive: true })
  const target = join(path, file.filename)
  const entries = await manifests(manifestPath)
  if (entries.some(row => row.key === key)) throw new Error('Bu modun yönetilen kurulum kaydı var; önce geri alın')
  // Write recovery manifest first; exclusive creation never overwrites an existing mod.
  if (await lstat(target).catch(() => null)) throw new Error('Aynı adlı dosya mevcut; üzerine yazılmadı')
  const entry = { key, file: file.filename, sha512, versionId: version.id, installedAt: new Date().toISOString() }
  await saveManifest(manifestPath, [...entries, entry])
  const temporary = join(path, `.blockctrl-${randomUUID()}.tmp`)
  try { await writeFile(temporary, content, { flag: 'wx', mode: 0o600 }); await link(temporary, target) } finally { await rm(temporary, { force: true }) }
  return { installed: true, name: project.name, version: version.name, restartRequired: true }
}
export async function removeOptimizationMod(root: string, manifestPath: string, key: string) {
  const entries = await manifests(manifestPath), entry = entries.find(row => row.key === key)
  if (!entry) throw new Error('Bu mod panel tarafından kurulmamış; dosyalarına dokunulmadı')
  const path = join(await safeMods(root), entry.file)
  const info = await lstat(path).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error })
  if (info) {
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Mod dosyası değişmiş; geri alma durduruldu')
    const current = createHash('sha512').update(await readFile(path)).digest('hex')
    if (current !== entry.sha512) throw new Error('Mod dosyası sonradan değişmiş; geri alma durduruldu')
    await rm(path)
  }
  await saveManifest(manifestPath, entries.filter(row => row.key !== key))
  return { removed: key, restartRequired: true }
}
