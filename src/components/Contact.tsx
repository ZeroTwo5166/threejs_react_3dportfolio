import React, { useEffect, useMemo, useRef, useState } from 'react'

// ─── Theme accent — the site's ONLINE green, so "contact" reads as
//     "channel open / available". Completes the cream → blue → violet →
//     teal theme journey across hero → about → projects → contact. ────────
const ACCENT = '#4fe3b5'
const ACCENT_RGB = '79, 227, 181'
const ACCENT_SOFT = `rgba(${ACCENT_RGB}, 0.08)`
const BG = '#0a1210' // near-black with a teal tint (Projects does the same in violet)

// ─── Your real coordinates — edit these ────────────────────────────────────
const EMAIL = 'subarna.gurung23@gmail.com' // TODO: set your real email
const CHANNELS: Array<{
  label: string
  value: string
  href?: string
  status: string
}> = [
  { label: 'EMAIL', value: EMAIL, href: `mailto:${EMAIL}`, status: 'PREFERRED' },
  { label: 'GITHUB', value: 'ZeroTwo5166', href: 'https://github.com/ZeroTwo5166', status: 'PUBLIC' },
  // { label: 'LINKEDIN', value: '/in/subarna-gurung', href: 'https://www.linkedin.com/', status: 'OPEN' }, // TODO: real URL
  { label: 'LOCATION', value: 'Copenhagen, DK', status: 'UTC+1' },
]

// ─── Headline typewriter — types, holds, deletes, moves to the next ───────
const HEADLINE_PHRASES = [
  'Open a channel.',
  'Ping the server.',
  'Start a transmission.'
]

const TYPE_SPEED_MS = 70      // per character while typing
const TYPE_JITTER_MS = 55     // random extra per character — human rhythm
const DELETE_SPEED_MS = 34    // per character while deleting
const HOLD_FULL_MS = 2100     // pause with the full phrase on screen
const HOLD_EMPTY_MS = 420     // pause before the next phrase starts

// Handshake duration before the mail client opens (ms). Skipped when the
// visitor prefers reduced motion.
const HANDSHAKE_MS = 1100

type CaretMode = 'solid' | 'blink'

// Loops: type phrase → hold (caret blinks) → delete → next phrase.
// Pauses whenever `active` is false (section off-screen) and shows the
// first phrase statically under reduced motion.
function useTypewriter(
  phrases: string[],
  active: boolean,
  reduced: boolean
): { text: string; caret: CaretMode } {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState<CaretMode>('blink')

  // Progress survives scrolling away and back: index/sub/deleting live in
  // refs so the loop resumes where it stopped instead of restarting.
  const idx = useRef(0)
  const sub = useRef(0)
  const deleting = useRef(false)

  useEffect(() => {
    if (reduced) {
      setText(phrases[0])
      setCaret('blink')
      return
    }
    if (!active) return

    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const phrase = phrases[idx.current % phrases.length]

      if (!deleting.current) {
        // ── typing forward ──
        sub.current++
        setText(phrase.slice(0, sub.current))
        setCaret('solid')

        if (sub.current >= phrase.length) {
          // full phrase reached — hold, blink, then start deleting
          setCaret('blink')
          deleting.current = true
          timer = setTimeout(tick, HOLD_FULL_MS)
        } else {
          timer = setTimeout(tick, TYPE_SPEED_MS + Math.random() * TYPE_JITTER_MS)
        }
      } else {
        // ── deleting ──
        sub.current--
        setText(phrase.slice(0, sub.current))
        setCaret('solid')

        if (sub.current <= 0) {
          deleting.current = false
          idx.current = (idx.current + 1) % phrases.length
          setCaret('blink')
          timer = setTimeout(tick, HOLD_EMPTY_MS)
        } else {
          timer = setTimeout(tick, DELETE_SPEED_MS)
        }
      }
    }

    timer = setTimeout(tick, 300)
    return () => clearTimeout(timer)
  }, [phrases, active, reduced])

  return { text, caret }
}

// ─── Scramble-decode effect (kept for the sub-headline) ────────────────────
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
        if (ch === ' ' || i < resolved) out += ch
        else if (i < resolved + 6) out += GLYPHS[(Math.random() * GLYPHS.length) | 0]
        else out += '\u00A0'
      }
      setDisplay(out)
      if (frame >= totalFrames) {
        setDisplay(text)
        clearInterval(id)
      }
    }, 28)
    return () => clearInterval(id)
  }, [text, trigger, reduced])

  return display
}

