'use client'

import Image from 'next/image'

import { RichText } from './RichText'
import { useTranslations } from './ClientProviders'

const FourOhFour: React.FC<{ errorMsg: string }> = ({ errorMsg }) => {
  const t = useTranslations()

  return (
    <div className="my-12">
      <div className="mx-auto w-1/3">
        <Image src="/images/fabulous-rip-2.png" alt="404" width={912} height={912} preload />
      </div>
      <div className="mx-auto mt-6 max-w-xl text-gray-500">
        <div className="mb-8 text-xl font-bold">
          <RichText
            text={t("Oops, that's a <1>four-oh-four</1>.")}
            tags={{ '1': <span className="underline decoration-red-500 decoration-wavy" /> }}
          />
        </div>
        <div className="mb-4 overflow-hidden rounded border border-gray-400/20 bg-gray-50 p-2 font-mono text-xs break-all dark:bg-gray-800">
          {errorMsg}
        </div>
        <div className="text-sm">
          <RichText
            text={t(
              'Press <2>F12</2> and open devtools for more details, or seek help at <6>onedrive-vercel-index discussions</6>.',
            )}
            tags={{
              '2': (
                <kbd className="rounded border border-gray-400/20 bg-gray-100 px-1 font-mono text-xs dark:bg-gray-800" />
              ),
              '6': (
                <a
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                  href="https://github.com/LufsX/onedrive-vercel-index/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default FourOhFour
