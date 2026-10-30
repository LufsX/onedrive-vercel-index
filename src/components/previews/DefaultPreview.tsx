'use client'

import { useClientConfig } from '../ClientConfigProvider'

import type { OdFileObject } from '../../types'
import { FC } from 'react'

import { useTranslations } from '../ClientProviders'

import { formatModifiedDateTime, humanFileSize } from '../../utils/fileDetails'
import FileIcon from '../FileIcon'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const DefaultPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { datetimeFormat } = useClientConfig().siteConfig
  const t = useTranslations()

  return (
    <div>
      <PreviewContainer>
        <div className="items-center px-5 py-4 md:flex md:gap-8">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-gray-900/10 bg-gray-50 px-4 py-14 dark:border-gray-500/30 dark:bg-gray-800">
            <FileIcon name={file.name} video={Boolean(file.video)} className="h-14 w-14" />
            <div className="text-center text-sm font-medium break-words md:w-40">{file.name}</div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 py-4 md:flex-1">
            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('Last modified')}</div>
              <div>{formatModifiedDateTime(file.lastModifiedDateTime, datetimeFormat)}</div>
            </div>

            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('File size')}</div>
              <div>{humanFileSize(file.size)}</div>
            </div>

            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('MIME type')}</div>
              <div>{file.file?.mimeType ?? t('Unavailable')}</div>
            </div>

            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('Hashes')}</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      Quick XOR
                    </td>
                    <td className="px-3 py-1 font-mono break-all text-gray-500 dark:text-gray-400">
                      {file.file.hashes?.quickXorHash ?? t('Unavailable')}
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      SHA1
                    </td>
                    <td className="px-3 py-1 font-mono break-all text-gray-500 dark:text-gray-400">
                      {file.file.hashes?.sha1Hash ?? t('Unavailable')}
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      SHA256
                    </td>
                    <td className="px-3 py-1 font-mono break-all text-gray-500 dark:text-gray-400">
                      {file.file.hashes?.sha256Hash ?? t('Unavailable')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PreviewContainer>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default DefaultPreview
