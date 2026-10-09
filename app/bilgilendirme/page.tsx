import type { Metadata } from 'next'
import { PublicMarketingPage } from '@/components/public-marketing'

export const metadata: Metadata = {
  title: 'Bilgilendirme',
  description: 'BlockCtrl Minecraft sunucu yönetim panelinin çalışma yapısı, özellikleri ve yönetim alanları.',
  robots: { index: true, follow: true },
}

export default function InformationPage(){ return <PublicMarketingPage page="info"/> }