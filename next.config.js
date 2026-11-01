/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' } : {}),
  reactStrictMode: true,

  // Non-localhost origins that may load dev resources (scripts, HMR) during development
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // Barrel-file imports are expanded at build time for smaller client bundles.
  // lucide-react and @headlessui/react are already in the Next.js default list.
  experimental: {
    optimizePackageImports: ['react-hot-toast'],
  },
}

module.exports = nextConfig
