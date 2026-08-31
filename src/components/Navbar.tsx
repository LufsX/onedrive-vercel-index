import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faEnvelope, faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { faKey, faSearch, faSignOutAlt } from '@fortawesome/free-solid-svg-icons'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import toast, { Toaster } from 'react-hot-toast'
import { useHotkeys } from 'react-hotkeys-hook'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'next-i18next/pages'

import siteConfig from '../../config/site.config'
import SwitchLang from './SwitchLang'
import useDeviceOS from '../utils/useDeviceOS'

const SearchModal = dynamic(() => import('./SearchModal'), { ssr: false })

const brandIconLoaders: Record<string, () => Promise<IconDefinition>> = {
  telegram: () => import('@fortawesome/free-brands-svg-icons/faTelegram').then(({ faTelegram }) => faTelegram),
}

const Navbar = () => {
  const router = useRouter()
  const os = useDeviceOS()

  const [brandIcons, setBrandIcons] = useState<Record<string, IconDefinition>>({})
  const [tokenPresent, setTokenPresent] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const [searchOpen, setSearchOpen] = useState(false)
  const openSearchBox = () => setSearchOpen(true)

  useHotkeys(`${os === 'mac' ? 'meta' : 'ctrl'}+k`, e => {
    openSearchBox()
    e.preventDefault()
  })

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

  useEffect(() => {
    const linkNames = [...new Set(siteConfig.links.map(({ name }) => name.toLowerCase()))]
    if (linkNames.length === 0) return

    let cancelled = false
    const loadBrandIcons = async () => {
      const iconEntries = await Promise.all(
        linkNames.map(async name => {
          const loader = brandIconLoaders[name]
          return loader ? ([name, await loader()] as const) : null
        })
      )
      const icons = Object.fromEntries(
        iconEntries.filter((entry): entry is readonly [string, IconDefinition] => entry !== null)
      ) as Record<string, IconDefinition>
      const unknownNames = linkNames.filter(name => !brandIconLoaders[name])

      if (unknownNames.length > 0) {
        const brandModule = await import('@fortawesome/free-brands-svg-icons')
        Object.values(brandModule).forEach(icon => {
          if (typeof icon !== 'object' || icon === null || !('iconName' in icon) || typeof icon.iconName !== 'string') {
            return
          }

          const iconName = icon.iconName.toLowerCase()
          if (unknownNames.includes(iconName)) icons[iconName] = icon as IconDefinition
        })
      }

      if (!cancelled) setBrandIcons(icons)
    }

    const idleCallback = (window as Window & { requestIdleCallback?: (callback: () => void) => number })
      .requestIdleCallback
    if (idleCallback) {
      idleCallback(loadBrandIcons)
    } else {
      window.setTimeout(loadBrandIcons, 1500)
    }

    return () => {
      cancelled = true
    }
  }, [])

  const { t } = useTranslation()

  const clearTokens = () => {
    setIsOpen(false)

    siteConfig.protectedRoutes.forEach(r => {
      localStorage.removeItem(r)
    })

    toast.success(t('Cleared all tokens'))
    setTimeout(() => {
      router.reload()
    }, 1000)
  }

  return (
    <div className="sticky top-0 z-[100] border-b border-gray-900/10 bg-white/80 backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900">
      <Toaster />

      {searchOpen && <SearchModal searchOpen={searchOpen} setSearchOpen={setSearchOpen} />}

      <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-1">
        <Link href="/" passHref className="flex items-center gap-2 py-2 hover:opacity-80 dark:text-white md:p-2">
          <Image src={siteConfig.icon} alt="icon" width="25" height="25" preload />
          <span className="hidden font-bold sm:block">{siteConfig.title}</span>
        </Link>

        <div className="flex flex-1 items-center gap-4 text-gray-700 md:flex-initial">
          <button
            className="flex flex-1 items-center justify-between rounded-lg bg-gray-100 px-2.5 py-1.5 hover:opacity-80 dark:bg-gray-800 dark:text-white md:w-48"
            onClick={openSearchBox}
          >
            <div className="flex items-center gap-2">
              <FontAwesomeIcon className="h-4 w-4" icon={faSearch} />
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
              const brandIcon = brandIcons[l.name.toLowerCase()]
              return (
                <a
                  key={l.name}
                  href={l.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:opacity-80 dark:text-white"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {brandIcon && <FontAwesomeIcon icon={brandIcon} />}
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
            <a href={siteConfig.email} className="flex items-center gap-2 transition-opacity hover:opacity-70 dark:text-white">
              <FontAwesomeIcon icon={faEnvelope} />
              <span className="hidden text-sm font-medium md:inline-block">{t('Email')}</span>
            </a>
          )}

          {tokenPresent && (
            <button
              className="flex items-center gap-2 transition-opacity hover:opacity-70 dark:text-white"
              onClick={() => setIsOpen(true)}
            >
              <span className="hidden text-sm font-medium md:inline-block">{t('Logout')}</span>
              <FontAwesomeIcon icon={faSignOutAlt} />
            </button>
          )}
        </div>
      </div>

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="fixed inset-0 z-10 overflow-y-auto" open={isOpen} onClose={() => setIsOpen(false)}>
          <div className="min-h-screen px-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-100"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-50"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 cursor-pointer bg-gray-50 dark:bg-gray-800" />
            </TransitionChild>

            {/* This element is to trick the browser into centering the modal contents. */}
            <span className="inline-block h-screen align-middle" aria-hidden="true">
              &#8203;
            </span>
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-100"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-50"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="my-8 inline-block w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle transition-all dark:bg-gray-900">
                <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {t('Clear all tokens?')}
                </DialogTitle>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    {t('These tokens are used to authenticate yourself into password protected folders, ') +
                      t('clearing them means that you will need to re-enter the passwords again.')}
                  </p>
                </div>

                <div className="mt-4 max-h-32 overflow-y-scroll font-mono text-sm dark:text-gray-100">
                  {siteConfig.protectedRoutes.map((r, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <FontAwesomeIcon icon={faKey} />
                      <span className="truncate">{r}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex items-center justify-end">
                  <button
                    className="mr-3 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
                    onClick={() => setIsOpen(false)}
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-hidden focus:ring-2 focus:ring-red-500/50"
                    onClick={() => clearTokens()}
                  >
                    <FontAwesomeIcon icon={faTrashAlt} />
                    <span>{t('Clear all')}</span>
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}

export default Navbar
