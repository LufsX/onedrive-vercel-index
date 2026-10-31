'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleAlert, ExternalLink } from 'lucide-react'

import { useClientConfig } from '../../../components/ClientConfigProvider'
import { useTranslations } from '../../../components/ClientProviders'
import { RichText } from '../../../components/RichText'
import { LoadingIcon } from '../../../components/Loading'
import SetupShell, { SetupSessionState, SetupStatus } from '../../../components/SetupShell'
import { uiButton, uiFieldLabel, uiInput, uiPrimaryButton } from '../../../components/uiStyles'
import { extractAuthCodeFromRedirected, generateAuthorisationUrl } from '../../../utils/oAuthHandler'
import useAdminSession from '../../../utils/useAdminSession'

export default function OAuthStep2() {
  const { apiConfig } = useClientConfig()
  const router = useRouter()
  const t = useTranslations()
  const { status, refresh } = useAdminSession()

  const [oAuthRedirectedUrl, setOAuthRedirectedUrl] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [buttonLoading, setButtonLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (status === 'anonymous' || status === 'uninitialized') router.replace('/onedrive-vercel-index-oauth/step-0')
  }, [router, status])

  const oAuthUrl = generateAuthorisationUrl(apiConfig)

  function proceed(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authCode || buttonLoading || status !== 'authenticated') return
    setButtonLoading(true)
    setError(false)
    try {
      sessionStorage.setItem('oauth_auth_code', authCode)
      router.push('/onedrive-vercel-index-oauth/step-3')
    } catch {
      setButtonLoading(false)
      setError(true)
    }
  }

  return (
    <SetupShell step={2} title={t('Step 2/3: Get authorisation code')}>
      {status !== 'authenticated' ? (
        <SetupSessionState status={status} retry={refresh} />
      ) : (
        <div className="fade-in space-y-4">
          <SetupStatus tone="error">
            {t(
              'If you are not the owner of this website, stop now, as continuing with this process may expose your personal files in OneDrive.',
            )}
          </SetupStatus>

          <a className={uiPrimaryButton} href={oAuthUrl} target="_blank" rel="noopener noreferrer">
            {t('Get an authorisation code')}
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>

          <p className="leading-relaxed">
            <RichText
              text={t(
                "The OAuth link for getting the authorisation code has been created. Click on the link above to get the <1>authorisation code</1>. Your browser will open a new tab to Microsoft's account login page. After logging in and authenticating with your Microsoft account, you will be redirected to a blank page on localhost. Paste <2>the entire redirected URL</2> down below.",
              )}
              tags={{
                '1': <strong className="font-medium" />,
                '2': <strong className="font-medium" />,
              }}
            />
          </p>

          <form onSubmit={proceed} className="space-y-4" aria-busy={buttonLoading}>
            <label className={uiFieldLabel} htmlFor="oauth-redirected-url">
              {t('Redirected URL')}
            </label>
            <input
              id="oauth-redirected-url"
              className={uiInput}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              type="password"
              required
              disabled={buttonLoading}
              placeholder="http://localhost/?code=…"
              value={oAuthRedirectedUrl}
              aria-invalid={!!oAuthRedirectedUrl && !authCode}
              aria-describedby="oauth-code-status oauth-code-expiry"
              onChange={event => {
                setOAuthRedirectedUrl(event.target.value)
                setAuthCode(extractAuthCodeFromRedirected(event.target.value, apiConfig.redirectUri))
                setError(false)
              }}
            />

            <div
              id="oauth-code-status"
              key={error ? 'error' : authCode ? 'valid' : oAuthRedirectedUrl ? 'invalid' : 'empty'}
            >
              <SetupStatus tone={error || (oAuthRedirectedUrl && !authCode) ? 'error' : authCode ? 'success' : 'info'}>
                {error
                  ? t('Could not save the authorisation code. Allow browser session storage and try again.')
                  : authCode
                    ? t('✅ You can now proceed onto the next step: requesting your access token and refresh token.')
                    : oAuthRedirectedUrl
                      ? t('❌ No valid code extracted.')
                      : t('Waiting for code...')}
              </SetupStatus>
            </div>

            <p id="oauth-code-expiry" className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400"
              />
              <span>
                {t(
                  'The code can only be used once and expires in about 10 minutes. Paste the redirected URL and press "Get tokens" right away.',
                )}
              </span>
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-400/30 pt-3">
              <button
                type="button"
                className={`${uiButton} bg-gray-100 dark:bg-gray-800`}
                disabled={buttonLoading}
                onClick={() => router.push('/onedrive-vercel-index-oauth/step-1')}
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('Step 1/3: Preparations')}
              </button>
              <button type="submit" className={uiPrimaryButton} disabled={!authCode || buttonLoading}>
                {buttonLoading && <LoadingIcon className="h-4 w-4 motion-safe:animate-spin" />}
                {t(buttonLoading ? 'Requesting tokens' : 'Get tokens')}
                {!buttonLoading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </div>
      )}
    </SetupShell>
  )
}
