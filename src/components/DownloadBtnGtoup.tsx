'use client'

import toast, { Toaster } from 'react-hot-toast'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faArrowAltCircleDown } from '@fortawesome/free-regular-svg-icons'
import type { IconProp } from '@fortawesome/fontawesome-svg-core'

import Image from 'next/image'
import { useTranslations } from './ClientProviders'
import { MouseEventHandler } from 'react'

import { getBaseUrl } from '../utils/getBaseUrl'
import { getStoredToken } from '../utils/protectedRouteHandler'

export const DownloadButton = ({
  onClickCallback,
  btnColor,
  btnText,
  btnIcon,
  btnImage,
  btnTitle,
}: {
  onClickCallback: MouseEventHandler<HTMLButtonElement>
  btnColor?: string
  btnText: string
  btnIcon?: IconProp
  btnImage?: string
  btnTitle?: string
}) => {
  const btnStyleMap = (btnColor?: string) => {
    const colorMap: Record<string, string> = {
      gray: 'hover:text-gray-600 dark:hover:text-white focus:ring-gray-200 focus:text-gray-600 dark:focus:text-white border-gray-300 dark:border-gray-500 dark:focus:ring-gray-500',
      blue: 'hover:text-blue-600 focus:ring-blue-200 focus:text-blue-600 border-blue-300 dark:border-blue-700 dark:focus:ring-blue-500',
      teal: 'hover:text-teal-600 focus:ring-teal-200 focus:text-teal-600 border-teal-300 dark:border-teal-700 dark:focus:ring-teal-500',
      red: 'hover:text-red-600 focus:ring-red-200 focus:text-red-600 border-red-300 dark:border-red-700 dark:focus:ring-red-500',
      green:
        'hover:text-green-600 focus:ring-green-200 focus:text-green-600 border-green-300 dark:border-green-700 dark:focus:ring-green-500',
      pink: 'hover:text-pink-600 focus:ring-pink-200 focus:text-pink-600 border-pink-300 dark:border-pink-700 dark:focus:ring-pink-500',
      yellow:
        'hover:text-yellow-400 focus:ring-yellow-100 focus:text-yellow-400 border-yellow-300 dark:border-yellow-400 dark:focus:ring-yellow-300',
    }

    return btnColor && btnColor in colorMap ? colorMap[btnColor] : colorMap.gray
  }

  return (
    <button
      className={`flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100/10 focus:z-10 focus:ring-2 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-900 ${btnStyleMap(
        btnColor,
      )}`}
      title={btnTitle}
      onClick={onClickCallback}
    >
      {btnIcon && <FontAwesomeIcon icon={btnIcon} />}
      {btnImage && <Image src={btnImage} alt={btnImage} width={20} height={20} priority />}
      <span>{btnText}</span>
    </button>
  )
}

const DownloadButtonGroup: React.FC<{ downloadUrl: string; path: string }> = ({ downloadUrl, path }) => {
  const t = useTranslations()
  const hashedToken = getStoredToken(path)

  const handleDownload = () => {
    const segments = path.split('/')
    const fileName = segments[segments.length - 1]

    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = fileName
    link.click()
  }

  const handleCopyLink = () => {
    const url = `${getBaseUrl()}/api/raw?path=${path}${hashedToken ? `&odpt=${hashedToken}` : ''}`
    navigator.clipboard.writeText(url)
    toast.success(t('Copied download link to clipboard'))
  }

  return (
    <>
      <Toaster />
      <div className="flex flex-wrap gap-2">
        <DownloadButton
          onClickCallback={handleDownload}
          btnIcon={faArrowAltCircleDown}
          btnText={t('Download')}
          btnColor="blue"
        />
        <DownloadButton onClickCallback={handleCopyLink} btnIcon={faCopy} btnText={t('Copy Link')} btnColor="gray" />
      </div>
    </>
  )
}

export default DownloadButtonGroup
