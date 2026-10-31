'use client'

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react'
import { useLayoutEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import styles from './Dropdown.module.css'

// Follow the accessible active descendant without moving DOM focus or adding a background to every row.
function ActiveHighlight({ selectedIndex }: { selectedIndex: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const highlight = ref.current
    const panel = highlight?.parentElement
    if (!highlight || !panel) return

    const update = () => {
      const activeId = panel.getAttribute('aria-activedescendant')
      const active = activeId ? panel.ownerDocument.getElementById(activeId) : null
      const item =
        active && panel.contains(active)
          ? active
          : panel.querySelector<HTMLElement>(`[data-dropdown-index="${selectedIndex}"]`)

      if (!item || !panel.clientWidth) {
        highlight.removeAttribute('data-ready')
        return
      }

      // Offsets stay in the panel's coordinate space while the panel itself scales on entry/exit.
      highlight.style.width = `${Math.max(0, item.offsetWidth - 8)}px`
      highlight.style.height = `${item.offsetHeight}px`
      highlight.style.transform = `translate3d(${item.offsetLeft + 4 - panel.scrollLeft}px, ${item.offsetTop - panel.scrollTop}px, 0)`
      highlight.setAttribute('data-ready', '')
    }

    update()
    const activeObserver = new MutationObserver(update)
    activeObserver.observe(panel, { attributes: true, attributeFilter: ['aria-activedescendant'] })
    const sizeObserver = new ResizeObserver(update)
    sizeObserver.observe(panel)
    panel.querySelectorAll<HTMLElement>('[data-dropdown-index]').forEach(item => sizeObserver.observe(item))
    panel.addEventListener('scroll', update, { passive: true })
    return () => {
      activeObserver.disconnect()
      sizeObserver.disconnect()
      panel.removeEventListener('scroll', update)
    }
  }, [selectedIndex])

  return <span ref={ref} aria-hidden="true" className={`${styles.highlight} bg-blue-50 dark:bg-blue-600/10`} />
}

// Headless UI owns keyboard navigation, outside dismissal, focus restoration and transition cleanup.
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
  const pointerType = useRef('mouse')
  const pointerPosition = useRef<{ x: number; y: number } | null>(null)
  const Button = role === 'menu' ? MenuButton : ListboxButton
  const Panel = role === 'menu' ? MenuItems : ListboxOptions

  // Keep coordinates across rows and keyboard navigation; per-row pointer-enter events can reset them.
  const trackMouse = (event: MouseEvent<HTMLElement>) => {
    // Compatibility MouseEvents truncate the subpixel coordinates reported by PointerEvents.
    const x = Math.trunc(event.screenX)
    const y = Math.trunc(event.screenY)
    const previous = pointerPosition.current
    if (pointerType.current !== 'mouse' || (previous?.x === x && previous.y === y)) {
      event.preventDefault()
      return
    }
    pointerPosition.current = { x, y }
  }
  const mousePointerOnly = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') event.preventDefault()
  }
  const mouseOnly = (event: MouseEvent<HTMLElement>) => {
    if (pointerType.current !== 'mouse') event.preventDefault()
  }

  const content = (
    <>
      <Button type="button" aria-label={triggerLabel} className={`group ${styles.trigger} ${triggerClassName}`}>
        {trigger}
      </Button>
      <Panel
        transition
        modal={false}
        className={`${styles.panel} ${panelClassName}`}
        onPointerDownCapture={event => {
          pointerType.current = event.pointerType
        }}
        onPointerMoveCapture={event => {
          pointerType.current = event.pointerType
        }}
      >
        <ActiveHighlight selectedIndex={selectedIndex} />
        {items.map((item, index) => {
          const props = {
            'data-dropdown-index': index,
            className: `${styles.item} ${itemClassName(item)}`,
            onPointerMove: trackMouse,
            onPointerLeave: mousePointerOnly,
            onMouseMove: trackMouse,
            onMouseLeave: mouseOnly,
          }
          return role === 'menu' ? (
            <MenuItem
              as="button"
              type="button"
              key={index}
              {...props}
              aria-current={index === selectedIndex ? 'true' : undefined}
              onClick={() => onSelect(item)}
            >
              {renderItem(item)}
            </MenuItem>
          ) : (
            <ListboxOption as="button" type="button" key={index} {...props} value={index}>
              {renderItem(item)}
            </ListboxOption>
          )
        })}
      </Panel>
    </>
  )

  return role === 'menu' ? (
    <Menu>{content}</Menu>
  ) : (
    <Listbox value={selectedIndex} onChange={index => onSelect(items[index])}>
      {content}
    </Listbox>
  )
}
