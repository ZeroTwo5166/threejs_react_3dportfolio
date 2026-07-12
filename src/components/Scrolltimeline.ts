// Scrolltimeline.ts
//
// ── The one rule of this project ─────────────────────────────────────────
// Every scroll beat is defined in SCREENS (multiples of 100vh), and the
// page layout is sized in vh from the SAME constants. No pixel reference
// viewport, no scale factor, no clamping — a phone and a 4K monitor both
// take the same number of "screens" of scrolling to reach each beat.
//
// Mobile safety: JS converts screens → pixels using what CSS `100vh`
// actually resolves to (measured with a probe), NOT window.innerHeight.
// On mobile, 100vh is the *large* viewport (URL bar hidden) and never
// changes while scrolling, so the timeline can never rescale mid-scroll.

import { useEffect, useState } from 'react'

// ── Timeline beats, in screens ────────────────────────────────────────────
export const TL = {
  CHAIR_END: 2.5,

  HEAD_FOLLOW_START: 2.7,

  TURN_START: 2.8,
  TURN_END: 3.6,

  WALK_START: 3.7,
  WALK_END: 4.6,

  JUMP_START: 4.6,
  JUMP_END: 5.5,

  // Where the NEXT section's top reaches the top of the viewport —
  // slightly after JUMP_END so the landing is visible before new content
  // pins. The runway spacer height derives from this (runwayHeightVh).
  NEXT_SECTION_PIN: 5.6,
} as const

export function runwayHeightVh(): string {
  return `${(TL.NEXT_SECTION_PIN - 1) * 100}vh`
}

// ── Measure what CSS 100vh resolves to ───────────────────────────────────
let cachedVh: number | null = null

export function getVhPixels(): number {
  if (typeof window === 'undefined' || !document.body) return 900
  if (cachedVh !== null) return cachedVh
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none;'
  document.body.appendChild(probe)
  cachedVh = probe.offsetHeight || window.innerHeight
  probe.remove()
  return cachedVh
}

export function useViewportUnit(): number {
  const [vh, setVh] = useState<number>(getVhPixels)

  useEffect(() => {
    setVh(getVhPixels()) // in case initial state ran pre-mount

    const onResize = () => {
      cachedVh = null
      const next = getVhPixels()
      setVh((prev) => (prev === next ? prev : next))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  return vh
}

// ── Per-frame helpers (call inside useFrame — no React state involved) ───

export function scrollScreens(vhPx?: number): number {
  return window.scrollY / (vhPx || getVhPixels())
}

export function progress(s: number, start: number, end: number): number {
  if (end <= start) return s >= end ? 1 : 0
  return Math.min(Math.max((s - start) / (end - start), 0), 1)
}

export type AvatarPhaseName =
  | 'typing'
  | 'sitToStand'
  | 'standing'
  | 'turning'
  | 'walking'
  | 'jumping'
  | 'landed'

export interface AvatarPhase {
  phase: AvatarPhaseName
  p: number // 0→1 progress within the phase
}

export function avatarPhase(s: number): AvatarPhase {
  if (s <= 0) return { phase: 'typing', p: 0 }
  if (s <= TL.CHAIR_END) {
    // Stand-up plays over the last 28% of the chair phase (the original
    // tuning: standProgress kicked in at chairProgress 0.72).
    const chairP = s / TL.CHAIR_END
    const standP = chairP >= 0.72 ? (chairP - 0.72) / 0.28 : 0
    return { phase: 'sitToStand', p: standP }
  }
  if (s <= TL.TURN_START) return { phase: 'standing', p: 1 }
  if (s <= TL.TURN_END) return { phase: 'turning', p: progress(s, TL.TURN_START, TL.TURN_END) }
  if (s <= TL.WALK_END) return { phase: 'walking', p: progress(s, TL.WALK_START, TL.WALK_END) }
  if (s <= TL.JUMP_END) return { phase: 'jumping', p: progress(s, TL.JUMP_START, TL.JUMP_END) }
  return { phase: 'landed', p: 1 }
}