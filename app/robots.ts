import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/servers/', '/hesap', '/destek-ayarlari'] },
    sitemap: 'https://minecrfat-server.vercel.app/sitemap.xml',
  }
}
