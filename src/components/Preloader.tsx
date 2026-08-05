import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'

// ─── Timing ──────────────────────────────────────────────────────────────
// Real progress can jump straight to 100% if everything's cached, which
// reads as a flash rather than a load — MIN_VISIBLE_MS guarantees the
// preloader is on screen long enough to register. FALLBACK_TIMEOUT_MS is
// a safety valve: if a model 404s or a request hangs, the site still opens
// instead of staying locked behind a stuck loader forever.
const MIN_VISIBLE_MS = 700
const FADE_MS = 650
const FALLBACK_TIMEOUT_MS = 8000

// Trims a loader URL down to just the filename for the boot log, e.g.
// "models/transparentStasisPod.glb?v=2" → "transparentStasisPod.glb".
function toFilename(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  const parts = clean.split('/')
  return parts[parts.length - 1] || url
}

const MAX_LOG_LINES = 6

export function Preloader() {
  const { progress, active, item, loaded, total, errors } = useProgress()

  const [reduced, setReduced] = useState(false)
  const [dismissed, setDismissed] = useState(false) // triggers the fade-out
  const [removed, setRemoved] = useState(false) // fully unmounts after the fade
  const [log, setLog] = useState<string[]>([])

  const mountedAt = useRef(Date.now())
  const lastItem = useRef<string | null>(null)
  // High-water mark: drei's `total` can grow after an initial wave of
  // assets already reads as 100% (a newly-registered loader bumps total
  // before it's loaded), which made the raw percentage visibly dip. This
  // state makes the displayed number monotonic — it only ever climbs.
  const [maxPct, setMaxPct] = useState(0)

  // ── Reduced motion (live-updating) ────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Block scroll behind the overlay while it's up.
  useEffect(() => {
    if (dismissed) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [dismissed])

  // Boot log — append each newly-started asset's filename, capped so it
  // reads like a scrolling terminal tail rather than a growing wall of text.
  useEffect(() => {
    if (!item || item === lastItem.current) return
    lastItem.current = item
    setLog((prev) => [...prev, toFilename(item)].slice(-MAX_LOG_LINES))
  }, [item])

  // Safety valve — force-dismiss no matter what state loading is in.
  useEffect(() => {
    const t = setTimeout(() => setDismissed(true), FALLBACK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [])

  // Real dismissal: everything's loaded (or there was nothing to load),
  // held for at least MIN_VISIBLE_MS so it never just flashes.
  useEffect(() => {
    if (dismissed) return
    const done = total === 0 ? true : !active && progress >= 100
    if (!done) return

    const elapsed = Date.now() - mountedAt.current
    const wait = reduced ? 0 : Math.max(0, MIN_VISIBLE_MS - elapsed)
    const t = setTimeout(() => setDismissed(true), wait)
    return () => clearTimeout(t)
  }, [active, progress, total, dismissed, reduced])

  // Unmount for good once the fade-out transition has actually finished.
  useEffect(() => {
    if (!dismissed) return
    const t = setTimeout(() => setRemoved(true), reduced ? 0 : FADE_MS)
    return () => clearTimeout(t)
  }, [dismissed, reduced])

  if (removed) return null

  // "Adjusting state during render" (react.dev's documented pattern for
  // deriving state from a changing input without an extra effect/commit
  // round-trip) — see the maxPct comment above for why this needs clamping.
  const rawPct = Math.min(100, Math.round(progress))
  if (rawPct > maxPct) setMaxPct(rawPct)
  const pct = Math.max(maxPct, rawPct)
  const hasErrors = errors.length > 0
  const label = pct >= 100 ? 'ALL SYSTEMS ONLINE' : 'INITIALIZING'

  return (
    <div
      className={`preloader ${dismissed ? 'is-dismissed' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!dismissed}
    >
      <div className="preloader-grid" aria-hidden="true" />
      <div className="preloader-scanlines" aria-hidden="true" />

      <div className="preloader-content">
        {/* The site's own logo, scaled up and spinning — doubles as the
            loading spinner so the very first thing you see is branded,
            not a generic spinner. */}
        <svg
          className={`preloader-mark ${pct >= 100 ? 'is-complete' : ''}`}
          width="72"
          height="72"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          aria-hidden="true"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" transform="rotate(45 12 12)" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 5 L12 19 M5 12 L19 12" strokeWidth="0.8" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>

        <div className="preloader-status">
          <span className="preloader-dot" />
          <span className="preloader-label">sys.boot :: {label}</span>
        </div>

        <div className="preloader-pct" key={pct}>
          {pct}<span className="preloader-pct-sign">%</span>
        </div>

        <div className="preloader-bar-track">
          <div className="preloader-bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="preloader-meta">
          {total > 0 ? `${loaded} / ${total} assets` : 'assets ready'}
        </div>

        <div className="preloader-log" aria-hidden="true">
          {log.map((line, i) => (
            <div key={`${line}-${i}`} className="preloader-log-line">
              &gt; loading {line}
            </div>
          ))}
        </div>

        {hasErrors && (
          <p className="preloader-warning">
            // {errors.length} asset{errors.length > 1 ? 's' : ''} failed to load — continuing anyway
          </p>
        )}
      </div>

      <style>{`
        .preloader {
          position: fixed;
          inset: 0;
          z-index: 100000;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #05070f;
          background-image:
            radial-gradient(ellipse 140% 110% at 50% 45%, transparent 55%, rgba(1,2,8,0.6) 100%),
            linear-gradient(172deg, #05070f 0%, #070a18 50%, #04050e 100%);
          color: #eaf6fb;
          transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease, filter ${FADE_MS}ms ease;
          opacity: 1;
          transform: scale(1);
          filter: blur(0px);
        }
        .preloader.is-dismissed {
          opacity: 0;
          transform: scale(1.04);
          filter: blur(6px);
          pointer-events: none;
        }

        .preloader-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,247,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,247,255,0.035) 1px, transparent 1px);
          background-size: 42px 42px, 42px 42px;
          pointer-events: none;
        }

        .preloader-scanlines {
          position: absolute;
          inset: -100% 0 0 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(0,247,255,0.03) 0px,
            rgba(0,247,255,0.03) 1px,
            transparent 1px,
            transparent 4px
          );
          pointer-events: none;
          animation: preloader-scan-drift 16s linear infinite;
        }
        @keyframes preloader-scan-drift { to { transform: translateY(50%); } }

        .preloader-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: min(360px, 86vw);
          text-align: center;
        }

        .preloader-mark {
          color: #00f7ff;
          filter: drop-shadow(0 0 16px rgba(0,247,255,0.45));
          margin-bottom: 1.6rem;
          animation: preloader-spin 3.2s linear infinite;
          transition: color 0.4s ease, filter 0.4s ease;
        }
        .preloader-mark.is-complete {
          color: #7dffe0;
          filter: drop-shadow(0 0 22px rgba(125,255,224,0.6));
          animation: preloader-spin 3.2s linear infinite, preloader-mark-flash 0.6s ease-out;
          animation-play-state: paused, running;
        }
        @keyframes preloader-spin { to { transform: rotate(360deg); } }
        @keyframes preloader-mark-flash {
          0% { filter: drop-shadow(0 0 22px rgba(125,255,224,0.6)); }
          40% { filter: drop-shadow(0 0 40px rgba(125,255,224,1)) brightness(1.3); }
          100% { filter: drop-shadow(0 0 22px rgba(125,255,224,0.6)); }
        }

        .preloader-status {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          margin-bottom: 1.1rem;
        }
        .preloader-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #00f7ff;
          box-shadow: 0 0 10px #00f7ff;
          animation: preloader-pulse 1.8s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes preloader-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .preloader-label {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #8fd9ea;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }

        .preloader-pct {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: clamp(2.4rem, 9vw, 3.4rem);
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.02em;
          color: #ffffff;
          margin-bottom: 1.1rem;
          animation: preloader-pct-pop 0.25s ease;
        }
        .preloader-pct-sign {
          font-size: 0.5em;
          color: #6b8ea0;
          margin-left: 0.1em;
        }
        @keyframes preloader-pct-pop {
          0% { opacity: 0.4; transform: translateY(2px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .preloader-bar-track {
          width: 100%;
          height: 4px;
          border-radius: 3px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
          margin-bottom: 0.6rem;
        }
        .preloader-bar-fill {
          position: relative;
          height: 100%;
          border-radius: 3px;
          background: linear-gradient(90deg, #00b8d4, #00f7ff);
          box-shadow: 0 0 12px rgba(0,247,255,0.55);
          transition: width 0.25s ease-out;
          overflow: hidden;
        }
        .preloader-bar-fill::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.65) 50%, transparent 70%);
          transform: translateX(-100%);
          animation: preloader-bar-shimmer 1.6s ease-in-out infinite;
        }
        @keyframes preloader-bar-shimmer {
          to { transform: translateX(100%); }
        }

        .preloader-meta {
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          color: #5c7788;
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 1.4rem;
        }

        .preloader-log {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-height: calc(0.95rem * ${MAX_LOG_LINES});
          width: 100%;
        }
        .preloader-log-line {
          font-size: 0.66rem;
          letter-spacing: 0.02em;
          color: rgba(0,247,255,0.55);
          font-family: 'JetBrains Mono', monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          animation: preloader-log-in 0.35s ease;
        }
        @keyframes preloader-log-in {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .preloader-warning {
          margin: 1rem 0 0 0;
          font-size: 0.66rem;
          letter-spacing: 0.03em;
          color: #e8b866;
          font-family: 'JetBrains Mono', monospace;
        }

        @media (prefers-reduced-motion: reduce) {
          .preloader { transition: opacity 0.15s linear; }
          .preloader.is-dismissed { transform: none; filter: none; }
          .preloader-mark { animation: none; }
          .preloader-dot { animation: none; opacity: 0.9; }
          .preloader-scanlines { animation: none; }
          .preloader-pct { animation: none; }
          .preloader-log-line { animation: none; }
          .preloader-bar-fill::after { animation: none; }
        }
      `}</style>
    </div>
  )
}