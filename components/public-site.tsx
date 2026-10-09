'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowRight, Box, CheckCircle2, Database, FileText, Folder, Globe2, Headphones,
  Menu, Network, Play, Server, ShieldCheck, Sparkles, Terminal, Users, X
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

const nav = [
  ['/', 'Ana Sayfa'],
  ['/information', 'Bilgilendirme'],
  ['/about', 'Hakkımızda'],
  ['/support', 'Destek'],
] as const

const features = [
  [Terminal, 'Konsol', 'Gerçek zamanlı konsol erişimi ve gelişmiş komut yönetimi.'],
  [Users, 'Oyuncular', 'Oyuncu listesi, yetkiler ve detaylı oyuncu istatistikleri.'],
  [Folder, 'Dosya Yöneticisi', 'Sunucu dosyalarına güvenli erişim, düzenleme ve yükleme.'],
  [Globe2, 'Dünyalar', 'Dünya yönetimi, yedekleme ve geri yükleme araçları.'],
  [Box, 'Eklentiler / Modlar', 'Kurulum, güncelleme ve içerik yönetimi.'],
  [Network, 'SFTP', 'Güvenli ve profesyonel dosya aktarım desteği.'],
  [Database, 'Veritabanları', 'MySQL, MariaDB ve bağlı veri servisleri.'],
  [ShieldCheck, 'Güvenlik', 'Erişim kontrolü, loglama ve gelişmiş güvenlik ayarları.'],
] as const

