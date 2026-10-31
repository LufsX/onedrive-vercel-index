'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, LogOut, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useClientConfig } from './ClientConfigProvider'
import { useTranslations } from './ClientProviders'
import AppDialog from './AppDialog'
import { uiButton, uiDangerButton } from './uiStyles'
import useAdminSession from '../utils/useAdminSession'

export default function NavbarLogoutDialog({
  open,
  onClose,
  tokenPresent,
}: {
  open: boolean
  onClose: () => void
  tokenPresent: boolean
}) {
  const { siteConfig } = useClientConfig()
  const admin = useAdminSession()
  const router = useRouter()
  const t = useTranslations()
  const [error, setError] = useState(false)

  const clearTokens = () => {
    siteConfig.protectedRoutes.forEach(r => {
      localStorage.removeItem(r)
      window.dispatchEvent(new CustomEvent('local-storage', { detail: r }))
    })
    toast.success(t('Cleared all tokens'))
    onClose()
    router.refresh()
  }

  const logout = async () => {
    setError(false)
    try {
      await admin.logout()
      onClose()
    } catch {
      setError(true)
    }
  }

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={t('Logout')}
      closeDisabled={admin.busy}
      afterLeave={() => setError(false)}
      footer={
        <button type="button" disabled={admin.busy} onClick={onClose} className={uiButton}>
          {t('Close')}
        </button>
      }
    >
      <div className="space-y-3" aria-busy={admin.busy}>
        {admin.status === 'authenticated' && (
          <section>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('Administrator')}</h3>
            <button
              disabled={admin.busy || admin.uploading}
              onClick={() => void logout()}
              className={`${uiDangerButton} mt-2`}
            >
              <LogOut className="h-4 w-4" />
              {t('Logout')}
            </button>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-500">
                {t('Administrator logout failed.')}
              </p>
            )}
          </section>
        )}
        {tokenPresent && (
          <section>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('Folder authorization')}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {t('These tokens are used to authenticate yourself into password protected folders, ') +
                t('clearing them means that you will need to re-enter the passwords again.')}
            </p>
            <div className="mt-2 max-h-32 overflow-y-auto font-mono text-sm dark:text-gray-100">
              {siteConfig.protectedRoutes
                .filter(r => localStorage.getItem(r) !== null)
                .map(r => (
                  <div key={r} className="flex items-center gap-1">
                    <KeyRound className="h-4 w-4" />
                    <span className="truncate">{r}</span>
                  </div>
                ))}
            </div>
            <button disabled={admin.uploading} onClick={clearTokens} className={`${uiDangerButton} mt-2`}>
              <Trash2 className="h-4 w-4" />
              {t('Clear all')}
            </button>
          </section>
        )}
        {admin.uploading && (
          <p className="text-sm text-gray-500">{t('Wait for the upload to finish or cancel it before logging out.')}</p>
        )}
      </div>
    </AppDialog>
  )
}
