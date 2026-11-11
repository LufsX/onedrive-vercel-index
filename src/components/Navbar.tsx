'use client'

import { useClientConfig } from './ClientConfigProvider'

import { Mail, Search } from 'lucide-react'
import { Toaster } from 'react-hot-toast'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from './ClientProviders'
import { useBrandIcons } from './BrandIconsProvider'

import BrandIcon from './BrandIcon'
import AdminAccess from './AdminAccess'
import SwitchLang from './SwitchLang'
import FeatureBoundary from './FeatureBoundary'
import useDeviceOS from '../utils/useDeviceOS'
import { uiButton } from './uiStyles'

const SearchModal = dynamic(() => import('./SearchModal'), { ssr: false })

const Navbar = () => {
  const { siteConfig } = useClientConfig()
  const icons = useBrandIcons()
  const os = useDeviceOS()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMounted, setSearchMounted] = useState(false)
  const openSearchBox = useCallback(() => {
    setSearchMounted(true)
    setSearchOpen(true)
  }, [])

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
      openSearchBox()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [os, openSearchBox])

  const t = useTranslations()

  return (
    <div className="sticky top-0 isolate z-[100] pt-[env(safe-area-inset-top)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 border-b border-gray-900/10 bg-white/80 backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900/80"
      />
      <Toaster
        toastOptions={{
          className:
            'rounded! border! border-gray-400/30! bg-white! text-gray-700! shadow-lg! dark:bg-gray-900! dark:text-gray-200!',
        }}
      />

      {searchMounted && (
        <FeatureBoundary onDismiss={() => setSearchOpen(false)}>
          <SearchModal searchOpen={searchOpen} setSearchOpen={setSearchOpen} />
        </FeatureBoundary>
      )}

      <div className="mx-auto flex w-full items-center justify-between gap-3 px-3 py-1 sm:px-4">
        <AdminAccess>
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-2 py-2 transition-opacity duration-150 hover:opacity-80 md:p-2 dark:text-white"
          >
            <Image src={siteConfig.icon} alt="icon" width="25" height="25" draggable={false} preload />
            <span className="hidden max-w-56 truncate font-bold sm:block">{siteConfig.title}</span>
          </Link>
        </AdminAccess>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 text-gray-700 sm:gap-2 md:flex-initial">
          <button
            className={`${uiButton} min-w-0 flex-1 justify-between bg-gray-100 md:w-44 dark:bg-gray-800 dark:text-white`}
            onClick={openSearchBox}
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="truncate text-sm font-medium">{t('Search ...')}</span>
            </div>

            <kbd className="ml-3 hidden shrink-0 rounded border border-gray-400/20 px-1.5 py-0.5 text-[11px] text-gray-500 md:block dark:text-gray-400">
              {os === 'mac' ? '⌘ K' : 'Ctrl K'}
            </kbd>
          </button>

          <SwitchLang />

          {siteConfig.links.length !== 0 &&
            siteConfig.links.map((l: { name: string; link: string }) => {
              const brandIcon = icons[l.name.toLowerCase()]
              return (
                <a
                  key={l.name}
                  aria-label={t(l.name)}
                  title={t(l.name)}
                  href={l.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded p-2 transition-colors duration-150 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {brandIcon && <BrandIcon mark={brandIcon} className="h-4 w-4" />}
                  </span>
                  <span className="hidden text-sm font-medium lg:inline-block">
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
              aria-label={t('Email')}
              title={t('Email')}
              href={siteConfig.email}
              className="flex shrink-0 items-center gap-1.5 rounded p-2 transition-colors duration-150 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800"
            >
              <Mail className="h-4 w-4" />
              <span className="hidden text-sm font-medium lg:inline-block">{t('Email')}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default Navbar