export function PublicSite({ page='home' }: { page?: 'home'|'about'|'information'|'support' }) {
  const pathname = usePathname()
  const [open,setOpen] = useState(false)
  return <main className="min-h-svh bg-[#020b16] text-slate-100">
    <header className="sticky top-0 z-40 border-b border-cyan-400/15 bg-[#020b16]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-5 px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight"><span className="grid size-9 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-400/10 text-cyan-300"><Box className="size-5"/></span><span>BLOCK<span className="text-cyan-400">CTRL</span></span></Link>
        <nav className="ml-5 hidden items-center gap-6 text-sm text-slate-300 md:flex">{nav.map(([href,label])=><Link key={href} href={href} className={pathname===href?'text-cyan-300':'hover:text-white'}>{label}</Link>)}</nav>
        <div className="ml-auto hidden items-center gap-2 sm:flex"><Link href="/sign-in" className="inline-flex h-8 items-center justify-center rounded-lg border border-cyan-300/30 bg-transparent px-3 text-sm font-medium text-slate-100 hover:bg-white/5">Giriş Yap</Link><Link href="/sign-up" className="inline-flex h-8 items-center justify-center rounded-lg bg-cyan-500 px-3 text-sm font-medium text-slate-950 hover:bg-cyan-400">Kayıt Ol</Link></div>
        <Button size="icon" variant="ghost" className="ml-auto md:hidden" onClick={()=>setOpen(v=>!v)}>{open?<X/>:<Menu/>}</Button>
      </div>
      {open&&<div className="border-t border-cyan-400/10 px-5 py-4 md:hidden">{nav.map(([href,label])=><Link key={href} href={href} className="block py-2 text-sm text-slate-300" onClick={()=>setOpen(false)}>{label}</Link>)}<div className="mt-3 flex gap-2"><Link href="/sign-in" className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-white/15 px-3 text-sm">Giriş Yap</Link><Link href="/sign-up" className="inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-cyan-500 px-3 text-sm font-medium text-slate-950">Kayıt Ol</Link></div></div>}
    </header>
    {page==='home'?<Home/>:page==='about'?<About/>:page==='information'?<Information/>:<Support/>}
    <Footer/>
  </main>
}

function HeroBackdrop(){
  return <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_35%,rgba(14,165,233,.22),transparent_30%),radial-gradient(circle_at_80%_25%,rgba(37,99,235,.18),transparent_26%),linear-gradient(180deg,#04182b_0%,#03111f_55%,#020b16_100%)]"/><div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(56,189,248,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.08)_1px,transparent_1px)] [background-size:48px_48px]"/><div className="absolute -bottom-32 left-[5%] h-80 w-80 rotate-45 rounded-[30%] bg-cyan-500/10 blur-2xl"/><div className="absolute -bottom-44 right-[10%] h-96 w-96 rotate-45 rounded-[28%] bg-blue-500/10 blur-3xl"/></div>
}

function Home(){
  return <>
    <section className="relative overflow-hidden border-b border-cyan-400/15"><HeroBackdrop/><div className="relative mx-auto grid min-h-[620px] max-w-[1500px] items-center gap-10 px-6 py-16 lg:grid-cols-[.9fr_1.1fr] lg:px-10">
      <div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200"><Sparkles className="size-3.5"/>Minecraft sunucu yönetiminde yeni seviye</div><h1 className="max-w-3xl text-5xl font-black leading-[1.03] tracking-[-.045em] text-white md:text-6xl">Minecraft Sunucu<br/>Yönetiminde <span className="text-cyan-400">Yeni Seviye</span></h1><p className="mt-6 max-w-xl text-base leading-7 text-slate-300">BlockCtrl ile sunucularınızı tek merkezden yönetin. Güçlü, güvenli ve modern bir Minecraft kontrol paneli.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-6 text-sm font-semibold text-slate-950 hover:bg-cyan-300">Hemen Başla <ArrowRight className="size-4"/></Link><Button size="lg" variant="outline" className="border-cyan-300/25 bg-[#071827]/70"><Play/>Tanıtımı İzle</Button></div><div className="mt-12 grid max-w-2xl grid-cols-2 gap-4 text-sm text-slate-300 md:grid-cols-4">{['Kolay Kurulum','Güvenli Altyapı','Sürekli Gelişim','7/24 Destek'].map(x=><div key={x} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-cyan-400"/>{x}</div>)}</div></div>
      <div className="rounded-[26px] border border-cyan-300/40 bg-[#061523]/85 p-4 shadow-[0_0_70px_rgba(14,165,233,.18)]"><div className="rounded-2xl border border-cyan-400/15 bg-[#03101c] p-5"><div className="flex items-center justify-between"><div><p className="text-xl font-bold">Genel Bakış</p><p className="text-xs text-slate-500">Sunucunuzun genel durumu ve canlı istatistikler</p></div><span className="rounded-lg bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">● Çalışıyor</span></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Oyuncular','12 / 50'],['CPU','32%'],['RAM','4.2 GB'],['Depolama','18.6 GB']].map(([a,b])=><div key={a} className="rounded-xl border border-cyan-400/10 bg-[#071827] p-4"><p className="text-xs text-slate-500">{a}</p><p className="mt-2 text-2xl font-black text-white">{b}</p><div className="mt-3 h-1.5 rounded-full bg-white/5"><div className="h-full w-1/2 rounded-full bg-cyan-400"/></div></div>)}</div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="min-h-56 rounded-xl border border-cyan-400/10 bg-black/20 p-4 font-mono text-xs leading-7 text-emerald-300">[22:14:03] Server started successfully!<br/>[22:14:05] Player joined<br/>[22:14:12] World loaded (survival)<br/>[22:14:20] 12 players online</div><div className="min-h-56 rounded-xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(14,165,233,.10),transparent)] p-4"><p className="text-sm font-semibold">Son 24 Saat</p><div className="mt-8 h-28 rounded-lg border-b border-l border-cyan-400/20 bg-[linear-gradient(135deg,transparent_45%,rgba(14,165,233,.8)_46%,rgba(14,165,233,.8)_48%,transparent_49%)]"/></div></div></div></div>
    </div></section>
    <section className="mx-auto max-w-[1500px] px-6 py-12 lg:px-10"><div className="flex items-end justify-between"><div><h2 className="text-3xl font-bold">Tüm İhtiyaçların Tek Panelde</h2><p className="mt-2 text-slate-400">Minecraft sunucu yönetimi için ihtiyacın olan her şey.</p></div><Link href="/information" className="hidden text-sm text-cyan-300 md:block">Tüm Özellikleri Gör →</Link></div><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(([Icon,title,text])=><div key={title} className="rounded-2xl border border-cyan-400/15 bg-[#061523] p-5 transition hover:-translate-y-1 hover:border-cyan-300/30"><Icon className="size-7 text-cyan-300"/><h3 className="mt-5 font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>)}</div></section>
    <section className="border-y border-cyan-400/10 bg-[#03101b]"><div className="mx-auto grid max-w-[1500px] gap-8 px-6 py-12 lg:grid-cols-2 lg:px-10"><div><h2 className="text-3xl font-bold">Neden BlockCtrl?</h2><p className="mt-2 text-slate-400">Sadece bir panel değil, sunucularınız için güçlü bir altyapı ortağı.</p><div className="mt-6 grid gap-4 sm:grid-cols-2">{[['Modern ve Hızlı','En yeni teknolojiler ile hızlı ve akıcı deneyim.'],['Güvenli Altyapı','Verileriniz güvende, sunucularınız kontrol altında.'],['Kolay Kullanım','Herkesin rahatça kullanabileceği arayüz.'],['Sürekli Gelişim','Sürekli yeni özellikler ve iyileştirmeler.']].map(([a,b])=><div key={a} className="rounded-xl border border-cyan-400/15 bg-[#071827] p-4"><b>{a}</b><p className="mt-1 text-sm text-slate-400">{b}</p></div>)}</div></div><div className="rounded-2xl border border-cyan-300/20 bg-[radial-gradient(circle_at_70%_30%,rgba(14,165,233,.22),transparent_35%),#061523] p-8"><p className="text-2xl font-bold">Daha fazlasını inşa et.</p><p className="mt-3 max-w-md text-slate-400">Sunucu yönetimi, web sitesi, oyuncu topluluğu ve otomasyonlar tek BlockCtrl hesabında.</p></div></div></section>
  </>
}

function About(){return <SimpleHero title="Hakkımızda" subtitle="Minecraft topluluğu için daha güçlü bir gelecek."><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">{[['Vizyonumuz','Oyun sunucularında özgürlük, kontrol ve sürdürülebilir topluluklar.'],['Misyonumuz','Teknolojiyi oyun topluluklarıyla buluşturan güvenli deneyim.'],['Değerlerimiz','Güvenlik, şeffaflık, kullanıcı odaklılık ve sürekli yenilik.'],['Topluluk','Minecraft topluluğunun büyümesine katkı sağlamak.']].map(([a,b])=><InfoCard key={a} title={a} text={b}/>)}</div></SimpleHero>}
function Information(){return <SimpleHero title="BlockCtrl Nasıl Çalışır?" subtitle="Minecraft sunucu yönetimini kolay, güvenli ve kapsamlı hale getiriyoruz."><div className="grid gap-4 lg:grid-cols-3">{[['1','Hesap Oluştur','Ücretsiz olarak kayıt olun ve panelin tüm özelliklerine erişin.'],['2','Sunucu Ekleyin','Node/agent ile sunucunuzu bağlayın, kurulumu tamamlayın.'],['3','Yönetin','Konsoldan oyunculara, dosyalardan yedeklere kadar tek yerden yönetin.']].map(([n,a,b])=><div key={n} className="rounded-2xl border border-cyan-400/15 bg-[#061523] p-6"><span className="grid size-10 place-items-center rounded-full bg-cyan-400/10 font-bold text-cyan-300">{n}</span><h3 className="mt-5 text-lg font-semibold">{a}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{b}</p></div>)}</div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(([Icon,title,text])=><div key={title} className="rounded-xl border border-cyan-400/10 bg-[#071827] p-4"><Icon className="size-5 text-cyan-300"/><b className="mt-3 block">{title}</b><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>)}</div></SimpleHero>}
function Support(){return <SimpleHero title="Her Zaman Yanınızdayız" subtitle="Sorularınız, önerileriniz veya yaşadığınız sorunlar için buradayız."><div className="grid gap-4 md:grid-cols-3"><InfoCard title="Destek Talebi Aç" text="Hesabınıza giriş yaparak gerçek destek sisteminden talep oluşturun." icon={Headphones}/><InfoCard title="Sık Sorulan Sorular" text="Kurulum, SFTP, yedekler ve oyuncu yönetimi hakkında hızlı cevaplar." icon={FileText}/><InfoCard title="Yeni Kullanıcı Rehberi" text="Paneli kullanmaya başlamak için adım adım rehber." icon={Sparkles}/></div><div className="mt-8 rounded-2xl border border-cyan-400/15 bg-[#061523] p-6"><h3 className="text-xl font-bold">Hâlâ yardıma mı ihtiyacınız var?</h3><p className="mt-2 text-slate-400">Giriş yapın ve panel içinden destek merkezini açın.</p><Link href="/sign-in" className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Giriş Yap</Link></div></SimpleHero>}

function SimpleHero({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){return <><section className="relative overflow-hidden border-b border-cyan-400/15"><HeroBackdrop/><div className="relative mx-auto max-w-[1500px] px-6 py-16 lg:px-10"><h1 className="text-5xl font-black tracking-[-.04em]">{title}</h1><p className="mt-4 max-w-2xl text-lg text-cyan-300">{subtitle}</p><p className="mt-4 max-w-3xl leading-7 text-slate-400">BlockCtrl, Minecraft sunucularını profesyonel bir kontrol düzleminde bir araya getirir; sunucu operasyonları, canlı telemetri, dosya yönetimi, güvenlik ve website builder araçlarını tek deneyimde sunar.</p></div></section><section className="mx-auto max-w-[1500px] px-6 py-12 lg:px-10">{children}</section></>}

function InfoCard({title,text,icon:Icon=ShieldCheck}:{title:string;text:string;icon?:typeof ShieldCheck}){return <div className="rounded-2xl border border-cyan-400/15 bg-[#061523] p-6"><Icon className="size-7 text-cyan-300"/><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>}

function Footer(){return <footer className="border-t border-cyan-400/10 bg-[#020914]"><div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-6 py-8 text-sm text-slate-500 md:flex-row md:items-center lg:px-10"><div className="font-bold text-slate-200">BLOCK<span className="text-cyan-400">CTRL</span></div><div className="flex flex-wrap gap-5"><Link href="/information">Bilgilendirme</Link><Link href="/about">Hakkımızda</Link><Link href="/support">Destek</Link></div><span className="md:ml-auto">© 2026 BlockCtrl</span></div></footer>}
