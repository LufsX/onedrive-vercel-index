'use client'

import type { OdFileObject } from '../../types'

import { FC, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

import { FontAwesomeIcon } from '../Icon'
import { faCopy } from '@fortawesome/free-regular-svg-icons'
import { faDownload, faFileDownload, faPen } from '@fortawesome/free-solid-svg-icons'
import { useTranslations } from '../ClientProviders'

import toast from 'react-hot-toast'
import { useClipboard } from 'use-clipboard-copy'

import { getBaseUrl } from '../../utils/getBaseUrl'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import { decodePathSegment } from '../../utils/pathEncoding'
import { getFileIcon } from '../../utils/getFileIcon'
import { formatModifiedDateTime, humanFileSize } from '../../utils/fileDetails'

import { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import CustomEmbedLinkMenu from '../CustomEmbedLinkMenu'

const VideoPlayer: FC<{ src: string }> = ({ src }) => {
  const t = useTranslations()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    return () => {
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [])

  return (
    <div className="mb-4">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-h-[70vh] w-full"
        onError={() => setFailed(true)}
      />
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {t(
            'Unable to play this media. The format may not be supported by your browser. Download it to play locally.',
          )}
        </p>
      )}
    </div>
  )
}

const VideoPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const pathname = usePathname()
  const hashedToken = getStoredToken(pathname)
  const clipboard = useClipboard()

  const [menuOpen, setMenuOpen] = useState(false)
  const t = useTranslations()
  const params = new URLSearchParams({ path: pathname.split('/').map(decodePathSegment).join('/') })
  if (hashedToken) params.set('odpt', hashedToken)
  const videoUrl = '/api/raw/?' + params
  const directUrl = getBaseUrl() + videoUrl

  return (
    <>
      <CustomEmbedLinkMenu path={pathname} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <PreviewContainer>
        <VideoPlayer key={videoUrl} src={videoUrl} />
        <div className="items-center px-5 py-4 md:flex md:gap-8">
          <div className="rounded-lg border border-gray-900/10 px-8 py-20 text-center dark:border-gray-500/30">
            <FontAwesomeIcon icon={getFileIcon(file.name, { video: Boolean(file.video) })} />
            <div className="mt-6 line-clamp-3 text-sm font-medium md:w-28">{file.name}</div>
          </div>

          <div className="flex flex-col gap-2 py-4 md:flex-1">
            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('Last modified')}</div>
              <div>{formatModifiedDateTime(file.lastModifiedDateTime)}</div>
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
              <table className="block w-full overflow-scroll text-sm whitespace-nowrap md:table">
                <tbody>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      Quick XOR
                    </td>
                    <td className="px-3 py-1 font-mono whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {file.file?.hashes?.quickXorHash ?? t('Unavailable')}
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      SHA1
                    </td>
                    <td className="px-3 py-1 font-mono whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {file.file?.hashes?.sha1Hash ?? t('Unavailable')}
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td className="bg-gray-50 px-3 py-1 text-left text-xs font-medium tracking-wider text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400">
                      SHA256
                    </td>
                    <td className="px-3 py-1 font-mono whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {file.file?.hashes?.sha256Hash ?? t('Unavailable')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PreviewContainer>

      <DownloadBtnContainer>
        <div className="flex flex-wrap justify-center gap-2">
          <DownloadButton
            onClickCallback={() => window.open(videoUrl)}
            btnColor="blue"
            btnText={t('Download')}
            btnIcon={faFileDownload}
          />
          <DownloadButton
            onClickCallback={() => window.open(`https://cors.isteed.cc/${directUrl}`)}
            btnColor="teal"
            btnText={t('Proxy download')}
            btnIcon={faDownload}
            btnTitle={t('Download the file through Cloudflare Serverless proxy.')}
          />
          <DownloadButton
            onClickCallback={() => {
              clipboard.copy(directUrl)
              toast.success(t('Copied direct link to clipboard.'))
            }}
            btnColor="pink"
            btnText={t('Copy direct link')}
            btnIcon={faCopy}
          />
          <DownloadButton
            onClickCallback={() => setMenuOpen(true)}
            btnColor="teal"
            btnText={t('Customise link')}
            btnIcon={faPen}
          />

          <DownloadButton
            onClickCallback={() => window.open(`filebox://play?url=${encodeURIComponent(directUrl)}`)}
            btnText="Filebar"
            btnImage="/players/filebar.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`iina://weblink?url=${encodeURIComponent(directUrl)}`)}
            btnText="IINA"
            btnImage="/players/iina.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`vlc://${directUrl}`)}
            btnText="VLC"
            btnImage="/players/vlc.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`potplayer://${directUrl}`)}
            btnText="PotPlayer"
            btnImage="/players/potplayer.png"
          />
          <DownloadButton
            onClickCallback={() =>
              window.open(
                directUrl.replace(/^https?:/, protocol => (protocol === 'https:' ? 'nplayer-https:' : 'nplayer-http:')),
              )
            }
            btnText="nPlayer"
            btnImage="/players/nplayer.png"
          />
        </div>
      </DownloadBtnContainer>
    </>
  )
}

export default VideoPreview
