'use client'

import Image from 'next/image'
import { useTranslations } from './ClientProviders'

const FourOhFour: React.FC<{ errorMsg: string }> = ({ errorMsg }) => {
  const t = useTranslations()

  return (
    <div className="my-12 flex flex-col items-center justify-center">
      <div className="mx-auto w-48 md:w-64">
        <Image src="/images/fabulous-page-not-found.png" width={912} height={912} alt="404" priority />
      </div>
      <div className="mt-6 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t("Oops, that's a 404.")}
      </div>
      <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
        {t("The requested path doesn't exist. Double check your URL.")}
      </div>
      {errorMsg && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-mono">{errorMsg}</p>
        </div>
      )}
    </div>
  )
}

export default FourOhFour
