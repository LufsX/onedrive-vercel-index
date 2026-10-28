'use client'

import { Fragment } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe, faCheck } from '@fortawesome/free-solid-svg-icons'
import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react'
import { useRouter } from 'next/navigation'

import { setLocaleCookie } from '../utils/localeCookie'
import { useLocale } from './ClientProviders'

const localeMapping = {
  'de-DE': 'Deutsch',
  en: 'English',
  es: 'Español',
  'zh-CN': '简体中文',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  'tr-TR': 'Türkçe',
  'zh-TW': '繁體中文',
}

const SwitchLang = () => {
  const router = useRouter()
  const currentLocale = useLocale()

  const switchLanguage = (locale: string) => {
    if (locale === currentLocale) return

    setLocaleCookie(locale)
    router.refresh()
  }

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton className="flex items-center gap-2 rounded px-2 py-1 text-gray-700 transition-colors hover:bg-gray-900/10 dark:text-gray-300 dark:hover:bg-gray-500/20">
        <FontAwesomeIcon icon={faGlobe} className="h-4 w-4" />
        <span className="hidden text-sm font-medium md:inline-block">
          {localeMapping[currentLocale as keyof typeof localeMapping]}
        </span>
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-lg border border-gray-900/10 bg-white shadow-lg ring-1 ring-black/5 focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-900">
          <div className="py-1">
            {Object.entries(localeMapping).map(([locale, label]) => (
              <MenuItem key={locale}>
                {({ active }) => (
                  <button
                    onClick={() => switchLanguage(locale)}
                    className={`${
                      active ? 'bg-gray-50 dark:bg-gray-800' : ''
                    } flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 dark:text-gray-300`}
                  >
                    <span>{label}</span>
                    {currentLocale === locale && <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-blue-600" />}
                  </button>
                )}
              </MenuItem>
            ))}
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  )
}

export default SwitchLang
