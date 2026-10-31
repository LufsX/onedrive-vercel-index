'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import SetupShell, { SetupSessionState, SetupStatus } from '../../../components/SetupShell'
import { LoadingIcon } from '../../../components/Loading'
import { uiButton, uiFieldLabel, uiInput, uiPrimaryButton } from '../../../components/uiStyles'
import { useTranslations } from '../../../components/ClientProviders'
import useAdminSession from '../../../utils/useAdminSession'

export default function OAuthStep0() {
  const router = useRouter()
  const t = useTranslations()
  const { status, refresh } = useAdminSession()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [configuration, setConfiguration] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'authenticated') {
      const next = new URLSearchParams(window.location.search).get('next')
      router.replace(next === 'step-3' ? '/onedrive-vercel-index-oauth/step-3' : '/onedrive-vercel-index-oauth/step-1')
    }
  }, [router, status])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (status !== 'uninitialized' && status !== 'anonymous')) return
    if (status === 'uninitialized' && password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const setup = status === 'uninitialized'
      const response = await fetch(setup ? '/api/admin/setup' : '/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ password }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 429) throw new Error('Too many requests. Try again later.')
        if (setup && response.status === 403 && data?.error === 'already_initialized') {
          await refresh()
          return
        }
        throw new Error(setup ? 'Could not generate administrator configuration.' : 'Administrator login failed.')
      }
      if (setup) {
        if (
          typeof data?.passwordHash !== 'string' ||
          typeof data?.sessionSecret !== 'string' ||
          !/^scrypt\$[1-9]\d*\$[1-9]\d*\$[1-9]\d*\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(data.passwordHash) ||
          !/^[a-f0-9]{64}$/.test(data.sessionSecret)
        )
          throw new Error('Could not generate administrator configuration.')
        setConfiguration(`ADMIN_PASSWORD_HASH='${data.passwordHash}'\nADMIN_SESSION_SECRET='${data.sessionSecret}'`)
        setConfirmation('')
      } else {
        if (data?.authenticated !== true) throw new Error('Administrator login failed.')
        await refresh()
        const next = new URLSearchParams(window.location.search).get('next')
        router.replace(
          next === 'step-3' ? '/onedrive-vercel-index-oauth/step-3' : '/onedrive-vercel-index-oauth/step-1',
        )
      }
      setPassword('')
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      setError(
        [
          'Too many requests. Try again later.',
          'Could not generate administrator configuration.',
          'Administrator login failed.',
        ].includes(message)
          ? message
          : status === 'uninitialized'
            ? 'Could not generate administrator configuration.'
            : 'Administrator login failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <SetupShell step={0} title={t(status === 'uninitialized' ? 'Set up administrator' : 'Administrator login')}>
      <div key={status} className="fade-in mx-auto w-full max-w-lg">
        {status === 'loading' || status === 'authenticated' || status === 'error' ? (
          <SetupSessionState status={status} retry={refresh} />
        ) : configuration && status === 'uninitialized' ? (
          <div className="fade-in space-y-3">
            <SetupStatus tone="success">
              {t('Set these environment variables and restart the deployment. Keep them private.')}
            </SetupStatus>
            <label className={uiFieldLabel}>
              {t('Environment configuration')}
              <textarea
                readOnly
                value={configuration}
                rows={5}
                spellCheck={false}
                autoComplete="off"
                className={`mt-1 block ${uiInput}`}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await refresh()
                } finally {
                  setBusy(false)
                }
              }}
              className={`${uiButton} bg-gray-100 dark:bg-gray-800`}
            >
              {busy && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
              {t(busy ? 'Loading...' : 'Retry')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="fade-in space-y-3" aria-busy={busy}>
            <label className={uiFieldLabel}>
              {t('Enter Password')}
              <input
                type="password"
                autoComplete={status === 'uninitialized' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                disabled={busy}
                value={password}
                onChange={event => setPassword(event.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'admin-error' : undefined}
                className={`mt-1 block ${uiInput}`}
              />
            </label>
            {status === 'uninitialized' && (
              <label className={uiFieldLabel}>
                {t('Confirm password')}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={busy}
                  value={confirmation}
                  onChange={event => setConfirmation(event.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'admin-error' : undefined}
                  className={`mt-1 block ${uiInput}`}
                />
              </label>
            )}
            {error && (
              <div id="admin-error" key={error}>
                <SetupStatus tone="error">{t(error)}</SetupStatus>
              </div>
            )}
            <div className="flex justify-end border-t border-gray-400/30 pt-3">
              <button type="submit" disabled={busy} className={uiPrimaryButton}>
                {busy && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
                {busy ? t('Loading...') : t(status === 'uninitialized' ? 'Generate configuration' : 'Login')}
                {!busy && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
              </button>
            </div>
          </form>
        )}
      </div>
    </SetupShell>
  )
}
