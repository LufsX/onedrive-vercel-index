'use client'

import { Fragment } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faChevronDown, faLanguage } from '@fortawesome/free-solid-svg-icons'
import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react'
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
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-1.5 rounded px-0.5 py-1 hover:opacity-80 dark:text-white">
        <FontAwesomeIcon className="h-4 w-4" icon={faLanguage} />
        <FontAwesomeIcon className="h-3 w-3" icon={faChevronDown} />
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition duration-100 ease-out"
        enterFrom="transform scale-95 opacity-0"
        enterTo="transform scale-100 opacity-100"
        leave="transition duration-75 ease-out"
        leaveFrom="transform scale-100 opacity-100"
        leaveTo="transform scale-95 opacity-0"
      >
        <MenuItems className="absolute top-full right-0 z-20 mt-1 w-44 overflow-hidden rounded border border-gray-900/10 bg-white py-1 shadow-lg focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-900 dark:text-white">
          {locales.map(locale => (
            <MenuItem key={locale}>
              {({ focus }) => (
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm font-medium whitespace-nowrap ${
                    focus ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-400' : ''
                  } ${locale === currentLocale ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
                  onClick={() => switchLocale(locale)}
                >
                  <span>{localeText(locale)}</span>
                  {locale === currentLocale && <FontAwesomeIcon className="h-3 w-3 shrink-0" icon={faCheck} />}
                </button>
              )}
            </MenuItem>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  )
}

export default SwitchLang
