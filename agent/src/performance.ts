import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export const performanceProfiles = {
  balanced: { 'view-distance': 8, 'simulation-distance': 6 },
  lowResource: { 'view-distance': 6, 'simulation-distance': 4 },
} as const
const keys = ['view-distance', 'simulation-distance'] as const
type Values = Record<(typeof keys)[number], string | null>
type Backup = { version: 1; createdAt: string; before: Values; applied: Values }

export function distanceValues(raw: string): Values {
  const values: Values = { 'view-distance': null, 'simulation-distance': null }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(view-distance|simulation-distance)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1] as keyof Values] = match[2]
  }
  return values
}
export function replaceDistances(raw: string, values: Values) {
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/).filter(line => !/^\s*(view-distance|simulation-distance)\s*=/.test(line))
  while (lines.at(-1) === '') lines.pop()
  for (const key of keys) if (values[key] !== null) lines.push(`${key}=${values[key]}`)
  return lines.join(newline) + newline
}
async function atomicWrite(path: string, content: string) {
  const temp = `${path}.${randomUUID()}.tmp`
  try { await writeFile(temp, content, { mode: 0o600 }); await rename(temp, path) }
  finally { await rm(temp, { force: true }) }
}
async function loadBackup(path: string): Promise<Backup | null> {
  let raw: string
  try { raw = await readFile(path, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  const value = JSON.parse(raw) as Backup
  if (value.version !== 1 || !value.before || !value.applied || !keys.every(key =>
    (value.before[key] === null || typeof value.before[key] === 'string') && typeof value.applied[key] === 'string')) {
    throw new Error('Performans yedeği geçersiz; dosyaya yazılmadı')
  }
  return value
}
export async function performanceStatus(propertiesPath: string, backupPath: string) {
  const current = distanceValues(await readFile(propertiesPath, 'utf8'))
  const backup = await loadBackup(backupPath)
  return { version: 1, current, profiles: performanceProfiles, backup: backup ? { createdAt: backup.createdAt, before: backup.before, applied: backup.applied } : null }
}
export async function applyPerformance(propertiesPath: string, backupPath: string, profile: string) {
  if (!(profile in performanceProfiles) || !Object.hasOwn(performanceProfiles, profile)) throw new Error('Geçersiz performans profili')
  if (await loadBackup(backupPath)) throw new Error('Yeni profil uygulamadan önce mevcut performans yedeğini geri alın')
  const raw = await readFile(propertiesPath, 'utf8')
  const before = distanceValues(raw)
  const targets = performanceProfiles[profile as keyof typeof performanceProfiles]
  // A reduction profile must never increase an already lower distance.
  const applied = Object.fromEntries(keys.map(key => {
    const current = Number(before[key])
    return [key, String(before[key] !== null && Number.isInteger(current) && current >= 2 ? Math.min(current, targets[key]) : targets[key])]
  })) as Values
  applied['simulation-distance'] = String(Math.min(Number(applied['simulation-distance']), Number(applied['view-distance'])))
  if (keys.every(key => before[key] === applied[key])) throw new Error('Mesafeler zaten bu profil kadar düşük; değişiklik yapılmadı')
  const backup: Backup = { version: 1, createdAt: new Date().toISOString(), before, applied }
  await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 })
  await atomicWrite(backupPath, JSON.stringify(backup))
  // Keep the backup on write failure so recovery remains possible.
  await atomicWrite(propertiesPath, replaceDistances(raw, applied))
  return { applied, restartRequired: true, backupCreatedAt: backup.createdAt }
}
export async function restorePerformance(propertiesPath: string, backupPath: string) {
  const backup = await loadBackup(backupPath)
  if (!backup) throw new Error('Geri alınabilecek performans yedeği yok')
  const raw = await readFile(propertiesPath, 'utf8')
  const current = distanceValues(raw)
  if (!keys.every(key => current[key] === backup.applied[key] || current[key] === backup.before[key])) {
    throw new Error('Mesafeler profil sonrasında değiştirilmiş; mevcut ayarları korumak için geri alma durduruldu')
  }
  await atomicWrite(propertiesPath, replaceDistances(raw, backup.before))
  await rm(backupPath)
  return { restored: backup.before, restartRequired: true }
}
