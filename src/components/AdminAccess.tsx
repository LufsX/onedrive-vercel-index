'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useClientConfig } from './ClientConfigProvider'
import { useTranslations } from './ClientProviders'
import FeatureBoundary from './FeatureBoundary'
import AppDialog from './AppDialog'
import { LoadingIcon } from './Loading'
import { uiButton, uiFieldLabel, uiInput, uiPrimaryButton } from './uiStyles'
import useAdminSession from '../utils/useAdminSession'
import { getAdminErrorMessage } from '../utils/adminErrors'

const NavbarLogoutDialog = dynamic(() => import('./NavbarLogoutDialog'), { ssr: false })

export default function AdminAccess({ children }: { children: ReactNode }) {
  const { siteConfig } = useClientConfig()
  const admin = useAdminSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const loginFormId = useId()
  const passwordRef = useRef<HTMLInputElement>(null)

  const [tokenPresent, setTokenPresent] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [logoutMounted, setLogoutMounted] = useState(false)
  const press = useRef<{
    timer?: ReturnType<typeof setTimeout>
    x: number
    y: number
    startedAt?: number
    suppressClick: boolean
  }>({
    x: 0,
    y: 0,
    suppressClick: false,
  })
  const cancelPress = () => {
    press.current.startedAt = undefined
  }
  useEffect(() => {
    const gesture = press.current
    return () => clearTimeout(gesture.timer)
  }, [])

  const openAccess = () => {
    if (admin.busy) return
    if (admin.status === 'authenticated') {
      setLogoutMounted(true)
      setIsOpen(true)
    } else setLoginOpen(true)
  }

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
    if (admin.busy || admin.status !== 'anonymous') return
    setLoginError('')
    try {
      await admin.login(password)
      setLoginOpen(false)
    } catch (failure) {
      setLoginError(getAdminErrorMessage(failure))
    }
  }

  return (
    <>
      <span
        className="flex min-w-0 shrink-0 select-none"
        style={{ WebkitTouchCallout: 'none' }}
        onPointerDown={event => {
          clearTimeout(press.current.timer)
          cancelPress()
          press.current.suppressClick = false
          if (event.button !== 0 || event.isPrimary === false) return
          press.current.x = event.clientX
          press.current.y = event.clientY
          press.current.startedAt = performance.now()
        }}
        onPointerUp={() => {
          const held = press.current.startedAt !== undefined && performance.now() - press.current.startedAt >= 800
          cancelPress()
          if (held) {
            press.current.suppressClick = true
            press.current.timer = setTimeout(openAccess, 0)
          }
        }}
        onPointerMove={event => {
          if (Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10) cancelPress()
        }}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onBlur={cancelPress}
        onTouchEnd={event => {
          if (press.current.suppressClick) event.preventDefault()
        }}
        onContextMenu={event => {
          if (press.current.startedAt !== undefined || press.current.suppressClick) event.preventDefault()
        }}
        onClickCapture={event => {
          if (!press.current.suppressClick) return
          event.preventDefault()
          event.stopPropagation()
          press.current.suppressClick = false
        }}
        onKeyDown={event => {
          press.current.suppressClick = false
          if (event.key !== 'Enter' || !event.shiftKey || event.repeat) return
          event.preventDefault()
          openAccess()
        }}
      >
        {children}
      </span>
      <AppDialog
        open={loginOpen}
        onClose={closeLogin}
        title={t(admin.status === 'uninitialized' ? 'Set up administrator' : 'Administrator login')}
        size="sm"
        initialFocus={passwordRef}
        closeDisabled={admin.busy}
        afterLeave={() => {
          setPassword('')
          setLoginError('')
        }}
        footer={
          <>
            {tokenPresent && (
              <button
                type="button"
                disabled={admin.busy}
                className={`${uiButton} mr-auto`}
                onClick={() => {
                  setLoginOpen(false)
                  setLogoutMounted(true)
                  setIsOpen(true)
                }}
              >
                {t('Folder authorization')}
              </button>
            )}
            <button type="button" disabled={admin.busy} onClick={closeLogin} className={uiButton}>
              {t('Cancel')}
            </button>
            {admin.status === 'anonymous' && (
              <button type="submit" form={loginFormId} disabled={admin.busy} className={uiPrimaryButton}>
                {admin.busy && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
                {t(admin.busy ? 'Loading...' : 'Login')}
              </button>
            )}
          </>
        }
      >
        {admin.status === 'uninitialized' ? (
          <Link href="/onedrive-vercel-index-oauth/step-0" className={uiPrimaryButton}>
            {t('Set up administrator')}
          </Link>
        ) : admin.status === 'error' ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-red-500">
              {t('Unable to check administrator session.')}
            </p>
            <button type="button" disabled={admin.busy} className={uiButton} onClick={() => void admin.refresh()}>
              {t('Retry')}
            </button>
          </div>
        ) : admin.status === 'loading' ? (
          <div role="status" className="flex items-center gap-2">
            <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />
            {t('Loading...')}
          </div>
        ) : (
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
                {t(loginError)}
              </p>
            )}
          </form>
        )}
      </AppDialog>
      {logoutMounted && (
        <FeatureBoundary onDismiss={() => setIsOpen(false)}>
          <NavbarLogoutDialog open={isOpen} onClose={() => setIsOpen(false)} tokenPresent={tokenPresent} />
        </FeatureBoundary>
      )}
    </>
  )
}
