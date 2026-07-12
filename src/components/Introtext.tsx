import { useEffect, useRef } from 'react'
import { TL, getVhPixels } from './Scrolltimeline'

// ── The one rule, applied here too ─────────────────────────────────────────
// Every block boundary is defined in SCREENS (multiples of 100vh), converted
// to pixels at read-time with the same probe-measured vh the avatar timeline
// uses. A phone and a 4K monitor hit each text beat at the same scroll depth.
//
// Old pixel values → screens (old design viewport ≈ 1000px):
//   900–2100  →  0.9–2.1   (avatar standing up)
//   2200–3400 →  2.2–3.4   (standing → turning; TURN is 2.8–3.6)
//   3500–4700 →  3.5–4.7   (walking into the jump; WALK ends 4.6)
// All three blocks get the SAME 1.2-screen duration.
const FADE_SCREENS = 0.2 // was FADE_DISTANCE = 200px

type BlockType = 'slide' | 'teleport'

interface IntroBlock {
  id: string
  type: BlockType
  start: number // screens
  end: number   // screens
  eyebrow: string
  title: string
  body: string
}

const blocks: IntroBlock[] = [
  {
    id: 'b1',
    type: 'slide',
    start: 0.9,
    end: 2.1, // fades out just before TL.CHAIR_END (2.5)
    eyebrow: '01 — The Assets',
    title: 'Sourced & Refined.',
    body: 'High-quality 3D geometry is sourced from Sketchfab and brought into Blender for meticulous preparation. The workflow focuses on custom texture painting, UV mapping, and material baking to ensure every asset is perfectly optimized for the web.',
  },
  {
    id: 'b2',
    type: 'teleport',
    start: 2.2,
    end: 3.4, // gone shortly before TL.TURN_END (3.6)
    eyebrow: '02 — The Interactive',
    title: 'Powered by Three.js.',
    body: 'Static models evolve into dynamic environments. Utilizing React Three Fiber, this experience renders complex WebGL scenes natively in the browser, featuring fluid camera choreography and elements that react seamlessly to scroll progression.',
  },
  {
    id: 'b3',
    type: 'slide',
    start: 3.5,
    end: 4.7, // 1.2 screens, same as b1 and b2 — fades out as the jump begins
    eyebrow: '03 — The Architecture',
    title: 'Built on Next.js & Vite.',
    body: 'Immersive 3D demands a blazing-fast foundation. This website leverages a modern React-based stack to perfectly balance the heavy computational load of WebGL rendering with a highly responsive, optimized frontend experience.',
  },
]

// Sanity check at module load: warn if a block outlives the timeline.
if (typeof window !== 'undefined') {
  for (const b of blocks) {
    if (b.end > TL.NEXT_SECTION_PIN) {
      // eslint-disable-next-line no-console
      console.warn(`[IntroText] block "${b.id}" ends after NEXT_SECTION_PIN`)
    }
  }
}

export function IntroText() {
  const refs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let ticking = false

    const update = () => {
      ticking = false
      const vh = getVhPixels() // probe-measured, stable on mobile URL-bar collapse
      const s = window.scrollY / vh // scroll position in screens

      blocks.forEach((b, i) => {
        const el = refs.current[i]
        if (!el) return

        let progress = 0

        if (s < b.start) {
          progress = 0
        } else if (s < b.start + FADE_SCREENS) {
          progress = (s - b.start) / FADE_SCREENS
        } else if (s < b.end - FADE_SCREENS) {
          progress = 1
        } else if (s < b.end) {
          progress = 1 - (s - (b.end - FADE_SCREENS)) / FADE_SCREENS
        } else {
          progress = 0
        }

        progress = Math.max(0, Math.min(1, progress))

        if (b.type === 'slide') {
          el.style.opacity = String(progress)
          el.style.transform = `translateX(${(1 - progress) * -70}px)`
          el.style.filter = 'none'
        } else {
          const visible = progress > 0.5
          el.style.opacity = visible ? '1' : '0'
          el.style.transform = visible
            ? 'translateY(0) scale(1)'
            : 'translateY(20px) scale(0.9)'
          el.style.filter = visible ? 'blur(0px)' : 'blur(6px)'
        }
      })
    }

    const onScroll = () => {
      // rAF-throttled: at most one style pass per frame.
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div className="intro-text-layer">
      <style>{`
        .intro-text-layer {
          position: fixed;
          inset: 0;
          z-index: 2;
          pointer-events: none;
        }

        .intro-block {
          position: absolute;
          left: 10%;
          top: 32%;
          width: clamp(260px, 34vw, 480px);
          opacity: 0;
          will-change: transform, opacity;
        }

        .intro-block.slide {
          transition:
            opacity 0.4s ease-out,
            transform 0.5s ease-out;
        }

        .intro-block.teleport {
          transition:
            opacity 0.25s ease,
            transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
            filter 0.3s ease;
        }

        .intro-eyebrow {
          font-size: clamp(0.7rem, 1vw, 0.85rem);
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #fff;
          margin-bottom: 10px;
        }

        .intro-title {
          font-size: clamp(1.5rem, 2.6vw, 2.4rem);
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
          margin: 0 0 14px;
          font-family: 'Inter', sans-serif;
        }

        .intro-body {
          font-size: clamp(0.9rem, 1.1vw, 1.1rem);
          line-height: 1.6;
          color: #334155;
          margin: 0;
          font-weight: 500;
        }

        /* 1700px and below — matches the 3D scene's shrink breakpoint */
        @media (max-width: 1700px) {
          .intro-block {
            top: 10%;
          }
        }

        /* 768px and below */
        @media (max-width: 768px) {
          .intro-block {
            top: 10%;
            left: 6%;
            right: 6%;
            width: auto;
          }

          .intro-title {
            font-size: 1.7rem;
          }

          .intro-body {
            font-size: 0.95rem;
          }
        }

        @media (max-width: 480px) {
          .intro-block {
            left: 5%;
            right: 5%;
          }
        }
      `}</style>

      {blocks.map((b, i) => (
        <div
          key={b.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          className={`intro-block ${b.type}`}
        >
          <div className="intro-eyebrow">{b.eyebrow}</div>
          <h2 className="intro-title">{b.title}</h2>
          <p className="intro-body">{b.body}</p>
        </div>
      ))}
    </div>
  )
}