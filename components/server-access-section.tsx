'use client'

import type { ComponentType, ReactNode } from 'react'
import { Folder, Gamepad2, Info, MoreHorizontal, RotateCcw, Search, Settings2, Terminal, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Member={id:string;name:string;email:string;role:string;approved:boolean}
type Permission={userId:string;canConsole:boolean;canFiles:boolean;canBackup:boolean;canReset:boolean;sections?:string[]}

function RoleBadge({role}:{role:string}){const manager=role==='manager';const admin=role==='admin';return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${manager?'border-amber-500/40 bg-amber-500/10 text-amber-300':admin?'border-blue-500/40 bg-blue-500/10 text-blue-300':'border-sky-500/35 bg-sky-500/10 text-sky-300'}`}>{role}</span>}
function MiniValue({label,value,good}:{label:string;value:string;good?:boolean}){return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 truncate text-xs font-medium ${good?'text-sky-300':'text-slate-200'}`}>{value}</p></div>}
function PermissionDisplay({icon:Icon,label,sub,enabled}:{icon:ComponentType<{className?:string}>;label:string;sub:string;enabled:boolean}){return <div className="flex items-center gap-3 rounded-lg border border-[#1f3851] bg-black/10 px-3 py-2"><Icon className="size-4 text-slate-300"/><div className="min-w-0 flex-1"><p className="text-xs font-medium">{label}</p><p className="text-xs text-slate-500">{sub}</p></div><span className={`relative h-5 w-9 rounded-full ${enabled?'bg-sky-500':'bg-slate-700'}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white ${enabled?'left-[18px]':'left-0.5'}`}/></span></div>}
function Card({title,subtitle,action,children}:{title:string;subtitle:string;action?:ReactNode;children:ReactNode}){return <section className="rounded-2xl border border-[#1f3851] bg-[#0b1826] p-4"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>{action}</div>{children}</section>}
function Empty({children}:{children:string}){return <div className="rounded-lg border border-dashed border-[#203a55] bg-black/10 p-6 text-center text-xs text-slate-500">{children}</div>}

