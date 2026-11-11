'use client'

import { useClientConfig } from './ClientConfigProvider'

import { Dispatch, SetStateAction, useRef, useState } from 'react'
import { useTranslations } from './ClientProviders'
import { Description } from '@headlessui/react'
import { Check, Copy } from 'lucide-react'
import useClipboard from '../utils/useClipboard'

import AppDialog from './AppDialog'
import { uiFieldLabel, uiIconButton, uiInput } from './uiStyles'
import { getBaseUrl } from '../utils/getBaseUrl'
import { getStoredToken } from '../utils/protectedRouteHandler'
import { getReadablePath } from '../utils/getReadablePath'

function LinkContainer({ title, value }: { title: string; value: string }) {
  const t = useTranslations()
  const clipboard = useClipboard({ copiedTimeout: 1000 })
  const text = useRef<HTMLTextAreaElement>(null)
  return (
    <>
      <h4 className="mb-1 text-xs font-medium tracking-wider uppercase">{title}</h4>
      <div className="mb-3 flex items-center gap-2 rounded border border-gray-400/20 bg-gray-50 p-2 font-mono dark:bg-gray-800">
        <textarea
          ref={text}
          readOnly
          aria-label={title}
          rows={2}
          value={value}
          className="max-h-24 min-w-0 flex-1 resize-none bg-transparent text-xs break-all opacity-80 focus-visible:outline-2 focus-visible:outline-blue-400"
          onFocus={event => event.currentTarget.select()}
        />
        <button
          type="button"
          aria-label={`${t('Copy direct link')}: ${title}`}
          disabled={clipboard.status === 'copying'}
          onClick={async () => {
            if (!(await clipboard.copy(value))) {
              text.current?.focus()
              text.current?.select()
            }
          }}
          className={`${uiIconButton} bg-gray-100 dark:bg-gray-800`}
        >
          {clipboard.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {clipboard.status === 'error' && (
        <p role="alert" className="mb-3 text-xs text-red-500 dark:text-red-400">
          {t('Could not copy the link. Copy it manually below.')}
        </p>
      )}
    </>
  )
}

export default function CustomEmbedLinkMenu({
  path,
  menuOpen,
  setMenuOpen,
}: {
  path: string
  menuOpen: boolean
  setMenuOpen: Dispatch<SetStateAction<boolean>>
}) {
  const t = useTranslations()

  const { protectedRoutes } = useClientConfig().siteConfig
  const hashedToken = getStoredToken(path, protectedRoutes)

  const focusInputRef = useRef<HTMLInputElement>(null)
  const closeMenu = () => setMenuOpen(false)

  const readablePath = getReadablePath(path)
  const filename = readablePath.substring(readablePath.lastIndexOf('/') + 1)
  const [name, setName] = useState(filename)

  return (
    <AppDialog
      open={menuOpen}
      onClose={closeMenu}
      title={t('Customise direct link')}
      size="lg"
      initialFocus={focusInputRef}
    >
      <Description as="p" className="mb-3 text-gray-600 dark:text-gray-300">
        {t('Change the raw file direct link to a URL ending with the extension of the file.')}{' '}
        <a
          href="https://ovi.swo.moe/docs/features/customise-direct-link"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline"
        >
          {t('What is this?')}
        </a>
      </Description>

      <label className={uiFieldLabel}>
        {t('Filename')}
        <input
          className={`${uiInput} mt-1 mb-3 w-full font-mono`}
          ref={focusInputRef}
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </label>

      <LinkContainer
        title={t('Default')}
        value={`${getBaseUrl()}/api/raw?path=${readablePath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
      />
      <LinkContainer
        title={t('URL encoded')}
        value={`${getBaseUrl()}/api/raw?path=${path}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
      />
      <LinkContainer
        title={t('Customised')}
        value={`${getBaseUrl()}/api/name/${name}?path=${readablePath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
      />
      <LinkContainer
        title={t('Customised and encoded')}
        value={`${getBaseUrl()}/api/name/${name}?path=${path}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
      />
    </AppDialog>
  )
}
