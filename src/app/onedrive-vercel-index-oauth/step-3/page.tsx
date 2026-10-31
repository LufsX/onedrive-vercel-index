'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { useTranslations } from '../../../components/ClientProviders'
import { LoadingIcon } from '../../../components/Loading'
import SetupShell, { SetupSessionState, SetupStatus } from '../../../components/SetupShell'
import { uiButton, uiPrimaryButton } from '../../../components/uiStyles'
import useAdminSession from '../../../utils/useAdminSession'
import { requestTokenWithAuthCode } from '../../../utils/oAuthHandler'

export default function OAuthStep3() {
  const router = useRouter()
  const t = useTranslations()
  const { status, refresh } = useAdminSession()
  const [hasCode, setHasCode] = useState(false)
  const [state, setState] = useState<'ready' | 'working' | 'stored' | 'error'>('ready')

  useEffect(() => {
    if (status === 'anonymous' || status === 'uninitialized') {
      router.replace('/onedrive-vercel-index-oauth/step-0?next=step-3')
    }
  }, [router, status])

  useEffect(() => {
    try {
      setHasCode(!!sessionStorage.getItem('oauth_auth_code'))
    } catch {
      setState('error')
    }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (status !== 'authenticated' || state === 'working') return
    setState('working')
    try {
      const code = sessionStorage.getItem('oauth_auth_code')
      if (!code) {
        setHasCode(false)
        setState('ready')
        return
      }
      const result = await requestTokenWithAuthCode(code)
      if ('error' in result && result.error === 'unauthorized') {
        router.replace('/onedrive-vercel-index-oauth/step-0?next=step-3')
        return
      }
      sessionStorage.removeItem('oauth_auth_code')
      setState('stored' in result && result.stored ? 'stored' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <SetupShell step={3} title={t('Step 3/3: Get access and refresh tokens')}>
      {status !== 'authenticated' ? (
        <SetupSessionState status={status} retry={refresh} />
      ) : state === 'stored' ? (
        <div className="fade-in space-y-4">
          <SetupStatus tone="success">{t('Tokens stored.')}</SetupStatus>
          <div className="flex justify-end border-t border-gray-400/30 pt-3">
            <Link className={uiPrimaryButton} href="/">
              {t('Home')}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : state === 'error' ? (
        <div className="fade-in space-y-4">
          <SetupStatus tone="error">{t('Error storing the token')}</SetupStatus>
          <div className="flex justify-end border-t border-gray-400/30 pt-3">
            <Link className={uiPrimaryButton} href="/onedrive-vercel-index-oauth/step-2">
              {t('Get a new code')}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : hasCode ? (
        <form onSubmit={submit} className="fade-in space-y-4" aria-busy={state === 'working'}>
          <SetupStatus busy={state === 'working'}>
            {t(
              state === 'working'
                ? 'Storing tokens'
                : 'These tokens may take a few seconds to populate after you click the button below. ',
            )}
          </SetupStatus>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-400/30 pt-3">
            <button
              type="button"
              className={`${uiButton} bg-gray-100 dark:bg-gray-800`}
              disabled={state === 'working'}
              onClick={() => router.push('/onedrive-vercel-index-oauth/step-2')}
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {t('Get a new code')}
            </button>
            <button type="submit" disabled={state === 'working'} className={uiPrimaryButton}>
              {state === 'working' && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
              {t(state === 'working' ? 'Storing tokens' : 'Store tokens')}
              {state !== 'working' && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
        </form>
      ) : (
        <div className="fade-in space-y-4">
          <SetupStatus>{t('Waiting for code...')}</SetupStatus>
          <div className="flex justify-end border-t border-gray-400/30 pt-3">
            <Link className={uiPrimaryButton} href="/onedrive-vercel-index-oauth/step-2">
              {t('Get an authorisation code')}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </SetupShell>
  )
}
