'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

// The panel stays mounted while it fades out, so this matches the leave animation in globals.css.
const CLOSE_MS = 90

// Shared keyboard, dismissal and animation behavior for the two single-choice switches.
export default function Dropdown<T>({
  role,
  items,
  selectedIndex,
  onSelect,
  trigger,
  triggerClassName,
  triggerLabel,
  panelClassName,
  itemClassName,
  renderItem,
}: {
  role: 'listbox' | 'menu'
  items: readonly T[]
  selectedIndex: number
  onSelect: (item: T) => void
  trigger: ReactNode
  triggerClassName: string
  triggerLabel?: string
  panelClassName: string
  itemClassName: (item: T) => string
  renderItem: (item: T) => ReactNode
}) {
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed')
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openingFocus = useRef<'first' | 'last' | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const open = state === 'open'

  const openPanel = useCallback(() => {
    clearTimeout(closeTimer.current)
    setState('open')
  }, [])

  // A click that lands outside the panel must not pull focus back out of whatever was clicked.
  const close = useCallback((restoreFocus = true) => {
    clearTimeout(closeTimer.current)
    setState(current => (current === 'closed' ? current : 'closing'))
    closeTimer.current = setTimeout(() => {
      setState('closed')
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
    }, CLOSE_MS)
  }, [])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (state !== 'open') return

    const options = panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"], [role="menuitem"]')
    const focusIndex =
      openingFocus.current === 'first'
        ? 0
        : openingFocus.current === 'last'
          ? (options?.length ?? 1) - 1
          : Math.max(0, selectedIndex)
    options?.[focusIndex]?.focus({ preventScroll: true })
    openingFocus.current = null
  }, [state, selectedIndex])

  useEffect(() => {
    if (state === 'closed') return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [state, close])

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`group ${triggerClassName}`}
        aria-label={triggerLabel}
        aria-haspopup={role}
        aria-expanded={open}
        aria-controls={state === 'closed' ? undefined : id + '-panel'}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={event => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            openingFocus.current = event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : null
            openPanel()
          } else if (event.key === 'Escape' && state !== 'closed') {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
        }}
      >
        {trigger}
      </button>
      {state !== 'closed' && (
        <div
          ref={panelRef}
          id={id + '-panel'}
          role={role}
          aria-labelledby={id}
          data-state={state}
          className={`dropdown-panel ${panelClassName}`}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
              return
            }
            if (event.key === 'Tab') {
              close()
              return
            }
            const options = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"], [role="menuitem"]'),
            )
            const index = options.indexOf(document.activeElement as HTMLButtonElement)
            let next: number
            switch (event.key) {
              case 'ArrowDown':
                next = (index + 1) % options.length
                break
              case 'ArrowUp':
                next = (index - 1 + options.length) % options.length
                break
              case 'Home':
                next = 0
                break
              case 'End':
                next = options.length - 1
                break
              default:
                return
            }
            event.preventDefault()
            options[next]?.focus()
          }}
        >
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              role={role === 'listbox' ? 'option' : 'menuitem'}
              aria-selected={role === 'listbox' ? index === selectedIndex : undefined}
              tabIndex={-1}
              className={itemClassName(item)}
              onPointerMove={event => event.currentTarget.focus({ preventScroll: true })}
              onClick={() => {
                close()
                onSelect(item)
              }}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
