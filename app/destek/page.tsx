import type { Metadata } from 'next'
import { PublicMarketingPage } from '@/components/public-marketing'

export const metadata: Metadata = {
  title: 'Destek',
  description: 'BlockCtrl hesap, panel ve Minecraft sunucu yönetimi için destek başlangıç sayfası ve sık sorulan sorular.',
  robots: { index: true, follow: true },
}

export default function SupportPage(){ return <PublicMarketingPage page="support"/> }