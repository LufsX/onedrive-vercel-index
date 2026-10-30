'use client'

import { useClientConfig } from '../../../components/ClientConfigProvider'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowRight, TriangleAlert } from 'lucide-react'

import Navbar from '../../../components/Navbar'
import Footer from '../../../components/Footer'
import { useTranslations } from '../../../components/ClientProviders'
import { RichText } from '../../../components/RichText'

export default function OAuthStep1() {
  const { apiConfig } = useClientConfig()
  const router = useRouter()
  const t = useTranslations()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
        <Navbar />

        <div className="mx-auto w-full max-w-5xl p-4">
          <div className="rounded bg-white p-3 dark:bg-gray-900 dark:text-gray-100">
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

            <h3 className="mt-4 mb-2 text-lg font-medium">{t('Step 1/3: Preparations')}</h3>

            <p className="py-1 text-sm font-medium text-yellow-400">
              <TriangleAlert className="mr-1 h-4 w-4" />{' '}
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
            </p>

            <p className="py-1">
              <RichText
                text={t(
                  'Authorisation is required as no valid <1>access_token</1> or <2>refresh_token</2> is present on this deployed instance. Check the following configurations before proceeding with authorising onedrive-vercel-index with your own Microsoft account.',
                )}
                tags={{
                  '1': <code className="font-mono text-sm underline decoration-pink-600 decoration-wavy" />,
                  '2': <code className="font-mono text-sm underline decoration-green-600 decoration-wavy" />,
                }}
              />
            </p>

            <div className="my-4 overflow-hidden">
              <table className="min-w-full table-auto">
                <tbody>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      CLIENT_ID
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.clientId}</code>
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      REDIRECT_URI
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.redirectUri}</code>
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      {t('Auth API URL')}
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.authApi}</code>
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      {t('Drive API URL')}
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.driveApi}</code>
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      {t('API Scope')}
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.scope}</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="py-1 text-sm font-medium">
              <TriangleAlert className="mr-1 h-4 w-4 text-yellow-400" />{' '}
              <RichText
                text={t(
                  'If you see anything missing or incorrect, you need to reconfigure <1>/config/api.config.js</1> and redeploy this instance.',
                )}
                tags={{ '1': <code className="font-mono text-xs" /> }}
              />
            </p>

            <div className="mt-6 mb-2 text-right">
              <button
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-cyan-300 dark:focus:ring-cyan-800"
                onClick={() => {
                  router.push('/onedrive-vercel-index-oauth/step-2')
                }}
              >
                <span>{t('Proceed to OAuth')}</span> <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
