'use client'

import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, Suspense } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheckCircle } from '@fortawesome/free-regular-svg-icons'
import { faArrowLeft, faCheck, faExclamationCircle, faKey } from '@fortawesome/free-solid-svg-icons'

import siteConfig from '../../../../config/site.config'
import Navbar from '../../../components/Navbar'
import Footer from '../../../components/Footer'
import { getAuthPersonInfo, requestTokenWithAuthCode, sendTokenToServer } from '../../../utils/oAuthHandler'
import { LoadingIcon } from '../../../components/Loading'

function OAuthStep3Content() {
  const router = useRouter()
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
  const [buttonContent, setButtonContent] = useState(
    <div>
      <span>Store tokens</span> <FontAwesomeIcon icon={faKey} />
    </div>,
  )
  const [buttonError, setButtonError] = useState(false)

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
    setButtonContent(
      <div>
        <span>Storing tokens</span> <LoadingIcon className="ml-1 inline h-4 w-4 animate-spin" />
      </div>,
    )

    const { data, status } = await getAuthPersonInfo(tokenResponse.accessToken!)
    if (status !== 200) {
      setButtonError(true)
      setButtonContent(
        <div>
          <span>Error validating identify, restart</span> <FontAwesomeIcon icon={faExclamationCircle} />
        </div>,
      )
      return
    }
    if (data.userPrincipalName !== siteConfig.userPrincipalName) {
      setButtonError(true)
      setButtonContent(
        <div>
          <span>Do not pretend to be the site owner</span> <FontAwesomeIcon icon={faExclamationCircle} />
        </div>,
      )
      return
    }

    await sendTokenToServer(
      tokenResponse.accessToken!,
      tokenResponse.refreshToken!,
      tokenResponse.expiryTime!.toString(),
    )
      .then(() => {
        setButtonError(false)
        setButtonContent(
          <div>
            <span>Stored! Going home...</span> <FontAwesomeIcon icon={faCheck} />
          </div>,
        )
        setTimeout(() => {
          router.push('/')
        }, 2000)
      })
      .catch(() => {
        setButtonError(true)
        setButtonContent(
          <div>
            <span>Error storing the token</span> <FontAwesomeIcon icon={faExclamationCircle} />
          </div>,
        )
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
                    alt="fabulous celebration"
                    priority
                  />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">Welcome to your new onedrive-vercel-index 🎉</h3>

                <h3 className="mt-4 mb-2 text-lg font-medium">Step 3/3: Error getting access tokens ❌</h3>

                <p className="py-1 text-sm font-medium text-red-400">
                  <FontAwesomeIcon icon={faExclamationCircle} className="mr-1" /> {tokenResponse.error}:{' '}
                  {tokenResponse.errorDescription}
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
                    ? 'The authorisation code can only be used once and is valid for about 10 minutes. Request a fresh code and paste it right away.'
                    : tokenResponse.error === 'network_error'
                      ? 'The browser could not reach the Microsoft token endpoint. Check the connection and try again.'
                      : 'Go back to the previous step and request the tokens again.'}
                </p>

                <div className="mt-6 mb-2 flex flex-wrap justify-end gap-2">
                  <button
                    className="rounded-lg border border-gray-500/30 px-4 py-2.5 text-center text-sm font-medium hover:opacity-80"
                    onClick={() => router.push('/onedrive-vercel-index-oauth/step-1')}
                  >
                    <FontAwesomeIcon icon={faArrowLeft} /> <span>Start over</span>
                  </button>
                  <button
                    className="rounded-lg bg-gradient-to-br from-red-400 to-pink-500 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-red-200 dark:focus:ring-red-800"
                    onClick={() => router.push('/onedrive-vercel-index-oauth/step-2')}
                  >
                    <FontAwesomeIcon icon={faArrowLeft} /> <span>Get a new code</span>
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
                    alt="fabulous fireworks"
                    priority
                  />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">Welcome to your new onedrive-vercel-index 🎉</h3>

                <h3 className="mt-4 mb-2 text-lg font-medium">
                  Step 3/3: Store access tokens <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />
                </h3>

                <p className="py-1">
                  <FontAwesomeIcon icon={faCheckCircle} className="mr-1 text-green-500" />
                  You have successfully requested the access tokens. Please copy and store the tokens for use later.
                  These tokens are used by onedrive-vercel-index to read files from your OneDrive account.
                </p>

                <div className="my-4 overflow-hidden">
                  <table className="min-w-full table-auto">
                    <tbody>
                      <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                        <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                          Access token
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <code className="font-mono text-xs">{tokenResponse.accessToken}</code>
                        </td>
                      </tr>
                      <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                        <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                          Expiry time
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <code className="font-mono text-sm">{expiryTimeLeft}s</code>
                        </td>
                      </tr>
                      <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                        <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                          Refresh token
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <code className="font-mono text-xs">{tokenResponse.refreshToken}</code>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="py-1">
                  You can now click on the button below to store the credentials with the deployed site. You will be
                  redirected home.
                </p>

                <div className="mt-6 mb-2 text-right">
                  <button
                    className={`rounded-lg bg-gradient-to-br px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 disabled:cursor-not-allowed disabled:grayscale ${
                      buttonError
                        ? 'from-red-400 to-pink-500 focus:ring-red-200 dark:focus:ring-red-800'
                        : 'from-green-500 to-cyan-400 focus:ring-green-200 dark:focus:ring-green-800'
                    }`}
                    onClick={sendAuthTokensToServer}
                  >
                    {buttonContent}
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
                    alt="fabulous come back later"
                    priority
                  />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">Step 3/3: No authorisation code</h3>
                <p className="py-1">
                  This page needs the authorisation code from the previous step. Codes are single use, so going back and
                  getting a new one is the quickest way forward.
                </p>
                <div className="mt-6 mb-2 text-right">
                  <button
                    className="rounded-lg bg-gradient-to-br from-green-500 to-cyan-400 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-green-200 dark:focus:ring-green-800"
                    onClick={() => router.push('/onedrive-vercel-index-oauth/step-2')}
                  >
                    <FontAwesomeIcon icon={faArrowLeft} /> <span>Get an authorisation code</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto w-52">
                  <LoadingIcon className="mx-auto h-32 w-32 animate-spin" />
                </div>
                <h3 className="mb-4 text-center text-xl font-medium">Requesting tokens...</h3>
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
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OAuthStep3Content />
    </Suspense>
  )
}
