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
import { useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import ActionHighlight from './ActionHighlight'
import styles from './Dropdown.module.css'

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
  itemHref,
  itemDisabled,
  renderItem,
  anchor,
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
  itemHref?: (item: T) => string | undefined
  itemDisabled?: (item: T) => boolean | undefined
  renderItem: (item: T) => ReactNode
  anchor?: 'bottom start' | 'bottom end'
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
        anchor={anchor}
        transition
        modal={false}
        className={`${styles.panel} ${anchor ? 'z-[150] max-w-[calc(100vw-1rem)] [--anchor-gap:4px] [--anchor-padding:8px]' : ''} ${panelClassName}`}
        onPointerDownCapture={event => {
          pointerType.current = event.pointerType
        }}
        onPointerMoveCapture={event => {
          pointerType.current = event.pointerType
        }}
      >
        <ActionHighlight selectedIndex={selectedIndex} />
        {items.map((item, index) => {
          const props = {
            'data-action-index': index,
            className: `${styles.item} ${itemClassName(item)}`,
            onPointerMove: trackMouse,
            onPointerLeave: mousePointerOnly,
            onMouseMove: trackMouse,
            onMouseLeave: mouseOnly,
          }
          const href = itemHref?.(item)
          const disabled = itemDisabled?.(item)
          return role === 'menu' ? (
            <MenuItem
              as={href ? 'a' : 'button'}
              {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : { type: 'button' })}
              key={index}
              {...props}
              disabled={disabled}
              aria-current={index === selectedIndex ? 'true' : undefined}
              onClick={() => {
                if (!href) onSelect(item)
              }}
            >
              {renderItem(item)}
            </MenuItem>
          ) : (
            <ListboxOption as="button" type="button" key={index} {...props} value={index} disabled={disabled}>
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
