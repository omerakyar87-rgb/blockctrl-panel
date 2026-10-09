/** @type {import('next').NextConfig} */
const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel-storage.com https://*.neon.tech https://api.vercel.com; frame-src 'self' https:; worker-src 'self' blob:; report-uri /api/csp-report"
const cspEnforced = process.env.NODE_ENV === 'production' || process.env.BLOCKCTRL_CSP_ENFORCE === 'true'
const cspHeader = cspEnforced ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'

const nextConfig = {
  poweredByHeader: false,
  compress: true,
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/favicon.svg' }]
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        { key: cspHeader, value: csp },
      ],
    }]
  },
}

export default nextConfig
