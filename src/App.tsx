import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Home } from './components/Home.jsx'

import './App.css'
import { runwayHeightVh } from './components/Scrolltimeline.js'
import { CustomCursor } from './components/CustomCursor.js'
import { IntroText } from './components/Introtext.js'
import { About } from './components/About.js'
import { Navbar } from './components/Navbar.js'
import { Projects } from './components/Projects.js'
import { Preloader } from './components/Preloader.js'
import { Contact } from './components/Contact.js'


export function getMaxScroll() {
  if (typeof window === 'undefined') return 0
  const doc = document.documentElement
  return Math.max(0, doc.scrollHeight - window.innerHeight)
}

// Touch/coarse-pointer devices (phones, most tablets) are the ones with the
// tightest GPU memory ceilings — mobile Safari in particular will kill the
// tab outright ("A problem repeatedly occurred") rather than degrade
// gracefully. Shadow maps and a high devicePixelRatio are two of the
// biggest, easiest-to-cut costs, so we detect once on mount and scale the
// Canvas back accordingly. Using `pointer: coarse` (not just a width
// breakpoint) so a narrow desktop browser window doesn't get penalized —
// same pattern CustomCursor.tsx already uses for `pointer: fine`.
function isLowPowerDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

export default function App() {
  const [titleIndex, setTitleIndex] = useState(0);
  const titles = [
    { text: "Software Developer", color: "#2b4570", bg: "#2b4570", shadow: "rgba(43, 69, 112, 0.15)" },
    { text: "Student", color: "#6366f1", bg: "#6366f1", shadow: "rgba(99, 102, 241, 0.15)" },
    { text: "Fullstack Developer", color: "#10b981", bg: "#10b981", shadow: "rgba(16, 185, 129, 0.15)" }
  ];

  // REF FOR ROUTING CLICKS INTO THE CANVAS
  const pageRef = useRef<HTMLDivElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);

  // Computed once on mount (not SSR'd, so no hydration concern) — see
  // isLowPowerDevice() above.
  const [lowPower] = useState(isLowPowerDevice);

  // Subtle cursor parallax on the hero headline block — only for fine
  // pointers (mirrors the coarse-pointer check above) and skipped under
  // prefers-reduced-motion. Writes CSS vars that .hero-container's
  // transform (App.css) already reads, rather than fighting its
  // transition with inline transforms.
  useEffect(() => {
    if (lowPower) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = heroTextRef.current
    if (!el) return

    const STRENGTH_X = 16
    const STRENGTH_Y = 10

    const onMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      el.style.setProperty('--parallax-x', String(nx * STRENGTH_X))
      el.style.setProperty('--parallax-y', String(ny * STRENGTH_Y))
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [lowPower]);


  useEffect(() => {
    const timer = setInterval(() => {
      setTitleIndex((prev) => (prev + 1) % titles.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [titles.length]);


  useEffect(() => {
    // Tell the browser not to remember scroll position
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    // Force scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  return (
    <div id="page" ref={pageRef}>

      <Preloader />

      <CustomCursor />
      <Navbar />

      {/* Fixed 3D stage — the page scrolls over it. */}
      <div id="canvas-container">
        {/* eventSource routes DOM clicks back into the 3D scene */}
        <Canvas
          eventSource={pageRef as React.RefObject<HTMLElement>}
          eventPrefix="client"
          shadows={!lowPower}
          dpr={lowPower ? [1, 1.5] : [1, 2]}
          camera={{ position: [0, 30, 150], fov: 25 }}
        >
          <Suspense fallback={null}>
            <Home />
          </Suspense>
        </Canvas>
      </div>

      {/* Scroll-driven story blocks — fixed overlay between the canvas (z:0)
          and the page content. Beats defined in screens in IntroText.tsx. */}
      <IntroText />

      <main>
        {/* Screen 0 → 1 */}
        <section id="hero" className="scroll-section">
          <div id="hero-text" className="hero-container" ref={heroTextRef}>
            <h1 className="hero-name">Subarna<br />Gurung</h1>

            <div className="hero-badge-container">
              <span
                className="hero-badge animate-badge"
                key={titleIndex}
                style={{
                  backgroundColor: titles[titleIndex].bg,
                  boxShadow: `3px 3px 0px ${titles[titleIndex].shadow}`,
                  color: 'white'
                }}
              >
                {titles[titleIndex].text}
              </span>
            </div>


            <button
              className="scroll-down-btn"
              style={{
                backgroundColor: titles[titleIndex].bg,
                borderColor: titles[titleIndex].color,
                color: 'white',
                boxShadow: `0 4px 12px ${titles[titleIndex].shadow}`,
              }}
              onClick={() => {
                const aboutSection = document.getElementById('about');
                if (aboutSection) {
                  const currentPosition = window.scrollY;
                  const targetPosition = Math.min(aboutSection.offsetTop, getMaxScroll());
                  const distance = targetPosition - currentPosition;
                  const speed = 2000;
                  const duration = (Math.abs(distance) / speed) * 1000;
                  let startTime: any = null;

                  const animation = (currentTime: any) => {
                    if (startTime === null) startTime = currentTime;
                    const timeElapsed = currentTime - startTime;
                    const progress = Math.min(timeElapsed / duration, 1);
                    window.scrollTo(0, currentPosition + distance * progress);
                    if (timeElapsed < duration) requestAnimationFrame(animation);
                  };

                  requestAnimationFrame(animation);
                }
              }}
            >
              <span>Auto scroll</span>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </button>

          </div>
        </section>

        {/* Screens 1 → NEXT_SECTION_PIN. */}
        <div
          id="animation-runway"
          aria-hidden="true"
          style={{ height: runwayHeightVh(), width: '100%' }}
        />

        {/* The BlackHole now lives inside <About /> so it's scoped to the
            About section only — see About.tsx / Blackhole.tsx. */}
        <div style={{ pointerEvents: 'auto' }}>
          <About />
        </div>

        <Projects />
        <Contact />
      </main>
    </div>
  )
}