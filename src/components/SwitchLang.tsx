'use client'

import { Check, ChevronDown, Languages } from 'lucide-react'
import Dropdown from './Dropdown'
import { useRouter } from 'next/navigation'

import { useLocale } from './ClientProviders'
import { setLocaleCookie } from '../utils/localeCookie'

const localeText = (locale: string): string => {
  switch (locale) {
    case 'de-DE':
      return '🇩🇪 Deutsch'
    case 'en':
      return '🇬🇧 English'
    case 'es':
      return '🇪🇸 Español'
    case 'hi':
      return '🇮🇳 हिन्दी'
    case 'id':
      return '🇮🇩 Indonesia'
    case 'tr-TR':
      return '🇹🇷 Türkçe'
    case 'zh-CN':
      return '🇨🇳 简体中文'
    case 'zh-TW':
      return '🇹🇼 繁體中文'
    default:
      return '🇨🇳 简体中文'
  }
}

const locales = ['en', 'zh-CN', 'zh-TW', 'de-DE', 'es', 'hi', 'id', 'tr-TR']

const SwitchLang = () => {
  const router = useRouter()
  const currentLocale = useLocale()

  const switchLocale = (locale: string) => {
    if (locale === currentLocale) return

    setLocaleCookie(locale)
    router.refresh()
  }

  return (
    <div className="relative">
      <Dropdown
        role="menu"
        items={locales}
        selectedIndex={locales.indexOf(currentLocale)}
        onSelect={switchLocale}
        triggerLabel={localeText(currentLocale)}
        triggerClassName="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 transition-colors duration-150 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800"
        trigger={
          <>
            <Languages className="h-4 w-4" />
            <ChevronDown className="h-3 w-3 transition-transform duration-200 group-aria-expanded:rotate-180" />
          </>
        }
        panelClassName="absolute top-full right-0 z-20 mt-1 w-44 overflow-hidden rounded border border-gray-900/10 bg-white py-1 shadow-lg focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-900 dark:text-white"
        itemClassName={locale =>
          `flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm font-medium whitespace-nowrap transition-colors duration-100 outline-hidden data-focus:text-blue-700 dark:data-focus:text-blue-400 ${locale === currentLocale ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`
        }
        renderItem={locale => (
          <>
            <span>{localeText(locale)}</span>
            {locale === currentLocale && <Check className="h-3 w-3 shrink-0" />}
          </>
        )}
      />
    </div>
  )
}

export default SwitchLang
