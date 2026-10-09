'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, ExternalLink, Image as ImageIcon, MonitorPlay, Palette, Pencil, Radio, Settings2, Sparkles, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

export type HeroMediaType = 'image' | 'gif' | 'video'
export type MinecraftServerHeroCardProps = {
  serverTitle?: string
  mediaUrl?: string
  mediaType?: HeroMediaType
  subtitles?: string[]
  ipAddress?: string
  playersOnline?: number
  playersMax?: number
  ping?: number
  onSave?: (values: { serverTitle: string; mediaUrl: string; mediaType: HeroMediaType; subtitles: string[]; ipAddress: string }) => void
  onClose?: () => void
}

const defaultSubtitles = ['⚡ Sezon 4 Açıldı! Özel Büyüler & Savaşlar!', "play.createsmp.com · Discord'a Katıl!", '✦ %50 İndirimli VIP Satışları Başladı!']

export function MinecraftServerHeroCard({ serverTitle = 'Create SMP', mediaUrl = '', mediaType = 'image', subtitles = defaultSubtitles, ipAddress = 'play.createsmp.com', playersOnline = 142, playersMax = 250, ping = 24, onSave, onClose }: MinecraftServerHeroCardProps) {
  const [editing, setEditing] = useState(true)
  const [title, setTitle] = useState(serverTitle)
  const [url, setUrl] = useState(mediaUrl)
  const [type, setType] = useState<HeroMediaType>(mediaType)
  const [ip, setIp] = useState(ipAddress)
  const [subtitleText, setSubtitleText] = useState(subtitles.join('\n'))
  const [subtitleIndex, setSubtitleIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [copied, setCopied] = useState(false)
  const subtitleList = useMemo(() => subtitleText.split('\n').map((item) => item.trim()).filter(Boolean), [subtitleText])
  const currentSubtitle = subtitleList[subtitleIndex % Math.max(subtitleList.length, 1)] || 'A Minecraft Server'

  useEffect(() => {
    let cursor = 0
    setTyped('')
    const timer = window.setInterval(() => {
      cursor += 1
      setTyped(currentSubtitle.slice(0, cursor))
      if (cursor >= currentSubtitle.length) window.clearInterval(timer)
    }, 42)
    return () => window.clearInterval(timer)
  }, [currentSubtitle])

  useEffect(() => {
    const timer = window.setInterval(() => setSubtitleIndex((index) => (index + 1) % Math.max(subtitleList.length, 1)), 5000)
    return () => window.clearInterval(timer)
  }, [subtitleList.length])

  async function copyIp() {
    await navigator.clipboard?.writeText(ip)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  function save() {
    onSave?.({ serverTitle: title, mediaUrl: url, mediaType: type, subtitles: subtitleList, ipAddress: ip })
    setEditing(false)
  }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6">
    <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#050b08] shadow-[0_24px_100px_rgba(0,0,0,.65)] sm:min-h-[calc(100vh-3rem)]"><header className="flex items-center justify-between border-b border-emerald-400/10 px-4 py-4 sm:px-6"><div><p className="flex items-center gap-2 text-sm font-semibold text-slate-100"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#4ade80]"/>BLOCKCTRL Sunucu Düzenleyici</p><p className="mt-1 text-xs text-slate-500">Seçili sunucunun vitrin görünümünü ve bağlantı bilgilerini yönetin.</p></div><button onClick={() => { setEditing(false); onClose?.() }} className="rounded-lg px-3 py-2 text-xs text-slate-500 transition hover:bg-white/5 hover:text-white">Kapat</button></header><div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]"><section className="min-w-0 overflow-y-auto p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-4 px-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-300/80"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee]"/>Canlı görünüm</span><span className="text-slate-500">Anlık önizleme</span></div>
      <motion.div layout className="overflow-hidden rounded-2xl border border-cyan-400/40 bg-[#080d1d]/90 shadow-[0_0_45px_rgba(34,211,238,0.12)] backdrop-blur-xl">
        <div className="relative h-64 overflow-hidden">
          {type === 'video' && url ? <video src={url} className="absolute inset-0 size-full object-cover" autoPlay loop muted playsInline /> : url ? <img src={url} alt="Sunucu kapağı" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.25),transparent_25%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,.32),transparent_30%),linear-gradient(125deg,#111827,#050816_65%,#111827)]" />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#030712]/20 via-[#030712]/25 to-[#080d1d]" />
          <div className="relative flex items-center justify-between p-4"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-950/50 px-3 py-1.5 text-xs font-semibold text-emerald-300"><span className="size-2 animate-pulse rounded-full bg-emerald-400"/>ÇEVRİMİÇİ</span><span className="inline-flex items-center gap-2 rounded-full border border-slate-600/70 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200"><Radio className="size-3.5 text-cyan-300"/>{ping} ms</span></div>
          <div className="absolute bottom-0 left-5 translate-y-1/2"><div className="grid size-16 place-items-center rounded-2xl border-2 border-cyan-300 bg-slate-900/90 text-3xl shadow-[0_0_24px_rgba(34,211,238,.4)]">◈</div></div>
        </div>
        <div className="space-y-5 p-5 pt-10 sm:p-6 sm:pt-10"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-2xl font-extrabold text-transparent">{title}</h2><span className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-slate-950/60 px-3 py-1.5 text-sm font-bold text-cyan-200"><Sparkles className="size-4"/>{playersOnline} / {playersMax}</span></div><div className="min-h-12 rounded-xl border border-slate-700/80 bg-slate-950/70 px-4 py-3 font-mono text-sm text-cyan-300 shadow-inner"><AnimatePresence mode="wait"><motion.span key={currentSubtitle} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} className="drop-shadow-[0_0_8px_rgba(34,211,238,.55)">{typed}<span className="animate-pulse">▋</span></motion.span></AnimatePresence></div><div className="flex flex-col gap-3 sm:flex-row"><button onClick={copyIp} className="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left transition hover:border-cyan-400/50"><span className="flex min-w-0 items-center gap-2 truncate font-mono text-sm text-cyan-300"><MonitorPlay className="size-4 shrink-0 text-slate-400"/>{ip}</span><span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400 group-hover:text-cyan-200">{copied ? <Check className="size-4 text-emerald-400"/> : <Copy className="size-4"/>}{copied ? 'IP Kopyalandı' : 'Kopyala'}</span></button><button className="relative overflow-hidden rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 font-bold text-slate-950 shadow-[0_0_25px_rgba(34,211,238,.25)] transition hover:-translate-y-0.5 hover:shadow-[0_0_35px_rgba(139,92,246,.45)]"><span className="relative flex items-center gap-2">Katıl <ExternalLink className="size-4"/></span></button></div></div>
      </motion.div>
    </section>
    {editing && <motion.aside initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} className="border-t border-emerald-400/10 bg-[#07110c] p-5 lg:border-l lg:border-t-0 sm:p-6"><div className="mb-5 flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-bold text-white"><Settings2 className="size-5 text-cyan-300"/>Sunucu Kapak Düzenleyici</h3><button onClick={() => { setEditing(false); onClose?.() }} className="text-xs text-slate-500 hover:text-white">Kapat</button></div><div className="space-y-4"><label className="block text-xs font-semibold text-slate-400">Sunucu Adı<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400"/></label><div><p className="mb-2 text-xs font-semibold text-slate-400">Kapak Medya Türü</p><div className="grid grid-cols-3 gap-2">{([['gif','GIF / Resim',ImageIcon],['video','Canlı Video',Video],['image','Ön Tanımlı',Palette]] as const).map(([value, label, Icon]) => <button key={value} onClick={() => setType(value)} className={`rounded-xl border px-2 py-2 text-xs transition ${type === value ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}><Icon className="mx-auto mb-1 size-4"/>{label}</button>)}</div></div><label className="block text-xs font-semibold text-slate-400">Medya URL<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-xs text-white outline-none transition focus:border-cyan-400"/></label><label className="block text-xs font-semibold text-slate-400">Alt Yazılar / MOTD<textarea value={subtitleText} onChange={(event) => setSubtitleText(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-white outline-none transition focus:border-cyan-400"/></label><label className="block text-xs font-semibold text-slate-400">IP Adresi<input value={ip} onChange={(event) => setIp(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-cyan-400"/></label><button onClick={save} className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"><Pencil className="mr-2 inline size-4"/>Önizlemeyi Kaydet</button></div></motion.aside>}</div></div>
    {!editing && <button onClick={() => setEditing(true)} className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full border border-cyan-300/40 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-cyan-200 shadow-2xl backdrop-blur"><Pencil className="size-4"/>Düzenle</button>}
  </div>
}

export default MinecraftServerHeroCard
