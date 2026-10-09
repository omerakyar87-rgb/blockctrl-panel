import { asc, count, eq, or } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ControlPanel } from '@/components/control-panel'
import { PublicMarketingPage } from '@/components/public-marketing'
import { auth } from '@/lib/auth'
import { db, ensurePanelSchema } from '@/lib/db'
import { user } from '@/lib/db/schema'

export default async function Page() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return <PublicMarketingPage page="home" />

    await ensurePanelSchema()
    let [record] = await db.select().from(user).where(or(eq(user.id, session.user.id), eq(user.email, session.user.email))).limit(1)
    if (!record) {
      ;[record] = await db.insert(user).values({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: true,
      }).onConflictDoNothing().returning()
      if (!record) [record] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1)
    }
    const [{ value: totalUsers }] = await db.select({ value: count() }).from(user)
    const [{ value: managers }] = await db.select({ value: count() }).from(user).where(eq(user.role, 'manager'))
    const [firstUser] = await db.select({ id: user.id }).from(user).orderBy(asc(user.createdAt)).limit(1)

    if (record && (totalUsers === 1 || managers === 0 && firstUser?.id === record.id) && (!record.approved || record.role !== 'manager')) {
      ;[record] = await db.update(user).set({ role: 'manager', approved: true, updatedAt: new Date() }).where(eq(user.id, record.id)).returning()
    }

    if (!record?.approved) redirect('/pending')
    return <ControlPanel />
  } catch (error) {
    const isDatabaseUnavailable = error instanceof Error && /ECONNREFUSED|ENOTFOUND|DATABASE_URL/i.test(error.message)
    if (!isDatabaseUnavailable) throw error

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020b16] px-6 text-slate-100">
        <section className="max-w-lg space-y-3 rounded-2xl border border-cyan-400/15 bg-[#061523] p-8 text-center">
          <h1 className="text-2xl font-semibold">Veritabanı bağlantısı kullanılamıyor</h1>
          <p className="text-slate-400">Neon bağlantısı bu çalışma ortamına henüz aktarılmamış olabilir. Entegrasyon tamamlandıktan sonra sayfayı yenileyin.</p>
        </section>
      </main>
    )
  }
}
