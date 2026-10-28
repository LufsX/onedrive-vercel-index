'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch, faFileContract, faFolderOpen, faTimesCircle } from '@fortawesome/free-solid-svg-icons'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FC } from 'react'
import { useTranslations } from './ClientProviders'

import { PreviewContainer } from './previews/Containers'
import { setStoredToken } from '../utils/protectedRouteHandler'

const Auth: FC<{ redirect: string }> = ({ redirect }) => {
  const router = useRouter()
  const t = useTranslations()
  const [token, setToken] = useState('')
  const [requesting, setRequesting] = useState(false)

  return (
    <PreviewContainer>
      <div className="mx-auto w-3/4">
        <div className="mx-auto w-52">
          <Image src="/images/fabulous-authentication.png" width={912} height={912} alt="authentication" priority />
        </div>

        <div className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">{t('Enter Password')}</div>

        <p className="py-1 text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('This route is password protected. Enter the password to view it.')}
        </p>

        <div className="my-4">
          <input
            className="w-full rounded border border-gray-300 bg-white p-2 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            autoFocus
            type="text"
            placeholder={t('Enter password here...')}
            value={token}
            onChange={e => {
              setToken(e.target.value)
            }}
            onKeyPress={e => {
              if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                setRequesting(true)
                setStoredToken(redirect, token)
                router.refresh()
              }
            }}
          />
        </div>

        <button
          className="w-full rounded bg-blue-600 py-2 font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/50 focus:outline-hidden disabled:cursor-not-allowed disabled:bg-gray-400"
          disabled={token === '' || requesting}
          onClick={() => {
            setRequesting(true)
            setStoredToken(redirect, token)
            router.refresh()
          }}
        >
          {requesting ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} spin /> <span className="ml-2">{t('Requesting...')}</span>
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faFolderOpen} /> <span className="ml-2">{t('Access')}</span>
            </>
          )}
        </button>

        <div className="my-4 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2 py-1">
            <FontAwesomeIcon icon={faFileContract} className="h-4 w-4" />
            <span>{t('Password will be stored in your browser using localStorage.')}</span>
          </div>
          <div className="flex items-center gap-2 py-1">
            <FontAwesomeIcon icon={faTimesCircle} className="h-4 w-4" />
            <span>{t('If you forgot the password, clear your browser cache and try again.')}</span>
          </div>
        </div>
      </div>
    </PreviewContainer>
  )
}

export default Auth
