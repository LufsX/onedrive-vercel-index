'use client'

import { Fragment, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faLanguage } from '@fortawesome/free-solid-svg-icons'
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
  const [open, setOpen] = useState(false)

  const switchLocale = (locale: string) => {
    setOpen(false)

    if (locale === currentLocale) return

    setLocaleCookie(locale)
    router.refresh()
  }

  return (
    <div className="relative">
      <Menu>
        <MenuButton
          className="flex items-center gap-1.5 hover:opacity-80 dark:text-white"
          onClick={() => setOpen(value => !value)}
        >
          <FontAwesomeIcon className="h-4 w-4" icon={faLanguage} />
          <FontAwesomeIcon className="h-3 w-3" icon={faChevronDown} />
        </MenuButton>

        <Transition
          as={Fragment}
          show={open}
          enter="transition duration-100 ease-out"
          enterFrom="transform scale-95 opacity-0"
          enterTo="transform scale-100 opacity-100"
          leave="transition duration-75 ease-out"
          leaveFrom="transform scale-100 opacity-100"
          leaveTo="transform scale-95 opacity-0"
        >
          <MenuItems className="absolute top-0 right-0 z-20 mt-8 w-28 divide-y divide-gray-900 overflow-auto rounded border border-gray-900/10 bg-white py-1 shadow-lg focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-900 dark:text-white">
            {locales.map(locale => (
              <MenuItem key={locale}>
                <button
                  type="button"
                  className="m-1 w-full cursor-pointer rounded px-2 py-1 text-left text-sm font-medium hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-600/10 dark:hover:text-blue-400"
                  onClick={() => switchLocale(locale)}
                >
                  {localeText(locale)}
                </button>
              </MenuItem>
            ))}
          </MenuItems>
        </Transition>
      </Menu>
    </div>
  )
}

export default SwitchLang
