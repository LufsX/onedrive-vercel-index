'use client'

import { createContext, useContext, useState, useSyncExternalStore, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { Check, Ellipsis } from 'lucide-react'
import { useTranslations } from '../ClientProviders'
import Dropdown from '../Dropdown'
import ActionHighlight from '../ActionHighlight'

export const PreviewToolbarTarget = createContext<HTMLElement | null>(null)

type ActionDetails = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  title?: string
}

export type PreviewAction = ActionDetails &
  (
    | { onSelect: () => void; selected?: boolean; disabled?: boolean; href?: never }
    | { href: string; onSelect?: never; selected?: never; disabled?: never }
  )

const actionClassName =
  'relative z-10 inline-flex cursor-pointer items-center justify-center gap-2 rounded px-2 py-1 text-sm whitespace-nowrap text-gray-600 transition-colors duration-150 hover:text-blue-700 active:bg-gray-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:text-blue-400 dark:active:bg-gray-600 aria-pressed:text-blue-700 dark:aria-pressed:text-blue-300 motion-reduce:transition-none'

function ActionContent({ action }: { action: PreviewAction }) {
  const Icon = action.icon
  return (
    <>
      <span aria-hidden="true" className="shrink-0">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span>{action.label}</span>
    </>
  )
}

function InlineActions({ actions, label }: { actions: readonly PreviewAction[]; label: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const selectedIndex = actions.findIndex(action => action.selected)

  return (
    <div
      role="group"
      aria-label={label}
      className="relative isolate flex items-center gap-1"
      onPointerLeave={() => setHoveredIndex(null)}
    >
      <ActionHighlight selectedIndex={hoveredIndex ?? focusedIndex ?? selectedIndex} />
      {actions.map((action, index) => {
        const props = {
          'data-action-index': index,
          title: action.title,
          className: actionClassName,
          onPointerEnter: () => setHoveredIndex(action.disabled ? null : index),
          onFocus: () => setFocusedIndex(index),
          onBlur: () => setFocusedIndex(null),
        }
        return action.href ? (
          <a key={action.id} {...props} href={action.href} target="_blank" rel="noopener noreferrer">
            <ActionContent action={action} />
          </a>
        ) : (
          <button
            key={action.id}
            {...props}
            type="button"
            aria-pressed={action.selected}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            <ActionContent action={action} />
          </button>
        )
      })}
    </div>
  )
}

const compactQuery = '(width < 48rem)'
const isCompact = () => window.matchMedia(compactQuery).matches
const serverCompact = () => false
const subscribeCompact = (notify: () => void) => {
  const media = window.matchMedia(compactQuery)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

export default function PreviewToolbar({ actions, label }: { actions: readonly PreviewAction[]; label?: string }) {
  const target = useContext(PreviewToolbarTarget)
  const compact = useSyncExternalStore(subscribeCompact, isCompact, serverCompact)
  const t = useTranslations()
  if (!target || actions.length === 0) return null

  return createPortal(
    compact ? (
      <div className="relative">
        <Dropdown
          role="menu"
          items={actions}
          selectedIndex={actions.findIndex(action => action.selected)}
          onSelect={action => action.onSelect?.()}
          itemHref={action => action.href}
          itemDisabled={action => action.disabled}
          triggerLabel={t('More')}
          triggerClassName="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-100 active:bg-gray-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600"
          trigger={
            <>
              <Ellipsis aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">{t('More')}</span>
            </>
          }
          panelClassName="absolute top-full right-0 z-20 mt-1 max-h-[60vh] w-max min-w-28 max-w-[calc(100vw-1rem)] overflow-y-auto rounded border border-gray-900/10 bg-white py-1 shadow-lg focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-900"
          itemClassName={action =>
            `flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-100 outline-hidden data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus:text-blue-700 dark:data-focus:text-blue-400 ${action.selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}`
          }
          renderItem={action => (
            <>
              <ActionContent action={action} />
              {actions.some(option => option.selected) && (
                <span className="ml-auto flex w-3.5 shrink-0 justify-center">
                  {action.selected && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
                </span>
              )}
            </>
          )}
        />
      </div>
    ) : (
      <InlineActions actions={actions} label={label ?? t('Preview actions')} />
    ),
    target,
  )
}
