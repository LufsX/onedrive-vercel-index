'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import SetupShell, { SetupSessionState, SetupStatus } from '../../../components/SetupShell'
import { LoadingIcon } from '../../../components/Loading'
import { uiButton, uiFieldLabel, uiInput, uiPrimaryButton } from '../../../components/uiStyles'
import { useTranslations } from '../../../components/ClientProviders'
import useAdminSession from '../../../utils/useAdminSession'
import { getAdminErrorMessage, readAdminError } from '../../../utils/adminErrors'

type Configuration = { passwordHash: string; sessionSecret: string }

export default function OAuthStep0() {
  const router = useRouter()
  const t = useTranslations()
  const { status, refresh, login } = useAdminSession()
  const [generate, setGenerate] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [configuration, setConfiguration] = useState<Configuration | null>(null)
  const [target, setTarget] = useState<'env' | 'vercel'>('env')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generating = generate || status === 'uninitialized'

  useEffect(() => {
    setGenerate(new URLSearchParams(window.location.search).get('generate') === '1')
  }, [])

  function proceed() {
    const next = new URLSearchParams(window.location.search).get('next')
    router.push(next === 'step-3' ? '/onedrive-vercel-index-oauth/step-3' : '/onedrive-vercel-index-oauth/step-1')
  }

  function changeMode(value: boolean) {
    setGenerate(value)
    setPassword('')
    setConfirmation('')
    setConfiguration(null)
    setError('')
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (!generating && status !== 'anonymous')) return
    if (generating && password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    const fallback = generating ? 'Could not generate administrator configuration.' : 'Administrator login failed.'
    setBusy(true)
    setError('')
    try {
      if (generating) {
        const response = await fetch('/api/admin/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ password }),
        })
        if (!response.ok) throw new Error(await readAdminError(response, fallback))
        const data = await response.json()
        if (
          typeof data?.passwordHash !== 'string' ||
          typeof data?.sessionSecret !== 'string' ||
          !/^scrypt:16384:8:1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(data.passwordHash) ||
          !/^[a-f0-9]{64}$/.test(data.sessionSecret)
        )
          throw new Error(fallback)
        setConfiguration({ passwordHash: data.passwordHash, sessionSecret: data.sessionSecret })
        setConfirmation('')
      } else {
        await login(password)
        proceed()
      }
      setPassword('')
    } catch (failure) {
      setError(getAdminErrorMessage(failure, fallback))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SetupShell step={0} title={t(generating ? 'Generate password configuration' : 'Administrator login')}>
      <div className="mx-auto w-full max-w-lg space-y-3">
        {status === 'uninitialized' && (
          <SetupStatus>
            {t('Set ADMIN_PASSWORD_HASH to enable administrator functions, or skip for read-only OAuth.')}
          </SetupStatus>
        )}
        {configuration ? (
          <div className="fade-in space-y-3">
            <SetupStatus tone="success">
              {t(
                'Replace these environment variables and restart or redeploy. Generating them does not change the current password.',
              )}
            </SetupStatus>
            <label className={uiFieldLabel}>
              {t('Configuration format')}
              <select
                value={target}
                onChange={event => setTarget(event.target.value as 'env' | 'vercel')}
                className={`mt-1 block ${uiInput}`}
              >
                <option value="env">.env / .env.local / Docker Compose</option>
                <option value="vercel">Vercel</option>
              </select>
            </label>
            {target === 'env' ? (
              <label className={uiFieldLabel}>
                {t('Environment configuration')}
                <textarea
                  readOnly
                  value={`ADMIN_PASSWORD_HASH=${configuration.passwordHash}\nADMIN_SESSION_SECRET=${configuration.sessionSecret}`}
                  rows={4}
                  spellCheck={false}
                  autoComplete="off"
                  className={`mt-1 block ${uiInput}`}
                />
              </label>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('In Vercel, paste each value without quotes or backslashes.')}
                </p>
                {(
                  [
                    ['ADMIN_PASSWORD_HASH', configuration.passwordHash],
                    ['ADMIN_SESSION_SECRET', configuration.sessionSecret],
                  ] as const
                ).map(([name, value]) => (
                  <label key={name} className={uiFieldLabel}>
                    {name}
                    <input
                      readOnly
                      value={value}
                      spellCheck={false}
                      autoComplete="off"
                      className={`mt-1 block ${uiInput}`}
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-400/30 pt-3">
              <button type="button" onClick={() => changeMode(true)} className={uiButton}>
                {t('Generate again')}
              </button>
              <button
                type="button"
                onClick={() => {
                  changeMode(false)
                  void refresh()
                }}
                className={uiPrimaryButton}
              >
                {t('Administrator login')}
              </button>
            </div>
          </div>
        ) : generating ? (
          <form onSubmit={submit} className="fade-in space-y-3" aria-busy={busy}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t(
                'Generate a new password hash at any time, then replace ADMIN_PASSWORD_HASH in your environment variables.',
              )}
            </p>
            <PasswordFields
              password={password}
              confirmation={confirmation}
              setPassword={setPassword}
              setConfirmation={setConfirmation}
              busy={busy}
              error={error}
            />
            {error && (
              <div id="admin-error">
                <SetupStatus tone="error">{t(error)}</SetupStatus>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-400/30 pt-3">
              {status !== 'uninitialized' && (
                <button type="button" disabled={busy} onClick={() => changeMode(false)} className={uiButton}>
                  {t('Cancel')}
                </button>
              )}
              <button type="submit" disabled={busy} className={uiPrimaryButton}>
                {busy && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
                {t(busy ? 'Loading...' : 'Generate configuration')}
              </button>
            </div>
          </form>
        ) : status === 'anonymous' ? (
          <form onSubmit={submit} className="fade-in space-y-3" aria-busy={busy}>
            <label className={uiFieldLabel}>
              {t('Enter Password')}
              <input
                type="password"
                autoComplete="current-password"
                required
                disabled={busy}
                value={password}
                onChange={event => setPassword(event.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'admin-error' : undefined}
                className={`mt-1 block ${uiInput}`}
              />
            </label>
            {error && (
              <div id="admin-error">
                <SetupStatus tone="error">{t(error)}</SetupStatus>
              </div>
            )}
            <div className="flex justify-end border-t border-gray-400/30 pt-3">
              <button type="submit" disabled={busy} className={uiPrimaryButton}>
                {busy && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
                {t(busy ? 'Loading...' : 'Login')}
              </button>
            </div>
          </form>
        ) : status === 'authenticated' ? (
          <div className="flex justify-end">
            <button type="button" onClick={proceed} className={uiPrimaryButton}>
              {t('Proceed to OAuth')}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <SetupSessionState status={status} retry={refresh} />
        )}
        {!generating && !configuration && status !== 'loading' && (
          <button type="button" onClick={() => changeMode(true)} className={uiButton}>
            {t('Generate password configuration')}
          </button>
        )}
        {status === 'uninitialized' && (
          <div className="flex justify-end border-t border-gray-400/30 pt-3">
            <button type="button" disabled={busy} onClick={proceed} className={uiButton}>
              {t('Skip administrator setup (read-only OAuth)')}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </SetupShell>
  )
}

function PasswordFields({
  password,
  confirmation,
  setPassword,
  setConfirmation,
  busy,
  error,
}: {
  password: string
  confirmation: string
  setPassword: (value: string) => void
  setConfirmation: (value: string) => void
  busy: boolean
  error: string
}) {
  const t = useTranslations()
  return (
    <>
      {(
        [
          ['Enter Password', password, setPassword],
          ['Confirm password', confirmation, setConfirmation],
        ] as const
      ).map(([label, value, update]) => (
        <label key={label} className={uiFieldLabel}>
          {t(label)}
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={busy}
            value={value}
            onChange={event => update(event.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'admin-error' : undefined}
            className={`mt-1 block ${uiInput}`}
          />
        </label>
      ))}
    </>
  )
}
