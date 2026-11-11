'use client'

import { CircleArrowDown, Copy, Ellipsis, Trash2, type LucideIcon } from 'lucide-react'
import type { OdFolderChildren } from '../../types'
import Dropdown from '../Dropdown'
import { canDeleteFile, useFileManager } from '../FileManager'
import { useTranslations } from '../ClientProviders'
import { uiRowIconButton } from '../uiStyles'
import useCopyLink from '../../utils/useCopyLink'
import { getBaseUrl } from '../../utils/getBaseUrl'
import { rawFileUrl } from '../../utils/rawFileUrl'

type Action = { label: string; icon: LucideIcon; run?: () => void; href?: string; disabled?: boolean; danger?: boolean }

export default function FileItemMenu({
  item,
  path,
  hashedToken,
  generating,
  onDownloadFolder,
}: {
  item: OdFolderChildren
  path: string
  hashedToken: string | null
  generating: boolean
  onDownloadFolder: () => void
}) {
  const t = useTranslations()
  const copyLink = useCopyLink()
  const manager = useFileManager()
  const url = item.folder ? path : rawFileUrl(path, hashedToken ? { odpt: hashedToken } : {})
  const actions: Action[] = [
    {
      label: t(item.folder ? 'Copy folder permalink' : 'Copy raw file permalink'),
      icon: Copy,
      run: () => {
        void copyLink(getBaseUrl() + url, t(item.folder ? 'Copied folder permalink.' : 'Copied raw file permalink.'))
      },
    },
    {
      label: t(item.folder ? 'Download folder' : 'Download file'),
      icon: CircleArrowDown,
      ...(item.folder ? { run: onDownloadFolder, disabled: generating } : { href: url }),
    },
  ]
  if (!item.folder && manager?.available && canDeleteFile(item)) {
    actions.push({
      label: t('Delete file'),
      icon: Trash2,
      danger: true,
      disabled: manager.busy,
      run: () => manager.deleteFile(item),
    })
  }
  return (
    <Dropdown
      role="menu"
      anchor="bottom end"
      items={actions}
      selectedIndex={-1}
      onSelect={action => action.run?.()}
      trigger={<Ellipsis className="h-4 w-4" />}
      triggerLabel={`${t('More')}: ${item.name}`}
      triggerClassName={uiRowIconButton}
      panelClassName="w-56 overflow-y-auto rounded border border-gray-400/30 bg-white py-1 shadow-lg dark:bg-gray-900 dark:shadow-none"
      itemHref={action => action.href}
      itemDisabled={action => action.disabled}
      itemClassName={action =>
        `flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm data-disabled:opacity-50 ${action.danger ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`
      }
      renderItem={action => (
        <>
          <action.icon className="h-4 w-4 shrink-0" />
          <span>{action.label}</span>
        </>
      )}
    />
  )
}
