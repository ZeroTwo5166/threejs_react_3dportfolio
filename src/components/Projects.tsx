import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

type Project = {
  id: string
  title: string
  description: string
  tags: string[]
  status: 'ONLINE' | 'OFFLINE' | 'IN PROGRESS'
  thumbnail?: string // path under /public, e.g. '/projects/nexus-core.jpg'
  link?: string
  repo?: string
  featured?: boolean
}

// ─── Theme accent — swap this one value to retheme the whole page ─────────
const ACCENT = '#c084fc' // violet/fuchsia — was teal (#4fe3b5)
const ACCENT_SOFT = 'rgba(192, 132, 252, 0.08)'
const BG = '#0d0a12' // slight violet-black tint, was neutral #0a0d12

// How many project cards appear on a single page. All cards render the
// same way now — no special "wide" featured layout.
const PAGE_SIZE = 6

// ─── Data — replace with your real projects ────────────────────────────────
// `thumbnail` should point at an image in /public (e.g. '/projects/x.jpg').
// If it's missing or fails to load, the card falls back to a generated
// gradient tile with the project's initial — so nothing ever looks broken.
const PROJECTS: Project[] = [
  {
    id: '01',
    title: 'RentIt',
    description: 'A two-sided rental marketplace connecting people who have items to lend with people who need them for a price — built with interactive map discovery so you can find and book nearby listings, plus full listing management for owners renting out their own gear.',
    tags: ['Angular', 'ASP.NET', 'MSSQL', 'SignalR', 'REST API', 'Leaflet'],
    status: 'ONLINE',
    thumbnail: '/projects/rentit.png',
    link: 'https://rentit.dryorc.site/',
    repo: 'https://github.com/ZeroTwo5166/RentIt.git',
  },
  {
    id: '02',
    title: 'DCord',
    description: 'A full-featured real-time messaging platform in the spirit of Discord — servers, channels, DMs, and live presence — reimagined with a custom visual identity and a handful of features tailored to how I actually use chat apps day to day.',
    tags: ['NextJS', 'Convex', 'REST API',],
    status: 'ONLINE',
    thumbnail: '/projects/dcord.png',
    link: 'https://dcord.dryorc.site/',
    repo: 'https://github.com/ZeroTwo5166/DiscordClone.git',
    featured: false,
  },

  {
    id: '03',
    title: 'SOP-Inventory',
    description: "A dedicated inventory management system for TEC's EUX skoleoplæringscenter — built to keep tools, materials, and shared equipment properly tracked, checked in/out, and organized across the training workshop, replacing what used to be manual tracking.",
    tags: ['Angular', 'ASP.NET', 'MSSQL'],
    status: 'ONLINE',
    thumbnail: '/projects/TEC.png',
    repo: 'https://github.com/ZeroTwo5166/SOP-Inventory.git', // TODO: confirm real repo URL
    // No `link` — internal school system, not publicly reachable. The card
    // shows "no_public_access" for the live view and still links out to source.
  },
  {
    id: '04',
    title: 'DineFinder',
    description: 'A map-based restaurant discovery app that helps users find nearby restaurants and search for specific dishes in their area. Built with an interactive map, location-aware search, and detailed restaurant information to make finding your next meal fast and intuitive.',
    tags: ['NextJS', 'Axios'],
    status: 'OFFLINE',
    thumbnail: '/projects/dinefinder.png',
    repo: 'https://github.com/ZeroTwo5166/Dinefinder.git',
  },
  {
    id: '05',
    title: 'ZeroX',
    description: 'A collaborative code editing platform that enables multiple users to write and edit code together in real time. Powered by SignalR for instant synchronization, with Angular providing a responsive editor and ASP.NET handling secure session and collaboration management.',
    tags: ['Angular', 'ASP.NET', 'MSSQL', "SignalR"],
    status: 'OFFLINE',
    repo: 'https://github.com/ZeroTwo5166/CodeEditor-chat-app.git',
  },
]

