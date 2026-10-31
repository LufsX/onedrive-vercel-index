'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import styles from './HoverSurface.module.css'

/** The item background and circular pointer glow move without re-rendering file items. */
export default function HoverSurface({ children, className = '' }: { children: ReactNode; className?: string }) {
  const surface = useRef<HTMLDivElement>(null)
  const highlight = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = surface.current
    const layer = highlight.current
    const background = backdrop.current
    if (!root || !layer || !background) return

    let pointer: { x: number; y: number; item: Element } | null = null
    let frame = 0
    let positioned = false

    const draw = () => {
      frame = 0
      if (!pointer || !pointer.item.isConnected) {
        layer.dataset.visible = 'false'
        background.dataset.visible = 'false'
        return
      }

      const bounds = root.getBoundingClientRect()
      const item = pointer.item.getBoundingClientRect()
      if (!positioned) {
        layer.dataset.instant = 'true'
        background.dataset.instant = 'true'
      }
      background.style.setProperty('--item-x', `${item.left - bounds.left - root.clientLeft + root.scrollLeft}px`)
      background.style.setProperty('--item-y', `${item.top - bounds.top - root.clientTop + root.scrollTop}px`)
      background.style.setProperty('--item-width', `${item.width}px`)
      background.style.setProperty('--item-height', `${item.height}px`)
      layer.style.setProperty('--pointer-x', `${pointer.x - item.left}px`)
      layer.style.setProperty('--pointer-y', `${pointer.y - item.top}px`)
      if (!positioned) {
        layer.getBoundingClientRect()
        background.getBoundingClientRect()
        layer.dataset.instant = 'false'
        background.dataset.instant = 'false'
        positioned = true
      }
      layer.dataset.visible = 'true'
      background.dataset.visible = 'true'
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const item = event.target instanceof Element ? event.target.closest('[data-hover-item]') : null
      pointer = item && root.contains(item) ? { x: event.clientX, y: event.clientY, item } : null
      schedule()
    }

    const hide = () => {
      pointer = null
      schedule()
    }

    root.addEventListener('pointermove', onPointerMove)
    root.addEventListener('pointerleave', hide)
    root.addEventListener('pointercancel', hide)
    window.addEventListener('scroll', hide, { capture: true, passive: true })
    window.addEventListener('blur', hide)
    const resize = new ResizeObserver(hide)
    resize.observe(root)

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerleave', hide)
      root.removeEventListener('pointercancel', hide)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  return (
    <div ref={surface} className={`${styles.surface} ${className}`}>
      <div ref={backdrop} aria-hidden="true" data-hover-backdrop data-visible="false" className={styles.backdrop}>
        <div ref={highlight} data-hover-highlight data-visible="false" className={styles.highlight} />
      </div>
      {children}
    </div>
  )
}
