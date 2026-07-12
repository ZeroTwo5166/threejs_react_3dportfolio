import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Home } from './components/Home.jsx'

import './App.css'
import { runwayHeightVh, TL } from './components/Scrolltimeline.js'
import { CustomCursor } from './components/CustomCursor.js'
import { IntroText } from './components/Introtext.js'


export function getMaxScroll() {
  if (typeof window === 'undefined') return 0
  const doc = document.documentElement
  return Math.max(0, doc.scrollHeight - window.innerHeight)
}

export default function App() {
  const [titleIndex, setTitleIndex] = useState(0);
  const titles = [
    { text: "Software Developer", color: "#2b4570", bg: "#2b4570", shadow: "rgba(43, 69, 112, 0.15)" },
    { text: "Gamer", color: "#ff6b35", bg: "#ff6b35", shadow: "rgba(255, 107, 53, 0.15)" },
    { text: "Fullstack Developer", color: "#10b981", bg: "#10b981", shadow: "rgba(16, 185, 129, 0.15)" }
  ];


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
    <div id="page">

      <CustomCursor />

      {/* Fixed 3D stage — the page scrolls over it. */}
      <div id="canvas-container">
        <Canvas shadows camera={{ position: [0, 30, 150], fov: 25 }}>
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
          <div id="hero-text" className="hero-container">
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
                  // Land where the About panel pins, but never past the
                  // actual end of the document. The old target
                  // (timeline.DEADZONE_END) sits BELOW the page bottom on
                  // most screens, so the animation kept feeding scrollTo
                  // positions that don't exist.
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

        {/* Screens 1 → NEXT_SECTION_PIN. Pure CSS vh — sized from the same
            constants the animation reads, so the runway is always exactly
            long enough for the full typing → stand → turn → walk → jump
            sequence, on any device, with no JS layout math. */}
        <div
          id="animation-runway"
          aria-hidden="true"
          style={{ height: runwayHeightVh(), width: '100%' }}
        />

        {/* Pins at exactly TL.NEXT_SECTION_PIN screens of scroll (the jump
            has just landed). Replace with your About section. */}
        <section id="about" className="scroll-section next-section">
          <div className="hero-content">
            <h2>About</h2>
            <p>
              This section's top reaches the viewport top at scroll ={' '}
              {TL.NEXT_SECTION_PIN} screens — right after JUMP_END ({TL.JUMP_END}).
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}