// Status colors kept as-is — these carry semantic meaning independent of theme.
const STATUS_META: Record<Project['status'], { color: string; label: string }> = {
  ONLINE: { color: '#4fe3b5', label: 'ONLINE' },
  'IN PROGRESS': { color: '#f5b452', label: 'IN_PROGRESS' },
  OFFLINE: { color: '#6b7685', label: 'OFFLINE' },
}

type FilterValue = Project['status'] | 'ALL'
const FILTERS: FilterValue[] = ['ALL', 'ONLINE', 'IN PROGRESS', 'OFFLINE']

// The OFFLINE filter chip gets its own red when active — distinct from
// STATUS_META.OFFLINE.color (a neutral gray), which is still used for the
// status dot/label shown on each card.
const OFFLINE_FILTER_ACTIVE_COLOR = '#ef4444'

function getFilterColor(f: FilterValue): string {
  if (f === 'ALL') return ACCENT
  if (f === 'OFFLINE') return OFFLINE_FILTER_ACTIVE_COLOR
  return STATUS_META[f].color
}

// ─── Count-up — animates a number from 0 to `target` with an ease-out curve
// whenever `target` changes (and `active` is true). Reduced motion jumps
// straight to the final value. ────────────────────────────────────────────
function useCountUp(target: number, active: boolean, reduced: boolean, duration = 650): number {
  const [value, setValue] = useState(reduced ? target : 0)

  useEffect(() => {
    if (reduced) {
      setValue(target)
      return
    }
    if (!active) return

    let raf = 0
    let start: number | null = null

    const step = (t: number) => {
      if (start === null) start = t
      const elapsed = t - start
      const p = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, active, reduced, duration])

  return value
}

// ─── Scramble-decode — same device as the Contact console's headline, used
// once here so the section title feels like it's resolving from noise. ────
const GLYPHS = '!<>-_\\/[]{}=+*^?#01'

function useScramble(text: string, trigger: boolean, reduced: boolean) {
  const [display, setDisplay] = useState(text)

  useEffect(() => {
    if (!trigger || reduced) {
      setDisplay(text)
      return
    }
    let frame = 0
    const totalFrames = Math.ceil(text.length / 1.5) + 8
    const id = setInterval(() => {
      frame++
      const resolved = Math.floor(frame * 1.5)
      let out = ''
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === ' ' || ch === '\n' || i < resolved) out += ch
        else if (i < resolved + 6) out += GLYPHS[(Math.random() * GLYPHS.length) | 0]
        else out += '\u00A0'
      }
      setDisplay(out)
      if (frame >= totalFrames) {
        setDisplay(text)
        clearInterval(id)
      }
    }, 26)
    return () => clearInterval(id)
  }, [text, trigger, reduced])

  return display
}

// ─── Uptime clock — purely cosmetic "how long this console has been open",
// ticks once a second. Text-only, so it plays fine under reduced motion. ───
function useUptime(active: boolean): string {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [active])

  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── Thumbnail with graceful fallback ───────────────────────────────────────
