'use client'

import { useState, type ReactNode } from 'react'
import { Check, CircleAlert, CircleCheck, LockKeyhole } from 'lucide-react'

import Navbar from './Navbar'
import Footer from './Footer'
import { LoadingIcon } from './Loading'
import { useTranslations } from './ClientProviders'
import { uiButton, uiPanel } from './uiStyles'

export function SetupStatus({
  children,
  tone = 'info',
  busy = false,
}: {
  children: ReactNode
  tone?: 'info' | 'success' | 'error'
  busy?: boolean
}) {
  const colors = {
    info: 'border-gray-400/30 bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    success: 'border-green-500/30 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    error: 'border-red-500/30 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  }

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      aria-busy={busy}
      className={`fade-in flex items-start gap-2 rounded border p-3 text-sm ${colors[tone]}`}
    >
      {busy ? (
        <LoadingIcon className="mt-0.5 h-4 w-4 shrink-0 motion-safe:animate-spin" />
      ) : tone === 'success' ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function SetupSessionState({ status, retry }: { status: string; retry: () => Promise<void> }) {
  const t = useTranslations()
  const [busy, setBusy] = useState(false)

  async function refresh() {
    if (busy) return
    setBusy(true)
    try {
      await retry()
    } finally {
      setBusy(false)
    }
  }

  if (status === 'error') {
    return (
      <div className="fade-in space-y-3">
        <SetupStatus tone="error">{t('Unable to check administrator session.')}</SetupStatus>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className={`${uiButton} bg-gray-100 dark:bg-gray-800`}
        >
          {busy && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
          {t(busy ? 'Loading...' : 'Retry')}
        </button>
      </div>
    )
  }

  return <SetupStatus busy>{t('Loading...')}</SetupStatus>
}

export default function SetupShell({
  step,
  title,
  children,
}: {
  step: 0 | 1 | 2 | 3
  title: string
  children: ReactNode
}) {
  const t = useTranslations()
  const steps = [
    t('Administrator'),
    t('Step 1/3: Preparations'),
    t('Step 2/3: Get authorisation code'),
    t('Step 3/3: Get access and refresh tokens'),
  ]

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-800">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-2 py-4 sm:px-4">
        <section className={`setup-panel overflow-hidden ${uiPanel}`} aria-labelledby="setup-title">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-400/30 bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <h1 id="setup-title" className="text-base font-medium text-gray-900 dark:text-gray-100">
              {title}
            </h1>
            <ol className="flex shrink-0 items-center gap-1.5">
              {steps.map((label, index) => (
                <li
                  key={label}
                  aria-current={index === step ? 'step' : undefined}
                  title={label}
                  className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-medium ${
                    index === step
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-400/30 bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-400'
                  }`}
                >
                  <span className="sr-only">{label}</span>
                  {index < step ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  ) : index === 0 ? (
                    <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
                  ) : (
                    <span aria-hidden="true">{index}</span>
                  )}
                </li>
              ))}
            </ol>
          </header>
          <div className="space-y-4 p-4">{children}</div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
