export function parseTickMetrics(raw: string) {
  const lines = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/§[0-9a-fklmnor]/gi, '').split(/\r?\n/)
    .map(line => line.replace(/^(?:\[[^\]]+\] \[[^\]]+\/INFO\]|\[\d{2}:\d{2}:\d{2} INFO\]):\s*/, '').trim())
  let tps: number | null = null, mspt: number | null = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const tpsMatch = line.match(/^TPS from last 1m, 5m, 15m:\s*\*?([\d.]+)/i)
    if (tpsMatch) { const value = Number(tpsMatch[1]); if (Number.isFinite(value) && value >= 0 && value <= 100) tps = value }
    if (/^Server tick times \(avg\/min\/max\)/i.test(line)) {
      const next = lines[index + 1] ?? ''
      const match = next.match(/^(?:◴\s*)?([\d.]+)\/[\d.]+\/[\d.]+/)
      if (match) { const value = Number(match[1]); if (Number.isFinite(value) && value >= 0) mspt = value }
    }
    const vanilla = line.match(/^Average tick time:\s*([\d.]+)ms\b/i)
    if (vanilla) { const value = Number(vanilla[1]); if (Number.isFinite(value) && value >= 0) mspt = value }
  }
  return { tps, mspt }
}
export function parseProcessStat(raw: string) {
  const end = raw.lastIndexOf(')')
  if (end < 0) throw new Error('Invalid process stat')
  const fields = raw.slice(end + 2).trim().split(/\s+/)
  const cpuTicks = Number(fields[11]) + Number(fields[12])
  const startTicks = Number(fields[19])
  if (!Number.isFinite(cpuTicks) || !Number.isFinite(startTicks)) throw new Error('Invalid process counters')
  return { cpuTicks, startTicks }
}
export function totalCpuTicks(raw: string) {
  const fields = raw.split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number)
  // guest/guest_nice are already included in user/nice; do not count twice.
  if (fields.length !== 8 || fields.some(value => !Number.isFinite(value))) throw new Error('Invalid host counters')
  return fields.reduce((sum, value) => sum + value, 0)
}
