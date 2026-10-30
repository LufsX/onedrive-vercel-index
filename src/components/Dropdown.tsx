'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

// Shared keyboard and dismissal behavior for the two single-choice switches.
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
  const [open, setOpen] = useState(false)
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openingFocus = useRef<'first' | 'last' | null>(null)

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    const options = panel?.querySelectorAll<HTMLButtonElement>('[role="option"], [role="menuitem"]')
    const focusIndex =
      openingFocus.current === 'first'
        ? 0
        : openingFocus.current === 'last'
          ? (options?.length ?? 1) - 1
          : Math.max(0, selectedIndex)
    options?.[focusIndex]?.focus({ preventScroll: true })
    openingFocus.current = null

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel?.contains(target) && !triggerRef.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, selectedIndex])

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup={role}
        aria-expanded={open}
        aria-controls={open ? id + '-panel' : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={event => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            openingFocus.current = event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : null
            setOpen(true)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={id + '-panel'}
          role={role}
          aria-labelledby={id}
          className={panelClassName}
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
