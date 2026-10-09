'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity, ArrowRight, Blocks, CheckCircle2, ChevronRight, CircleHelp, CloudCog,
  Code2, Cpu, Database, FileClock, Files, Gauge, Globe2, HardDrive, Headphones, KeyRound,
  Layers3, LockKeyhole, Network, Package, Radio, RefreshCw, Server, ShieldCheck,
  Sparkles, Terminal, Users, Wifi, Wrench, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type PublicPage = 'home' | 'info' | 'about' | 'support'
type Feature = { title:string; description:string; icon:LucideIcon; accent:string }

const nav = [
  { href:'/', label:'Ana Sayfa' },
  { href:'/bilgilendirme', label:'Bilgilendirme' },
  { href:'/hakkimizda', label:'Hakkımızda' },
  { href:'/destek', label:'Destek' },
]

const features:Feature[] = [
  { title:'Canlı Sunucu Yönetimi', description:'Başlatma, durdurma, yeniden başlatma, oyuncu sayısı, RAM, CPU ve çalışma durumunu tek merkezde izleyin.', icon:Gauge, accent:'from-cyan-400/20 to-blue-500/5' },
  { title:'Gerçek Zamanlı Konsol', description:'Minecraft stdout/stderr akışını görüntüleyin, komut gönderin ve agent olaylarını aynı konsolda takip edin.', icon:Terminal, accent:'from-blue-400/20 to-indigo-500/5' },
  { title:'Dosya ve SFTP', description:'Dosyaları panelden yönetin veya sunucuya özel güvenli SFTP hesabıyla doğrudan bağlanın.', icon:Files, accent:'from-sky-400/20 to-cyan-500/5' },
  { title:'Yedekleme ve Dünyalar', description:'Dünya yönetimi, yedekleme, geri yükleme ve zamanlanmış bakım işlemlerini düzenleyin.', icon:FileClock, accent:'from-indigo-400/20 to-blue-500/5' },
  { title:'Güvenlik Merkezi', description:'Sunucu izinleri, güvenlik olayları, erişim politikaları ve koruma durumunu tek görünümde yönetin.', icon:ShieldCheck, accent:'from-cyan-400/20 to-emerald-500/5' },
  { title:'Kayıp Eşya Takibi', description:'Oyuncuların kaybettiği eşyaları sunucu, oyuncu, zaman, konum ve Minecraft item görseliyle takip edin.', icon:Package, accent:'from-blue-400/20 to-violet-500/5' },
]

const faqs = [
  ['BlockCtrl ne işe yarar?', 'BlockCtrl; Minecraft sunucularını, node agent bağlantılarını, dosyaları, konsolu, oyuncuları, yedekleri, güvenliği ve ek yönetim araçlarını tek panel altında toplamak için tasarlanmıştır.'],
  ['Hangi Minecraft sunucu türlerini destekler?', 'Panel yapısı Vanilla, Paper, Fabric, Forge ve NeoForge gibi farklı loader türleriyle çalışacak şekilde hazırlanmıştır. Sunucunun kullanılabilir özellikleri loader ve agent yeteneklerine göre değişebilir.'],
  ['SFTP erişimi güvenli mi?', 'BlockCtrl SFTP sistemi sunucuya özel Linux kullanıcısı, chroot ve sınırlı dosya erişimi yaklaşımını kullanacak şekilde tasarlanmıştır. Hesap yönetimi ve bağlantı kontrolleri panel üzerinden yürütülür.'],
  ['Destek talebi nasıl açılır?', 'Hesabınıza giriş yaptıktan sonra BlockCtrl destek merkezinden destek talebi oluşturabilir ve yetkili yanıtlarını aynı panelden takip edebilirsiniz.'],
  ['Şifremi unuttum, ne yapmalıyım?', 'Giriş ekranındaki “Şifremi unuttum” bağlantısını kullanarak şifre yenileme sürecini başlatabilirsiniz.'],
]

function Fade({children,delay=0,className=''}:{children:ReactNode;delay?:number;className?:string}){
  const reduced = useReducedMotion()
  return <motion.div className={className} initial={reduced?false:{opacity:0,y:22}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.16}} transition={{duration:.6,delay,ease:[.2,.8,.2,1]}}>{children}</motion.div>
}

function Logo(){return <Link href="/" className="flex items-center gap-3" aria-label="BlockCtrl ana sayfa"><img src="/blockctrl-logo.png" alt="BlockCtrl" className="h-9 w-auto max-w-[170px] object-contain"/></Link>}

