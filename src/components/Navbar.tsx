import React, { useEffect, useRef, useState } from 'react'

type Theme = 'cream' | 'blue' | 'violet' | 'teal'
type SectionId = 'about' | 'projects' | 'contact'

const SECTION_IDS: SectionId[] = ['about', 'projects', 'contact']

// Per-theme palette. 'violet' mirrors the accent Projects.tsx uses
// (ACCENT = '#c084fc', BG = '#0d0a12') and 'teal' mirrors Contact.tsx
// (ACCENT = '#4fe3b5', BG = '#0a1210), so the navbar matches whichever
// section you've scrolled into. 'accentRgb' is the same color as
// comma-separated channels, for building rgba() strings at various alphas.
const THEME_COLORS: Record<
  Theme,
  { accent: string; accentRgb: string; isLight: boolean; bg: string; border: string; boxShadow: string }
> = {
  cream: {
    accent: '#d6a77a',
    accentRgb: '214,167,122',
    isLight: true,
    bg: 'rgba(244,237,225,0.55)',
    border: 'rgba(0,0,0,0.06)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
  },
  blue: {
    accent: '#7eb8f7',
    accentRgb: '126,184,247',
    isLight: false,
    bg: 'rgba(10,18,32,0.55)',
    border: 'rgba(126,184,247,0.15)',
    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
  },
  violet: {
    accent: '#c084fc',
    accentRgb: '192,132,252',
    isLight: false,
    bg: 'rgba(13,10,18,0.55)', // same base as Projects.tsx's BG (#0d0a12)
    border: 'rgba(192,132,252,0.15)',
    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
  },
  teal: {
    accent: '#4fe3b5',
    accentRgb: '79,227,181',
    isLight: false,
    bg: 'rgba(10,18,16,0.55)', // same base as Contact.tsx's BG (#0a1210)
    border: 'rgba(79,227,181,0.15)',
    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
  },
}

type NavbarProps = {
  // Currently unused — kept for signature compatibility with App.tsx.
  timeline?: unknown
}

export function getMaxScroll() {
  if (typeof window === 'undefined') return 0
  const doc = document.documentElement
  return Math.max(0, doc.scrollHeight - window.innerHeight)
}

