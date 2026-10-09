'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'

type Status = {
  serverStatus: string; canEdit: boolean; canInstallOptimizationMods: boolean; nodeOnline: boolean; agentSettingsWritable: boolean; pendingApply: boolean
  lastApply?: { id: string; status: string; type: string } | null; lastApplyError?: string | null
  optimizationTarget?: { loader: string; minecraft: string }
  performance?: { backup?: { createdAt: string } | null } | null
  runtimeOptimization?: { version: number; error?: string; enabled: boolean; active: boolean; supported: boolean; reason?: string | null; profile: string | null; arguments: string[]; lastArguments: string[]; profiles: Record<string, string[]> } | null
  optimizationMods?: { reason?: string | null; managed: { key: string; file: string }[]; items: { key: string; name: string; purpose: string; installed: boolean; available: boolean; versionId?: string; versionName?: string; reason?: string | null }[] } | null
  latestMetric?: { createdAt: string; tps: number | null; mspt: number | null; cpuPercent: number; memoryUsedMb: number } | null
}
const profiles = [
  { id: 'balanced', name: 'Dengeli çalışma', description: 'Başlangıç heap boyutunu RAM üst sınırından ayırır. G1 çöp toplayıcısının varsayılan uyarlamasını kullanır.' },
  { id: 'memory', name: 'Bellek odaklı', description: 'Daha küçük başlangıç heap alanı ve tekrarlanan metinleri tekilleştirme. Bellek tasarrufu ek CPU maliyeti getirebilir.' },
] as const
const fetcher = async (url: string): Promise<Status> => {
  const response = await fetch(url, { cache: 'no-store' }); const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Optimizasyon verisi alınamadı')
  return data
}
export function ServerPerformanceCenter({ serverId }: { serverId: string }) {
  const { data, error, mutate } = useSWR(`/api/panel-settings?serverId=${serverId}&performance=1`, fetcher, { refreshInterval: 15_000 })
  const [scan, setScan] = useState(false)
  const mods = useSWR(scan ? `/api/panel-settings?serverId=${serverId}&optimizationMods=1` : null, fetcher, { revalidateOnFocus: false })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [commandId, setCommandId] = useState(''), [profile, setProfile] = useState('balanced')
  const runtime = data?.runtimeOptimization, metric = data?.latestMetric
  const fresh = !!metric && !!data?.nodeOnline && data.serverStatus === 'running' && Date.now() - new Date(metric.createdAt).getTime() < 60_000
  const ready = runtime?.version === 2 && !runtime.error
  const canChange = !!data?.canEdit && data.agentSettingsWritable && !data.pendingApply && !busy
  const finished = !!commandId && data?.lastApply?.id === commandId && data.lastApply.status === 'completed'
  const resultMessage = finished ? 'Agent işlemi tamamladı. Değişiklikler sonraki Minecraft başlangıcında etkinleşir; mod listesini yeniden tarayabilirsiniz.' : message
  async function apply(action: string, key?: string, versionId?: string) {
    setBusy(true); setMessage(''); setCommandId('')
    try {
      const response = await fetch('/api/panel-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId, performanceAction: action, profile, key, versionId }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'İşlem başarısız')
      setCommandId(result.commandId); setMessage(result.message); await mutate()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'İşlem başarısız') }
    finally { setBusy(false) }
  }
  const lag = fresh && ((metric.tps != null && metric.tps < 18) || (metric.mspt != null && metric.mspt > 50))
  const catalog = mods.data?.optimizationMods
  return <section className="space-y-4 rounded-2xl border border-cyan-400/20 bg-[#061522] p-4">
    <div><h3 className="font-semibold text-white">CPU / RAM optimizasyonu</h3><p className="mt-1 text-xs text-slate-400">{data?.optimizationTarget?.loader} {data?.optimizationTarget?.minecraft} · Java çalışma profili ve sürüme uygun motor optimizasyonları. Chunk mesafeleri korunur.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[
      ['TPS', fresh && metric.tps != null ? metric.tps.toFixed(1) : 'Veri yok'],
      ['MSPT', fresh && metric.mspt != null ? metric.mspt.toFixed(1) : 'Veri yok'],
      ['CPU (node payı)', fresh ? `${metric.cpuPercent.toFixed(1)}%` : 'Veri yok'],
      ['Bellek (JVM RSS)', fresh ? `${metric.memoryUsedMb} MB` : 'Veri yok'],
    ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-950/60 p-3"><div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value}</div></div>)}</div>
    <p className="text-xs text-slate-300">{!fresh ? 'Son 60 saniyede çalışan sunucudan doğrulanmış ölçüm yok.' : lag ? 'Tick gecikmesi eşiği aşıldı (TPS <18 veya MSPT >50 ms). İşlemci, plugin/mod ve GC yükünü birlikte değerlendirin.' : metric.tps == null && metric.mspt == null ? 'Kaynak ölçümleri geliyor; bu sunucuda TPS/MSPT henüz alınamıyor.' : 'Son tick ölçümü gecikme eşiğinin altında. Optimizasyon etkisini benzer oyuncu yükünde karşılaştırın.'}</p>
    {fresh && <p className="text-xs text-slate-500">Ölçüm: {new Date(metric.createdAt).toLocaleString('tr-TR')}</p>}
    {!ready && <p className="text-xs text-amber-200">{runtime?.error || 'CPU/RAM modülü için agent güncellemesini tamamlayın.'}</p>}
    {ready && !runtime.supported && <p className="text-xs text-amber-200">{runtime.reason}</p>}
    <div className="grid gap-3 md:grid-cols-2">{profiles.map(item => <button key={item.id} onClick={() => setProfile(item.id)} aria-pressed={profile === item.id} className={`rounded-xl border p-3 text-left ${profile === item.id ? 'border-cyan-400/50 bg-cyan-400/10' : 'border-slate-700'}`}><div className="text-sm font-semibold text-white">{item.name}</div><p className="mt-1 text-xs text-slate-400">{item.description}</p></button>)}</div>
    {runtime?.enabled && <p className="text-xs text-cyan-200">Seçili çalışma profili: {runtime.profile === 'memory' ? 'Bellek odaklı' : 'Dengeli'} · {runtime.active ? 'Bu başlangıçta uygulandı' : 'Sonraki başlangıçta uygulanacak'}</p>}
    <p className="text-xs text-slate-400">RAM üst sınırı korunur. Profil, kurulu Java ile test edilir; desteklenmeyen veya özel JVM seçenekleriyle çakışan ayarlar uygulanmaz. Performans kazanımı iş yüküne bağlıdır.</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={!canChange || !ready || !runtime?.supported || runtime.enabled} onClick={() => apply('runtime-enable')}>Çalışma profilini etkinleştir</Button>
      <Button variant="outline" disabled={!canChange || !ready || !runtime?.enabled} onClick={() => apply('runtime-disable')}>Çalışma profilini geri al</Button>
    </div>
    <div className="space-y-3 border-t border-slate-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">Uyumlu optimizasyon modları</h4><Button variant="outline" disabled={!ready || !data?.nodeOnline || mods.isValidating} onClick={() => { if (scan) void mods.mutate(); else setScan(true) }}>{mods.isValidating ? 'Taranıyor…' : 'Uyumlu modları tara'}</Button></div>
      <p className="text-xs text-slate-400">Minecraft sürümü ve Fabric / Quilt / Forge / NeoForge türüyle eşleşen kararlı dosyalar seçilir. Vanilla ve Paper ailesi Java çalışma katmanını kullanır. Mevcut sunucu türü otomatik değiştirilmez.</p>
      {mods.error && <p className="text-xs text-amber-200">{mods.error.message}</p>}
      {catalog?.reason && <p className="text-xs text-slate-300">{catalog.reason}</p>}
      {catalog?.items.map(item => <div key={item.key} className="rounded-xl border border-slate-800 p-3"><div className="flex items-center justify-between gap-3"><div><b className="text-sm text-white">{item.name}</b><p className="mt-1 text-xs text-slate-400">{item.purpose}</p></div><Button disabled={!canChange || !data?.canInstallOptimizationMods || !item.available || catalog.managed.some(row => row.key === item.key)} onClick={() => apply('mod-install', item.key, item.versionId)}>Kur</Button></div><p className="mt-2 text-xs text-slate-500">{item.reason || item.versionName}</p></div>)}
      {catalog?.managed.map(item => <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 p-3"><span className="min-w-0 break-all text-xs text-cyan-200">Panel kurulum kaydı: {item.file}</span><Button variant="outline" disabled={!canChange || !data?.canInstallOptimizationMods} onClick={() => apply('mod-remove', item.key)}>Kurulumu geri al</Button></div>)}
      <p className="text-xs text-slate-500">Gerekli ek bağımlılığı veya bildirilmiş çakışması olan sürümlerin otomatik kurulumu kapalıdır. Dosyalar SHA-512 ile doğrulanır; aynı modun ikinci kopyası yüklenmez. Mod paketiyle davranış uyumluluğu sunucu açıldıktan sonra kontrol edilmelidir.</p>
    </div>
    {data?.performance?.backup && <div className="rounded-lg border border-amber-500/30 p-3"><p className="mb-2 text-xs text-amber-200">Önceki mesafe profilinin yedeği var. Eski görüş ve simülasyon değerlerini geri alabilirsiniz.</p><Button variant="outline" disabled={!canChange} onClick={() => apply('restore')}>Eski chunk mesafelerini geri yükle</Button></div>}
    {!data?.agentSettingsWritable && <p className="text-xs text-amber-200">Değişiklikler için Minecraft sunucusunu tamamen durdurun ve agent bağlantısını kontrol edin.</p>}
    {data?.pendingApply && <p className="text-xs text-amber-200">Agent işlemi bekleniyor; sonuç otomatik yenilenecek.</p>}
    {(resultMessage || data?.lastApplyError || error) && <p role="status" className="text-xs text-amber-200">{error?.message || data?.lastApplyError || resultMessage}</p>}
  </section>
}
