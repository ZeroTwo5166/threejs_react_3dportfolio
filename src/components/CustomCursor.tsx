import { useEffect, useRef } from 'react'

// Elements that make the cursor shrink to its "interactive" size.
const HOVER_SELECTOR = 'button, [role="button"], a, input[type="range"]'

const SIZE_DEFAULT = 100
const SIZE_HOVER = 30
const EASE = 0.3 // per-frame lerp factor toward the target size

// ── Store: lets non-DOM code (R3F pointer events) drive the hover state ────
let hoverCount = 0
let notify: ((hovering: boolean) => void) | null = null

// Normalized device coords (-1..1) of the last mousemove, for non-DOM code
// (e.g. Avatar's head-follow-cursor) that needs pointer position without
// subscribing to React state. Only populated on fine-pointer devices — see
// onMove below — so touch devices correctly report "no pointer".
let ndcX = 0
let ndcY = 0
let ndcSeen = false

export const cursorStore = {
  setHover(hovering: boolean) {
    // Counted, not boolean: overlapping hover sources (a DOM link on top of
    // a 3D object) won't flicker each other off.
    hoverCount = Math.max(0, hoverCount + (hovering ? 1 : -1))
    notify?.(hoverCount > 0)
  },
  getNDC(): { x: number; y: number } | null {
    return ndcSeen ? { x: ndcX, y: ndcY } : null
  },
}

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const finePointer =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches

  useEffect(() => {
    if (!finePointer) return
    const cursor = cursorRef.current
    if (!cursor) return

    let mouseX = -SIZE_DEFAULT // park off-screen until the mouse moves
    let mouseY = -SIZE_DEFAULT
    let currentSize = SIZE_DEFAULT
    let targetSize = SIZE_DEFAULT
    let frame = 0
    let seen = false

    const render = () => {
      currentSize += (targetSize - currentSize) * EASE
      cursor.style.width = `${currentSize}px`
      cursor.style.height = `${currentSize}px`
      cursor.style.transform = `translate(${mouseX - currentSize / 2}px, ${
        mouseY - currentSize / 2
      }px)`

      // Keep animating only while the size is still settling.
      if (Math.abs(targetSize - currentSize) > 0.1) {
        frame = requestAnimationFrame(render)
      } else {
        frame = 0
      }
    }

    const kick = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      ndcX = (e.clientX / window.innerWidth) * 2 - 1
      ndcY = -(e.clientY / window.innerHeight) * 2 + 1
      ndcSeen = true
      if (!seen) {
        seen = true
        cursor.style.opacity = '1'
      }
      // Reposition immediately every move; size settles via rAF.
      render()
    }

    // Delegated hover: one pair of listeners for the whole document.
    const onOver = (e: Event) => {
      const t = e.target as Element | null
      if (t?.closest(HOVER_SELECTOR)) cursorStore.setHover(true)
    }
    const onOut = (e: Event) => {
      const t = e.target as Element | null
      if (t?.closest(HOVER_SELECTOR)) cursorStore.setHover(false)
    }

    notify = (hovering) => {
      targetSize = hovering ? SIZE_HOVER : SIZE_DEFAULT
      kick()
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)

    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      notify = null
      hoverCount = 0
      ndcSeen = false
      if (frame) cancelAnimationFrame(frame)
    }
  }, [finePointer])

  if (!finePointer) return null

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: SIZE_DEFAULT,
        height: SIZE_DEFAULT,
        zIndex: 99999,
        pointerEvents: 'none',
        borderRadius: '50%',
        backgroundColor: 'white',
        mixBlendMode: 'difference',
        opacity: 0, // revealed on first mousemove
        willChange: 'transform, width, height',
      }}
    />
  )
}