export const Navbar = ({ timeline: _timeline }: NavbarProps) => {
  const [theme, setTheme] = useState<Theme>('cream')
  const [active, setActive] = useState<SectionId | null>(null)
  const [soundOn, setSoundOn] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [hoveredPill, setHoveredPill] = useState<SectionId | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const hideSliderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onScroll = () => {
      const about = document.getElementById('about')
      const projects = document.getElementById('projects')
      const contact = document.getElementById('contact')

      // Precedence: teal (contact) > violet (projects) > blue (about) >
      // cream (hero/default). Checked in document order so whichever
      // section you've scrolled into furthest wins.
      let nextTheme: Theme = 'cream'
      if (about && about.getBoundingClientRect().top <= 200) {
        nextTheme = 'blue'
      }
      if (projects && projects.getBoundingClientRect().top <= 200) {
        nextTheme = 'violet'
      }
      if (contact && contact.getBoundingClientRect().top <= 200) {
        nextTheme = 'teal'
      }
      setTheme(nextTheme)

      // Determine which section is currently in view
      let current: SectionId | null = null
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        // Section counts as "active" once its top has scrolled past this offset
        if (rect.top <= 200) {
          current = id
        }
      }
      setActive(current)
    }

    onScroll()

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Clear any pending slider-hide timer on unmount.
  useEffect(
    () => () => {
      if (hideSliderTimeout.current) clearTimeout(hideSliderTimeout.current)
    },
    []
  )

  // Custom constant-speed scroll animation, shared by ALL nav pills
  // (about, projects, and contact all scroll the same way now).
  // Pass the raw target scrollY position (e.g. el.offsetTop).
  const animatedScrollTo = (targetTop: number) => {
    const currentPosition = window.scrollY
    const targetPosition = Math.min(targetTop, getMaxScroll())
    const distance = targetPosition - currentPosition

    // Already there (or close enough) — nothing to animate, and this also
    // avoids a divide-by-zero below that produced NaN → scrollTo(0, NaN),
    // which browsers coerce to 0 (i.e. snaps to the very top of the page).
    // This is what caused clicking an already-active nav pill a second
    // time to jump back to the top instead of staying put.
    if (Math.abs(distance) < 1) return

    // Adjust this value to control speed (pixels per second)
    const speed = 2000
    const duration = (Math.abs(distance) / speed) * 1000

    let startTime: number | null = null

    const animation = (currentTime: number) => {
      if (startTime === null) startTime = currentTime
      const timeElapsed = currentTime - startTime
      const progress = Math.min(timeElapsed / duration, 1)
      window.scrollTo(0, currentPosition + distance * progress)
      if (timeElapsed < duration) requestAnimationFrame(animation)
    }

    requestAnimationFrame(animation)
  }

  // Custom smooth scroll function with constant speed (scroll-to-top)
  const smoothScrollToTop = () => {
    const currentPosition = window.scrollY
    const targetPosition = 0
    const distance = targetPosition - currentPosition

    // Already at the top — nothing to animate, and this also avoids the
    // same divide-by-zero/NaN issue described in animatedScrollTo above.
    if (Math.abs(distance) < 1) return

    // Adjust this value to control speed (pixels per second)
    // Higher = faster, Lower = slower
    const speed = 2000 // pixels per second

    // Calculate duration based on distance and speed
    const duration = (Math.abs(distance) / speed) * 1000

    let startTime: number | null = null

    const animation = (currentTime: number) => {
      if (startTime === null) startTime = currentTime
      const timeElapsed = currentTime - startTime
      const progress = Math.min(timeElapsed / duration, 1)

      // Linear easing - constant speed throughout
      const ease = progress

      window.scrollTo(0, currentPosition + distance * ease)

      if (timeElapsed < duration) {
        requestAnimationFrame(animation)
      }
    }

    requestAnimationFrame(animation)
  }

  const toggleSound = () => {
    setSoundOn((prev) => {
      const next = !prev

      if (audioRef.current) {
        if (next) {
          audioRef.current.volume = volume
          audioRef.current.play().catch(() => {
            // Handle autoplay restrictions
          })
          // Auto-show slider when turning sound on
          setShowVolumeSlider(true)
        } else {
          audioRef.current.pause()
          // Hide slider when sound is turned off
          setShowVolumeSlider(false)
        }
      }

      return next
    })
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)

    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const handleMouseEnter = () => {
    // Only show slider if sound is on
    if (!soundOn) return

    if (hideSliderTimeout.current) {
      clearTimeout(hideSliderTimeout.current)
    }
    setShowVolumeSlider(true)
  }

  const handleMouseLeave = () => {
    hideSliderTimeout.current = setTimeout(() => {
      setShowVolumeSlider(false)
    }, 300) // Small delay to prevent flickering
  }

  return (
    <>
      <audio ref={audioRef} src="/lofiMusic.mp3" loop />

      <style>{`
        @media (max-width: 500px) {
          .navbar-center-container {
            display: none !important;
          }
        }

        /* Range-input thumb styling. Pseudo-elements can't be expressed in
           inline styles, so the old '&::-webkit-slider-thumb' keys in the
           styles object silently did nothing — this class actually applies
           them. Theme is passed via CSS variables set on the input. */
        .navbar-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--thumb-bg);
          border: 2px solid white;
          box-shadow: var(--thumb-shadow);
          transition: all 0.2s ease;
        }
        .navbar-volume-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--thumb-bg);
          border: 2px solid white;
          box-shadow: var(--thumb-shadow);
          transition: all 0.2s ease;
        }
      `}</style>

      {/* WRAPPER */}
      <div style={styles.wrapper}>
        {/* LEFT: FUTURISTIC LOGO */}
        <div
          style={styles.logoWrapper}
          onClick={smoothScrollToTop}
          role="button"
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              smoothScrollToTop()
            }
          }}
          aria-label="Scroll to top"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={styles.logoIcon(theme)}
          >
            <rect x="4" y="4" width="16" height="16" rx="2" transform="rotate(45 12 12)" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 5 L12 19 M5 12 L19 12" strokeWidth="1" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </div>

        {/* CENTER: NAV LINKS & ENERGY */}
        <div className="navbar-center-container" style={styles.navContainer}>
          <div style={styles.energy(theme)} />
          <nav style={styles.nav(theme)}>
            <div style={styles.center}>
              {SECTION_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    // All sections scroll the same way: constant-speed
                    // animation to the section's top.
                    const target = document.getElementById(id)
                    if (target) animatedScrollTo(target.offsetTop)
                    setActive(id)
                  }}
                  onMouseEnter={() => setHoveredPill(id)}
                  onMouseLeave={() => setHoveredPill(null)}
                  style={styles.pill(active === id, hoveredPill === id, theme)}
                >
                  {id}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {/* RIGHT: SOUND */}
        <div
          style={styles.soundWrapper}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div style={styles.soundGroup}>
            <button
              onClick={toggleSound}
              style={styles.sound(theme, soundOn)}
              aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
            >
              {soundOn ? (
                // SOUND ON ICON
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
              ) : (
                // SOUND OFF ICON
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
              )}
            </button>

            {/* Volume Slider Below - Absolutely positioned to not affect layout */}
            {soundOn && (
              <div style={styles.volumeSliderContainer(showVolumeSlider)}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="navbar-volume-slider"
                  style={styles.volumeSlider(theme)}
                  aria-label="Volume control"
                  title="Volume"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// CSS custom properties (--thumb-bg etc.) aren't in React.CSSProperties,
// so style functions that set them return this widened type instead.
type CSSWithVars = React.CSSProperties & Record<`--${string}`, string>

const styles = {
  wrapper: {
    position: 'fixed',
    top: 18,
    left: 0,
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 9999,
    pointerEvents: 'none',
  } satisfies React.CSSProperties,

  logoWrapper: {
    position: 'absolute',
    left: 32,
    top: 0,
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'auto',
    transition: 'transform 0.2s ease',
    cursor: 'pointer',
  } satisfies React.CSSProperties,

  logoIcon: (theme: Theme): React.CSSProperties => {
    const c = THEME_COLORS[theme]
    return {
      color: theme === 'cream' ? '#fd0505' : c.accent,
      filter: `drop-shadow(0 0 12px rgba(${c.accentRgb}, 0.5))`,
      transition: 'all 0.35s ease',
    }
  },

  soundWrapper: {
    position: 'absolute',
    right: 32,
    top: 0,
    pointerEvents: 'auto',
  } satisfies React.CSSProperties,

  soundGroup: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  } satisfies React.CSSProperties,

  volumeSliderContainer: (show: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: '52px', // Position below the button
    left: '50%',
    transform: 'translateX(-50%)',
    maxHeight: show ? '100px' : '0px',
    opacity: show ? 1 : 0,
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: show ? 'auto' : 'none',
  }),

  volumeSlider: (theme: Theme): CSSWithVars => {
    const c = THEME_COLORS[theme]
    return {
      width: '100px',
      height: '4px',
      WebkitAppearance: 'none',
      appearance: 'none',
      background: `rgba(${c.accentRgb}, 0.3)`,
      borderRadius: '2px',
      outline: 'none',
      transition: 'all 0.3s ease',
      // Consumed by the .navbar-volume-slider pseudo-element rules in <style>.
      '--thumb-bg': c.accent,
      '--thumb-shadow': `0 2px 8px rgba(${c.accentRgb},0.4)`,
    }
  },

  navContainer: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
  } satisfies React.CSSProperties,

  nav: (theme: Theme): React.CSSProperties => {
    const c = THEME_COLORS[theme]
    return {
      pointerEvents: 'auto',

      display: 'flex',
      alignItems: 'center',

      padding: '10px 14px',
      borderRadius: '999px',

      backdropFilter: 'blur(18px) saturate(160%)',
      WebkitBackdropFilter: 'blur(18px) saturate(160%)',

      background: c.bg,
      border: `1px solid ${c.border}`,
      boxShadow: c.boxShadow,

      transition: 'all 0.35s ease',
    }
  },

  energy: (theme: Theme): React.CSSProperties => {
    const c = THEME_COLORS[theme]
    return {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '420px',
      height: '90px',

      background: `radial-gradient(circle, rgba(${c.accentRgb},${theme === 'cream' ? 0.25 : 0.22}), transparent 70%)`,

      filter: 'blur(22px)',
      opacity: 0.9,
      zIndex: -1,
    }
  },

  center: {
    display: 'flex',
    gap: '10px',
  } satisfies React.CSSProperties,

  pill: (active: boolean, hovered: boolean, theme: Theme): React.CSSProperties => {
    const c = THEME_COLORS[theme]
    return {
      border: 'none',

      padding: '6px 14px',
      borderRadius: '999px',

      fontSize: '12px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',

      fontWeight: 'bold',

      transition: 'all 0.25s ease',

      color: active ? '#fff' : c.isLight ? '#2a2a2a' : 'rgba(255,255,255,0.65)',

      background: active
        ? `rgba(${c.accentRgb},0.85)`
        : hovered
          ? `rgba(${c.accentRgb},0.5)`
          : 'transparent',

      boxShadow: active
        ? `0 6px 18px rgba(${c.accentRgb},0.25)`
        : hovered
          ? `0 4px 14px rgba(${c.accentRgb},0.2)`
          : 'none',
    }
  },

  sound: (theme: Theme, on: boolean): React.CSSProperties => {
    const c = THEME_COLORS[theme]
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',

      width: '44px',
      height: '44px',
      padding: '0',

      border: `1px solid ${c.border}`,
      borderRadius: '50%',

      transition: 'all 0.25s ease',

      backdropFilter: 'blur(18px) saturate(160%)',
      WebkitBackdropFilter: 'blur(18px) saturate(160%)',

      color: on ? '#fff' : c.isLight ? '#2a2a2a' : 'rgba(255,255,255,0.6)',

      background: on
        ? theme === 'cream'
          ? 'rgba(214, 122, 122, 0.85)' // kept as the original warm "mute" red for the cream theme
          : `rgba(${c.accentRgb},0.85)`
        : c.bg,
    }
  },
}