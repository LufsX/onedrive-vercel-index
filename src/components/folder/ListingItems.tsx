'use client'

import type { OdFolderChildren } from '../../types'
import { FC, useEffect, useRef } from 'react'
import { Check, Minus } from 'lucide-react'
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
  disabled?: boolean
}> = ({ checked, onChange, title, indeterminate, disabled = false }) => {
  const ref = useRef<HTMLInputElement>(null)
  const mixed = Boolean(indeterminate && checked === 1)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed
  }, [checked, mixed])

  return (
    <label
      title={title}
      className="relative inline-flex cursor-pointer items-center justify-center rounded p-1.5 text-white transition-colors duration-150 hover:bg-gray-100 has-disabled:cursor-not-allowed has-disabled:opacity-50 has-disabled:hover:bg-transparent motion-reduce:transition-none dark:hover:bg-gray-800"
      onClick={event => event.stopPropagation()}
    >
      <input
        className="m-0 h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-[3px] border border-gray-400/70 bg-white transition-colors duration-150 checked:border-blue-600 checked:bg-blue-600 indeterminate:border-blue-600 indeterminate:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed motion-reduce:transition-none dark:border-gray-500 dark:bg-gray-900 dark:checked:border-blue-500 dark:checked:bg-blue-500 dark:indeterminate:border-blue-500 dark:indeterminate:bg-blue-500 dark:focus-visible:ring-offset-gray-900 forced-colors:appearance-auto"
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        ref={ref}
        aria-label={title}
        onChange={onChange}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center forced-colors:hidden"
      >
        {mixed ? (
          <Minus className="h-2.5 w-2.5" strokeWidth={3} />
        ) : checked !== 0 ? (
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        ) : null}
      </span>
    </label>
  )
}

export const Downloading: FC<{ title: string; style: string }> = ({ title, style }) => {
  return (
    <span title={title} className={`${style} rounded`} role="status">
      <LoadingIcon className="inline-block h-4 w-4 animate-spin align-middle" />
    </span>
  )
}
