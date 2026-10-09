import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
async function load(path) {
  const source = await readFile(new URL('../../'+path, import.meta.url), 'utf8')
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import('data:text/javascript;base64,'+Buffer.from(result.outputText).toString('base64'))
}
const performance = await load('agent/src/performance.ts')
const metrics = await load('agent/src/performance-metrics.ts')
async function fixture(t, raw) {
  const root = await mkdtemp(join(tmpdir(), 'blockctrl-performance-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const props = join(root, 'server.properties'), backup = join(root, 'private', 'backup.json')
  await writeFile(props, raw)
  return { props, backup }
}
test('profile backs up distances and restores them without reverting unrelated changes', async t => {
  const { props, backup } = await fixture(t, '# settings\r\nview-distance=12\r\nsimulation-distance=10\r\npvp=true\r\n')
  await performance.applyPerformance(props, backup, 'balanced')
  let raw = await readFile(props, 'utf8')
  assert.match(raw, /view-distance=8\r\n/)
  assert.match(raw, /simulation-distance=6\r\n/)
  await writeFile(props, raw.replace('pvp=true', 'pvp=false'))
  await performance.restorePerformance(props, backup)
  raw = await readFile(props, 'utf8')
  assert.match(raw, /view-distance=12/); assert.match(raw, /simulation-distance=10/); assert.match(raw, /pvp=false/)
  assert.equal((await performance.performanceStatus(props, backup)).backup, null)
})
test('profile never raises lower distances, preserves absent properties on rollback, and rejects duplicate application', async t => {
  const { props, backup } = await fixture(t, 'view-distance=3\nmotd=Hello\n')
  await performance.applyPerformance(props, backup, 'lowResource')
  assert.equal((await performance.performanceStatus(props, backup)).current['view-distance'], '3')
  await assert.rejects(performance.applyPerformance(props, backup, 'balanced'), /önce/)
  await performance.restorePerformance(props, backup)
  assert.equal((await performance.performanceStatus(props, backup)).current['simulation-distance'], null)
})
test('rollback refuses to overwrite externally edited distances', async t => {
  const { props, backup } = await fixture(t, 'view-distance=12\nsimulation-distance=10\n')
  await performance.applyPerformance(props, backup, 'balanced')
  await writeFile(props, (await readFile(props, 'utf8')).replace('view-distance=8', 'view-distance=9'))
  await assert.rejects(performance.restorePerformance(props, backup), /değiştirilmiş/)
  assert.match(await readFile(props, 'utf8'), /view-distance=9/)
  assert.ok((await performance.performanceStatus(props, backup)).backup)
})
test('invalid profiles and corrupt backups fail before writing properties', async t => {
  const { props, backup } = await fixture(t, 'view-distance=12\n')
  await assert.rejects(performance.applyPerformance(props, backup, '__proto__'), /Geçersiz/)
  await performance.applyPerformance(props, backup, 'balanced')
  await writeFile(backup, '{}')
  const before = await readFile(props, 'utf8')
  await assert.rejects(performance.restorePerformance(props, backup), /geçersiz/)
  assert.equal(await readFile(props, 'utf8'), before)
})
test('tick parser handles Paper console formatting and leaves unavailable values null', () => {
  assert.deepEqual(metrics.parseTickMetrics('[12:00:00] [Server thread/INFO]: TPS from last 1m, 5m, 15m: §a*20.0, 19.5, 19.1\n[12:00:00] [Server thread/INFO]: Server tick times (avg/min/max) from last 5s, 10s, 1m:\n[12:00:00] [Server thread/INFO]: ◴ 12.50/1.2/62.8, 11.2/1.0/30.0'), { tps: 20, mspt: 12.5 })
  assert.deepEqual(metrics.parseTickMetrics('[12:00:00 INFO]: TPS from last 1m, 5m, 15m: *19.8, 19.5, 19.1'), { tps: 19.8, mspt: null })
  assert.deepEqual(metrics.parseTickMetrics('The game is running normally at 20.0 ticks per second\nAverage tick time: 4.20ms (Target: 50.0ms)'), { tps: null, mspt: 4.2 })
  assert.deepEqual(metrics.parseTickMetrics('<Player> TPS from last 1m, 5m, 15m: 1\nUnknown command'), { tps: null, mspt: null })
})
test('Linux process counters handle command names with spaces and exclude duplicated guest time', () => {
  const fields = Array(22).fill('0'); fields[0] = 'S'; fields[11] = '80'; fields[12] = '20'; fields[19] = '999'
  assert.deepEqual(metrics.parseProcessStat('123 (java with spaces) '+fields.join(' ')), { cpuTicks: 100, startTicks: 999 })
  assert.equal(metrics.totalCpuTicks('cpu 10 20 30 40 50 60 70 80 1000 2000\ncpu0 0'), 360)
})
