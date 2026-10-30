'use client'

import { useClientConfig } from '../../../components/ClientConfigProvider'

import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, Suspense } from 'react'
import { ArrowLeft, Check, CircleAlert, CircleCheck, KeyRound } from 'lucide-react'

import Navbar from '../../../components/Navbar'
import Footer from '../../../components/Footer'
import { useTranslations } from '../../../components/ClientProviders'
import { getAuthPersonInfo, requestTokenWithAuthCode, sendTokenToServer } from '../../../utils/oAuthHandler'
import { LoadingIcon } from '../../../components/Loading'

function OAuthStep3Content() {
  const { siteConfig, apiConfig } = useClientConfig()
  const router = useRouter()
  const t = useTranslations()
  const searchParams = useSearchParams()
  const authCode = searchParams.get('authCode') || ''

  const [tokenResponse, setTokenResponse] = useState<{
    accessToken?: string
    expiryTime?: number
    refreshToken?: string
    error?: string
    errorDescription?: string
    errorUri?: string
  }>({})

  // An authorisation code is single use: redeeming it twice (double mount, refresh,
  // or a second request racing the first) reports "code has expired" even though the
  // first call already succeeded.
  const redeemedCode = useRef<string | null>(null)

  const [expiryTimeLeft, setExpiryTimeLeft] = useState<number>(0)
  const [buttonState, setButtonState] = useState<
    'initial' | 'storing' | 'identityError' | 'ownerError' | 'stored' | 'storeError'
  >('initial')
  const [buttonError, setButtonError] = useState(false)
  const [setupSecret, setSetupSecret] = useState('')
  const [setupError, setSetupError] = useState('')

  useEffect(() => {
    if (!authCode || redeemedCode.current === authCode) return

    redeemedCode.current = authCode

    // Drop the code from the address bar so a refresh or a shared link cannot
    // re-redeem it and show a misleading "expired" error.
    window.history.replaceState(null, '', '/onedrive-vercel-index-oauth/step-3')

    requestTokenWithAuthCode(authCode).then(response => {
      setTokenResponse(response as any)
      if ('expiryTime' in response && typeof response.expiryTime === 'number') {
        setExpiryTimeLeft(Number(response.expiryTime))
      }
    })
  }, [authCode])

  useEffect(() => {
    if (!expiryTimeLeft) return

    const intervalId = setInterval(() => {
      setExpiryTimeLeft(expiryTimeLeft - 1)
    }, 1000)

    return () => clearInterval(intervalId)
  }, [expiryTimeLeft])

  const sendAuthTokensToServer = async () => {
    if (!tokenResponse.accessToken || !tokenResponse.refreshToken || !tokenResponse.expiryTime) {
      return
    }

    setButtonError(false)
    setSetupError('')
    setButtonState('storing')

    const { data, status } = await getAuthPersonInfo(tokenResponse.accessToken!, apiConfig.driveApi)
    if (status !== 200) {
      setButtonError(true)
      setButtonState('identityError')
      return
    }
    if (data.userPrincipalName !== siteConfig.userPrincipalName) {
      setButtonError(true)
      setButtonState('ownerError')
      return
    }

    await sendTokenToServer(
      tokenResponse.accessToken!,
      tokenResponse.refreshToken!,
      tokenResponse.expiryTime!.toString(),
      setupSecret,
    )
      .then(() => {
        setButtonError(false)
        setSetupSecret('')
        setButtonState('stored')
        setTimeout(() => {
          router.push('/')
        }, 2000)
      })
      .catch(error => {
        setButtonError(true)
        const code = error?.response?.data?.error
        setSetupError(
          code === 'invalid_setup_secret' ? t('Invalid administrator setup secret')
            : code === 'setup_unavailable' ? t('Administrator setup secret is not configured')
              : code === 'identity_mismatch' ? t('The token does not belong to the configured site owner')
                : code === 'identity_unavailable' ? t('Could not verify the token with Microsoft Graph')
                  : t('Error storing the token'),
        )
        setButtonState('storeError')
      })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
        <Navbar />

        <div className="mx-auto w-full max-w-5xl p-4">
          <div className="rounded bg-white p-3 dark:bg-gray-900 dark:text-gray-100">
            {tokenResponse.error ? (
              <>
                <div className="mx-auto w-52">
                  <Image
                    src="/images/fabulous-celebration.png"
                    width={912}
                    height={912}
                    alt={t('fabulous celebration')}
                    priority
                  />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">
                  {t('Welcome to your new onedrive-vercel-index 🎉')}
                </h3>

                <h3 className="mt-4 mb-2 text-lg font-medium">{t('Step 3/3: Error getting access tokens ❌')}</h3>

                <p className="py-1 text-sm font-medium text-red-400">
                  <CircleAlert className="mr-1 h-4 w-4" /> {tokenResponse.error}: {tokenResponse.errorDescription}
                </p>

                {tokenResponse.errorUri && (
                  <p className="py-1 text-sm break-all italic">
                    <a
                      className="text-blue-600 hover:underline dark:text-blue-400"
                      href={tokenResponse.errorUri}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {tokenResponse.errorUri}
                    </a>
                  </p>
                )}

                <p className="py-1">
                  {tokenResponse.error === 'invalid_grant'
                    ? t(
                        'The authorisation code can only be used once and is valid for about 10 minutes. Request a fresh code and paste it right away.',
                      )
                    : tokenResponse.error === 'network_error'
                      ? t(
                          'The token service could not be reached. Check the connection and try again.',
                        )
                      : t('Go back to the previous step and request the tokens again.')}
                </p>

                <div className="mt-6 mb-2 flex flex-wrap justify-end gap-2">
                  <button
                    className="rounded-lg border border-gray-500/30 px-4 py-2.5 text-center text-sm font-medium hover:opacity-80"
                    onClick={() => router.push('/onedrive-vercel-index-oauth/step-1')}
                  >
                    <ArrowLeft className="h-4 w-4" /> <span>{t('Start over')}</span>
                  </button>
                  <button
                    className="rounded-lg bg-gradient-to-br from-red-400 to-pink-500 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-red-200 dark:focus:ring-red-800"
                    onClick={() => router.push('/onedrive-vercel-index-oauth/step-2')}
                  >
                    <ArrowLeft className="h-4 w-4" /> <span>{t('Get a new code')}</span>
                  </button>
                </div>
              </>
            ) : tokenResponse.accessToken ? (
              <>
                <div className="mx-auto w-52">
                  <Image
                    src="/images/fabulous-fireworks.png"
                    width={912}
                    height={912}
                    alt={t('fabulous fireworks')}
                    priority
                  />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">
                  {t('Welcome to your new onedrive-vercel-index 🎉')}
                </h3>

                <h3 className="mt-4 mb-2 text-lg font-medium">
                  {t('Step 3/3: Store access tokens')} <CircleCheck className="h-4 w-4 text-green-500" />
                </h3>

                <p className="py-1">
                  <CircleCheck className="mr-1 h-4 w-4 text-green-500" />
                  {t(
                    'You have successfully requested the access tokens. Please copy and store the tokens for use later. These tokens are used by onedrive-vercel-index to read files from your OneDrive account.',
                  )}
                </p>

                <div className="my-4 overflow-hidden">
                  <table className="min-w-full table-auto">
                    <tbody>
                      <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                        <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                          {t('Access token')}
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <code className="font-mono text-xs">{tokenResponse.accessToken}</code>
                        </td>
                      </tr>
                      <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                        <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                          {t('Expiry time')}
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <code className="font-mono text-sm">{expiryTimeLeft}s</code>
                        </td>
                      </tr>
                      <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                        <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                          {t('Refresh token')}
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <code className="font-mono text-xs">{tokenResponse.refreshToken}</code>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="py-1">
                  {t(
                    'You can now click on the button below to store the credentials with the deployed site. You will be redirected home.',
                  )}
                </p>

                <div className="mt-6">
                  <label htmlFor="setup-secret" className="block text-sm font-medium">{t('Administrator setup secret')}</label>
                  <input id="setup-secret" type="password" autoComplete="off" value={setupSecret}
                    onChange={event => setSetupSecret(event.target.value)}
                    aria-describedby="setup-secret-help"
                    className="mt-2 w-full max-w-md rounded border border-gray-400 px-3 py-2 dark:bg-gray-800" />
                  <p id="setup-secret-help" className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                    {t('Enter the administrator setup secret if configured. Without OAUTH_SETUP_SECRET, anyone with a token for the configured Microsoft account can replace the stored credentials. Set a secret to protect this endpoint.')}
                  </p>
                  {setupError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{setupError}</p>}
                </div>
                <div className="mt-6 mb-2 text-right">
                  <button
                    className={`rounded-lg bg-gradient-to-br px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 disabled:cursor-not-allowed disabled:grayscale ${
                      buttonError
                        ? 'from-red-400 to-pink-500 focus:ring-red-200 dark:focus:ring-red-800'
                        : 'from-green-500 to-cyan-400 focus:ring-green-200 dark:focus:ring-green-800'
                    }`}
                    onClick={sendAuthTokensToServer}
                    disabled={buttonState === 'storing' || buttonState === 'stored'}
                  >
                    <div>
                      {buttonState === 'initial' && (
                        <>
                          <span>{t('Store tokens')}</span> <KeyRound className="h-4 w-4" />
                        </>
                      )}
                      {buttonState === 'storing' && (
                        <>
                          <span>{t('Storing tokens')}</span>{' '}
                          <LoadingIcon className="ml-1 inline h-4 w-4 animate-spin" />
                        </>
                      )}
                      {buttonState === 'identityError' && (
                        <>
                          <span>{t('Error validating identify, restart')}</span> <CircleAlert className="h-4 w-4" />
                        </>
                      )}
                      {buttonState === 'ownerError' && (
                        <>
                          <span>{t('Do not pretend to be the site owner')}</span> <CircleAlert className="h-4 w-4" />
                        </>
                      )}
                      {buttonState === 'stored' && (
                        <>
                          <span>{t('Stored! Going home...')}</span> <Check className="h-4 w-4" />
                        </>
                      )}
                      {buttonState === 'storeError' && (
                        <>
                          <span>{t('Error storing the token')}</span> <CircleAlert className="h-4 w-4" />
                        </>
                      )}
                    </div>
                  </button>
                </div>
              </>
            ) : authCode === '' ? (
              <>
                <div className="mx-auto w-52">
                  <Image
                    src="/images/fabulous-come-back-later.png"
                    width={912}
                    height={912}
                    alt={t('fabulous come back later')}
                    priority
                  />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">{t('Step 3/3: No authorisation code')}</h3>
                <p className="py-1">
                  {t(
                    'This page needs the authorisation code from the previous step. Codes are single use, so going back and getting a new one is the quickest way forward.',
                  )}
                </p>
                <div className="mt-6 mb-2 text-right">
                  <button
                    className="rounded-lg bg-gradient-to-br from-green-500 to-cyan-400 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-green-200 dark:focus:ring-green-800"
                    onClick={() => router.push('/onedrive-vercel-index-oauth/step-2')}
                  >
                    <ArrowLeft className="h-4 w-4" /> <span>{t('Get an authorisation code')}</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto w-52">
                  <LoadingIcon className="mx-auto h-32 w-32 animate-spin" />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">{t('Requesting tokens...')}</h3>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function OAuthStep3() {
  const t = useTranslations()

  return (
    <Suspense fallback={<div>{t('Loading...')}</div>}>
      <OAuthStep3Content />
    </Suspense>
  )
}
