'use client'

import { useClientConfig } from './ClientConfigProvider'

import { ArrowRight } from 'lucide-react'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FC, useState } from 'react'
import { useTranslations } from './ClientProviders'
import { uiInput, uiPrimaryButton } from './uiStyles'

import { matchProtectedRoute } from '../utils/protectedRouteHandler'
import useLocalStorage from '../utils/useLocalStorage'

const Auth: FC<{ redirect: string }> = ({ redirect }) => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const authTokenPath = matchProtectedRoute(redirect, protectedRoutes)

  const router = useRouter()
  const [token, setToken] = useState('')
  const [, setPersistedToken] = useLocalStorage(authTokenPath, '')

  const t = useTranslations()

  return (
    <div className="fade-in mx-auto flex max-w-sm flex-col gap-4 md:my-10">
      <div className="mx-auto w-3/4 md:w-5/6">
        <Image src={'/images/fabulous-wapmire-weekdays.png'} alt="authenticate" width={912} height={912} preload />
      </div>
      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('Enter Password')}</div>

      <p className="text-sm font-medium text-gray-500">
        {t('This route (the folder itself and the files inside) is password protected. ') +
          t('If you know the password, please enter it below.')}
      </p>

      <div className="flex items-center gap-2">
        <input
          className={`${uiInput} flex-1`}
          autoFocus
          type="password"
          placeholder="************"
          value={token}
          onChange={e => {
            setToken(e.target.value)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
              setPersistedToken(token)
              router.refresh()
            }
          }}
        />
        <button
          className={uiPrimaryButton}
          onClick={() => {
            setPersistedToken(token)
            router.refresh()
          }}
          title="Enter"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default Auth
