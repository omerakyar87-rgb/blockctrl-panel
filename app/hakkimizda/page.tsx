import type { Metadata } from 'next'
import { PublicMarketingPage } from '@/components/public-marketing'

export const metadata: Metadata = {
  title: 'Hakkımızda',
  description: 'BlockCtrl Minecraft sunucu yönetim panelinin amacı, ürün yaklaşımı ve temel ilkeleri.',
  robots: { index: true, follow: true },
}

export default function AboutPage(){ return <PublicMarketingPage page="about"/> }