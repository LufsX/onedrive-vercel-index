'use client'

import { useClientConfig } from './ClientConfigProvider'

import { LogIn, LogOut, Mail, Search } from 'lucide-react'
import { Toaster } from 'react-hot-toast'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from './ClientProviders'
import { useBrandIcons } from './BrandIconsProvider'

import BrandIcon from './BrandIcon'
import SwitchLang from './SwitchLang'
import FeatureBoundary from './FeatureBoundary'
import AppDialog from './AppDialog'
import { LoadingIcon } from './Loading'
import { uiButton, uiFieldLabel, uiInput, uiPrimaryButton } from './uiStyles'
import useDeviceOS from '../utils/useDeviceOS'
import useAdminSession from '../utils/useAdminSession'

const SearchModal = dynamic(() => import('./SearchModal'), { ssr: false })

const NavbarLogoutDialog = dynamic(() => import('./NavbarLogoutDialog'), { ssr: false })

const Navbar = () => {
  const { siteConfig } = useClientConfig()
  const icons = useBrandIcons()
  const os = useDeviceOS()
  const admin = useAdminSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(false)
  const loginFormId = useId()
  const passwordRef = useRef<HTMLInputElement>(null)

  const [tokenPresent, setTokenPresent] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [logoutMounted, setLogoutMounted] = useState(false)

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

  useEffect(() => {
    const storedToken = () => {
      for (const r of siteConfig.protectedRoutes) {
        if (localStorage.hasOwnProperty(r)) {
          return true
        }
      }
      return false
    }
    const update = () => setTokenPresent(storedToken())
    update()
    window.addEventListener('storage', update)
    window.addEventListener('local-storage', update)
    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener('local-storage', update)
    }
  }, [siteConfig.protectedRoutes])

  const t = useTranslations()
  const closeLogin = () => {
    if (admin.busy) return
    setLoginOpen(false)
  }
  const login = async (event: React.FormEvent) => {
    event.preventDefault()
    if (admin.busy) return
    setLoginError(false)
    try {
      await admin.login(password)
      setLoginOpen(false)
    } catch {
      setLoginError(true)
    }
  }

  return (
    <div className="sticky top-0 isolate z-[100] pt-[env(safe-area-inset-top)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 border-b border-gray-900/10 bg-white/80 backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900/80"
      />
      <Toaster />

      {searchMounted && (
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

          {admin.status === 'uninitialized' && (
            <Link
              href="/onedrive-vercel-index-oauth/step-0"
              title={t('Set up administrator')}
              aria-label={t('Set up administrator')}
              className="dark:text-white"
            >
              <LogIn className="h-4 w-4" />
            </Link>
          )}
          {admin.status === 'anonymous' && (
            <button
              title={t('Administrator login')}
              aria-label={t('Administrator login')}
              className="dark:text-white"
              onClick={() => setLoginOpen(true)}
            >
              <LogIn className="h-4 w-4" />
            </button>
          )}
          {admin.status === 'error' && (
            <button
              title={t('Unable to check administrator session.')}
              className="text-sm text-red-500"
              onClick={() => void admin.refresh()}
            >
              {t('Retry')}
            </button>
          )}
          {(tokenPresent || admin.status === 'authenticated') && (
            <button
              className="flex cursor-pointer items-center gap-2 transition-opacity duration-150 hover:opacity-80 dark:text-white"
              onClick={() => {
                setLogoutMounted(true)
                setIsOpen(true)
              }}
              title={t('Logout')}
              aria-label={t('Logout')}
            >
              <span className="hidden text-sm font-medium md:inline-block">{t('Logout')}</span>
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <AppDialog
        open={loginOpen}
        onClose={closeLogin}
        title={t('Administrator login')}
        size="sm"
        initialFocus={passwordRef}
        closeDisabled={admin.busy}
        afterLeave={() => {
          setPassword('')
          setLoginError(false)
        }}
        footer={
          <>
            <button type="button" disabled={admin.busy} onClick={closeLogin} className={uiButton}>
              {t('Cancel')}
            </button>
            <button type="submit" form={loginFormId} disabled={admin.busy} className={uiPrimaryButton}>
              {admin.busy && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
              {t(admin.busy ? 'Loading...' : 'Login')}
            </button>
          </>
        }
      >
        <form id={loginFormId} onSubmit={login} className="space-y-3" aria-busy={admin.busy}>
          <label className={uiFieldLabel}>
            {t('Enter Password')}
            <input
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              required
              disabled={admin.busy}
              value={password}
              placeholder="************"
              onChange={e => setPassword(e.target.value)}
              className={`${uiInput} mt-1 w-full font-mono`}
            />
          </label>
          {loginError && (
            <p role="alert" className="text-sm text-red-500">
              {t('Administrator login failed.')}
            </p>
          )}
        </form>
      </AppDialog>
      {logoutMounted && (
        <FeatureBoundary onDismiss={() => setIsOpen(false)}>
          <NavbarLogoutDialog open={isOpen} onClose={() => setIsOpen(false)} tokenPresent={tokenPresent} />
        </FeatureBoundary>
      )}
    </div>
  )
}

export default Navbar
