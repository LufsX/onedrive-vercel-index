'use client'

import { useEffect } from 'react'

/**
 * Floating scrollbars for pointer devices.
 *
 * A native scrollbar reserves layout space as soon as its content overflows, so a
 * listing that finishes loading shifted the page sideways. This component removes
 * the native bars (see .overlay-scrollbar in globals.css) and paints a thumb in
 * viewport coordinates instead, which never takes part in the layout. The thumb
 * appears while hovering a scroll container or while it scrolls, and can be dragged.
 */

/** Idle delay before a visible thumb fades away. */
const IDLE_MS = 900
/** Thickness of the thumb and its distance from the container edge. */
const THICKNESS = 8
const INSET = 2
/** Short thumbs stay draggable without covering the content. */
const MIN_LENGTH = 24
/** Throttle for the pointer walk that resolves the hovered scroll container. */
const POINTER_INTERVAL_MS = 100

type Axis = 'y' | 'x'

const AXES: readonly Axis[] = ['y', 'x']

const overflowFor = (element: HTMLElement, axis: Axis) => {
  const style = getComputedStyle(element)
  return axis === 'y' ? style.overflowY : style.overflowX
}

const rangeFor = (element: HTMLElement, axis: Axis) =>
  axis === 'y' ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth

// 'overflow: hidden' boxes still overflow internally, so only real scroll containers qualify.
const isScrollable = (element: HTMLElement, axis: Axis) =>
  rangeFor(element, axis) > 1 &&
  (element === document.scrollingElement || /^(auto|scroll|overlay)$/.test(overflowFor(element, axis)))

const scrollableAxes = (element: HTMLElement) => AXES.filter(axis => isScrollable(element, axis))

const metrics = (container: HTMLElement, axis: Axis) => {
  const viewport = axis === 'y' ? container.clientHeight : container.clientWidth
  const total = axis === 'y' ? container.scrollHeight : container.scrollWidth
  const offset = axis === 'y' ? container.scrollTop : container.scrollLeft
  const maxScroll = Math.max(0, total - viewport)
  const length = Math.max(MIN_LENGTH, Math.round((viewport / total) * viewport))
  const travel = viewport - length
  const progress = maxScroll > 0 ? Math.min(1, Math.max(0, offset / maxScroll)) : 0
  return { viewport, maxScroll, length, travel, start: Math.round(progress * travel) }
}

export default function OverlayScrollbars() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return

    const thumbs = AXES.map(axis => {
      const element = document.createElement('div')
      element.className = 'overlay-scrollbar'
      element.dataset.axis = axis
      element.setAttribute('aria-hidden', 'true')
      return { axis, element }
    })

    let current: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let dragging = false
    let lastPointerCheck = 0

    const place = ({ axis, element }: (typeof thumbs)[number], container: HTMLElement) => {
      // The root element's box starts at the top of the document, so its own box
      // cannot be used; the scrollport is the viewport.
      const rect =
        container === document.scrollingElement
          ? { top: 0, left: 0, right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight }
          : container.getBoundingClientRect()
      const { length, start } = metrics(container, axis)
      if (axis === 'y') {
        element.style.width = `${THICKNESS}px`
        element.style.height = `${length}px`
        element.style.transform = `translate3d(${rect.right - THICKNESS - INSET}px, ${rect.top + start}px, 0)`
      } else {
        element.style.width = `${length}px`
        element.style.height = `${THICKNESS}px`
        element.style.transform = `translate3d(${rect.left + start}px, ${rect.bottom - THICKNESS - INSET}px, 0)`
      }
    }

    const hide = () => {
      if (dragging) return
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      current = null
      thumbs.forEach(({ element }) => element.removeAttribute('data-visible'))
    }

    const show = (container: HTMLElement) => {
      const axes = scrollableAxes(container)
      if (!axes.length) {
        hide()
        return
      }

      current = container
      thumbs.forEach(tracked => {
        if (!axes.includes(tracked.axis)) {
          tracked.element.removeAttribute('data-visible')
          return
        }
        if (!tracked.element.isConnected) document.body.appendChild(tracked.element)
        place(tracked, container)
        tracked.element.setAttribute('data-visible', '')
      })

      if (timer) clearTimeout(timer)
      timer = setTimeout(hide, IDLE_MS)
    }

    const nearestScrollable = (node: HTMLElement | null): HTMLElement | null => {
      let element: HTMLElement | null = node
      while (element) {
        if (scrollableAxes(element).length) return element
        element = element.parentElement
      }
      // The document itself scrolls, so hovering anywhere still reveals the page thumb.
      const root = document.scrollingElement
      return root instanceof HTMLElement && scrollableAxes(root).length ? root : null
    }

    const isThumb = (target: EventTarget | null) =>
      target instanceof Node && thumbs.some(({ element }) => element === target || element.contains(target))

    const onScroll = (event: Event) => {
      if (dragging) return
      const container = event.target === document ? document.scrollingElement : event.target
      if (container instanceof HTMLElement) show(container)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (dragging || isThumb(event.target)) return
      const now = Date.now()
      if (now - lastPointerCheck < POINTER_INTERVAL_MS) return
      lastPointerCheck = now
      const container = event.target instanceof HTMLElement ? nearestScrollable(event.target) : null
      if (container) show(container)
      else hide()
    }

    thumbs.forEach(({ axis, element }) => {
      element.addEventListener('pointerdown', event => {
        if (!current || event.button !== 0) return
        event.preventDefault()

        const container = current
        const startPointer = axis === 'y' ? event.clientY : event.clientX
        const startOffset = axis === 'y' ? container.scrollTop : container.scrollLeft
        const { travel, maxScroll } = metrics(container, axis)

        dragging = true
        element.setAttribute('data-dragging', '')
        element.setPointerCapture(event.pointerId)

        const move = (moveEvent: PointerEvent) => {
          if (travel <= 0) return
          const delta = (axis === 'y' ? moveEvent.clientY : moveEvent.clientX) - startPointer
          const next = startOffset + (delta / travel) * maxScroll
          if (axis === 'y') container.scrollTop = next
          else container.scrollLeft = next
        }
        const release = () => {
          dragging = false
          element.removeAttribute('data-dragging')
          element.removeEventListener('pointermove', move)
          element.removeEventListener('pointerup', release)
          element.removeEventListener('pointercancel', release)
        }

        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', release)
        element.addEventListener('pointercancel', release)
      })
    })

    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('resize', hide)

    return () => {
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', hide)
      if (timer) clearTimeout(timer)
      thumbs.forEach(({ element }) => element.remove())
    }
  }, [])

  return null
}
