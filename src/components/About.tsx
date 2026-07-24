import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { techStore, type SystemLabel } from './TechStore'
import { TL } from './Scrolltimeline'
import { MOBILE } from './Avatar'
import { BlackHole } from './Blackhole'

type SystemRow = {
  label: SystemLabel
  value: string
  status: string
}

const SYSTEMS: SystemRow[] = [
  { label: 'CORE', value: 'C# · .NET', status: 'PRIMARY' },
  { label: 'FRONTEND', value: 'Angular · Next.js · React', status: 'ONLINE' },
  { label: 'DATA CORE', value: 'MS SQL Server', status: 'STABLE' },
  { label: 'RUNTIME', value: 'Node.js · Linux', status: 'ONLINE' },
  { label: 'VISUALS', value: 'Three.js / R3F', status: 'ACTIVE' },
]

// Single source of truth: the timeline defines the section height in
// screens; the pod's enter/exit lockstep in Avatar.tsx depends on this
// exact value, so it must never be edited here independently.
const ABOUT_HEIGHT_VH = TL.ABOUT_HEIGHT_SCREENS * 100

// ── Small-screen scaling (matches Avatar.tsx's SMALL_SCREEN.breakpoint) ───
// Below this width the pod itself starts shrinking/repositioning (see
// SMALL_SCREEN in Avatar.tsx). The panel scales down slightly in lockstep
// so neither element dominates the shrinking viewport. Keep this value in
// sync with Avatar.tsx's SMALL_SCREEN.breakpoint if that ever changes.
const SMALL_SCREEN_BREAKPOINT = 2200
const SMALL_SCREEN_ABOUT_SCALE = 0.85

// ── Mobile stacked-layout sizing ─────────────────────────────────────────
// Panel scale applied by the ≤1000px media query below. Referenced in TS
// too (fit check), so it's defined once here and injected into the CSS.
const MOBILE_ABOUT_SCALE = 0.72

// Fraction of the viewport the pod band claims on mobile, derived from the
// same MOBILE constants Avatar.tsx positions the pod with:
// top gap above the pod + the pod's max height + a little breathing room.
const MOBILE_POD_BAND_FRAC = (1 - MOBILE.topNdc) / 2 + MOBILE.heightFrac + 0.06

// Matches the 2.5vh bottom padding on .about-sticky in the media query.
const MOBILE_BOTTOM_PAD_FRAC = 0.025

