'use client'

import type { OdFolderChildren } from '../../types'
import { FC, MouseEventHandler, useEffect, useRef } from 'react'
import emojiRegex from 'emoji-regex'
import { getRawExtension } from '../../utils/getFileIcon'
import FileIcon from '../FileIcon'
import { LoadingIcon } from '../Loading'

// Render the icon of a folder child (may be a file or a folder), use emoji if the name of the child contains emoji
const renderEmoji = (name: string) => {
  const emoji = emojiRegex().exec(name)
  return { render: emoji && !emoji.index, emoji }
}
const formatChildName = (name: string) => {
  const { render, emoji } = renderEmoji(name)
  return render ? name.replace(emoji ? emoji[0] : '', '').trim() : name
}
export const ChildName: FC<{ name: string; folder?: boolean }> = ({ name, folder }) => {
  const original = formatChildName(name)
  const extension = folder ? '' : getRawExtension(original)
  const prename = folder ? original : original.substring(0, original.length - extension.length)
  return (
    <span className="truncate before:float-right before:content-[attr(data-tail)]" data-tail={extension}>
      {prename}
    </span>
  )
}
export const ChildIcon: FC<{ child: OdFolderChildren }> = ({ child }) => {
  const { render, emoji } = renderEmoji(child.name)
  return render ? (
    <span>{emoji ? emoji[0] : '📁'}</span>
  ) : (
    <FileIcon name={child.name} folder={Boolean(child.folder)} video={Boolean(child.video)} className="h-4 w-4" />
  )
}

export const Checkbox: FC<{
  checked: 0 | 1 | 2
  onChange: () => void
  title: string
  indeterminate?: boolean
}> = ({ checked, onChange, title, indeterminate }) => {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      if (indeterminate) {
        ref.current.indeterminate = checked == 1
      }
    }
  }, [ref, checked, indeterminate])

  const handleClick: MouseEventHandler = e => {
    if (ref.current) {
      if (e.target === ref.current) {
        e.stopPropagation()
      } else {
        ref.current.click()
      }
    }
  }

  return (
    <span
      title={title}
      className="inline-flex cursor-pointer items-center rounded p-1.5 hover:bg-gray-300 dark:hover:bg-gray-600"
      onClick={handleClick}
    >
      <input
        className="form-check-input cursor-pointer"
        type="checkbox"
        checked={Boolean(checked)}
        ref={ref}
        aria-label={title}
        onChange={onChange}
      />
    </span>
  )
}

export const Downloading: FC<{ title: string; style: string }> = ({ title, style }) => {
  return (
    <span title={title} className={`${style} rounded`} role="status">
      <LoadingIcon className="inline-block h-4 w-4 animate-spin align-middle" />
    </span>
  )
}
