'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, ChevronDown, Cloud, FolderUp, KeyRound, LogIn, Server, ShieldCheck } from 'lucide-react'
import Dropdown from '../../../components/Dropdown'
import SetupShell, { SetupSessionState, SetupStatus } from '../../../components/SetupShell'
import { LoadingIcon } from '../../../components/Loading'
import { uiButton, uiFieldLabel, uiInput, uiPanel, uiPrimaryButton } from '../../../components/uiStyles'
import { useTranslations } from '../../../components/ClientProviders'
import useAdminSession from '../../../utils/useAdminSession'
import { getAdminErrorMessage, readAdminError } from '../../../utils/adminErrors'

type Configuration = { passwordHash: string; sessionSecret: string }

// Same control as the other selectors in the site, instead of a native <select>.
const configurationTargets = [
  { value: 'env', label: '.env / .env.local / Docker Compose' },
  { value: 'vercel', label: 'Vercel' },
] as const

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
      <div className="mx-auto grid w-full max-w-4xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-8">
        <aside className="order-2 space-y-5 lg:order-none lg:py-2">
          <div>
            <span className="mb-3 inline-flex items-center gap-1.5 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-600/10 dark:text-blue-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('Administrator access')}
            </span>
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {t('Manage your OneDrive files')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {t(
                'Administrators can upload files, create folders and delete files. Visitors can browse and download without an administrator account.',
              )}
            </p>
          </div>
          <ol className="space-y-4">
            {[
              {
                icon: KeyRound,
                title: 'Set an administrator password',
                detail: 'Generate the password configuration below. Use at least 8 characters.',
              },
              {
                icon: Server,
                title: 'Apply the environment variables',
                detail:
                  'Save ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET in your deployment, then restart or redeploy.',
              },
              {
                icon: Cloud,
                title: 'Connect OneDrive',
                detail: 'Log in as administrator, then follow the next steps to authorize your Microsoft account.',
              },
            ].map(({ icon: Icon, title, detail }, index) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-400/20 bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    <span className="mr-1.5 font-mono text-xs text-gray-400">0{index + 1}</span>
                    {t(title)}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t(detail)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex items-start gap-2 border-t border-gray-400/20 pt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            <FolderUp className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {t(
                'Already configured? Log in to continue. To change the password, generate a new configuration and update your deployment.',
              )}
            </p>
          </div>
        </aside>
        <div className={`order-1 min-w-0 space-y-4 p-4 sm:p-5 lg:order-none ${uiPanel}`}>
          <div className="flex items-center gap-2 border-b border-gray-400/20 pb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            {generating ? (
              <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            )}
            {t(
              generating
                ? 'Generate password configuration'
                : status === 'authenticated'
                  ? 'Administrator session active'
                  : 'Administrator login',
            )}
          </div>
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
              <div>
                <span className={uiFieldLabel}>{t('Configuration format')}</span>
                <div className="relative mt-1">
                  <Dropdown
                    role="listbox"
                    items={configurationTargets}
                    selectedIndex={configurationTargets.findIndex(option => option.value === target)}
                    onSelect={option => setTarget(option.value)}
                    triggerLabel={configurationTargets.find(option => option.value === target)?.label}
                    triggerClassName="flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-gray-600/10 bg-gray-50 px-2 py-1.5 text-sm text-gray-900 transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-hidden dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700 motion-reduce:transition-none"
                    trigger={
                      <>
                        <span className="truncate">
                          {configurationTargets.find(option => option.value === target)?.label}
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-200 group-aria-expanded:rotate-180" />
                      </>
                    }
                    panelClassName="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded border border-gray-900/10 bg-white py-1 shadow-lg focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-900"
                    itemClassName={option =>
                      `flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm font-medium transition-colors duration-100 outline-hidden data-focus:text-blue-700 dark:data-focus:text-blue-400 ${option.value === target ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`
                    }
                    renderItem={option => (
                      <>
                        <span>{option.label}</span>
                        {option.value === target && <Check className="h-3 w-3 shrink-0" />}
                      </>
                    )}
                  />
                </div>
              </div>
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
                  {busy ? (
                    <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
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
                  {busy ? <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" /> : <LogIn className="h-4 w-4" />}
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
