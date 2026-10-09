'use client'

import { KeyRound, LockKeyhole, UserRoundCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActionConfirm } from '@/components/action-confirm-dialog'

type SessionRow={id:string;ipAddress:string|null;userAgent:string|null;expiresAt:string}
type AccessData={
  capabilities:string[]
  snapshot?:{properties?:{onlineMode?:boolean;whitelist?:boolean}|null}|null
  access:{
    sessions:number
    sessionDetails:SessionRow[]
    failedLoginAt:string|null
    apiKeys:number|null
    passwordChangedAt:string|null
    twoFactor:'active'|'off'|'challenge-required'|'integration-required'
    mfa?:{verifiedFactors:number}|null
  }
}

function timeAgo(value:string){const time=new Date(value).getTime();if(!Number.isFinite(time))return'—';const diff=Math.max(0,Date.now()-time);if(diff<60_000)return'az önce';if(diff<3_600_000)return`${Math.floor(diff/60_000)} dk önce`;if(diff<86_400_000)return`${Math.floor(diff/3_600_000)} sa önce`;return`${Math.floor(diff/86_400_000)} gün önce`}
function capability(data:AccessData,key:string){return data.capabilities.includes(key)?'Destekleniyor':'Entegrasyon gerekli'}
function Row({label,value}:{label:string;value:string}){return <div className="flex items-start justify-between gap-4 border-b border-slate-800/70 py-2.5 last:border-0"><span className="text-xs text-slate-500">{label}</span><span className="max-w-[58%] text-right text-xs font-medium text-slate-200">{value}</span></div>}
function Card({title,subtitle,icon:Icon,children}:{title:string;subtitle?:string;icon:any;children:React.ReactNode}){return <section className="rounded-xl border border-[#203a55] bg-[#0a1826] p-4"><div className="mb-3 flex items-start gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-300"><Icon className="size-4"/></div><div><h3 className="text-sm font-semibold text-white">{title}</h3>{subtitle&&<p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div></div>{children}</section>}

export function ServerSecurityAccessTab({data,busy,act}:{data:AccessData;busy:string;act:(action:string,payload?:Record<string,unknown>)=>Promise<any>}){
  const actionConfirm=useActionConfirm()
  const p=data.snapshot?.properties
  async function revokeOthers(){
    const ok=await actionConfirm.ask('Bu hesap için mevcut oturum dışındaki tüm Supabase oturumları sonlandırılacak.',{title:'Diğer oturumları kapat',confirmLabel:'Oturumları kapat',danger:true,requiredText:'OTURUMLARI KAPAT'})
    if(ok)await act('session-revoke-others',{})
  }
  return <div className="space-y-3">
    {actionConfirm.dialog}
    <div className="grid gap-3 xl:grid-cols-3">
      <Card title="Oyuncu giriş güvenliği" icon={UserRoundCheck}>
        <Row label="online-mode" value={p?.onlineMode===true?'Açık':p?.onlineMode===false?'Kapalı':'Bilinmiyor'}/>
        <Row label="Whitelist" value={p?.whitelist===true?'Açık':p?.whitelist===false?'Kapalı':'Bilinmiyor'}/>
        <Row label="IP ban / CIDR" value="Ağ güvenliği sekmesinde"/>
        <Row label="Oyuncu banı" value="Oyuncular bölümünde"/>
        <Row label="Kullanıcı adı filtreleme" value="Entegrasyon gerekli"/>
        <Row label="Aynı IP’den max oyuncu" value="Entegrasyon gerekli"/>
        <Row label="VPN / Proxy kontrolü" value={capability(data,'ip-reputation')}/>
        <Row label="Cracked PIN/Auth" value={capability(data,'auth-addon')}/>
        <Row label="Discord hesap eşleme" value="Entegrasyon gerekli"/>
        <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" disabled={!!busy||p?.onlineMode===true} onClick={()=>void act('fix-finding',{fixId:'enable-online-mode'})}>Premium doğrulamayı aç</Button>
      </Card>
      <Card title="Yönetici ve panel güvenliği" icon={KeyRound}>
        <Row label="2FA" value={data.access.twoFactor==='active'?'Aktif · AAL2':data.access.twoFactor==='challenge-required'?'Kayıtlı · doğrulama gerekli':data.access.twoFactor==='off'?'Kapalı':'Durum okunamadı'}/>
        <Row label="2FA faktörü" value={data.access.mfa?String(data.access.mfa.verifiedFactors):'—'}/>
        <Row label="Aktif oturum" value={String(data.access.sessions)}/>
        <Row label="Son başarısız giriş" value={data.access.failedLoginAt?timeAgo(data.access.failedLoginAt):'Veri kaynağı yok'}/>
        <Row label="Aktif API anahtarı" value={data.access.apiKeys===null?'Entegrasyon gerekli':String(data.access.apiKeys)}/>
        <Row label="Son parola değişimi" value={data.access.passwordChangedAt?timeAgo(data.access.passwordChangedAt):'Veri kaynağı yok'}/>
        <Row label="Admin IP allowlist" value="Entegrasyon gerekli"/>
      </Card>
      <Card title="Kritik işlem doğrulaması" subtitle="Bu kart özellik varmış gibi onay işareti üretmez." icon={LockKeyhole}>
        <Row label="Sunucu silme" value="İsimle onay mevcut"/>
        <Row label="Backup restore" value="Yazılı onay mevcut"/>
        <Row label="World reset" value="Yazılı onay mevcut"/>
        <Row label="RCON açma" value="Merkezi tekrar doğrulama gerekli"/>
        <Row label="Operator ekleme" value="Merkezi tekrar doğrulama gerekli"/>
        <Row label="Config değiştirme" value="Backup var · tekrar doğrulama gerekli"/>
      </Card>
    </div>
    <Card title="Supabase oturum güvenliği" subtitle="Mevcut oturum Supabase Auth üzerinden doğrulanır; diğer oturumlar topluca sonlandırılabilir." icon={Users}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead className="text-left text-slate-500"><tr><th className="pb-2">IP</th><th>Cihaz / User-Agent</th><th>Bitiş</th><th>İşlem</th></tr></thead>
          <tbody>{data.access.sessionDetails.map(row=><tr key={row.id} className="border-t border-[#203a55]"><td className="py-2 font-mono">{row.ipAddress||'—'}</td><td className="max-w-[420px] truncate">{row.userAgent||'Mevcut Supabase oturumu'}</td><td>{row.expiresAt?timeAgo(row.expiresAt):'—'}</td><td><Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!busy} onClick={()=>void revokeOthers()}>Diğerlerini kapat</Button></td></tr>)}</tbody>
        </table>
        {!data.access.sessionDetails.length&&<p className="py-5 text-center text-xs text-slate-600">Aktif oturum kaydı yok.</p>}
      </div>
    </Card>
  </div>
}