// Renders the real image if it loads; if it's missing/404s, swaps to a
// generated gradient tile carrying the project's initial so the layout
// never shows a broken-image icon.
function ProjectThumb({ project }: { project: Project }) {
  const [failed, setFailed] = useState(!project.thumbnail)

  if (failed) {
    return (
      <div
        className="card-thumb-fallback"
        style={{
          background: `linear-gradient(135deg, rgba(192,132,252,0.22), rgba(13,10,18,0.9))`,
        }}
        aria-hidden="true"
      >
        <span>{project.title.charAt(0)}</span>
      </div>
    )
  }

  return (
    <img
      className="card-thumb-img"
      src={project.thumbnail}
      alt={`${project.title} thumbnail`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

// ─── Card with cursor-tracked glow + 3D tilt ────────────────────────────────
function ProjectCard({
  project,
  delay,
  visible,
  reduced,
}: {
  project: Project
  delay: number
  visible: boolean
  reduced: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const meta = STATUS_META[project.status]

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    el.style.setProperty('--mx', `${x}px`)
    el.style.setProperty('--my', `${y}px`)

    if (reduced) return
    const rx = ((y / rect.height) - 0.5) * -6 // deg
    const ry = ((x / rect.width) - 0.5) * 6
    el.style.transition = 'transform 0.08s ease-out, border-color 0.25s ease, background 0.25s ease'
    el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px)`
  }

  const handleMouseLeave = () => {
    const el = cardRef.current
    if (!el) return
    el.style.transition =
      'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease, background 0.25s ease'
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)'
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`project-reveal project-card ${visible ? 'is-visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Thumbnail — bleeds to the card's edges, ignoring its padding */}
      <div className="card-thumb">
        <ProjectThumb project={project} />
      </div>

      <span className="card-glow" />
      <span className="corner corner-tl" />
      <span className="corner corner-br" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#635a70', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>
          0x{project.id}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            className={project.status === 'OFFLINE' ? '' : 'pulse-dot-status'}
            style={{ width: '6px', height: '6px', borderRadius: '50%', background: meta.color, display: 'inline-block', flexShrink: 0 }}
          />
          <span style={{ fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.1em', color: meta.color, fontFamily: "'JetBrains Mono', monospace" }}>
            {meta.label}
          </span>
        </div>
      </div>

      <h3 style={{
        fontSize: '1.4rem',
        fontWeight: 600,
        margin: '0 0 0.75rem 0',
        color: '#f0eaf6',
        letterSpacing: '-0.01em',
        fontFamily: "'Inter', system-ui, sans-serif",
        position: 'relative',
        zIndex: 1,
      }}>
        {project.title}
        {project.featured && (
          <span style={{
            marginLeft: '0.75rem',
            fontSize: '0.62rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: '#0d0a12',
            background: ACCENT,
            padding: '0.2rem 0.55rem',
            borderRadius: '3px',
            verticalAlign: 'middle',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            FEATURED
          </span>
        )}
      </h3>

      <p style={{
        fontSize: '0.9rem',
        lineHeight: 1.65,
        color: '#a196ac',
        margin: '0 0 1.5rem 0',
        flexGrow: 1,
        fontFamily: "'Inter', system-ui, sans-serif",
        position: 'relative',
        zIndex: 1,
      }}>
        {project.description}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
        {project.tags.map((tag) => (
          <span key={tag} className="tag-chip">{tag}</span>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: '1.5rem',
        marginTop: 'auto',
        paddingTop: '1.25rem',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        position: 'relative',
        zIndex: 1,
      }}>
        {project.link ? (
          <a href={project.link} target="_blank" rel="noreferrer" className="project-link">launch_↗</a>
        ) : (
          <span className="project-link" style={{ opacity: 0.4, cursor: 'default' }}>no_public_access</span>
        )}
        {project.repo && (
          <a href={project.repo} target="_blank" rel="noreferrer" className="project-link">source_↗</a>
        )}
      </div>
    </div>
  )
}

export const Projects = () => {
  const sectionRef = useRef<HTMLDivElement>(null)
  const filterBarRef = useRef<HTMLDivElement>(null)
  const filterRefs = useRef<Partial<Record<FilterValue, HTMLButtonElement | null>>>({})

  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [filter, setFilter] = useState<FilterValue>('ALL')
  const [page, setPage] = useState(0)

  // Drives the grid's entrance animation independently of `visible` — flips
  // off then back on (double rAF, so the browser actually paints the "off"
  // frame) any time the filter or page changes, replaying the stagger like
  // a fresh boot sequence instead of just snapping to the new set.
  const [cardsShown, setCardsShown] = useState(false)

  // Tracks the active filter chip's full box (not just left/width) so the
  // indicator still lands correctly when the chips wrap onto two rows on
  // narrow screens — see the layout effect below for why this matters.
  const [indicator, setIndicator] = useState({ left: 0, top: 0, width: 0, height: 0 })

  // ── Reduced motion (live-updating) ────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Changing the filter changes the result set, so any page you were on
  // stops making sense — always land back on page 1.
  useEffect(() => {
    setPage(0)
  }, [filter])

  // Full filtered list — this is what actually gets paginated. No more
  // special-cased featured project; every card renders the same way.
  const filtered = useMemo(
    () => PROJECTS.filter((p) => filter === 'ALL' || p.status === filter),
    [filter]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)

  const pageItems = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage]
  )

  const totalShown = pageItems.length
  const onlineCount = useMemo(() => PROJECTS.filter((p) => p.status === 'ONLINE').length, [])
  const loadPct = Math.round((onlineCount / PROJECTS.length) * 100)

  const goPrev = () => setPage((p) => Math.max(0, p - 1))
  const goNext = () => setPage((p) => Math.min(totalPages - 1, p + 1))

  // ── Replay the grid's stagger whenever the visible set changes ───────────
  useEffect(() => {
    if (!visible) return

    if (reduced) {
      setCardsShown(true)
      return
    }

    setCardsShown(false)
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setCardsShown(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [visible, filter, safePage, reduced])

  // ── Sliding indicator under the active filter chip ────────────────────────
  // Reads the button's FULL bounding box (left, top, width, height) rather
  // than assuming a single row at height:100% — on narrow screens the chips
  // wrap onto two lines, and a height:100%-of-container indicator would
  // stretch across both rows instead of hugging just the active chip.
  useLayoutEffect(() => {
    const update = () => {
      const btn = filterRefs.current[filter]
      const bar = filterBarRef.current
      if (!btn || !bar) return
      const barRect = bar.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      setIndicator({
        left: btnRect.left - barRect.left,
        top: btnRect.top - barRect.top,
        width: btnRect.width,
        height: btnRect.height,
      })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [filter, visible])

  const title1 = useScramble('Running processes', visible, reduced)

  const shownCount = useCountUp(totalShown, visible, reduced)
  const processCount = useCountUp(PROJECTS.length, visible, reduced)
  const loadBar = useCountUp(loadPct, visible, reduced, 900)
  const uptime = useUptime(visible)

  return (
    <section
      id="projects"
      ref={sectionRef}
      style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12vh 6vw',
        boxSizing: 'border-box',
        zIndex: 5,
        backgroundColor: BG,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
          radial-gradient(circle at 85% 0%, rgba(192, 132, 252, 0.1) 0%, transparent 45%)
        `,
        backgroundSize: '42px 42px, 42px 42px, 100% 100%',
        overflow: 'hidden',
      }}
    >
      {/* ─── Header ─── */}
      <div className="projects-header" style={{ width: '100%', maxWidth: '1200px', marginBottom: '3rem', position: 'relative', zIndex: 2 }}>
        <div
          className={`project-reveal header-stat-row ${visible ? 'is-visible' : ''}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem 1rem', marginBottom: '1.25rem' }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="pulse-dot-theme" />
            <span style={{
              fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: ACCENT,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}>
              sys.log :: projects
            </span>
          </div>
          <span style={{
            fontSize: '0.72rem', color: '#635a70', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em',
            display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '0.3rem', gap: '0.6rem',
          }}>
            <span key={processCount}>{String(processCount).padStart(2, '0')} processes</span>
            ·
            <span key={`shown-${shownCount}`} className="stat-pop">{String(shownCount).padStart(2, '0')} shown</span>
            ·
            <span className="uptime-clock">up {uptime}</span>
          </span>
        </div>

        <h2
          className={`project-reveal projects-title ${visible ? 'is-visible' : ''}`}
          style={{
            fontSize: 'clamp(2.6rem, 5.2vw, 4rem)', fontWeight: 600, margin: '0 0 1.4rem 0',
            lineHeight: 1.15, color: '#f0eaf6', letterSpacing: '-0.02em',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace", transitionDelay: '100ms',
          }}
        >
          {title1} <br />
          <span style={{ color: '#6b6275' }}>&amp; archived builds.</span>
        </h2>

        {/* ─── System load bar — % of catalogued projects currently online ─── */}
        <div
          className={`project-reveal ${visible ? 'is-visible' : ''}`}
          style={{ marginBottom: '2rem', transitionDelay: '140ms' }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: '0.4rem',
          }}>
            <span style={{
              fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#6b6275', fontFamily: "'JetBrains Mono', monospace",
            }}>
              system_load
            </span>
            <span style={{
              fontSize: '0.7rem', color: STATUS_META.ONLINE.color, fontFamily: "'JetBrains Mono', monospace",
            }}>
              {loadBar}% online
            </span>
          </div>
          <div className="load-track">
            <div className="load-fill" style={{ width: `${loadBar}%` }} />
          </div>
        </div>

        {/* ─── Status filter bar — sliding indicator tracks the active chip ─── */}
        <div
          ref={filterBarRef}
          className={`project-reveal filter-bar ${visible ? 'is-visible' : ''}`}
          style={{ transitionDelay: '160ms' }}
        >
          <span
            className="filter-indicator"
            style={{
              transform: `translate(${indicator.left}px, ${indicator.top}px)`,
              width: `${indicator.width}px`,
              height: `${indicator.height}px`,
              background: `${getFilterColor(filter)}1c`,
              borderColor: `${getFilterColor(filter)}55`,
            }}
            aria-hidden="true"
          />
          {FILTERS.map((f) => {
            const active = filter === f
            const color = getFilterColor(f)
            return (
              <button
                key={f}
                ref={(el) => { filterRefs.current[f] = el }}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className="filter-chip"
                style={{ color: active ? color : '#a196ac' }}
              >
                {f === 'IN PROGRESS' ? 'IN_PROGRESS' : f}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Projects Grid ─── */}
      <div className="projects-grid" style={{ width: '100%', maxWidth: '1200px', display: 'grid', gap: '1.75rem', position: 'relative', zIndex: 2 }}>
        {pageItems.map((project, i) => (
          <ProjectCard
            key={project.id}
            project={project}
            delay={reduced ? 0 : 160 + i * 90}
            visible={cardsShown}
            reduced={reduced}
          />
        ))}
      </div>

      {totalShown === 0 && (
        <p className="empty-state" style={{ color: '#635a70', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', marginTop: '2rem' }}>
          no_processes_match_filter<span className="empty-caret">▍</span>
        </p>
      )}

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <div
          className={`project-reveal ${visible ? 'is-visible' : ''}`}
          style={{
            width: '100%', maxWidth: '1200px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '1.25rem', marginTop: '3rem', position: 'relative', zIndex: 2,
          }}
        >
          <button
            type="button"
            className="page-nav-btn"
            onClick={goPrev}
            disabled={safePage === 0}
            aria-label="Previous page"
          >
            ‹ prev
          </button>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                type="button"
                className="page-dot"
                aria-label={`Go to page ${i + 1}`}
                aria-current={i === safePage}
                onClick={() => setPage(i)}
                style={{
                  background: i === safePage ? ACCENT : 'rgba(255,255,255,0.15)',
                  boxShadow: i === safePage ? `0 0 8px ${ACCENT_SOFT}` : 'none',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            className="page-nav-btn"
            onClick={goNext}
            disabled={safePage === totalPages - 1}
            aria-label="Next page"
          >
            next ›
          </button>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

        .projects-grid {
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        }
        @media (max-width: 768px) {
          .projects-grid { grid-template-columns: 1fr; }
        }

        .project-card {
          position: relative;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01));
          border-radius: 4px;
          padding: 2rem;
          border: 1px solid rgba(255,255,255,0.08);
          overflow: hidden;
          will-change: transform;
          transition: border-color 0.25s ease, background 0.25s ease;
        }
        .project-card:hover {
          border-color: rgba(192, 132, 252, 0.35);
        }
        .project-card:hover .corner { opacity: 1; }
        .project-card:hover .card-glow { opacity: 1; }

        /* Thumbnail — bleeds edge-to-edge at the top of the card, ignoring
           the card's own padding via negative margins. Sits before the
           glow/corner overlays in DOM so they still wash over it. */
        .card-thumb {
          position: relative;
          margin: -2rem -2rem 1.5rem -2rem;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: rgba(255,255,255,0.03);
          flex-shrink: 0;
        }
        .card-thumb-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }
        .project-card:hover .card-thumb-img {
          transform: scale(1.04);
        }
        .card-thumb-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-thumb-fallback span {
          font-family: 'JetBrains Mono', monospace;
          font-size: 2.4rem;
          font-weight: 600;
          color: rgba(240, 234, 246, 0.35);
        }

        /* Cursor-tracked radial glow */
        .card-glow {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.3s ease;
          background: radial-gradient(320px circle at var(--mx, 50%) var(--my, 50%), ${ACCENT_SOFT}, transparent 70%);
          pointer-events: none;
        }

        .corner {
          position: absolute;
          width: 14px;
          height: 14px;
          opacity: 0;
          transition: opacity 0.25s ease;
          pointer-events: none;
        }
        .corner-tl { top: -1px; left: -1px; border-top: 2px solid ${ACCENT}; border-left: 2px solid ${ACCENT}; }
        .corner-br { bottom: -1px; right: -1px; border-bottom: 2px solid ${ACCENT}; border-right: 2px solid ${ACCENT}; }

        /* Theme pulse dot (header) — separate from status pulse so status colors stay untouched */
        .pulse-dot-theme {
          width: 6px; height: 6px; border-radius: 50%;
          background: ${ACCENT};
          box-shadow: 0 0 0 0 rgba(192, 132, 252, 0.55);
          animation: pulse-theme 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-theme {
          0% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0.45); }
          70% { box-shadow: 0 0 0 6px rgba(192, 132, 252, 0); }
          100% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0); }
        }

        /* Status pulse dot (cards) — uses each status's own color via inline style */
        .pulse-dot-status {
          animation: pulse-status 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-status {
          0% { box-shadow: 0 0 0 0 currentColor; }
          70% { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }

        /* Stat numbers pop briefly whenever they change (filter/page swap) */
        .stat-pop { display: inline-block; animation: stat-pop 0.3s ease; }
        @keyframes stat-pop {
          0% { transform: scale(1.18); color: ${ACCENT}; }
          100% { transform: scale(1); }
        }
        .uptime-clock { font-variant-numeric: tabular-nums; opacity: 0.85; }

        /* System load bar */
        .load-track {
          width: 100%;
          height: 5px;
          border-radius: 3px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }
        .load-fill {
          height: 100%;
          border-radius: 3px;
          background: linear-gradient(90deg, ${STATUS_META.ONLINE.color}, ${ACCENT});
          box-shadow: 0 0 12px rgba(79, 227, 181, 0.45);
          transition: width 0.2s linear;
        }

        /* Filter bar + sliding indicator */
        .filter-bar {
          position: relative;
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .filter-indicator {
          position: absolute;
          left: 0;
          top: 0;
          border-radius: 3px;
          border: 1px solid transparent;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                      width 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                      height 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                      background 0.25s ease, border-color 0.25s ease;
          pointer-events: none;
          z-index: 0;
        }

        .tag-chip {
          font-size: 0.68rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          color: #b8aec2;
          background: transparent;
          padding: 0.3rem 0.7rem;
          border-radius: 3px;
          border: 1px solid rgba(255,255,255,0.1);
          font-family: 'JetBrains Mono', monospace;
        }

        .filter-chip {
          position: relative;
          z-index: 1;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.08em;
          font-family: 'JetBrains Mono', monospace;
          padding: 0.45rem 0.9rem;
          border-radius: 3px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          transition: color 0.2s ease;
        }
        .filter-chip:hover {
          color: ${ACCENT} !important;
        }
        .filter-chip:focus-visible {
          outline: 2px solid rgba(192, 132, 252, 0.7);
          outline-offset: 2px;
        }

        .project-link {
          font-size: 0.78rem;
          font-weight: 500;
          letter-spacing: 0.03em;
          color: ${ACCENT};
          text-decoration: none;
          transition: color 0.2s, opacity 0.2s, transform 0.2s;
          font-family: 'JetBrains Mono', monospace;
          opacity: 0.85;
          display: inline-block;
        }
        .project-link:hover { color: #dcb6ff; opacity: 1; text-decoration: underline; transform: translateX(2px); }
        .project-link:focus-visible {
          outline: 2px solid rgba(192, 132, 252, 0.7);
          outline-offset: 2px;
        }

        .project-reveal {
          opacity: 0;
          transform: translateY(2.5rem);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .project-reveal.is-visible { opacity: 1; transform: translateY(0); }

        /* Cards use the same reveal transform, but transitions are declared
           separately (see .project-card) so the JS-driven tilt's inline
           transition doesn't get clobbered by this rule's specificity. */
        .project-card.project-reveal {
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.25s ease, background 0.25s ease;
        }

        .empty-state { display: inline-flex; align-items: center; gap: 0.15rem; }
        .empty-caret { color: ${ACCENT}; animation: empty-blink 1.1s steps(1) infinite; }
        @keyframes empty-blink { 50% { opacity: 0; } }

        /* Pagination controls */
        .page-nav-btn {
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-family: 'JetBrains Mono', monospace;
          color: #a196ac;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 3px;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .page-nav-btn:hover:not(:disabled) {
          color: ${ACCENT};
          border-color: rgba(192, 132, 252, 0.5);
          background: ${ACCENT_SOFT};
        }
        .page-nav-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .page-nav-btn:focus-visible {
          outline: 2px solid rgba(192, 132, 252, 0.7);
          outline-offset: 2px;
        }

        .page-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          border: none;
          padding: 0;
          cursor: pointer;
          transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .page-dot:hover {
          transform: scale(1.25);
        }
        .page-dot:focus-visible {
          outline: 2px solid rgba(192, 132, 252, 0.7);
          outline-offset: 2px;
        }

        /* ── Mobile ──────────────────────────────────────────────────────
           - Extra top clearance so the header never sits under the fixed
             navbar's logo/sound button, whatever the viewport quirks.
           - Filter chips move to a 2×2 grid instead of wrapping in flex —
             this is what actually fixes the indicator, since it now always
             occupies exactly one grid cell instead of a box that could
             span two flex-wrapped rows.
           - Card padding/thumb bleed shrink to match, and type tightens up
             so "Running processes & archived builds." doesn't run to four
             lines on a 390px-wide phone. */
        @media (max-width: 480px) {
          section#projects {
            padding-top: calc(12vh + 28px);
          }
          .projects-title {
            font-size: 2.15rem !important;
          }
          .header-stat-row {
            margin-top: 0.25rem;
          }
          .filter-bar {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem;
          }
          .filter-chip {
            width: 100%;
            text-align: center;
            padding: 0.55rem 0.5rem;
          }
          .project-card {
            padding: 1.25rem;
          }
          .card-thumb {
            margin: -1.25rem -1.25rem 1.25rem -1.25rem;
          }
          .projects-grid {
            gap: 1.25rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .project-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
          .project-card { transform: none !important; }
          .project-card:hover .card-thumb-img { transform: none; }
          .pulse-dot-theme, .pulse-dot-status, .stat-pop, .empty-caret { animation: none !important; }
          .filter-indicator { transition: none; }
          .project-link:hover { transform: none; }
        }
      `}</style>
    </section>
  )
}