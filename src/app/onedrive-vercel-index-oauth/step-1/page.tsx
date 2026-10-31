'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowRight, TriangleAlert } from 'lucide-react'

import { useClientConfig } from '../../../components/ClientConfigProvider'
import { useTranslations } from '../../../components/ClientProviders'
import { RichText } from '../../../components/RichText'
import SetupShell, { SetupSessionState } from '../../../components/SetupShell'
import { uiPrimaryButton } from '../../../components/uiStyles'
import useAdminSession from '../../../utils/useAdminSession'

export default function OAuthStep1() {
  const { apiConfig } = useClientConfig()
  const router = useRouter()
  const t = useTranslations()
  const { status, refresh } = useAdminSession()

  useEffect(() => {
    if (status === 'anonymous' || status === 'uninitialized') router.replace('/onedrive-vercel-index-oauth/step-0')
  }, [router, status])

  const configuration = [
    ['CLIENT_ID', apiConfig.clientId],
    ['REDIRECT_URI', apiConfig.redirectUri],
    [t('Auth API URL'), apiConfig.authApi],
    [t('Drive API URL'), apiConfig.driveApi],
    [t('API Scope'), apiConfig.scope],
  ]

  return (
    <SetupShell step={1} title={t('Step 1/3: Preparations')}>
      {status !== 'authenticated' ? (
        <SetupSessionState status={status} retry={refresh} />
      ) : (
        <div className="fade-in space-y-4">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {t('Welcome to your new onedrive-vercel-index 🎉')}
          </p>

          <p className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <RichText
                text={t(
                  'If you have not specified a REDIS_URL inside your Vercel env variable, go initialise one at <1>Upstash</1>. Docs: <2>Vercel Integration - Upstash</2>.',
                )}
                tags={{
                  '1': (
                    <a href="https://upstash.com/" target="_blank" rel="noopener noreferrer" className="underline" />
                  ),
                  '2': (
                    <a
                      href="https://docs.upstash.com/redis/howto/vercelintegration"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    />
                  ),
                }}
              />
            </span>
          </p>

          <p className="leading-relaxed">
            <RichText
              text={t(
                'Authorisation is required as no valid <1>access_token</1> or <2>refresh_token</2> is present on this deployed instance. Check the following configurations before proceeding with authorising onedrive-vercel-index with your own Microsoft account.',
              )}
              tags={{
                '1': <code className="font-mono text-xs" />,
                '2': <code className="font-mono text-xs" />,
              }}
            />
          </p>

          <dl className="divide-y divide-gray-400/30 overflow-hidden rounded border border-gray-400/30">
            {configuration.map(([label, value]) => (
              <div key={label} className="grid min-w-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {label}
                </dt>
                <dd className="min-w-0 px-3 py-2">
                  <code className="font-mono text-xs break-all">{value}</code>
                </dd>
              </div>
            ))}
          </dl>

          <p className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400"
            />
            <span className="min-w-0">
              <RichText
                text={t(
                  'If you see anything missing or incorrect, you need to reconfigure <1>/config/api.config.js</1> and redeploy this instance.',
                )}
                tags={{ '1': <code className="font-mono text-xs break-all" /> }}
              />
            </span>
          </p>

          <div className="flex justify-end border-t border-gray-400/30 pt-3">
            <button
              type="button"
              className={uiPrimaryButton}
              onClick={() => router.push('/onedrive-vercel-index-oauth/step-2')}
            >
              {t('Proceed to OAuth')}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </SetupShell>
  )
}
