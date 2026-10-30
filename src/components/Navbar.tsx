'use client'

import { LogOut, Mail, Search } from 'lucide-react'
import { Toaster } from 'react-hot-toast'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useTranslations } from './ClientProviders'
import { useBrandIcons } from './BrandIconsProvider'

import siteConfig from '../../config/site.config'
import BrandIcon from './BrandIcon'
import SwitchLang from './SwitchLang'
import FeatureBoundary from './FeatureBoundary'
import useDeviceOS from '../utils/useDeviceOS'

const SearchModal = dynamic(() => import('./SearchModal'), { ssr: false })

const NavbarLogoutDialog = dynamic(() => import('./NavbarLogoutDialog'), { ssr: false })

const Navbar = () => {
  const icons = useBrandIcons()
  const os = useDeviceOS()

  const [tokenPresent, setTokenPresent] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const [searchOpen, setSearchOpen] = useState(false)
  const openSearchBox = () => setSearchOpen(true)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierPressed = os === 'mac' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
      if (event.code !== 'KeyK' || !modifierPressed || event.altKey || event.shiftKey) return

      const target = event.composedPath()[0]
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches(
            'input, textarea, select, [role="searchbox"], [role="slider"], [role="spinbutton"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="radio"], [role="textbox"]',
          ))
      ) {
        return
      }

      event.preventDefault()
      setSearchOpen(true)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [os])

  useEffect(() => {
    const storedToken = () => {
      for (const r of siteConfig.protectedRoutes) {
        if (localStorage.hasOwnProperty(r)) {
          return true
        }
      }
      return false
    }
    setTokenPresent(storedToken())
  }, [])

  const t = useTranslations()

  return (
    <div className="sticky top-0 z-[100] border-b border-gray-900/10 bg-white/80 backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900">
      <Toaster />

      {searchOpen && (
        <FeatureBoundary onDismiss={() => setSearchOpen(false)}>
          <SearchModal searchOpen={searchOpen} setSearchOpen={setSearchOpen} />
        </FeatureBoundary>
      )}

      <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-1">
        <Link
          href="/"
          className="flex items-center gap-2 py-2 transition-opacity duration-150 hover:opacity-80 md:p-2 dark:text-white"
        >
          <Image src={siteConfig.icon} alt="icon" width="25" height="25" preload />
          <span className="hidden font-bold sm:block">{siteConfig.title}</span>
        </Link>

        <div className="flex flex-1 items-center gap-4 text-gray-700 md:flex-initial">
          <button
            className="flex flex-1 cursor-pointer items-center justify-between rounded-lg bg-gray-100 px-2.5 py-1.5 transition-colors duration-150 hover:bg-gray-200 md:w-48 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
            onClick={openSearchBox}
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="truncate text-sm font-medium">{t('Search ...')}</span>
            </div>

            <div className="hidden items-center gap-1 md:flex">
              <div className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-medium dark:bg-gray-700">
                {os === 'mac' ? '⌘' : 'Ctrl'}
              </div>
              <div className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-medium dark:bg-gray-700">K</div>
            </div>
          </button>

          <SwitchLang />

          {siteConfig.links.length !== 0 &&
            siteConfig.links.map((l: { name: string; link: string }) => {
              const brandIcon = icons[l.name.toLowerCase()]
              return (
                <a
                  key={l.name}
                  href={l.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 transition-opacity duration-150 hover:opacity-80 dark:text-white"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {brandIcon && <BrandIcon mark={brandIcon} className="h-4 w-4" />}
                  </span>
                  <span className="hidden text-sm font-medium md:inline-block">
                    {
                      // Append link name comments here to add translations
                      // t('Weibo')
                      t(l.name)
                    }
                  </span>
                </a>
              )
            })}

          {siteConfig.email && (
            <a
              href={siteConfig.email}
              className="flex items-center gap-2 transition-opacity duration-150 hover:opacity-80 dark:text-white"
            >
              <Mail className="h-4 w-4" />
              <span className="hidden text-sm font-medium md:inline-block">{t('Email')}</span>
            </a>
          )}

          {tokenPresent && (
            <button
              className="flex cursor-pointer items-center gap-2 transition-opacity duration-150 hover:opacity-80 dark:text-white"
              onClick={() => setIsOpen(true)}
            >
              <span className="hidden text-sm font-medium md:inline-block">{t('Logout')}</span>
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <FeatureBoundary onDismiss={() => setIsOpen(false)}>
          <NavbarLogoutDialog onClose={() => setIsOpen(false)} />
        </FeatureBoundary>
      )}
    </div>
  )
}

export default Navbar
