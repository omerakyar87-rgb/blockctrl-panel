import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type RuntimeProfile = 'balanced' | 'memory'
type State = { version: 1; profile: RuntimeProfile; createdAt: string; originalArgs: string | null; writtenHash?: string; previousWrittenHash?: string; lastPid?: number; lastArgs?: string[] }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function standardScript(script: string) {
  const active = script.split(/\r?\n/).filter(line => !line.trim().startsWith('#')).join('\n').trim()
  return /^java\s+@user_jvm_args\.txt\s+@libraries\/[A-Za-z0-9_./+-]+(?:\s+"\$@")?\s*$/.test(active)
}
async function optional(path: string) {
  try { return await readFile(path, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
async function atomic(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${randomUUID()}.tmp`
  try { await writeFile(temp, content, { mode: 0o600 }); await rename(temp, path) } finally { await rm(temp, { force: true }) }
}
async function stateAt(path: string): Promise<State | null> {
  const text = await optional(path)
  if (text === null) return null
  const state = JSON.parse(text) as State
  if (state.version !== 1 || !['balanced', 'memory'].includes(state.profile) || !(state.originalArgs === null || typeof state.originalArgs === 'string')) throw new Error('Çalıştırma optimizasyonu kaydı geçersiz')
  return state
}
export function runtimeArguments(memory: number, profile: string) {
  if (!Number.isInteger(memory) || memory < 1024 || memory > 65536) throw new Error('RAM bütçesi 1024-65536 MB olmalı')
  if (profile !== 'balanced' && profile !== 'memory') throw new Error('Geçersiz çalışma profili')
  const initial = profile === 'memory' ? Math.min(512, memory) : Math.min(2048, Math.max(512, Math.floor(memory / 2)))
  return [`-Xms${initial}M`, `-Xmx${memory}M`, '-XX:+UseG1GC', ...(profile === 'memory' ? ['-XX:+UseStringDeduplication'] : [])]
}
export function validateArgumentFile(text: string) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'))
  // Preserve arbitrary application options, but never combine collectors or hidden argfiles.
  for (const line of lines) {
    if (/^-Xm[sx]\d+[kKmMgG]?\s*$/.test(line.trim())) continue
    if (/(?:-XX:|(?:^|\s)-Xm[sx]|(?:^|\s)@)/.test(line)) throw new Error('Özel JVM/GC seçenekleri var. Çakışmayı önlemek için otomatik optimizasyon uygulanmadı.')
  }
}
export async function launcherCapability(root: string, managedHashes: string[] = []) {
  const script = await optional(join(root, 'run.sh'))
  if (script === null) return { kind: 'jar' as const, supported: true, reason: null }
  const args = await optional(join(root, 'user_jvm_args.txt'))
  if (!standardScript(script)) {
    return { kind: 'script' as const, supported: false, reason: 'Özel run.sh kullanılıyor; Java komutu ve argüman yolu güvenle doğrulanamadı.' }
  }
  try { if (!managedHashes.includes(hash(args ?? ''))) validateArgumentFile(args ?? '') } catch (error) { return { kind: 'script' as const, supported: false, reason: (error as Error).message } }
  const info = await lstat(join(root, 'user_jvm_args.txt')).catch(() => null)
  if (info?.isSymbolicLink()) return { kind: 'script' as const, supported: false, reason: 'JVM argüman dosyası sembolik bağlantı; otomatik yazım kapalı.' }
  return { kind: 'script' as const, supported: true, reason: null }
}
export async function verifyJavaFlags(args: string[]) {
  if (process.env.JAVA_TOOL_OPTIONS || process.env.JDK_JAVA_OPTIONS || process.env._JAVA_OPTIONS) throw new Error('Agent ortamında özel Java seçenekleri var; otomatik profil ile birleştirilemez.')
  const flags = args.filter(value => !/^-Xm[sx]/.test(value))
  await new Promise<void>((resolve, reject) => {
    const child = spawn('java', ['-Xms16M', '-Xmx64M', ...flags, '-version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''; let settled = false
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('Java uyumluluk testi zaman aşımına uğradı')) }, 8000)
    function finish(error?: Error) { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve() }
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-3000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-3000) })
    child.on('error', error => finish(error))
    child.on('close', code => finish(code === 0 ? undefined : new Error(`Kurulu Java bu profili desteklemiyor: ${output.slice(-600)}`)))
  })
}
export async function runtimeOptimizationStatus(root: string, statePath: string, memory: number, pid: number | null) {
  const state = await stateAt(statePath)
  const capability = await launcherCapability(root, [state?.writtenHash, state?.previousWrittenHash].filter((x): x is string => !!x))
  return { version: 2, enabled: !!state, profile: state?.profile ?? null, supported: capability.supported, reason: capability.reason, launcher: capability.kind,
    createdAt: state?.createdAt ?? null, active: !!state && !!pid && state.lastPid === pid,
    arguments: state ? runtimeArguments(memory, state.profile) : [], lastArguments: state?.lastArgs ?? [],
    profiles: { balanced: runtimeArguments(memory, 'balanced'), memory: runtimeArguments(memory, 'memory') } }
}
export async function enableRuntimeOptimization(root: string, statePath: string, memory: number, profile: string) {
  if (await stateAt(statePath)) throw new Error('Önce etkin çalışma profilini geri alın')
  const args = runtimeArguments(memory, profile)
  const capability = await launcherCapability(root)
  if (!capability.supported) throw new Error(capability.reason ?? 'Başlatıcı desteklenmiyor')
  await verifyJavaFlags(args)
  const originalArgs = capability.kind === 'script' ? await optional(join(root, 'user_jvm_args.txt')) : null
  await atomic(statePath, JSON.stringify({ version: 1, profile: profile as RuntimeProfile, createdAt: new Date().toISOString(), originalArgs } satisfies State))
  return { configured: true, restartRequired: true, arguments: args }
}
export async function prepareOptimizedLaunch(root: string, statePath: string, memory: number) {
  const state = await stateAt(statePath)
  if (!state) return null
  const args = runtimeArguments(memory, state.profile)
  await verifyJavaFlags(args)
  const script = await optional(join(root, 'run.sh'))
  if (script !== null) {
    const current = await optional(join(root, 'user_jvm_args.txt'))
    if (state.writtenHash && (current === null || hash(current) !== state.writtenHash && hash(current) !== state.previousWrittenHash)) throw new Error('JVM dosyası sonradan değiştirildi; profil uygulanmadan başlatma durduruldu')
    if (!state.writtenHash && current !== state.originalArgs) throw new Error('JVM dosyası profil seçildikten sonra değişti; önce profili geri alın')
    // Always revalidate the script itself, even if our managed argument file is present.
    if (!standardScript(script)) throw new Error('Başlatıcı değişmiş; otomatik optimizasyon durduruldu')
    if ((await lstat(join(root, 'user_jvm_args.txt')).catch(() => null))?.isSymbolicLink()) throw new Error('JVM dosyası sembolik bağlantı; başlatma durduruldu')
    validateArgumentFile(state.originalArgs ?? '')
    const kept = (state.originalArgs ?? '').split(/\r?\n/).filter(line => !/^\s*-Xm[sx]\d+[kKmMgG]?\s*$/.test(line))
    const next = [...args, ...kept].join('\n') + '\n'
    // Persist both digests before writing so an interrupted launch remains recoverable.
    state.previousWrittenHash = current === null ? undefined : hash(current)
    state.writtenHash = hash(next)
    await atomic(statePath, JSON.stringify(state))
    await atomic(join(root, 'user_jvm_args.txt'), next)
  }
  return args
}
export async function markOptimizedLaunch(statePath: string, pid: number, args: string[]) {
  const state = await stateAt(statePath)
  if (state) await atomic(statePath, JSON.stringify({ ...state, lastPid: pid, lastArgs: args }))
}
export async function disableRuntimeOptimization(root: string, statePath: string) {
  const state = await stateAt(statePath)
  if (!state) throw new Error('Etkin çalışma profili yok')
  if (state.writtenHash) {
    const path = join(root, 'user_jvm_args.txt'), current = await optional(path)
    if (current !== state.originalArgs && (current === null || hash(current) !== state.writtenHash && hash(current) !== state.previousWrittenHash)) throw new Error('JVM dosyası sonradan değişmiş; mevcut ayarları korumak için geri alma durduruldu')
    if (state.originalArgs === null) await rm(path, { force: true })
    else await atomic(path, state.originalArgs)
  }
  await rm(statePath)
  return { restored: true, restartRequired: true }
}
