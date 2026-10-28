'use client'

import siteConfig from '../../config/site.config'

const Footer = () => {
  return (
    <div className="w-full border-t border-gray-900/10 bg-white py-4 text-center text-xs font-medium text-gray-500 dark:border-gray-500/30 dark:bg-gray-900 dark:text-gray-400">
      {siteConfig.footer}
    </div>
  )
}

export default Footer
