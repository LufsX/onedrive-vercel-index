import React, { Fragment } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faLanguage } from '@fortawesome/free-solid-svg-icons'
import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react'

import { useRouter } from 'next/router'
import Link from 'next/link'
import { useCookies } from 'react-cookie'

// https://headlessui.dev/react/menu#integrating-with-next-js
const CustomLink = ({ href, children, as, locale, ...props }): React.ReactElement => {
  return (
    <Link href={href} as={as} locale={locale} {...props}>
      {children}
    </Link>
  )
}

const localeText = (locale: string): string => {
  switch (locale) {
    case 'en':
      return '🇬🇧 English'
    case 'zh-CN':
      return '🇨🇳 简体中文'
    case 'zh-TW':
      return '🇹🇼 繁體中文'
    case 'de-DE':
      return '🇩🇪 Deutsch'
    case 'en':
      return '🇬🇧 English'
    case 'es':
      return '🇪🇸 Español'
    case 'zh-CN':
      return '🇨🇳 简体中文'
    case 'hi':
      return '🇮🇳 हिन्दी'
    case 'id':
      return '🇮🇩 Indonesia'
    case 'tr-TR':
      return '🇹🇷 Türkçe'
    case 'zh-TW':
      return '🇹🇼 繁體中文'
    default:
      return '🇨🇳 简体中文'
  }
}

const SwitchLang = () => {
  const { locales, pathname, query, asPath } = useRouter()

  const [, setCookie] = useCookies(['NEXT_LOCALE'])

  return (
    <div className="relative">
      <Menu>
        <MenuButton className="flex items-center gap-1.5 hover:opacity-80 dark:text-white">
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
          <MenuItems className="absolute top-0 right-0 z-20 mt-8 w-28 divide-y divide-gray-900 overflow-auto rounded border border-gray-900/10 bg-white py-1 shadow-lg focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-900 dark:text-white">
            {[...locales!]
              .sort((a, b) => {
                const preferredOrder = ['en', 'zh-CN', 'zh-TW', 'de-DE', 'es', 'hi', 'id', 'tr-TR']
                return preferredOrder.indexOf(a) - preferredOrder.indexOf(b)
              })
              .map(locale => (
                <MenuItem key={locale}>
                  <CustomLink
                    key={locale}
                    href={{ pathname, query }}
                    as={asPath}
                    locale={locale}
                    onClick={() => setCookie('NEXT_LOCALE', locale, { path: '/' })}
                  >
                    <div className="m-1 cursor-pointer rounded px-2 py-1 text-left text-sm font-medium hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-600/10 dark:hover:text-blue-400">
                      {localeText(locale)}
                    </div>
                  </CustomLink>
                </MenuItem>
              ))}
          </MenuItems>
        </Transition>
      </Menu>
    </div>
  )
}

export default SwitchLang
