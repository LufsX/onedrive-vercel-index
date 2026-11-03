'use client'

import { useLayoutEffect, useRef } from 'react'
import styles from './ActionHighlight.module.css'

export default function ActionHighlight({ selectedIndex }: { selectedIndex: number }) {
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
          : panel.querySelector<HTMLElement>(`[data-action-index="${selectedIndex}"]`)

      if (!item || !panel.clientWidth) {
        highlight.removeAttribute('data-ready')
        return
      }

      // Offsets stay in the panel's coordinate space during its entry/exit animation.
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
    panel.querySelectorAll<HTMLElement>('[data-action-index]').forEach(item => sizeObserver.observe(item))
    panel.addEventListener('scroll', update, { passive: true })
    return () => {
      activeObserver.disconnect()
      sizeObserver.disconnect()
      panel.removeEventListener('scroll', update)
    }
  }, [selectedIndex])

  return <span ref={ref} aria-hidden="true" className={`${styles.highlight} bg-blue-50 dark:bg-blue-600/10`} />
}
