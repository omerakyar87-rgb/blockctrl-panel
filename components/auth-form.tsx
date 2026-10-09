'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Globe2, LoaderCircle, Server, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(formData: FormData) {
    setPending(true)
    setError('')
    try {
      const email = String(formData.get('email') ?? '').trim().toLowerCase()
      const password = String(formData.get('password') ?? '')
      const name = String(formData.get('name') ?? '').trim()
      if (!email || !email.includes('@')) throw new Error('Geçerli bir e-posta adresi girin.')
      if (password.length < 8) throw new Error('Şifre en az 8 karakter olmalıdır.')
      if (mode === 'sign-up' && name.length < 2) throw new Error('Ad soyad en az 2 karakter olmalıdır.')

      const supabase = createClient()

      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback?next=/auth/confirmed`,
            data: { name },
          },
        })

        if (signUpError) {
          const errorText = `${signUpError.code ?? ''} ${signUpError.message}`.toLowerCase()
          if (errorText.includes('rate') || errorText.includes('too many')) {
            throw new Error('Çok fazla deneme yapıldı. Lütfen biraz bekleyin.')
          }
          if (errorText.includes('weak') || errorText.includes('password')) {
            throw new Error('Şifre daha güçlü olmalıdır.')
          }
          if (errorText.includes('email_address_not_authorized') || errorText.includes('not authorized')) {
            throw new Error('Bu e-posta adresi kayıt için yetkili değil.')
          }
          if (errorText.includes('already registered') || errorText.includes('already been registered') || errorText.includes('user_already_exists')) {
            throw new Error('Bu e-posta adresi zaten kayıtlı. Giriş yapmayı veya şifrenizi yenilemeyi deneyin.')
          }
          if (errorText.includes('failed to fetch') || errorText.includes('network') || errorText.includes('fetch')) {
            throw new Error('Supabase bağlantısı kurulamadı. Lütfen biraz sonra tekrar deneyin.')
          }
          if (errorText.includes('redirect') || errorText.includes('url')) {
            throw new Error('Doğrulama bağlantısı ayarlanamadı. Lütfen yöneticinizle iletişime geçin.')
          }
          throw new Error('Kayıt tamamlanamadı. Bilgilerinizi kontrol edip tekrar deneyin.')
        }

        if (!data.session) {
          setError('Kayıt başarılı. Devam etmek için e-posta adresinize gönderilen doğrulama bağlantısına tıklayın.')
          return
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          const errorText = `${signInError.code ?? ''} ${signInError.message}`.toLowerCase()
          if (errorText.includes('failed to fetch') || errorText.includes('network') || errorText.includes('fetch')) {
            throw new Error('Supabase bağlantısı kurulamadı. Lütfen biraz sonra tekrar deneyin.')
          }
          throw new Error(errorText.includes('confirm') ? 'Önce e-posta adresinizi doğrulamanız gerekiyor.' : 'E-posta veya şifre hatalı.')
        }
      }

      router.replace('/')
      router.refresh()
    } catch (cause) {
      console.error('[BlockCtrl] Authentication request error:', cause)
      setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.')
    } finally {
      setPending(false)
    }
  }

  const isSignIn = mode === 'sign-in'

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-[#050b12] p-4 font-sans text-slate-100 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(14,165,233,.16),transparent_34%),radial-gradient(circle_at_85%_85%,rgba(16,185,129,.12),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px)] [background-size:38px_38px]" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-800/90 bg-slate-950/75 shadow-2xl shadow-black/40 backdrop-blur-xl lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden min-h-[640px] flex-col justify-between overflow-hidden border-r border-slate-800 bg-slate-900/55 p-10 lg:flex">
          <div className="absolute -left-20 top-20 size-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative">
            <button type="button" onClick={() => router.push('/')} className="inline-flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <Box className="size-6" />
              </span>
              <span>
                <span className="block text-lg font-semibold tracking-tight text-white">BlockCtrl</span>
                <span className="block text-[10px] font-medium uppercase tracking-[.22em] text-cyan-300/80">Minecraft Control Plane</span>
              </span>
            </button>

            <h1 className="mt-14 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
              Minecraft altyapınızı tek merkezden yönetin.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
              Sunucular, node telemetrisi, dosyalar, yedekler, oyuncular, güvenlik ve website builder aynı BlockCtrl çalışma alanında.
            </p>
          </div>

          <div className="relative grid gap-3 sm:grid-cols-3">
            <Feature icon={Server} title="Canlı node" text="Heartbeat ve sunucu telemetrisi" />
            <Feature icon={ShieldCheck} title="Yetki kontrollü" text="Sunucu bazlı rol ve izinler" />
            <Feature icon={Globe2} title="Website Builder" text="Sunucu verisine bağlı yayın" />
          </div>
        </section>

        <section className="flex min-h-[640px] items-center p-6 sm:p-10">
          <Card className="w-full border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 pb-6 text-left">
              <button type="button" onClick={() => router.push('/')} className="mb-7 inline-flex items-center gap-2 lg:hidden">
                <span className="grid size-9 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300"><Box className="size-5" /></span>
                <span className="font-semibold text-white">BlockCtrl</span>
              </button>
              <p className="text-xs font-semibold uppercase tracking-[.22em] text-cyan-300">BLOCKCTRL</p>
              <CardTitle className="mt-2 text-3xl tracking-tight text-white">
                {isSignIn ? 'Tekrar hoş geldiniz' : 'Hesabınızı oluşturun'}
              </CardTitle>
              <CardDescription className="max-w-sm leading-6 text-slate-400">
                {isSignIn
                  ? 'Minecraft sunucu yönetim merkezinize güvenli şekilde giriş yapın.'
                  : 'E-posta doğrulamasından sonra hesabınız BlockCtrl paneline bağlanır.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0">
              <form action={submit} className="flex flex-col gap-5">
                <FieldGroup>
                  {!isSignIn && (
                    <Field>
                      <FieldLabel htmlFor="name" className="text-slate-300">Ad soyad</FieldLabel>
                      <Input id="name" name="name" required minLength={2} autoComplete="name" className="h-11 border-slate-700 bg-slate-900/80 text-white" />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="email" className="text-slate-300">E-posta</FieldLabel>
                    <Input id="email" name="email" type="email" required autoComplete="email" className="h-11 border-slate-700 bg-slate-900/80 text-white" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password" className="text-slate-300">Şifre</FieldLabel>
                    <Input id="password" name="password" type="password" required minLength={8} autoComplete={isSignIn ? 'current-password' : 'new-password'} className="h-11 border-slate-700 bg-slate-900/80 text-white" />
                  </Field>
                </FieldGroup>

                {error && (
                  <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm leading-5 text-red-200">
                    {error}
                  </p>
                )}

                <Button disabled={pending} type="submit" className="h-11 w-full bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400">
                  {pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
                  {isSignIn ? 'Giriş yap' : 'Hesap oluştur'}
                </Button>

                {isSignIn && (
                  <Button type="button" variant="link" className="h-auto self-start p-0 text-cyan-300" onClick={() => router.push('/forgot-password')}>
                    Şifremi unuttum
                  </Button>
                )}

                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-slate-800" />
                  <span className="text-[11px] uppercase tracking-wider text-slate-600">veya</span>
                  <span className="h-px flex-1 bg-slate-800" />
                </div>

                <Button type="button" variant="outline" className="h-11 border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800" onClick={() => router.push(isSignIn ? '/sign-up' : '/sign-in')}>
                  {isSignIn ? 'Yeni BlockCtrl hesabı oluştur' : 'Zaten hesabım var'}
                </Button>
              </form>

              <p className="mt-8 text-center text-xs leading-5 text-slate-600">
                Devam ederek hesabınızın yalnız BlockCtrl panel kimlik doğrulaması için Supabase Auth ile işlenmesini kabul etmiş olursunuz.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

function Feature({ icon: Icon, title, text }: { icon: typeof Server; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <Icon className="mb-3 size-5 text-cyan-300" />
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  )
}
