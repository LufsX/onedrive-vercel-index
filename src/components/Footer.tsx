'use client'

import { useClientConfig } from './ClientConfigProvider'

export default function Footer() {
  const { siteConfig } = useClientConfig()
  return (
    <footer className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-gray-900/10 px-4 py-3 text-center text-xs font-medium text-gray-400 dark:border-gray-500/30">
      <div dangerouslySetInnerHTML={{ __html: siteConfig.footer }} />
    </footer>
  )
}