export const About = () => {
  const panelRef = useRef<HTMLDivElement>(null)
  const bioRef = useRef<HTMLParagraphElement>(null)
  const [visible, setVisible] = useState(false)

  // ── Height-aware bio ────────────────────────────────────────────────────
  // On short mobile viewports the pod (top) + full panel (bottom) may not
  // fit in one column. When that happens the Bio paragraph collapses.
  const [hideBio, setHideBio] = useState(false)
  const hideBioRef = useRef(false)          // mirror for measurement (no stale closure)
  const bioNaturalHeight = useRef(0)        // unscaled px, incl. margin-bottom

  // Which system row is toggled on (or null). Subscribing through
  // useSyncExternalStore keeps this in lockstep with the shared store
  // that Avatar.tsx reads inside the Canvas.
  const selected = useSyncExternalStore(techStore.subscribe, techStore.getSelected)

  // ── Responsive scaling ──
  const aboutScale = 1

  useEffect(() => {
    const el = panelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Toggle both ways so the reveal replays every time the panel
        // scrolls into view, from above or below, and resets when it
        // leaves so it's ready to animate again on the next pass.
        setVisible(entry.isIntersecting)

        // If the panel scrolls out of view, drop any active highlight so
        // the orbit doesn't stay dimmed with no visible explanation.
        if (!entry.isIntersecting) techStore.clear()
      },
      { threshold: 0.35 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── Fit check: hide the bio when pod + panel can't share the column ────
  // Strategy: always test the panel's WITH-bio height against the space
  // below the pod band. Because the tested quantity never changes when the
  // bio is hidden (its stored height is added back in), the decision is
  // stable — no show/hide flicker at the threshold.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const check = () => {
      if (window.innerWidth > MOBILE.breakpoint) {
        hideBioRef.current = false
        setHideBio(false)
        return
      }

      // Record the bio's natural (untransformed) height whenever it's in
      // the DOM, so the test can keep accounting for it once hidden.
      const bio = bioRef.current
      if (bio && bio.offsetHeight > 0) {
        const mb = parseFloat(getComputedStyle(bio).marginBottom || '0')
        bioNaturalHeight.current = bio.offsetHeight + mb
      }

      // offsetHeight ignores CSS transforms → natural size; apply the
      // effective scale ourselves before comparing against real pixels.
      const effScale = aboutScale * MOBILE_ABOUT_SCALE
      const fullNaturalH =
        panel.offsetHeight + (hideBioRef.current ? bioNaturalHeight.current : 0)

      const availablePx =
        window.innerHeight * (1 - MOBILE_POD_BAND_FRAC - MOBILE_BOTTOM_PAD_FRAC)

      const shouldHide = fullNaturalH * effScale > availablePx
      hideBioRef.current = shouldHide
      setHideBio(shouldHide)
    }

    check()

    // Re-check when the panel's content reflows (fonts, wrapping) and on
    // any viewport change. The toggle itself resizes the panel and re-fires
    // the observer, but the with-bio test converges to the same answer.
    const ro = new ResizeObserver(check)
    ro.observe(panel)
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return (
    <div
      id="about"
      style={{
        height: `${ABOUT_HEIGHT_VH}vh`,
        position: 'relative',
        zIndex: 5, // LAYERS OVER HOME HTML
      }}
    >
      {/* Drifting black hole — scoped to this section only. The layer is
          position:absolute inside #about (which is position:relative), so
          it's clipped to About's bounds and scrolls with it. z-index 0
          keeps it behind the sticky panel (z-index 1 below). */}
      <BlackHole />

      {/* Layout lives in the .about-sticky class (not inline) so the
          ≤1000px media query below can restack it: pod on top, panel
          below, no overlap. */}
      <div className="about-sticky">
        {/* ─── Scaling wrapper for the About panel ───
            aboutScale multiplies with --about-responsive-scale,
            which the media queries below drop below 1. transform-origin
            is also a variable so the shrunken panel stays pinned to the
            bottom edge on mobile instead of floating up. */}
        <div
          style={{
            transform: `scale(calc(${aboutScale} * var(--about-responsive-scale, 1)))`,
            transformOrigin: 'var(--about-scale-origin, top left)',
            pointerEvents: 'none', // let clicks pass to the panel
          }}
        >
          <div
            ref={panelRef}
            className="about-panel"
            style={{
              pointerEvents: 'auto',
              width: 'var(--about-panel-width)',
              maxWidth: 'var(--about-panel-max-width)',
              color: 'white',
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
              background: 'linear-gradient(160deg, rgba(10,16,32,0.72), rgba(10,16,32,0.35))',
              border: '1px solid rgba(0,247,255,0.18)',
              borderRadius: 'var(--about-panel-radius)',
              padding: 'var(--about-panel-padding-y) var(--about-panel-padding-x)',
              marginTop: 'var(--about-panel-margin-top)',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 0 40px rgba(0,247,255,0.06)',
              boxSizing: 'border-box',
            }}
          >
            {/* Eyebrow */}
            <div
              className={`about-reveal ${visible ? 'is-visible' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--about-gap-xs)',
                marginBottom: 'var(--about-gap-sm)',
                transitionDelay: '0ms',
              }}
            >
              <span
                style={{
                  width: '0.6rem',
                  height: '0.6rem',
                  borderRadius: '50%',
                  background: '#00f7ff',
                  boxShadow: '0 0 10px #00f7ff',
                  animation: 'twinklePulse 2s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#00f7ff',
                }}
              >
                Unit 001 — Status: Active
              </span>
            </div>

            {/* Headline */}
            <h2
              className={`about-reveal ${visible ? 'is-visible' : ''}`}
              style={{
                fontSize: '2.6rem',
                fontWeight: 800,
                margin: '0 0 0.4rem 0',
                lineHeight: 1.15,
                color: '#ffffff',
                transitionDelay: '80ms',
              }}
            >
              C# developer.
              <br />
              Fluent across the stack.
            </h2>

            <p
              className={`about-reveal ${visible ? 'is-visible' : ''}`}
              style={{
                fontSize: '0.88rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
                margin: '0 0 var(--about-gap-md) 0',
                transitionDelay: '160ms',
              }}
            >
              Rank: Mid-level · Mission: ship software
            </p>

            {/* Bio — collapses on short mobile viewports (see fit check) */}
            <p
              ref={bioRef}
              className={`about-reveal about-bio ${visible ? 'is-visible' : ''} ${
                hideBio ? 'about-bio-hidden' : ''
              }`}
              style={{
                fontSize: '1.15rem',
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.75)',
                margin: '0 0 var(--about-gap-lg) 0',
                transitionDelay: '240ms',
              }}
            >
              My home base is C# and .NET — building APIs and business logic
              backed by SQL Server. From there I reach across the stack:
              shipping frontends in React, Next.js, and Angular, running
              services on Node and Ubuntu, and pushing pixels in Three.js when
              a project deserves a third dimension. The modules in orbit are
              the tools I fly daily.
            </p>

            {/* Systems readout — each row is a toggle that focuses its
                logo(s) in the tech orbit around the stasis pod. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--about-gap-xs)' }}>
              {SYSTEMS.map((s, i) => {
                const isActive = selected === s.label
                const isDimmed = selected !== null && !isActive

                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => techStore.toggle(s.label)}
                    aria-pressed={isActive}
                    className={`about-reveal about-row ${visible ? 'is-visible' : ''} ${
                      isDimmed ? 'is-dimmed' : ''
                    }`}
                    style={{
                      font: 'inherit',
                      textAlign: 'left',
                      width: '100%',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      rowGap: '0.15rem',
                      columnGap: 'var(--about-row-gap)',
                      padding: 'var(--about-row-padding-y) var(--about-row-padding-x)',
                      borderRadius: 'var(--about-row-radius)',
                      boxSizing: 'border-box',
                      background: isActive
                        ? 'rgba(0,247,255,0.16)'
                        : 'rgba(0,247,255,0.05)',
                      border: isActive
                        ? '1px solid rgba(0,247,255,0.55)'
                        : '1px solid rgba(0,247,255,0.1)',
                      boxShadow: isActive
                        ? '0 0 18px rgba(0,247,255,0.18)'
                        : 'none',
                      transitionDelay: `${320 + i * 90}ms`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        color: '#00f7ff',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.98rem',
                        color: isActive
                          ? 'rgba(255,255,255,0.95)'
                          : 'rgba(255,255,255,0.72)',
                        textAlign: 'right',
                        flex: '1 1 auto',
                        minWidth: '6rem',
                        overflowWrap: 'break-word',
                      }}
                    >
                      {s.value}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        color: isActive ? '#00f7ff' : '#39ff9c',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      ● {isActive ? 'FOCUSED' : s.status}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Hint line so the interaction is discoverable */}
            <p
              className={`about-reveal ${visible ? 'is-visible' : ''}`}
              style={{
                fontSize: '0.75rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.3)',
                margin: 'var(--about-gap-md) 0 0 0',
                transitionDelay: `${320 + SYSTEMS.length * 90}ms`,
              }}
            >
              ▸ Select a system to lock its module in orbit
            </p>
          </div>
        </div>
      </div>

      <style>{`
        /* ── Static sizing tokens ──────────────────────────────────────────
            All values are now fixed; the panel no longer scales with the viewport. */
        .about-panel {
          --about-panel-width: 29rem;
          --about-panel-max-width: 29rem;
          --about-panel-padding-y: 2.1rem;
          --about-panel-padding-x: 1.9rem;
          --about-panel-margin-top: 10vh;
          --about-panel-radius: 0.95rem;

          --about-gap-xs: 0.7rem;
          --about-gap-sm: 0.95rem;
          --about-gap-md: 1.25rem;
          --about-gap-lg: 1.4rem;

          --about-row-gap: 0.75rem;
          --about-row-padding-y: 0.65rem;
          --about-row-padding-x: 0.85rem;
          --about-row-radius: 0.5rem;
        }

        /* Sticky viewport for the panel. Default (desktop): vertically
           centered, left-aligned. Moved out of inline styles so the
           mobile media query can restack it. z-index 1 keeps the panel
           above the section-scoped BlackHole layer (z-index 0). */
        .about-sticky {
          position: sticky;
          top: 0;
          height: 100vh;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          padding: 0 0 0 6vw;
          pointer-events: none;
          box-sizing: border-box;
        }

        /* Collapsed bio (short mobile viewports — toggled from TS) */
        .about-bio-hidden {
          display: none;
        }

        /* ── Small-screen scale-down (≤2200px) ────────────────────────────
           Matches the width at which Avatar.tsx starts shrinking/repositioning
           the pod (SMALL_SCREEN.breakpoint). The panel scales down slightly
           in lockstep so it doesn't dominate a shrinking pod/viewport.
           Must come BEFORE the mobile (≤1000px) block below so mobile's
           stronger scale-down wins at narrower widths. */
        @media (max-width: ${SMALL_SCREEN_BREAKPOINT}px) {
          #about {
            --about-responsive-scale: ${SMALL_SCREEN_ABOUT_SCALE};
          }
        }

        /* ── Stacked mobile layout (≤1000px) ──────────────────────────────
           Avatar.tsx shrinks the stasis pod and anchors it to the TOP of
           the viewport at this same breakpoint (MOBILE.breakpoint = 1000).
           Here the panel scales down further and anchors BOTTOM-CENTER, so
           the pod and the content stack vertically instead of overlapping. */
        @media (max-width: ${MOBILE.breakpoint}px) {
          #about {
            --about-responsive-scale: ${MOBILE_ABOUT_SCALE};
            --about-scale-origin: bottom center;
          }
          .about-sticky {
            align-items: flex-end;      /* panel drops to the bottom half */
            justify-content: center;    /* centered under the pod */
            padding: 0 4vw ${MOBILE_BOTTOM_PAD_FRAC * 100}vh;
          }
          .about-panel {
            --about-panel-width: min(27rem, 92vw);
            --about-panel-max-width: 92vw;
            --about-panel-margin-top: 0;
          }
        }

        @keyframes twinklePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        /* Base state: text/eyebrow/bio rise in from below with a fade. */
        .about-reveal {
          opacity: 0;
          transform: translateY(1.1rem);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                      background 0.25s ease,
                      border-color 0.25s ease,
                      box-shadow 0.25s ease;
        }
        .about-reveal.is-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* System rows slide in from the left instead, so the readout
           feels like it's booting up line by line. */
        .about-row {
          transform: translateX(-0.875rem);
        }
        .about-row.is-visible {
          transform: translateX(0);
        }
        .about-row:hover {
          background: rgba(0,247,255,0.12) !important;
          border-color: rgba(0,247,255,0.35) !important;
        }
        .about-row:focus-visible {
          outline: 2px solid rgba(0,247,255,0.7);
          outline-offset: 2px;
        }

        /* When another system is focused, non-active rows fade back.
           Three classes so this wins over .about-reveal.is-visible
           without touching the boot-up reveal animation. */
        .about-row.is-dimmed.is-visible {
          opacity: 0.45;
        }

        @media (prefers-reduced-motion: reduce) {
          #about * { animation: none !important; }
          .about-reveal, .about-row {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  )
}