'use client'

import { useClientConfig } from '../../../components/ClientConfigProvider'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, CircleAlert, ExternalLink } from 'lucide-react'

import Navbar from '../../../components/Navbar'
import Footer from '../../../components/Footer'
import { useTranslations } from '../../../components/ClientProviders'
import { RichText } from '../../../components/RichText'
import { LoadingIcon } from '../../../components/Loading'
import { extractAuthCodeFromRedirected, generateAuthorisationUrl } from '../../../utils/oAuthHandler'

export default function OAuthStep2() {
  const { apiConfig } = useClientConfig()
  const router = useRouter()
  const t = useTranslations()

  const [oAuthRedirectedUrl, setOAuthRedirectedUrl] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [buttonLoading, setButtonLoading] = useState(false)

  const oAuthUrl = generateAuthorisationUrl(apiConfig)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
        <Navbar />

        <div className="mx-auto w-full max-w-5xl p-4">
          <div className="rounded bg-white p-3 dark:bg-gray-900 dark:text-gray-100">
            <div className="mx-auto w-52">
              <Image
                src="/images/fabulous-come-back-later.png"
                width={912}
                height={912}
                alt={t('fabulous come back later')}
                priority
              />
            </div>
            <h3 className="mb-4 text-center text-xl font-medium">
              {t('Welcome to your new onedrive-vercel-index 🎉')}
            </h3>

            <h3 className="mt-4 mb-2 text-lg font-medium">{t('Step 2/3: Get authorisation code')}</h3>

            <p className="py-1 text-sm font-medium text-red-400">
              <CircleAlert className="mr-1 h-4 w-4" />{' '}
              {t(
                'If you are not the owner of this website, stop now, as continuing with this process may expose your personal files in OneDrive.',
              )}
            </p>

            <div
              className="relative my-2 cursor-pointer rounded border border-gray-500/50 bg-gray-50 font-mono text-sm hover:opacity-80 dark:bg-gray-800"
              onClick={() => {
                window.open(oAuthUrl)
              }}
            >
              <div className="absolute top-0 right-0 p-1 opacity-60">
                <ExternalLink className="h-4 w-4" />
              </div>
              <pre className="overflow-x-auto p-2 whitespace-pre-wrap">
                <code>{oAuthUrl}</code>
              </pre>
            </div>

            <p className="py-1">
              <RichText
                text={t(
                  "The OAuth link for getting the authorisation code has been created. Click on the link above to get the <1>authorisation code</1>. Your browser will open a new tab to Microsoft's account login page. After logging in and authenticating with your Microsoft account, you will be redirected to a blank page on localhost. Paste <2>the entire redirected URL</2> down below.",
                )}
                tags={{
                  '1': <b className="underline decoration-yellow-400 decoration-wavy" />,
                  '2': <b className="underline decoration-teal-500 decoration-wavy" />,
                }}
              />
            </p>

            <div className="mx-auto my-4 w-2/3 overflow-hidden rounded">
              <Image src="/images/step-2-screenshot.png" width={1466} height={607} alt={t('step 2 screenshot')} />
            </div>

            <input
              className={`my-2 w-full flex-1 rounded border bg-gray-50 p-2 font-mono text-sm font-medium focus:ring focus:outline-hidden dark:bg-gray-800 dark:text-white ${
                authCode
                  ? 'border-green-500/50 focus:ring-green-500/30 dark:focus:ring-green-500/40'
                  : 'border-red-500/50 focus:ring-red-500/30 dark:focus:ring-red-500/40'
              }`}
              autoFocus
              type="text"
              placeholder="http://localhost/?code=M.R3_BAY.c0..."
              value={oAuthRedirectedUrl}
              onChange={e => {
                setOAuthRedirectedUrl(e.target.value)
                setAuthCode(extractAuthCodeFromRedirected(e.target.value, apiConfig.redirectUri))
              }}
            />

            <p className="py-1">{t('The authorisation code extracted is:')}</p>
            <p className="my-2 truncate overflow-hidden rounded border border-gray-400/20 bg-gray-50 p-2 font-mono text-sm opacity-80 dark:bg-gray-800">
              {authCode ?? <span className="animate-pulse">{t('Waiting for code...')}</span>}
            </p>

            <p>
              {authCode
                ? t('✅ You can now proceed onto the next step: requesting your access token and refresh token.')
                : t('❌ No valid code extracted.')}
            </p>

            <p className="py-1 text-sm font-medium text-yellow-600 dark:text-yellow-500">
              <CircleAlert className="mr-1 h-4 w-4" />{' '}
              {t(
                'The code can only be used once and expires in about 10 minutes. Paste the redirected URL and press "Get tokens" right away.',
              )}
            </p>

            <div className="mt-6 mb-2 text-right">
              <button
                className="rounded-lg bg-gradient-to-br from-green-500 to-cyan-400 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-green-200 disabled:cursor-not-allowed disabled:grayscale dark:focus:ring-green-800"
                disabled={authCode === ''}
                onClick={() => {
                  setButtonLoading(true)
                  router.push(`/onedrive-vercel-index-oauth/step-3?authCode=${authCode}`)
                }}
              >
                {buttonLoading ? (
                  <>
                    <span>{t('Requesting tokens')}</span> <LoadingIcon className="ml-1 inline h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>
                    <span>{t('Get tokens')}</span> <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
