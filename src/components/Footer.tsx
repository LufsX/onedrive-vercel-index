'use client'

import { useClientConfig } from './ClientConfigProvider'

const Footer = () => {
  const { siteConfig } = useClientConfig()
  return (
    <div
      className="w-full border-t border-gray-900/10 p-4 text-center text-xs font-medium text-gray-400 dark:border-gray-500/30"
      dangerouslySetInnerHTML={{ __html: siteConfig.footer }}
    ></div>
  )
}

export default Footer
