import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'

import Image from 'next/image'
import { useRouter } from 'next/router'
import { FC, useState } from 'react'
import { useTranslation } from 'next-i18next/pages'

import { matchProtectedRoute } from '../utils/protectedRouteHandler'
import useLocalStorage from '../utils/useLocalStorage'

const Auth: FC<{ redirect: string }> = ({ redirect }) => {
  const authTokenPath = matchProtectedRoute(redirect)

  const router = useRouter()
  const [token, setToken] = useState('')
  const [, setPersistedToken] = useLocalStorage(authTokenPath, '')

  const { t } = useTranslation()

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 md:my-10">
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
          className="flex-1 rounded-lg border border-gray-900/10 bg-white p-2.5 font-mono shadow-sm transition-shadow focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 dark:border-gray-500/20 dark:bg-gray-800 dark:text-white dark:focus:ring-blue-400/50"
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
              router.reload()
            }
          }}
        />
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
          onClick={() => {
            setPersistedToken(token)
            router.reload()
          }}
          title='Enter'
        >
          <FontAwesomeIcon icon={faArrowRight} />
        </button>
      </div>
    </div>
  )
}

export default Auth
