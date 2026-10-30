'use client'

import { useClientConfig } from '../ClientConfigProvider'

import type { OdFileObject } from '../../types'
import { FC, useEffect, useRef, useState } from 'react'

import { Music } from 'lucide-react'
import { useTranslations } from '../ClientProviders'
import { usePathname } from 'next/navigation'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import { LoadingIcon } from '../Loading'
import { formatModifiedDateTime } from '../../utils/fileDetails'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import { decodePathSegment } from '../../utils/pathEncoding'

enum PlayerState {
  Loading,
  Ready,
  Playing,
  Paused,
  Error,
}

const AudioPlayer: FC<{ file: OdFileObject; audioUrl: string; thumbnail: string }> = ({
  file,
  audioUrl,
  thumbnail,
}) => {
  const t = useTranslations()
  const audioRef = useRef<HTMLAudioElement>(null)
  const { datetimeFormat } = useClientConfig().siteConfig
  const [playerStatus, setPlayerStatus] = useState(PlayerState.Loading)
  const [brokenThumbnail, setBrokenThumbnail] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      // Stop playback and cancel pending media requests when leaving this file.
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }, [])

  return (
    <>
      <PreviewContainer>
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex aspect-square w-full items-center justify-center rounded bg-gray-100 transition-all duration-75 md:w-48 dark:bg-gray-700">
            {playerStatus === PlayerState.Loading && (
              <div className="absolute z-20 flex h-full w-full items-center justify-center bg-white opacity-80 dark:bg-gray-800">
                <LoadingIcon className="z-10 inline-block h-5 w-5 animate-spin" />
              </div>
            )}

            {!brokenThumbnail ? (
              <div className="absolute m-4 aspect-square rounded-full shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={`h-full w-full rounded-full object-cover object-top ${
                    playerStatus === PlayerState.Playing ? 'animate-spin-slow' : ''
                  }`}
                  src={thumbnail}
                  alt={file.name}
                  onError={() => setBrokenThumbnail(true)}
                />
              </div>
            ) : (
              <Music className={`z-10 h-8 w-8 ${playerStatus === PlayerState.Playing ? 'animate-spin' : ''}`} />
            )}
          </div>

          <div className="flex w-full flex-col justify-between">
            <div>
              <div className="mb-2 font-medium">{file.name}</div>
              <div className="mb-4 text-sm text-gray-500">
                {t('Last modified:') + ' ' + formatModifiedDateTime(file.lastModifiedDateTime, datetimeFormat)}
              </div>
            </div>

            <audio
              className="h-11 w-full"
              src={audioUrl}
              ref={audioRef}
              controls
              preload="metadata"
              onLoadedMetadata={() => setPlayerStatus(PlayerState.Ready)}
              onCanPlay={event => setPlayerStatus(event.currentTarget.paused ? PlayerState.Ready : PlayerState.Playing)}
              onPlaying={() => setPlayerStatus(PlayerState.Playing)}
              onPause={() => setPlayerStatus(PlayerState.Paused)}
              onEnded={() => setPlayerStatus(PlayerState.Paused)}
              onSeeking={() => setPlayerStatus(PlayerState.Loading)}
              onSeeked={event => setPlayerStatus(event.currentTarget.paused ? PlayerState.Paused : PlayerState.Playing)}
              onWaiting={() => setPlayerStatus(PlayerState.Loading)}
              onError={() => setPlayerStatus(PlayerState.Error)}
            />
            {playerStatus === PlayerState.Error && (
              <p role="alert" className="mt-2 text-sm text-red-500">
                {t(
                  'Unable to play this media. The format may not be supported by your browser. Download it to play locally.',
                )}
              </p>
            )}
          </div>
        </div>
      </PreviewContainer>

      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

const AudioPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { protectedRoutes } = useClientConfig().siteConfig
  const pathname = usePathname()
  const hashedToken = getStoredToken(pathname, protectedRoutes)
  const params = new URLSearchParams({ path: pathname.split('/').map(decodePathSegment).join('/') })
  if (hashedToken) params.set('odpt', hashedToken)
  const audioUrl = '/api/raw?' + params
  const thumbnail = '/api/thumbnail?' + params + '&size=medium'

  return <AudioPlayer key={audioUrl} file={file} audioUrl={audioUrl} thumbnail={thumbnail} />
}

export default AudioPreview