export function ServerAccessSection({
  users,permissions,selectedUserId,userQuery,busy,onSelectUser,onQueryChange,onNotice,onPermissionAction,
}:{
  users:Member[]
  permissions:Permission[]
  selectedUserId:string
  userQuery:string
  busy:boolean
  onSelectUser:(id:string)=>void
  onQueryChange:(value:string)=>void
  onNotice:(message:string)=>void
  onPermissionAction:(userId:string,grant:boolean)=>Promise<void>|void
}){
  const filteredUsers=users.filter(user=>!userQuery.trim()||`${user.name} ${user.email}`.toLowerCase().includes(userQuery.toLowerCase()))
  const selectedUser=users.find(user=>user.id===selectedUserId)??users[0]
  const selectedPermission=selectedUser?permissions.find(permission=>permission.userId===selectedUser.id):undefined
  function selectCandidate(){
    const candidate=users.find(user=>!permissions.some(permission=>permission.userId===user.id))
    if(candidate){onSelectUser(candidate.id);onNotice(`${candidate.name} seçildi. Sağ panelden bu sunucuya erişim verebilirsiniz.`)}
    else onNotice('Sunucuya eklenebilecek başka onaylı kullanıcı yok.')
  }
  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold text-white">Erişim</h2><p className="mt-1 text-sm text-slate-500">Sunucuya erişimi olan kullanıcıları yönetin ve yetkilerini düzenleyin.</p></div>
    <div className="flex items-start gap-3 rounded-xl border border-blue-500/35 bg-blue-950/20 px-4 py-3 text-xs text-blue-200"><Info className="mt-0.5 size-4 shrink-0"/><div><b>Sunucu erişimi kullanıcı bazında yönetilir.</b><p className="mt-1 text-blue-200/70">Bir kullanıcı bu sunucuya erişebilmek için sunucu ile ilişkilendirilmiş olmalıdır.</p></div></div>
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_430px]">
      <Card title="Kullanıcılar" subtitle="Bu sunucuya erişimi olan kullanıcılar." action={<Button size="sm" className="bg-sky-600 text-slate-950" onClick={selectCandidate}><UserPlus className="mr-2 size-4"/>Kullanıcı seç</Button>}>
        <div className="relative mb-3"><Search className="absolute left-3 top-2.5 size-4 text-slate-500"/><input value={userQuery} onChange={e=>onQueryChange(e.target.value)} className="h-9 w-full rounded-md border border-[#28445f] bg-[#091725] pl-9 pr-3 text-xs outline-none" placeholder="Kullanıcı ara..."/></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead className="border-y border-[#203a55] bg-white/[.02] text-left text-slate-400"><tr><th className="p-3">Kullanıcı</th><th className="p-3">Rol</th><th className="p-3">Son giriş</th><th className="p-3">Durum</th><th className="p-3">Bu sunucu</th><th className="p-3"></th></tr></thead><tbody>{filteredUsers.map(user=>{const permission=permissions.find(item=>item.userId===user.id);return <tr key={user.id} onClick={()=>onSelectUser(user.id)} className={`cursor-pointer border-b border-[#1f3851] ${selectedUser?.id===user.id?'bg-sky-500/[.04]':''}`}><td className="p-3"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-slate-700 text-xs font-bold">{user.name.slice(0,2).toUpperCase()}</span><div><b className="text-white">{user.name}</b><div className="text-xs text-slate-500">{user.email}</div></div></div></td><td className="p-3"><RoleBadge role={user.role}/></td><td className="p-3 text-slate-400">—</td><td className="p-3"><span className={user.approved?'text-sky-300':'text-amber-300'}>● {user.approved?'Onaylı':'Bekliyor'}</span></td><td className="p-3">{permission?'Erişim var':'Erişim yok'}</td><td className="p-3"><MoreHorizontal className="size-4 text-slate-500"/></td></tr>})}</tbody></table></div>
      </Card>
      <Card title="Kullanıcı detayları" subtitle="Kullanıcının yetkilerini düzenleyin.">
        {selectedUser?<><div className="flex items-center justify-between border-b border-[#203a55] pb-4"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-700 text-sm font-bold">{selectedUser.name.slice(0,2).toUpperCase()}</span><div className="min-w-0"><b className="block truncate">{selectedUser.name}</b><div className="truncate text-xs text-slate-500">{selectedUser.email}</div></div></div><RoleBadge role={selectedUser.role}/></div><div className="grid gap-3 border-b border-[#203a55] py-4 sm:grid-cols-3"><MiniValue label="Durum" value={selectedUser.approved?'Onaylı':'Bekliyor'} good={selectedUser.approved}/><MiniValue label="Rol" value={selectedUser.role}/><MiniValue label="Bu sunucuya erişim" value={selectedPermission?'Var':'Yok'}/></div><div className="pt-4"><h4 className="text-sm font-semibold">Sunucu yetkileri</h4><p className="mt-1 text-xs text-slate-500">Bu kullanıcının bu sunucuya özel yetkilerini ayarlayın.</p><div className="mt-3 space-y-1"><PermissionDisplay icon={Gamepad2} label="Genel Bakış" sub="Sunucu durumunu görüntüleyebilir." enabled={!!selectedPermission?.sections?.includes('overview')||selectedUser.role==='manager'}/><PermissionDisplay icon={Terminal} label="Konsol" sub="Konsolu görüntüleyip komut çalıştırabilir." enabled={!!selectedPermission?.canConsole||selectedUser.role==='manager'}/><PermissionDisplay icon={Folder} label="Dosyalar" sub="Sunucu dosyalarını görüntüleyip düzenleyebilir." enabled={!!selectedPermission?.canFiles||selectedUser.role==='manager'}/><PermissionDisplay icon={RotateCcw} label="Yedekler" sub="Yedekleri oluşturup yönetebilir." enabled={!!selectedPermission?.canBackup||selectedUser.role==='manager'}/><PermissionDisplay icon={Settings2} label="Ayarlar" sub="Sunucu ayarlarını düzenleyebilir." enabled={!!selectedPermission?.canReset||selectedUser.role==='manager'}/></div><div className="mt-4 flex gap-2">{selectedUser.role!=='manager'&&(selectedPermission?<Button variant="destructive" disabled={busy} onClick={()=>void onPermissionAction(selectedUser.id,false)}><Trash2 className="mr-2 size-4"/>Erişimi kaldır</Button>:<Button className="bg-sky-600 text-slate-950" disabled={busy||!selectedUser.approved} onClick={()=>void onPermissionAction(selectedUser.id,true)}><UserPlus className="mr-2 size-4"/>Tam erişim ver</Button>)}</div></div></>:<Empty>Bir kullanıcı seçin.</Empty>}
      </Card>
    </div>
  </div>
}
