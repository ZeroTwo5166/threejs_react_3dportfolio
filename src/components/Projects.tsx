// Projects.tsx
//
// Placeholder — one full screen, white background. Swap the inner
// content for the real project cards later. The id="projects" is what
// the Navbar's scroll-spy and scrollTo() look for, so keep it.

export const Projects = () => {
  return (
    <section
      id="projects"
      style={{
        minHeight: '100vh',
        position: 'relative',
        backgroundColor: '#ffffff',
        // Same layering trick as About: sits above the fixed canvas (z:10
        // but pointer-events none) and the intro-text layer, so the white
        // background actually covers the scene as it scrolls up.
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          color: '#0f172a',
        }}
      >
        <p
          style={{
            fontSize: 'clamp(0.75rem, 2vw, 1rem)',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            margin: '0 0 0.75rem 0',
          }}
        >
          Section 02
        </p>
        <h2
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Projects
        </h2>
        <p
          style={{
            fontSize: 'clamp(0.9rem, 1.6vw, 1.05rem)',
            color: '#64748b',
            margin: '1rem 0 0 0',
          }}
        >
          Coming soon.
        </p>
      </div>
    </section>
  )
}