function Header(){
  const pathname=usePathname()
  return <header className="fixed inset-x-0 top-0 z-50 border-b border-sky-300/10 bg-[#020b14]/72 backdrop-blur-xl">
    <div className="mx-auto flex h-[62px] max-w-[1240px] items-center gap-5 px-4 sm:px-6">
      <Logo/>
      <nav className="ml-auto hidden h-full items-center gap-1 md:flex" aria-label="Tanıtım menüsü">
        {nav.map(item=><Link key={item.href} href={item.href} className={`relative flex h-full items-center px-3 text-[12px] font-medium transition ${pathname===item.href?'text-white':'text-slate-300/80 hover:text-white'}`}>{item.label}{pathname===item.href&&<span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,.8)]"/>}</Link>)}
      </nav>
      <div className="ml-auto flex items-center gap-2 md:ml-3">
        <Link href="/sign-in" className="hidden h-9 items-center justify-center rounded-md border border-cyan-300/35 bg-[#03111f]/70 px-5 text-[12px] font-semibold text-white transition hover:border-cyan-300/65 hover:bg-cyan-400/10 sm:inline-flex">Giriş Yap</Link>
        <Link href="/sign-up" className="inline-flex h-9 items-center justify-center rounded-md border border-cyan-300/45 bg-gradient-to-b from-[#23c7ff] to-[#0b9ff0] px-5 text-[12px] font-semibold text-[#001421] shadow-[0_0_26px_rgba(14,165,233,.22)] transition hover:brightness-110">Kayıt Ol</Link>
      </div>
    </div>
    <div className="flex gap-1 overflow-x-auto border-t border-white/5 bg-[#020b14]/85 px-3 py-2 md:hidden">{nav.map(item=><Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs ${pathname===item.href?'bg-sky-400/10 text-sky-200':'text-slate-400'}`}>{item.label}</Link>)}</div>
  </header>
}

function Footer(){return <footer className="border-t border-cyan-400/10 bg-[#020a12]">
  <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-9 sm:px-6 md:grid-cols-[1.35fr_.8fr_.8fr_1fr]">
    <div><Logo/><p className="mt-4 max-w-[250px] text-[12px] leading-5 text-slate-500">Minecraft sunucu yönetiminde modern, güvenli ve güçlü çözüm.</p><div className="mt-4 flex gap-2 text-slate-500"><span className="grid size-7 place-items-center rounded-md border border-white/5 bg-white/[.025]">●</span><span className="grid size-7 place-items-center rounded-md border border-white/5 bg-white/[.025]">●</span><span className="grid size-7 place-items-center rounded-md border border-white/5 bg-white/[.025]">▶</span></div></div>
    <div><p className="text-[11px] font-semibold text-white">Ürün</p><div className="mt-4 grid gap-2 text-[11px] text-slate-500"><Link href="/bilgilendirme" className="hover:text-cyan-300">Özellikler</Link><span>Fiyatlandırma</span><span>Güncellemeler</span></div></div>
    <div><p className="text-[11px] font-semibold text-white">Şirket</p><div className="mt-4 grid gap-2 text-[11px] text-slate-500"><Link href="/hakkimizda" className="hover:text-cyan-300">Hakkımızda</Link><Link href="/bilgilendirme" className="hover:text-cyan-300">Bilgilendirme</Link><Link href="/destek" className="hover:text-cyan-300">Destek</Link></div></div>
    <div><p className="text-[11px] font-semibold text-white">Yasal</p><div className="mt-4 grid gap-2 text-[11px] text-slate-500"><span>Kullanım Şartları</span><span>Gizlilik Politikası</span><span>İletişim</span></div><div className="mt-6 text-right text-[10px] leading-4 text-slate-600">Minecraft'ı daha iyi bir yer hâline getirelim.<br/>© 2026 BlockCtrl. Tüm hakları saklıdır.</div></div>
  </div>
</footer>}

function Background(){return <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-[#020a12]">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_4%,rgba(14,165,233,.08),transparent_28%),linear-gradient(180deg,#03101e_0%,#020a12_62%,#01070d_100%)]"/>
</div>}

function StatusPill(){return <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"/>Panel + Agent mimarisi</span>}

function DashboardMock(){return <motion.div initial={{opacity:0,scale:.97,x:24}} animate={{opacity:1,scale:1,x:0}} transition={{duration:.8,delay:.15}} className="relative mx-auto w-full max-w-[610px] lg:translate-x-3">
  <div className="pointer-events-none absolute -inset-4 rounded-[28px] bg-cyan-400/10 blur-3xl"/>
  <div className="relative overflow-hidden rounded-[20px] border border-cyan-300/45 bg-[#031321]/90 p-1.5 shadow-[0_28px_90px_rgba(0,0,0,.58),0_0_44px_rgba(14,165,233,.18)] lg:rotate-[1deg]">
    <img src="/marketing-panel.webp" alt="BlockCtrl sunucu yönetim paneli önizlemesi" className="block w-full rounded-[15px] object-cover"/>
  </div>
</motion.div>}

function MockRow({icon:Icon,title,value}:{icon:LucideIcon;title:string;value:string}){return <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[.025] p-2.5"><Icon className="size-4 text-sky-300"/><div className="min-w-0 flex-1"><p className="text-[10px] text-slate-500">{title}</p><p className="truncate text-xs font-medium text-slate-200">{value}</p></div></div>}

function PageHero({eyebrow,title,description,icon:Icon}:{eyebrow:string;title:string;description:string;icon:LucideIcon}){return <section className="relative overflow-hidden pt-36 sm:pt-40">
  <div className="absolute inset-x-0 top-0 h-[480px] bg-[linear-gradient(180deg,rgba(3,11,20,.18),#030b14),url('/auth-bg.png')] bg-cover bg-center opacity-35"/>
  <div className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8"><Fade><div className="mx-auto max-w-3xl text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-300 shadow-[0_0_45px_rgba(14,165,233,.12)]"><Icon className="size-7"/></div><p className="text-xs font-semibold uppercase tracking-[.24em] text-sky-300">{eyebrow}</p><h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">{title}</h1><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">{description}</p></div></Fade></div>
</section>}

function Home(){
  const homeFeatures:Array<{title:string;description:string;icon:LucideIcon;color:string}>=[
    {title:'Konsol',description:'Gerçek zamanlı konsol erişimi ve gelişmiş komut yönetimi.',icon:Terminal,color:'from-violet-500/22 to-violet-500/5'},
    {title:'Oyuncular',description:'Oyuncu listesi, yetkiler ve detaylı oyuncu istatistikleri.',icon:Users,color:'from-emerald-500/22 to-emerald-500/5'},
    {title:'Dosya Yöneticisi',description:'Tüm sunucu dosyalarına güvenli erişim, düzenleme ve yükleme.',icon:Files,color:'from-orange-500/22 to-orange-500/5'},
    {title:'SFTP',description:'Güvenli dosya transferi ile profesyonel yönetim.',icon:KeyRound,color:'from-cyan-500/22 to-cyan-500/5'},
    {title:'Eklentiler / Modlar',description:'Plugin ve mod kurulumu, güncelleme ve yönetimi.',icon:Package,color:'from-lime-500/22 to-lime-500/5'},
    {title:'Yedekler',description:'Otomatik yedekleme, indirme ve geri yükleme.',icon:FileClock,color:'from-sky-500/22 to-sky-500/5'},
    {title:'Veritabanları',description:'MySQL, MariaDB ve diğer veritabanı yönetimi.',icon:Database,color:'from-purple-500/22 to-purple-500/5'},
    {title:'Güvenlik',description:'Gelişmiş güvenlik araçları ve erişim kontrolü.',icon:ShieldCheck,color:'from-red-500/22 to-red-500/5'},
  ]
  const reasons:Array<{title:string;text:string;icon:LucideIcon}>=[
    {title:'Modern ve Hızlı',text:'En yeni teknolojilerle hızlı ve akıcı bir deneyim.',icon:Zap},
    {title:'Güvenli Altyapı',text:'Verileriniz güvende, sunucularınız kontrol altında.',icon:ShieldCheck},
    {title:'Kolay Kullanım',text:'Herkesin rahatça kullanabileceği arayüz.',icon:Users},
    {title:'Sürekli Gelişim',text:'Sürekli yeni özellikler ve iyileştirmeler.',icon:Activity},
  ]
  return <>
    <section className="relative isolate overflow-hidden border-b border-cyan-400/10 pt-[62px]">
      <img src="/marketing-hero-bg.webp" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center"/>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(1,9,18,.90)_0%,rgba(2,12,23,.74)_43%,rgba(2,12,23,.36)_72%,rgba(2,9,17,.55)_100%),linear-gradient(180deg,rgba(1,8,16,.10)_40%,#03101b_100%)]"/>
      <div className="mx-auto grid min-h-[430px] max-w-[1240px] items-center gap-8 px-5 py-11 sm:px-6 lg:grid-cols-[.88fr_1.12fr] lg:py-14">
        <motion.div initial={{opacity:0,x:-22}} animate={{opacity:1,x:0}} transition={{duration:.65}} className="max-w-[550px]">
          <h1 className="text-[34px] font-black leading-[1.08] tracking-[-.035em] text-white sm:text-[46px] lg:text-[52px]">Minecraft Sunucu<br/>Yönetiminde <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">Yeni Seviye</span></h1>
          <p className="mt-4 max-w-[470px] text-[13px] leading-6 text-slate-200/85 sm:text-[14px]">BlockCtrl ile sunucularınızı tek merkezden yönetin.<br className="hidden sm:block"/>Güçlü, güvenli ve modern bir Minecraft paneli.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex h-11 items-center gap-2 rounded-md bg-gradient-to-b from-[#2ccaff] to-[#0a9fe9] px-6 text-[13px] font-bold text-[#001421] shadow-[0_12px_34px_rgba(14,165,233,.24)] transition hover:-translate-y-0.5 hover:brightness-110">Hemen Başla <ArrowRight className="size-4"/></Link><a href="#nasil-calisir" className="inline-flex h-11 items-center gap-3 rounded-md border border-sky-200/25 bg-[#051624]/72 px-6 text-[13px] font-semibold text-white backdrop-blur transition hover:border-cyan-300/45 hover:bg-cyan-400/[.07]"><span className="grid size-5 place-items-center rounded-full border border-white/45 text-[9px]">▶</span>Tanıtımı İzle</a></div>
        </motion.div>
        <DashboardMock/>
      </div>
      <div className="border-t border-cyan-300/10 bg-[#03101c]/72 backdrop-blur-md"><div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-px px-5 sm:px-6 md:grid-cols-4"><Benefit icon={Wrench} label="Kolay Kurulum"/><Benefit icon={ShieldCheck} label="Güvenli Altyapı"/><Benefit icon={Activity} label="Sürekli Gelişim"/><Benefit icon={Headphones} label="7/24 Destek"/></div></div>
    </section>

    <section className="relative overflow-hidden border-b border-cyan-400/10 bg-[#03101b]">
      <div className="mx-auto grid max-w-[1240px] lg:grid-cols-[1.02fr_.98fr]">
        <div className="px-5 py-9 sm:px-6 lg:border-r lg:border-cyan-400/10">
          <div className="flex items-end justify-between gap-4"><div><h2 className="text-[22px] font-bold tracking-[-.025em] text-white">Tüm İhtiyaçların Tek Panelde</h2><p className="mt-1 text-[11px] text-slate-400">Minecraft sunucu yönetimi için ihtiyacın olan her şey, modern ve kullanıcı dostu bir arayüzde.</p></div><Link href="/bilgilendirme" className="hidden items-center gap-1 text-[10px] font-semibold text-cyan-300 sm:flex">Tüm Özellikleri Gör <ArrowRight className="size-3.5"/></Link></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{homeFeatures.map((item,i)=><motion.div key={item.title} initial={{opacity:0,y:12}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*.035}} whileHover={{y:-3}} className={`group min-h-[128px] rounded-lg border border-sky-300/15 bg-gradient-to-br ${item.color} p-3.5 shadow-[0_12px_30px_rgba(0,0,0,.15)]`}><div className="flex items-center justify-between"><span className="grid size-8 place-items-center rounded-md border border-white/10 bg-black/15 text-cyan-200"><item.icon className="size-4"/></span><ArrowRight className="size-3.5 text-cyan-300/75 transition group-hover:translate-x-1"/></div><h3 className="mt-3 text-[12px] font-bold text-white">{item.title}</h3><p className="mt-1.5 text-[10px] leading-[1.45] text-slate-300/72">{item.description}</p></motion.div>)}</div>
        </div>
        <div className="relative min-h-[360px] overflow-hidden px-5 py-9 sm:px-6">
          <img src="/marketing-character.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[65%_42%] opacity-60"/>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#03101b_0%,rgba(3,16,27,.86)_42%,rgba(3,16,27,.28)_100%),linear-gradient(180deg,rgba(3,16,27,.45),rgba(3,16,27,.74))]"/>
          <div className="relative max-w-[520px]"><h2 className="text-[22px] font-bold tracking-[-.025em] text-white">Neden BlockCtrl?</h2><p className="mt-1 text-[11px] text-slate-300/75">Sadece bir panel değil, sunucularınız için güçlü bir altyapı ortağı.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{reasons.map(item=><div key={item.title} className="flex min-h-[92px] gap-3 rounded-lg border border-sky-300/15 bg-[#061927]/74 p-3.5 backdrop-blur-md"><span className="grid size-9 shrink-0 place-items-center rounded-md border border-cyan-300/20 bg-cyan-400/10 text-cyan-300"><item.icon className="size-4.5"/></span><div><h3 className="text-[11px] font-bold text-white">{item.title}</h3><p className="mt-1 text-[10px] leading-4 text-slate-300/70">{item.text}</p></div></div>)}</div></div>
        </div>
      </div>
    </section>

    <section id="nasil-calisir" className="bg-[#020b14] px-5 py-8 sm:px-6">
      <div className="mx-auto max-w-[1240px]"><h2 className="text-[21px] font-bold text-white">Nasıl Çalışır?</h2><p className="mt-1 text-[11px] text-slate-500">3 basit adımda sunucularınızı yönetmeye başlayın.</p><div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><div className="grid gap-3 sm:grid-cols-3"><Step number="1" title="Hesap Oluştur" text="Ücretsiz olarak kayıt olun ve panelin tüm özelliklerine erişin." icon={Users}/><Step number="2" title="Sunucu Ekleyin" text="Node agent ile sunucunuzu bağlayın ve otomatik kurulumu tamamlayın." icon={Server}/><Step number="3" title="Kontrol Sizde" text="Sunucunuzu yönetin, büyütün ve topluluğunuzu geliştirin." icon={Wrench}/></div><div className="group relative min-h-[155px] overflow-hidden rounded-xl border border-cyan-300/18"><img src="/marketing-video-bg.webp" alt="BlockCtrl Minecraft dünyası" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"/><div className="absolute inset-0 bg-gradient-to-t from-[#020b14]/88 via-[#020b14]/15 to-transparent"/><div className="absolute inset-0 grid place-items-center"><span className="grid size-14 place-items-center rounded-full border-2 border-cyan-200 bg-[#03101c]/35 text-white shadow-[0_0_30px_rgba(34,211,238,.28)] backdrop-blur-sm">▶</span></div><div className="absolute inset-x-4 bottom-3"><h3 className="text-[13px] font-bold text-white">Sınırları Kaldır</h3><p className="mt-0.5 text-[10px] text-slate-300">Kendi dünyanı yönet, hayal ettiğinden daha fazlasını inşa et.</p></div></div></div></div>
    </section>

    <section className="bg-[#020b14] px-5 pb-5 sm:px-6"><div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-xl border border-cyan-300/18"><img src="/marketing-section-bg.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-45"/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,11,20,.88),rgba(2,13,23,.42),rgba(2,11,20,.88))]"/><div className="relative flex min-h-[110px] flex-col items-center justify-center px-6 py-5 text-center"><h2 className="text-[20px] font-bold text-white">Macera Burada Başlıyor</h2><p className="mt-1 text-[10px] text-slate-300/80">BlockCtrl ile sunucularınızı profesyonelce yönetin, topluluğunuzu büyütün.</p><div className="mt-4 flex gap-3"><Link href="/sign-in" className="inline-flex h-9 min-w-24 items-center justify-center rounded-md bg-gradient-to-b from-[#2ccaff] to-[#0a9fe9] px-5 text-[11px] font-bold text-[#001421]">Giriş Yap</Link><Link href="/sign-up" className="inline-flex h-9 min-w-24 items-center justify-center rounded-md border border-cyan-300/45 bg-[#03111f]/75 px-5 text-[11px] font-semibold text-white">Kayıt Ol</Link></div></div></div></section>
  </>
}

function Benefit({icon:Icon,label}:{icon:LucideIcon;label:string}){return <div className="flex min-h-12 items-center justify-center gap-2 border-x border-cyan-400/[.05] text-[10px] font-medium text-slate-300"><Icon className="size-3.5 text-cyan-300"/>{label}</div>}

function Step({number,title,text,icon:Icon}:{number:string;title:string;text:string;icon:LucideIcon}){return <div className="relative min-h-[155px] rounded-xl border border-sky-300/12 bg-[#061522]/88 p-4"><span className="absolute -left-1 -top-2 grid size-8 place-items-center rounded-full border border-sky-400/30 bg-[#08223a] text-sm font-bold text-cyan-300">{number}</span><Icon className="ml-auto size-7 text-blue-300/70"/><h3 className="mt-5 text-[11px] font-bold text-white">{title}</h3><p className="mt-2 text-[10px] leading-4 text-slate-400">{text}</p></div>}

function ArchitectureCard({icon:Icon,title,subtitle}:{icon:LucideIcon;title:string;subtitle:string}){return <motion.div whileHover={{scale:1.03}} className="relative rounded-2xl border border-sky-400/12 bg-[#071522] p-5 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-sky-400/10 text-sky-300"><Icon className="size-6"/></div><p className="mt-4 text-sm font-semibold text-white">{title}</p><p className="mt-1 text-xs text-slate-500">{subtitle}</p></motion.div>}

const managementAreas:Array<{title:string;description:string;icon:LucideIcon}> = [
  {title:'Genel Bakış',icon:Gauge,description:'Canlı özet ve sunucu durumu'},
  {title:'Konsol',icon:Terminal,description:'Log akışı ve komut yönetimi'},
  {title:'Oyuncular',icon:Users,description:'Çevrimiçi oyuncu işlemleri'},
  {title:'Dosyalar',icon:Files,description:'Yükleme, listeleme ve dosya işlemleri'},
  {title:'Dünyalar',icon:Globe2,description:'Dünya yönetimi ve operasyonları'},
  {title:'Eklentiler / Modlar',icon:Package,description:'Loader uyumlu içerik yönetimi'},
  {title:'Yedekler',icon:RefreshCw,description:'Yedek oluşturma ve geri yükleme'},
  {title:'SFTP',icon:KeyRound,description:'Sınırlı güvenli dosya erişimi'},
  {title:'Veritabanları',icon:Database,description:'Sunucuya bağlı veritabanı yönetimi'},
  {title:'Güvenlik',icon:LockKeyhole,description:'Politika ve güvenlik telemetrisi'},
  {title:'Ağ & Portlar',icon:Network,description:'Port ve bağlantı ayarları'},
  {title:'Zamanlamalar',icon:FileClock,description:'Planlı bakım ve otomasyonlar'},
]

function Information(){
  const coreFeatures:Array<{title:string;description:string;icon:LucideIcon;tone:string}> = [
    {title:'Genel Bakış',description:'Sunucularınızın anlık durumunu görüntüleyin.',icon:Gauge,tone:'from-sky-500/25 to-blue-600/8'},
    {title:'Konsol',description:'Gerçek zamanlı konsol erişimi ve komut yönetimi.',icon:Terminal,tone:'from-violet-500/25 to-fuchsia-600/7'},
    {title:'Oyuncular',description:'Oyuncu listesi ve detaylı istatistikler.',icon:Users,tone:'from-emerald-500/25 to-teal-600/8'},
    {title:'Dosyalar',description:'Tüm sunucu dosyalarınızı yönetin.',icon:Files,tone:'from-cyan-500/25 to-teal-500/7'},
    {title:'Dünyalar',description:'Dünya yönetimi, yükleme ve geri yükleme.',icon:Globe2,tone:'from-orange-500/25 to-amber-600/8'},
    {title:'Eklentiler / Modlar',description:'Kurulum, güncelleme ve yönetim.',icon:Package,tone:'from-lime-500/25 to-green-600/8'},
    {title:'SFTP',description:'Güvenli dosya transferi.',icon:KeyRound,tone:'from-sky-500/25 to-cyan-600/8'},
    {title:'Veritabanları',description:'MySQL, MariaDB ve diğerleri.',icon:Database,tone:'from-purple-500/25 to-indigo-600/8'},
    {title:'Güvenlik',description:'Gelişmiş güvenlik araçları.',icon:ShieldCheck,tone:'from-red-500/25 to-rose-600/8'},
    {title:'Ağ & Portlar',description:'Port yönetimi ve ağ ayarları.',icon:Network,tone:'from-cyan-500/25 to-blue-600/8'},
    {title:'Yedekler',description:'Otomatik yedekleme ve indirme.',icon:FileClock,tone:'from-blue-500/25 to-sky-600/8'},
    {title:'Zamanlanmış Görevler',description:'Otomatik görev planlama.',icon:RefreshCw,tone:'from-orange-500/25 to-red-600/8'},
    {title:'Kayıp Eşya Takibi',description:'Kaybolan eşyaları takip edin.',icon:ShieldCheck,tone:'from-red-500/25 to-rose-600/8'},
    {title:'Entegrasyonlar',description:'Discord ve diğer servisler.',icon:Blocks,tone:'from-cyan-500/25 to-sky-600/8'},
    {title:'Toplu İndirme',description:'Birçok dosyayı için kolay indirme.',icon:HardDrive,tone:'from-cyan-500/25 to-teal-600/8'},
  ]
  return <>
    <section className="relative isolate overflow-hidden border-b border-cyan-400/10 pt-[62px]">
      <div className="absolute inset-0 -z-20 bg-[#020b14]"/>
      <div className="absolute inset-0 -z-10 opacity-[.18] [background-image:radial-gradient(circle_at_center,rgba(56,189,248,.9)_0,rgba(56,189,248,.9)_1px,transparent_1.3px)] [background-size:52px_52px]"/>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_20%,rgba(14,165,233,.16),transparent_28%),radial-gradient(circle_at_40%_55%,rgba(14,165,233,.07),transparent_35%),linear-gradient(180deg,rgba(2,11,20,.20),rgba(2,11,20,.94))]"/>
      <div className="mx-auto grid min-h-[460px] max-w-[1240px] items-center gap-10 px-5 py-11 sm:px-6 lg:grid-cols-[.92fr_1.08fr] lg:py-14">
        <Fade>
          <div className="max-w-[560px]">
            <h1 className="text-[38px] font-black leading-none tracking-[-.04em] text-white sm:text-[50px]">BlockCtrl Nasıl Çalışır?</h1>
            <p className="mt-4 max-w-[520px] text-[13px] leading-6 text-slate-200/80 sm:text-[14px]">Minecraft sunucu yönetimini kolay, güvenli ve kapsamlı hale getiriyoruz.</p>
            <div className="mt-9 space-y-6">
              <InfoStep number="1" title="Hesap Oluştur" text="Ücretsiz olarak kayıt olun ve panelin tüm özelliklerine erişin."/>
              <InfoStep number="2" title="Sunucu Ekleyin" text="Node/agent ile sunucunuzu bağlayın, otomatik kurulumu tamamlayın."/>
              <InfoStep number="3" title="Yönetin" text="Konsoldan oyunculara, dosyalardan yedeklere kadar her şeyi tek yerden yönetin."/>
            </div>
          </div>
        </Fade>
        <Fade delay={.08}>
          <div className="relative mx-auto w-full max-w-[500px]">
            <div className="pointer-events-none absolute inset-10 rounded-full bg-cyan-400/10 blur-3xl"/>
            <img src="/info-architecture.webp" alt="BlockCtrl panel, node agent ve Minecraft sunucusu mimarisi" className="relative z-10 mx-auto block max-h-[430px] w-auto max-w-full object-contain drop-shadow-[0_24px_50px_rgba(0,0,0,.36)]"/>
          </div>
        </Fade>
      </div>
    </section>

    <section className="relative bg-[#020b14] px-5 pb-14 pt-7 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <Fade><h2 className="text-[22px] font-bold tracking-[-.025em] text-white">Başlıca Özellikler</h2></Fade>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {coreFeatures.map((item,i)=><Fade key={item.title} delay={(i%5)*.025}>
            <motion.div whileHover={{y:-3}} className={`group min-h-[138px] rounded-lg border border-sky-300/15 bg-gradient-to-br ${item.tone} p-3.5 shadow-[0_12px_30px_rgba(0,0,0,.18)]`}>
              <span className="grid size-9 place-items-center rounded-lg border border-white/10 bg-black/15 text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,.07)]"><item.icon className="size-4.5"/></span>
              <h3 className="mt-3 text-[12px] font-bold text-white">{item.title}</h3>
              <p className="mt-1.5 text-[10px] leading-[1.5] text-slate-300/72">{item.description}</p>
            </motion.div>
          </Fade>)}
        </div>
      </div>
    </section>
  </>
}

function InfoStep({number,title,text}:{number:string;title:string;text:string}){
  return <div className="relative flex gap-4 pl-1">
    <div className="relative flex w-10 shrink-0 justify-center">
      <span className="relative z-10 grid size-10 place-items-center rounded-full border border-cyan-300/45 bg-[linear-gradient(145deg,#0d6fb6,#063b78)] text-lg font-bold text-cyan-100 shadow-[0_0_18px_rgba(14,165,233,.18)]">{number}</span>
      {number!=='3'&&<span className="absolute top-10 h-[48px] w-px bg-gradient-to-b from-cyan-300/60 to-cyan-400/10"/>}
    </div>
    <div className="pt-1"><h3 className="text-[14px] font-bold text-white">{title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-300/72">{text}</p></div>
  </div>
}

function About(){
  const values:Array<{title:string;description:string;icon:LucideIcon}>=[
    {title:'Vizyonumuz',description:'Oyun sunucularında özgürlük, kontrol ve sürdürülebilir topluluklar sağlamak.',icon:Globe2},
    {title:'Misyonumuz',description:'Teknolojiyi oyun tutkunlarıyla birleştirerek en iyi sunucu yönetim deneyimini sunmak.',icon:Headphones},
    {title:'Değerlerimiz',description:'Güvenlik, şeffaflık, kullanıcı odaklılık ve sürekli yenilik.',icon:ShieldCheck},
    {title:'Topluluk',description:'Minecraft topluluğunun büyümesine katkı sağlamak için buradayız.',icon:Users},
  ]
  const reasons:Array<{title:string;description:string;icon:LucideIcon}>=[
    {title:'Modern Teknoloji',description:'En yeni altyapı ile hızlı ve stabil deneyim.',icon:Zap},
    {title:'Kullanıcı Odaklı',description:'Herkesin kullanabileceği sade ve güçlü arayüz.',icon:Users},
    {title:'Güvenlik Önceliği',description:'Verileriniz bizim için değerli, daima güvende.',icon:ShieldCheck},
    {title:'Sürekli Gelişim',description:'Gelen geri bildirimlerle her gün daha iyiye.',icon:Activity},
  ]
  return <>
    <section className="relative isolate overflow-hidden border-b border-cyan-400/10 pt-[62px]">
      <img src="/about-hero.webp" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-[72%_48%]"/>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(1,9,18,.98)_0%,rgba(2,12,23,.94)_36%,rgba(2,12,23,.66)_66%,rgba(2,9,17,.50)_100%),linear-gradient(180deg,rgba(2,9,17,.14)_42%,#020b14_100%)]"/>
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-12 sm:px-6 sm:pt-16 lg:pb-12 lg:pt-20">
        <Fade>
          <div className="max-w-[610px]">
            <h1 className="text-[38px] font-black leading-none tracking-[-.04em] text-white sm:text-[52px]">Hakkımızda</h1>
            <p className="mt-4 text-[16px] font-semibold text-cyan-300 sm:text-[18px]">Minecraft topluluğu için daha güçlü bir gelecek.</p>
            <p className="mt-6 max-w-[570px] text-[12px] leading-6 text-slate-200/78 sm:text-[13px]">BlockCtrl, sunucu yöneticilerine profesyonel, güvenli ve kullanımı kolay bir kontrol paneli sunmak için geliştirildi. Amacımız, Minecraft sunucu yönetimini herkes için erişilebilir ve keyifli hale getirmek.</p>
          </div>
        </Fade>
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{values.map((item,i)=>{const Icon=item.icon;return <Fade key={item.title} delay={i*.045}><motion.div whileHover={{y:-4}} className="h-full min-h-[150px] rounded-xl border border-cyan-300/20 bg-[#041421]/82 p-4 shadow-[0_16px_38px_rgba(0,0,0,.22)] backdrop-blur-md"><span className="grid size-9 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,.08)]"><Icon className="size-4.5"/></span><h2 className="mt-4 text-[13px] font-bold text-white">{item.title}</h2><p className="mt-2 text-[10px] leading-[1.55] text-slate-300/72">{item.description}</p></motion.div></Fade>})}</div>
      </div>
    </section>

    <section className="bg-[#020b14] px-5 py-8 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <Fade><h2 className="text-[22px] font-bold tracking-[-.025em] text-white">Neden BlockCtrl?</h2></Fade>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{reasons.map((item,i)=>{const Icon=item.icon;return <Fade key={item.title} delay={i*.04}><motion.div whileHover={{y:-3}} className="flex min-h-[102px] gap-3 rounded-xl border border-cyan-300/16 bg-[#061522]/90 p-4 shadow-[0_14px_32px_rgba(0,0,0,.18)]"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-cyan-300/22 bg-[linear-gradient(145deg,rgba(14,165,233,.18),rgba(37,99,235,.08))] text-cyan-300"><Icon className="size-4.5"/></span><div><h3 className="text-[11px] font-bold text-white">{item.title}</h3><p className="mt-1.5 text-[10px] leading-4 text-slate-400">{item.description}</p></div></motion.div></Fade>})}</div>

        <Fade delay={.05} className="mt-7"><div className="relative overflow-hidden rounded-xl border border-cyan-300/20 shadow-[0_18px_45px_rgba(0,0,0,.24)]"><img src="/about-cta.webp" alt="BlockCtrl Minecraft dünyası" className="absolute inset-0 h-full w-full object-cover object-center"/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,11,20,.88),rgba(2,13,23,.48),rgba(2,11,20,.88))]"/><div className="relative flex min-h-[118px] flex-col items-center justify-center px-6 py-5 text-center"><h2 className="text-[20px] font-bold text-white sm:text-[22px]">Minecraft Dünyalarını Birlikte Büyütelim</h2><p className="mt-1 text-[10px] text-slate-200/80">Sen de aramıza katıl, farkı keşfet.</p><div className="mt-4 flex gap-3"><Link href="/sign-in" className="inline-flex h-9 min-w-24 items-center justify-center rounded-md bg-gradient-to-b from-[#2ccaff] to-[#0a9fe9] px-5 text-[11px] font-bold text-[#001421] shadow-[0_9px_28px_rgba(14,165,233,.22)]">Giriş Yap</Link><Link href="/sign-up" className="inline-flex h-9 min-w-24 items-center justify-center rounded-md border border-cyan-300/45 bg-[#03111f]/78 px-5 text-[11px] font-semibold text-white backdrop-blur-sm">Kayıt Ol</Link></div></div></div></Fade>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-cyan-400/10 pt-5 md:grid-cols-4"><AboutStat icon={Users} value="10.000+" label="Mutlu Kullanıcı"/><AboutStat icon={Server} value="25.000+" label="Yönetilen Sunucu"/><AboutStat icon={Gauge} value="99.9%" label="Sistem Uptime"/><AboutStat icon={Headphones} value="7/24" label="Profesyonel Destek"/></div>
      </div>
    </section>
  </>
}

function AboutStat({icon:Icon,value,label}:{icon:LucideIcon;value:string;label:string}){return <div className="flex items-center gap-3 px-1 py-2"><span className="grid size-9 shrink-0 place-items-center rounded-lg text-cyan-300"><Icon className="size-5"/></span><div><p className="text-[13px] font-black text-white">{value}</p><p className="mt-0.5 text-[9px] text-slate-500">{label}</p></div></div>}


function Support(){
  const topics=['Sunucu nasıl eklenir?','SFTP bilgilerine nasıl erişirim?','Yedekleri nasıl indiririm?','Oyuncu listesi nerede?','Destek talebi ne kadar sürede yanıtlanır?']
  return <>
    <section className="relative overflow-hidden border-b border-cyan-400/10 pt-[62px]">
      <img src="/support-hero.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-right-top"/>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,11,20,.96)_0%,rgba(2,11,20,.90)_40%,rgba(2,11,20,.42)_68%,rgba(2,11,20,.20)_100%),linear-gradient(180deg,rgba(2,10,18,.04),rgba(2,10,18,.80))]"/>
      <div className="pointer-events-none absolute right-[4.5%] top-[132px] z-20 hidden max-w-[390px] rotate-[-4deg] text-right lg:block">
        <p className="rounded-2xl bg-[#03101b]/35 px-5 py-4 text-[32px] font-semibold italic leading-[1.22] tracking-[.01em] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,.95)] backdrop-blur-[2px] ring-1 ring-white/5">“İyi bir sunucu,<br/>daima iyi dostluklar.”</p>
      </div>
      <div className="relative mx-auto max-w-[1240px] px-4 pb-8 pt-10 sm:px-6 sm:pt-12 lg:pb-10 lg:pt-14">
        <div className="max-w-[690px]">
          <Fade><h1 className="text-[38px] font-black tracking-[-.035em] text-white sm:text-[48px]">Her Zaman Yanınızdayız</h1><p className="mt-3 max-w-[630px] text-[14px] leading-6 text-slate-300 sm:text-[15px]">Sorularınız, önerileriniz veya yaşadığınız sorunlar için buradayız.</p></Fade>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <SupportShortcut icon={Headphones} title="Destek Talebi Aç" text="Hesabınıza giriş yaparak destek talebi oluşturun." href="/sign-in" cta="Destek Sistemine Git" tone="blue"/>
            <SupportShortcut icon={CircleHelp} title="Sık Sorulan Sorular" text="En çok merak edilen soruların cevapları." href="#sss" cta="SSS'yi Gör" tone="teal"/>
            <SupportShortcut icon={Sparkles} title="Yeni Kullanıcı Rehberi" text="Paneli kolayca kullanmak için rehberlere göz atın." href="/bilgilendirme" cta="Rehberleri Gör" tone="sky"/>
          </div>
        </div>
        <div className="mt-7 grid gap-4 lg:grid-cols-[1.35fr_.9fr]">
          <div id="sss" className="rounded-2xl border border-cyan-400/12 bg-[#051421]/86 p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)] backdrop-blur-md">
            <h2 className="text-[17px] font-bold text-white">Popüler Konular</h2>
            <div className="mt-3 divide-y divide-cyan-400/[.08] overflow-hidden rounded-xl border border-cyan-400/10 bg-[#03101b]/78">{topics.map((topic,index)=><Link key={topic} href={index===0?'/bilgilendirme':index===1?'/bilgilendirme':'#'} className="group flex min-h-11 items-center justify-between gap-4 px-4 text-[12px] text-slate-200 transition hover:bg-cyan-400/[.05] hover:text-white"><span>{topic}</span><ChevronRight className="size-4 text-cyan-400 transition group-hover:translate-x-0.5"/></Link>)}</div>
          </div>
          <div className="rounded-2xl border border-cyan-400/12 bg-[#051421]/88 p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)] backdrop-blur-md">
            <h2 className="text-[17px] font-bold text-white">Hâlâ yardıma mı ihtiyacınız var?</h2>
            <p className="mt-3 text-[12px] leading-5 text-slate-400">Giriş yaparak gerçek destek sistemimizden ekibimize ulaşabilirsiniz.</p>
            <Link href="/sign-in" className="mt-6 inline-flex h-11 min-w-[120px] items-center justify-center rounded-lg border border-cyan-300/45 bg-gradient-to-b from-[#23c7ff] to-[#0b9ff0] px-5 text-[12px] font-bold text-[#001421] shadow-[0_0_24px_rgba(14,165,233,.18)] transition hover:brightness-110">Giriş Yap</Link>
          </div>
        </div>
      </div>
    </section>
  </>
}

function SupportShortcut({icon:Icon,title,text,href,cta,tone}:{icon:LucideIcon;title:string;text:string;href:string;cta:string;tone:'blue'|'teal'|'sky'}){
  const toneClass=tone==='teal'?'from-emerald-500/18 to-cyan-500/[.03] text-emerald-200 border-emerald-400/20':tone==='sky'?'from-blue-500/18 to-sky-500/[.03] text-sky-200 border-sky-400/20':'from-indigo-500/18 to-blue-500/[.03] text-blue-200 border-blue-400/20'
  return <motion.div whileHover={{y:-3}} className="rounded-2xl border border-cyan-400/12 bg-[#061725]/90 p-4 shadow-[0_14px_36px_rgba(0,0,0,.20)] backdrop-blur-md"><div className={`grid size-10 place-items-center rounded-xl border bg-gradient-to-br ${toneClass}`}><Icon className="size-5"/></div><h3 className="mt-3 text-[13px] font-bold text-white">{title}</h3><p className="mt-1.5 min-h-[38px] text-[11px] leading-5 text-slate-400">{text}</p><Link href={href} className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-300/20 bg-[#071b2c]/90 px-3 text-[11px] font-semibold text-white transition hover:border-cyan-300/45 hover:bg-cyan-400/[.07]">{cta}<ArrowRight className="size-3.5"/></Link></motion.div>
}


function CTA(){return <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"><Fade><div className="relative overflow-hidden rounded-[30px] border border-sky-400/15 bg-[linear-gradient(135deg,rgba(14,165,233,.12),rgba(37,99,235,.08),rgba(7,21,34,.96))] p-8 sm:p-10"><div className="absolute -right-20 -top-20 size-72 rounded-full bg-sky-500/10 blur-[80px]"/><div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-300">BlockCtrl'e başlayın</p><h2 className="mt-3 text-3xl font-bold text-white">Sunucu yönetim merkezinizi oluşturun.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Hesap oluşturun veya mevcut hesabınızla giriş yaparak size açık BlockCtrl sunucularını yönetmeye başlayın.</p></div><div className="flex shrink-0 flex-wrap gap-3"><Link href="/sign-in" className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">Giriş Yap</Link><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg">Kayıt Ol <ArrowRight className="size-4"/></Link></div></div></div></Fade></section>}

export function PublicMarketingPage({page}:{page:PublicPage}){
  return <div className="min-h-svh overflow-x-hidden bg-[#030b14] font-sans text-slate-100 selection:bg-sky-400/25 selection:text-white"><a href="#public-main" className="bc-skip-link">İçeriğe geç</a><Background/><Header/><main id="public-main">{page==='home'?<Home/>:page==='info'?<Information/>:page==='about'?<About/>:<Support/>}</main><Footer/></div>
}