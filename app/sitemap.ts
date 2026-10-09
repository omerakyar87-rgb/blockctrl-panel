import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base='https://minecrfat-server.vercel.app'
  const now=new Date()
  return [
    {url:base+'/',lastModified:now,changeFrequency:'weekly',priority:1},
    {url:base+'/bilgilendirme',lastModified:now,changeFrequency:'monthly',priority:.8},
    {url:base+'/hakkimizda',lastModified:now,changeFrequency:'monthly',priority:.7},
    {url:base+'/destek',lastModified:now,changeFrequency:'monthly',priority:.8},
    {url:base+'/sign-in',lastModified:now,changeFrequency:'yearly',priority:.3},
    {url:base+'/sign-up',lastModified:now,changeFrequency:'yearly',priority:.3},
  ]
}