// ─── Boot log — typed once, character by character ─────────────────────────
const BOOT_LINES = [
  '> boot uplink_console v2.6',
  '> bridge: mailto ......... OK',
  '> channel status: OPEN',
]

type TxState = 'idle' | 'sending' | 'sent'
type Packet = { id: number; dx: number; dy: number; delay: number }

export const Contact = () => {
  const sectionRef = useRef<HTMLElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const txLedRef = useRef<HTMLSpanElement>(null)

  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)

  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [payload, setPayload] = useState('')
  const [tx, setTx] = useState<TxState>('idle')
  const [copied, setCopied] = useState(false)

  const [bootText, setBootText] = useState<string[]>([])
  const bootedRef = useRef(false)

  const [packets, setPackets] = useState<Packet[]>([])
  const packetId = useRef(0)

  // "Signal energy" — bumped by every keystroke, decays in the rAF loop.
  // Drives both the waveform amplitude and the TX LED. Lives in a ref so
  // typing never re-renders the canvas loop.
  const energyRef = useRef(0)

  const txTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const packetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Reduced motion (live-updating) ────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── Reveal replays like the About panel: toggled both ways ───────────────
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── Headline: looping typewriter. Sub-headline: one-shot decode ──────────
  const headline = useTypewriter(HEADLINE_PHRASES, visible, reduced)
  const line2 = useScramble('I read every transmission.', visible, reduced)

  // ── Boot log: types once, on first visibility ─────────────────────────────
  useEffect(() => {
    if (!visible || bootedRef.current) return
    bootedRef.current = true

    if (reduced) {
      setBootText(BOOT_LINES)
      return
    }

    let elapsed = 250 // small pause after the console slides in
    BOOT_LINES.forEach((line, li) => {
      for (let c = 1; c <= line.length; c++) {
        const t = setTimeout(() => {
          setBootText((prev) => {
            const next = [...prev]
            next[li] = line.slice(0, c)
            return next
          })
        }, elapsed)
        bootTimers.current.push(t)
        elapsed += 12
      }
      elapsed += 140 // beat between lines
    })
  }, [visible, reduced])

  // ── Live signal waveform — idles softly, spikes while you type ───────────
  useEffect(() => {
    const canvas = waveRef.current
    if (!canvas || !visible) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const fit = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
    }

    // Reduced motion: one static flat trace, no loop.
    if (reduced) {
      fit()
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.5)`
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      return
    }

    let raf = 0
    let t = 0

    const loop = () => {
      fit()
      const w = canvas.width
      const h = canvas.height
      const mid = h / 2
      t += 0.06
      energyRef.current *= 0.94 // decay

      const energy = energyRef.current

      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1.2 * dpr
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${0.45 + Math.min(energy, 1) * 0.5})`
      ctx.shadowColor = `rgba(${ACCENT_RGB}, 0.8)`
      ctx.shadowBlur = 4 * dpr + energy * 6 * dpr

      ctx.beginPath()
      const step = 2 * dpr
      for (let x = 0; x <= w; x += step) {
        const n = x / w
        // Window function so the wave pinches at both ends.
        const window_ = Math.sin(n * Math.PI)
        const idle = Math.sin(n * 14 + t * 2.4) * 1.6 * dpr
        const spike =
          (Math.sin(n * 46 + t * 9) + Math.sin(n * 23 - t * 6)) *
          energy * 5 * dpr
        const y = mid + (idle + spike) * window_
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // TX LED lights while energy is present.
      if (txLedRef.current) {
        txLedRef.current.style.opacity = energy > 0.05 ? '1' : '0.25'
        txLedRef.current.style.boxShadow =
          energy > 0.05 ? `0 0 8px rgba(${ACCENT_RGB}, 0.9)` : 'none'
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [visible, reduced])

  const bumpEnergy = () => {
    energyRef.current = Math.min(energyRef.current + 0.6, 2.5)
  }

  useEffect(
    () => () => {
      if (txTimer.current) clearTimeout(txTimer.current)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      if (packetTimer.current) clearTimeout(packetTimer.current)
      bootTimers.current.forEach(clearTimeout)
    },
    []
  )

  const payloadBytes = useMemo(
    () => new TextEncoder().encode(payload).length,
    [payload]
  )

  const canTransmit = payload.trim().length > 0 && tx !== 'sending'

  // ── Console: cursor-tracked glow + 3D tilt ────────────────────────────────
  const handleConsoleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = consoleRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    el.style.setProperty('--mx', `${x}px`)
    el.style.setProperty('--my', `${y}px`)

    if (reduced) return
    const tiltEl = tiltRef.current
    if (!tiltEl) return
    const rx = ((y / rect.height) - 0.5) * -5 // deg
    const ry = ((x / rect.width) - 0.5) * 5
    tiltEl.style.transition = 'transform 0.08s ease-out'
    tiltEl.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
  }

  const handleConsoleLeave = () => {
    const tiltEl = tiltRef.current
    if (!tiltEl) return
    tiltEl.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
    tiltEl.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)'
  }

  const openMailClient = () => {
    const subject = encodeURIComponent(
      `[uplink] ${name.trim() || 'New transmission'}`
    )
    const bodyLines = [
      payload.trim(),
      '',
      '—',
      name.trim() ? `from: ${name.trim()}` : null,
      from.trim() ? `return_address: ${from.trim()}` : null,
    ].filter((l): l is string => l !== null)
    const body = encodeURIComponent(bodyLines.join('\n'))
    window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`
  }

  // ── Transmit: packet burst + handshake, then hand off to the mail app ────
  const transmit = () => {
    if (!canTransmit) return

    if (reduced) {
      openMailClient()
      setTx('sent')
      return
    }

    // Spawn a burst of data packets flying up out of the button.
    const burst: Packet[] = Array.from({ length: 14 }, () => ({
      id: packetId.current++,
      dx: (Math.random() - 0.5) * 140,
      dy: -(50 + Math.random() * 90),
      delay: Math.random() * 250,
    }))
    setPackets(burst)
    if (packetTimer.current) clearTimeout(packetTimer.current)
    packetTimer.current = setTimeout(() => setPackets([]), 1400)

    energyRef.current = 2.5 // slam the waveform

    setTx('sending')
    txTimer.current = setTimeout(() => {
      openMailClient()
      setTx('sent')
    }, HANDSHAKE_MS)
  }

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard unavailable — the address is visible in the channel list.
    }
  }

  return (
    <section
      id="contact"
      ref={sectionRef}
      style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12vh 6vw',
        boxSizing: 'border-box',
        zIndex: 5,
        backgroundColor: BG,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
          radial-gradient(circle at 12% 100%, rgba(${ACCENT_RGB}, 0.08) 0%, transparent 40%)
        `,
        backgroundSize: '42px 42px, 42px 42px, 100% 100%',
        overflow: 'hidden',
      }}
    >
      {/* ─── Signal rings — a beacon pinging from the bottom-left corner ─── */}
      <div className="signal-rings" aria-hidden="true">
        <span /><span /><span />
      </div>

      {/* ─── Rising data motes drifting up through the section ─── */}
      <div className="data-motes" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} style={{ ['--i' as string]: i }} />
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: '1200px', position: 'relative', zIndex: 2 }}>
        {/* ─── Header ─── */}
        <div
          className={`contact-reveal ${visible ? 'is-visible' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="contact-pulse-dot" />
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: ACCENT,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            >
              sys.link :: contact
            </span>
          </div>
          <span
            className="header-meta"
            style={{
              fontSize: '0.72rem',
              color: '#5a7068',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em',
            }}
          >
            channel: OPEN · uplink: mailto · response: &lt;24h
          </span>
        </div>

        {/* Headline: endless typewriter — types a phrase, holds, deletes,
            moves to the next. \u00A0 keeps line height when text is empty. */}
        <h2
          className={`contact-reveal ${visible ? 'is-visible' : ''}`}
          style={{
            fontSize: 'clamp(2.6rem, 5.2vw, 4rem)',
            fontWeight: 600,
            margin: '0 0 3rem 0',
            lineHeight: 1.15,
            color: '#eaf6f1',
            letterSpacing: '-0.02em',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            transitionDelay: '100ms',
          }}
        >
          <span className="type-line">
            {headline.text || '\u00A0'}
            <span
              className={`header-caret ${headline.caret === 'blink' ? 'is-blinking' : ''}`}
              aria-hidden="true"
            >
              ▍
            </span>
          </span>
          <br />
          <span style={{ color: '#5f7a70' }}>{line2}</span>
        </h2>

        {/* ─── Two columns: channels | uplink console ─── */}
        <div className="contact-grid">
          {/* ── Left: comm channels, styled like About's systems readout ── */}
          <div>
            <p
              className={`contact-reveal ${visible ? 'is-visible' : ''}`}
              style={{
                fontSize: '0.95rem',
                lineHeight: 1.7,
                color: 'rgba(234, 246, 241, 0.68)',
                margin: '0 0 1.5rem 0',
                fontFamily: "'Inter', system-ui, sans-serif",
                maxWidth: '32rem',
                transitionDelay: '160ms',
              }}
            >
              Have a project, a role, or a question about how any of this was
              built? Pick a channel — the console on the right drafts the
              message for you.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {CHANNELS.map((c, i) => {
                const Row: React.ElementType = c.href ? 'a' : 'div'
                return (
                  <Row
                    key={c.label}
                    {...(c.href
                      ? {
                          href: c.href,
                          target: c.href.startsWith('http') ? '_blank' : undefined,
                          rel: c.href.startsWith('http') ? 'noreferrer' : undefined,
                        }
                      : {})}
                    className={`contact-reveal channel-row ${visible ? 'is-visible' : ''}`}
                    style={{ transitionDelay: `${220 + i * 90}ms` }}
                  >
                    <span className="channel-label">{c.label}</span>
                    <span className="channel-value">{c.value}</span>
                    {/* Status flips to LINKED on hover via CSS */}
                    <span className="channel-status">
                      <span className="st-default">● {c.status}</span>
                      <span className="st-hover">◉ LINKED</span>
                    </span>
                  </Row>
                )
              })}
            </div>

            <button
              type="button"
              onClick={copyEmail}
              className={`contact-reveal copy-btn ${copied ? 'is-copied' : ''} ${visible ? 'is-visible' : ''}`}
              style={{ transitionDelay: `${220 + CHANNELS.length * 90}ms` }}
            >
              {copied ? '✓ address_copied' : 'copy_address ⧉'}
            </button>
          </div>

          {/* ── Right: the uplink console (outer = reveal, inner = 3D tilt) ── */}
          <div
            className={`contact-reveal console-tilt-zone ${visible ? 'is-visible' : ''}`}
            style={{ transitionDelay: '280ms' }}
            onMouseLeave={handleConsoleLeave}
          >
            <div ref={tiltRef} className="console-tilt">
              <div
                ref={consoleRef}
                onMouseMove={handleConsoleMove}
                className="uplink-console"
              >
                <span className="console-glow" aria-hidden="true" />
                <span className="console-scanlines" aria-hidden="true" />
                <span className="console-sweep" aria-hidden="true" />
                <span className="corner corner-tl" aria-hidden="true" />
                <span className="corner corner-br" aria-hidden="true" />

                {/* Console title bar: dots · title · live waveform · TX LED */}
                <div className="console-titlebar">
                  <span style={{ display: 'inline-flex', gap: '0.4rem' }} aria-hidden="true">
                    <i className="console-dot" />
                    <i className="console-dot" />
                    <i className="console-dot" />
                  </span>
                  <span className="console-title">uplink_console</span>
                  <canvas ref={waveRef} className="signal-wave" aria-hidden="true" />
                  <span className="tx-led-wrap" aria-hidden="true">
                    <span ref={txLedRef} className="tx-led" />
                    <span className="tx-led-label">TX</span>
                  </span>
                </div>

                {/* Boot log — types itself the first time you arrive */}
                <div className="boot-log" aria-hidden="true">
                  {bootText.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>

                <label className="field">
                  <span className="field-label">&gt; identity</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); bumpEnergy() }}
                    placeholder="your name"
                    autoComplete="name"
                    disabled={tx === 'sending'}
                  />
                </label>

                <label className="field">
                  <span className="field-label">&gt; return_address</span>
                  <input
                    type="email"
                    value={from}
                    onChange={(e) => { setFrom(e.target.value); bumpEnergy() }}
                    placeholder="you@domain.com"
                    autoComplete="email"
                    disabled={tx === 'sending'}
                  />
                </label>

                <label className="field">
                  <span className="field-label">&gt; payload</span>
                  <textarea
                    value={payload}
                    onChange={(e) => { setPayload(e.target.value); bumpEnergy() }}
                    placeholder="type your message…"
                    rows={6}
                    disabled={tx === 'sending'}
                  />
                </label>

                <div className="console-footer">
                  {/* key= makes the counter pop on every change */}
                  <span className="payload-meta" key={payloadBytes}>
                    payload_size: {payloadBytes} bytes
                  </span>

                  <span className="transmit-wrap">
                    {/* Data packets burst out of the button on transmit */}
                    {packets.map((p) => (
                      <i
                        key={p.id}
                        className="packet"
                        style={{
                          ['--dx' as string]: `${p.dx}px`,
                          ['--dy' as string]: `${p.dy}px`,
                          animationDelay: `${p.delay}ms`,
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      className={`transmit-btn ${tx === 'sending' ? 'is-sending' : ''}`}
                      onClick={transmit}
                      disabled={!canTransmit}
                    >
                      {tx === 'sending' ? (
                        <>establishing_link<span className="tx-dots" /></>
                      ) : tx === 'sent' ? (
                        '↺ transmit_again'
                      ) : (
                        'transmit_message ↗'
                      )}
                      <span className="tx-progress" aria-hidden="true" />
                    </button>
                  </span>
                </div>

                <p className="console-status" role="status">
                  {tx === 'sent'
                    ? '// transmission handed to your mail client — press send there to complete.'
                    : tx === 'sending'
                      ? '// negotiating handshake…'
                      : '// transmit opens your mail app with everything pre-filled. no data is stored here.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .contact-grid {
          display: grid;
          grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
          gap: 3rem;
          align-items: start;
        }
        /* Grid ITEMS default to min-width:auto (their content's intrinsic
           width), which can silently win over the track's minmax(0, ...)
           and push the whole grid — and everything inside it — past the
           viewport. Since the site hides horizontal overflow instead of
           scrolling it (html,body { overflow-x:hidden } in App.css), that
           shows up as content getting clipped at a hard edge rather than
           wrapping, which is exactly the mobile bug this fixes. */
        .contact-grid > * {
          min-width: 0;
        }
        @media (max-width: 900px) {
          .contact-grid { grid-template-columns: 1fr; gap: 2.25rem; }
        }

        /* ── Reveal (same feel as Projects) ── */
        .contact-reveal {
          opacity: 0;
          transform: translateY(2.5rem);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .contact-reveal.is-visible { opacity: 1; transform: translateY(0); }

        /* ── Header pulse ── */
        .contact-pulse-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: ${ACCENT};
          box-shadow: 0 0 0 0 rgba(${ACCENT_RGB}, 0.55);
          animation: contact-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          flex-shrink: 0;
        }
        @keyframes contact-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(${ACCENT_RGB}, 0.45); }
          70%  { box-shadow: 0 0 0 6px rgba(${ACCENT_RGB}, 0); }
          100% { box-shadow: 0 0 0 0 rgba(${ACCENT_RGB}, 0); }
        }

        /* Header meta ("channel: OPEN · uplink: ..."). As a flex child it
           needs min-width:0 to actually shrink/wrap instead of forcing the
           header row (and its parent) wider than the viewport. */
        .header-meta {
          min-width: 0;
          overflow-wrap: break-word;
        }

        /* ── Typewriter headline ──
           The caret is solid while typing/deleting and blinks while the
           phrase holds — like a real terminal. */
        .type-line { display: inline-block; min-width: 1ch; }
        .header-caret {
          color: ${ACCENT};
          margin-left: 0.08em;
          text-shadow: 0 0 14px rgba(${ACCENT_RGB}, 0.7);
        }
        .header-caret.is-blinking {
          animation: caret-blink 1.05s steps(1) infinite;
        }
        @keyframes caret-blink { 50% { opacity: 0; } }

        /* ── Signal rings beacon (bottom-left) ── */
        .signal-rings {
          position: absolute;
          left: -140px; bottom: -140px;
          width: 280px; height: 280px;
          pointer-events: none; z-index: 1;
        }
        .signal-rings span {
          position: absolute; inset: 0; border-radius: 50%;
          border: 1px solid rgba(${ACCENT_RGB}, 0.35);
          animation: ring-ping 4.5s cubic-bezier(0, 0.4, 0.6, 1) infinite;
        }
        .signal-rings span:nth-child(2) { animation-delay: 1.5s; }
        .signal-rings span:nth-child(3) { animation-delay: 3s; }
        @keyframes ring-ping {
          0%   { transform: scale(0.25); opacity: 0.8; }
          100% { transform: scale(2.6);  opacity: 0; }
        }

        /* ── Rising data motes — tiny bits drifting up like sparks ── */
        .data-motes { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
        .data-motes span {
          --i: 0;
          position: absolute;
          bottom: -3vh;
          left: calc(6% + var(--i) * 10.5%);
          width: 3px; height: 3px;
          background: rgba(${ACCENT_RGB}, 0.5);
          box-shadow: 0 0 6px rgba(${ACCENT_RGB}, 0.6);
          animation: mote-rise calc(9s + var(--i) * 1.7s) linear infinite;
          animation-delay: calc(var(--i) * -2.3s);
        }
        .data-motes span:nth-child(even) { width: 2px; height: 2px; opacity: 0.7; }
        @keyframes mote-rise {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          8%   { opacity: 0.9; }
          85%  { opacity: 0.5; }
          100% { transform: translateY(-108vh) translateX(3vw); opacity: 0; }
        }

        /* ── Channel rows (echoes About's systems readout) ── */
        .channel-row {
          position: relative;
          display: flex; flex-wrap: wrap; align-items: baseline;
          justify-content: space-between;
          column-gap: 0.75rem; row-gap: 0.15rem;
          padding: 0.7rem 0.9rem;
          border-radius: 4px;
          background: rgba(${ACCENT_RGB}, 0.05);
          border: 1px solid rgba(${ACCENT_RGB}, 0.12);
          text-decoration: none;
          box-sizing: border-box;
          min-width: 0;
          overflow: hidden;
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      background 0.25s ease, border-color 0.25s ease;
        }
        /* Radar sweep that slides across a row on hover */
        .channel-row::after {
          content: '';
          position: absolute; top: 0; bottom: 0;
          left: -60%; width: 45%;
          background: linear-gradient(100deg, transparent, rgba(${ACCENT_RGB}, 0.14), transparent);
          transform: skewX(-18deg);
          pointer-events: none;
        }
        a.channel-row:hover {
          background: rgba(${ACCENT_RGB}, 0.12);
          border-color: rgba(${ACCENT_RGB}, 0.4);
          transform: translateX(4px);
        }
        a.channel-row:hover::after { animation: row-sweep 0.7s ease forwards; }
        @keyframes row-sweep { to { left: 115%; } }
        a.channel-row:focus-visible {
          outline: 2px solid rgba(${ACCENT_RGB}, 0.7);
          outline-offset: 2px;
        }
        .channel-label {
          font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em;
          color: ${ACCENT};
          font-family: 'JetBrains Mono', monospace;
          white-space: nowrap; flex-shrink: 0;
        }
        .channel-value {
          font-size: 0.92rem;
          color: rgba(234, 246, 241, 0.78);
          font-family: 'JetBrains Mono', monospace;
          text-align: right; flex: 1 1 auto; min-width: 6rem;
          overflow-wrap: anywhere;
        }
        .channel-status {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em;
          color: ${ACCENT};
          font-family: 'JetBrains Mono', monospace;
          white-space: nowrap; flex-shrink: 0;
          opacity: 0.85;
        }
        .channel-status .st-hover { display: none; }
        a.channel-row:hover .st-default { display: none; }
        a.channel-row:hover .st-hover { display: inline; }

        .copy-btn {
          margin-top: 1rem;
          font-size: 0.72rem; font-weight: 500; letter-spacing: 0.08em;
          font-family: 'JetBrains Mono', monospace;
          color: #9fb8ae;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 3px;
          padding: 0.5rem 1rem;
          transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease,
                      opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .copy-btn:hover {
          color: ${ACCENT};
          border-color: rgba(${ACCENT_RGB}, 0.5);
          background: ${ACCENT_SOFT};
        }
        .copy-btn.is-copied {
          color: ${ACCENT};
          border-color: rgba(${ACCENT_RGB}, 0.6);
          animation: copied-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes copied-pop {
          0% { transform: scale(0.92); }
          60% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .copy-btn:focus-visible {
          outline: 2px solid rgba(${ACCENT_RGB}, 0.7);
          outline-offset: 2px;
        }

        /* ── Uplink console: tilt wrapper ── */
        .console-tilt-zone { perspective: 900px; min-width: 0; }
        .console-tilt {
          transform-style: preserve-3d;
          will-change: transform;
        }

        .uplink-console {
          position: relative;
          display: flex; flex-direction: column; gap: 1.1rem;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008));
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 4px;
          padding: 1.6rem 1.8rem 1.4rem;
          overflow: hidden;
          box-shadow: 0 0 60px rgba(${ACCENT_RGB}, 0.05);
        }
        .console-glow {
          position: absolute; inset: 0;
          opacity: 0;
          transition: opacity 0.3s ease;
          background: radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), ${ACCENT_SOFT}, transparent 70%);
          pointer-events: none;
        }
        .uplink-console:hover .console-glow { opacity: 1; }
        .uplink-console:hover .corner { opacity: 1; }

        /* Faint CRT scanlines drifting down the console */
        .console-scanlines {
          position: absolute; inset: -100% 0 0 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(${ACCENT_RGB}, 0.035) 0px,
            rgba(${ACCENT_RGB}, 0.035) 1px,
            transparent 1px,
            transparent 4px
          );
          pointer-events: none;
          animation: scan-drift 14s linear infinite;
        }
        @keyframes scan-drift { to { transform: translateY(50%); } }

        /* Occasional bright sweep down the glass */
        .console-sweep {
          position: absolute; left: 0; right: 0; height: 60px; top: -80px;
          background: linear-gradient(to bottom, transparent, rgba(${ACCENT_RGB}, 0.06), transparent);
          pointer-events: none;
          animation: glass-sweep 7s ease-in-out infinite;
        }
        @keyframes glass-sweep {
          0%, 60% { top: -80px; opacity: 0; }
          70% { opacity: 1; }
          85%, 100% { top: 110%; opacity: 0; }
        }

        .corner {
          position: absolute; width: 14px; height: 14px;
          opacity: 0; transition: opacity 0.25s ease; pointer-events: none;
        }
        .corner-tl { top: -1px; left: -1px; border-top: 2px solid ${ACCENT}; border-left: 2px solid ${ACCENT}; }
        .corner-br { bottom: -1px; right: -1px; border-bottom: 2px solid ${ACCENT}; border-right: 2px solid ${ACCENT}; }

        .console-titlebar {
          display: flex; align-items: center; gap: 0.8rem;
          padding-bottom: 0.9rem;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          position: relative; z-index: 1;
          min-width: 0;
        }
        .console-dot {
          display: inline-block; width: 8px; height: 8px; border-radius: 50%;
          background: rgba(${ACCENT_RGB}, 0.35);
        }
        .console-title {
          font-size: 0.7rem; letter-spacing: 0.06em;
          color: #6b8479;
          font-family: 'JetBrains Mono', monospace;
          white-space: nowrap;
        }
        .signal-wave {
          flex: 1 1 auto;
          min-width: 30px;
          height: 26px;
          display: block;
        }
        .tx-led-wrap {
          display: inline-flex; align-items: center; gap: 0.35rem;
          flex-shrink: 0;
        }
        .tx-led {
          width: 7px; height: 7px; border-radius: 50%;
          background: ${ACCENT};
          opacity: 0.25;
          transition: opacity 0.15s ease;
        }
        .tx-led-label {
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.15em;
          color: #6b8479;
          font-family: 'JetBrains Mono', monospace;
        }

        .boot-log {
          font-size: 0.7rem;
          line-height: 1.7;
          letter-spacing: 0.04em;
          color: rgba(${ACCENT_RGB}, 0.75);
          font-family: 'JetBrains Mono', monospace;
          min-height: 3.6em; /* reserve space so the form doesn't jump while typing */
          position: relative; z-index: 1;
          white-space: pre-wrap;
        }

        .field {
          display: flex; flex-direction: column; gap: 0.45rem;
          position: relative; z-index: 1;
          min-width: 0;
        }
        .field-label {
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(${ACCENT_RGB}, 0.75);
          font-family: 'JetBrains Mono', monospace;
          transition: color 0.2s ease, text-shadow 0.2s ease;
        }
        /* Prompt lights up while its field is focused */
        .field:focus-within .field-label {
          color: ${ACCENT};
          text-shadow: 0 0 12px rgba(${ACCENT_RGB}, 0.6);
        }
        .field input,
        .field textarea {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9rem;
          color: #eaf6f1;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 3px;
          padding: 0.7rem 0.85rem;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease,
                      background 0.2s ease, opacity 0.2s ease;
          resize: vertical;
          box-sizing: border-box;
          width: 100%;
          caret-color: ${ACCENT};
        }
        .field input::placeholder,
        .field textarea::placeholder { color: #51655c; }
        .field input:focus,
        .field textarea:focus {
          border-color: rgba(${ACCENT_RGB}, 0.55);
          background: rgba(${ACCENT_RGB}, 0.04);
          box-shadow: 0 0 0 3px rgba(${ACCENT_RGB}, 0.12),
                      0 0 24px rgba(${ACCENT_RGB}, 0.08);
        }
        .field input:disabled,
        .field textarea:disabled { opacity: 0.55; }

        .console-footer {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 1rem;
          padding-top: 0.35rem;
          position: relative; z-index: 1;
          min-width: 0;
        }
        .payload-meta {
          font-size: 0.7rem; letter-spacing: 0.05em;
          color: #5a7068;
          font-family: 'JetBrains Mono', monospace;
          display: inline-block;
          animation: byte-pop 0.25s ease;
        }
        @keyframes byte-pop {
          0% { transform: scale(1.12); color: ${ACCENT}; }
          100% { transform: scale(1); }
        }

        .transmit-wrap { position: relative; display: inline-block; }

        /* Data packets bursting out of the transmit button */
        .packet {
          position: absolute;
          left: 50%; top: 30%;
          width: 5px; height: 5px;
          background: ${ACCENT};
          box-shadow: 0 0 8px rgba(${ACCENT_RGB}, 0.9);
          pointer-events: none;
          opacity: 0;
          animation: packet-fly 0.9s cubic-bezier(0.2, 0.6, 0.4, 1) forwards;
          z-index: 2;
        }
        @keyframes packet-fly {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.3); opacity: 0; }
        }

        .transmit-btn {
          position: relative;
          overflow: hidden;
          font-size: 0.78rem; font-weight: 600; letter-spacing: 0.08em;
          text-transform: lowercase;
          font-family: 'JetBrains Mono', monospace;
          color: #06110d;
          background: ${ACCENT};
          border: 1px solid ${ACCENT};
          border-radius: 3px;
          padding: 0.65rem 1.4rem;
          transition: box-shadow 0.25s ease, transform 0.15s ease, opacity 0.2s ease;
        }
        .transmit-btn:hover:not(:disabled) {
          box-shadow: 0 0 24px rgba(${ACCENT_RGB}, 0.45);
          transform: translateY(-1px);
        }
        .transmit-btn:active:not(:disabled) { transform: translateY(1px) scale(0.98); }
        .transmit-btn:focus-visible {
          outline: 2px solid #eaf6f1;
          outline-offset: 2px;
        }
        .transmit-btn:disabled { opacity: 0.4; }
        .transmit-btn.is-sending { color: rgba(6, 17, 13, 0.75); }

        .tx-progress {
          position: absolute; left: 0; bottom: 0; height: 3px; width: 100%;
          background: rgba(6, 17, 13, 0.55);
          transform: scaleX(0);
          transform-origin: left;
        }
        .transmit-btn.is-sending .tx-progress {
          animation: tx-fill ${HANDSHAKE_MS}ms linear forwards;
        }
        @keyframes tx-fill { to { transform: scaleX(1); } }

        .tx-dots::after {
          content: '';
          animation: tx-dots 1s steps(4) infinite;
        }
        @keyframes tx-dots {
          0%   { content: ''; }
          25%  { content: '.'; }
          50%  { content: '..'; }
          75%  { content: '...'; }
        }

        .console-status {
          margin: 0;
          font-size: 0.7rem;
          line-height: 1.5;
          letter-spacing: 0.03em;
          color: #5a7068;
          font-family: 'JetBrains Mono', monospace;
          position: relative; z-index: 1;
        }

        /* ── Mobile ──────────────────────────────────────────────────────
           Tightens spacing/type and gives the console's own internals more
           room to breathe on narrow phones, on top of the min-width:0 fixes
           above (which solve the actual overflow — this is polish). */
        @media (max-width: 640px) {
          section#contact { padding: 10vh 5vw; }
          .uplink-console { padding: 1.25rem 1.1rem 1.1rem; }
          .header-meta { font-size: 0.66rem !important; }
        }

        @media (max-width: 480px) {
          /* Channel rows stack: label+status on one line, the value gets
             its own full-width line below instead of fighting for space
             on one row — this is what actually stops long values like the
             email address from being squeezed into a sliver. */
          .channel-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .channel-row > .channel-value {
            order: 3;
            width: 100%;
            text-align: left;
            min-width: 0;
          }
          .channel-row > .channel-status { order: 2; }

          /* The waveform is decorative; on very narrow phones it's the
             first thing to go so the title bar never gets cramped. */
          .signal-wave { display: none; }

          .console-footer {
            flex-direction: column;
            align-items: stretch;
          }
          .transmit-wrap,
          .transmit-btn { width: 100%; }
          .transmit-btn { text-align: center; }
        }

        @media (prefers-reduced-motion: reduce) {
          .contact-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
          .contact-pulse-dot, .header-caret.is-blinking, .tx-dots::after,
          .signal-rings span, .data-motes span,
          .console-scanlines, .console-sweep,
          .payload-meta, .copy-btn.is-copied, .packet,
          .channel-row::after { animation: none !important; }
          .signal-rings, .data-motes, .console-sweep { display: none; }
          .console-tilt { transform: none !important; }
          a.channel-row:hover { transform: none; }
          .transmit-btn:hover:not(:disabled),
          .transmit-btn:active:not(:disabled) { transform: none; }
        }
      `}</style>
    </section>
  )
}