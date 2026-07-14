// ─── BlackHole.tsx ────────────────────────────────────────────────────────
// A small, distant black hole that drifts across the deep-space background.
// Pure CSS — no canvas, no JS per-frame work — so it costs essentially
// nothing.
//
// SCOPED TO ITS PARENT SECTION: the layer is position:absolute (not fixed),
// so it fills whatever positioned ancestor it's rendered inside and is
// clipped to it. Render it as the first child of #about (see About.tsx)
// and it only ever shows there — it scrolls in and out with the section.
//
// Anatomy:
//   .bh-tilt  → tilts + squashes the accretion disk into an ellipse
//   .bh-disk  → spinning conic-gradient: bright doppler-beamed side,
//               dimmer receding side, blurred into a glow
//   .bh-ring  → the thin bright photon ring hugging the event horizon
//   .bh-core  → the event horizon itself: pure black
//
// Tune the vibe with the CSS custom props on .blackhole:
//   --bh-size   overall diameter ("far away" = keep it small)
//   --bh-drift  seconds for one full crossing of the screen
//   --bh-top    vertical position of its path (percent of the section)

export function BlackHole(): React.ReactElement {
  return (
    <div className="blackhole-layer" aria-hidden="true">
      <style>{`
        .blackhole-layer {
          position: absolute;   /* fills the nearest positioned ancestor (#about) */
          inset: 0;
          z-index: 0;           /* under the About panel (.about-sticky is z-index 1) */
          pointer-events: none;
          overflow: hidden;     /* clips the drift to the section bounds */
        }

        .blackhole {
          --bh-size: 110px;
          --bh-drift: 60s;
          --bh-top: 18%;

          position: absolute;
          top: var(--bh-top);
          left: 0;
          width: var(--bh-size);
          height: var(--bh-size);
          animation: bh-drift var(--bh-drift) linear infinite;
          will-change: transform, opacity;
        }

        /* Tilt wrapper: turns the spinning disc into an inclined ellipse.
           Separate from the spin so the two transforms don't fight. */
        .bh-tilt {
          position: absolute;
          inset: -65%;
          transform: rotate(-16deg) scaleY(0.34);
        }

        /* Accretion disk: conic gradient so one side is hot and bright
           (doppler beaming) and the other dim, blurred into a soft glow,
           slowly rotating. */
        .bh-disk {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            rgba(255, 190, 120, 0.0) 0deg,
            rgba(255, 170, 90, 0.35) 60deg,
            rgba(255, 214, 165, 0.85) 120deg,
            rgba(220, 235, 255, 0.9) 160deg,
            rgba(255, 178, 100, 0.5) 220deg,
            rgba(160, 80, 30, 0.18) 300deg,
            rgba(255, 190, 120, 0.0) 360deg
          );
          /* punch a hole in the middle of the disc so it reads as a ring
             of matter, not a glowing ball */
          -webkit-mask: radial-gradient(circle, transparent 26%, #000 34%, #000 62%, transparent 72%);
          mask: radial-gradient(circle, transparent 26%, #000 34%, #000 62%, transparent 72%);
          filter: blur(3px);
          animation: bh-spin 22s linear infinite;
        }

        /* Photon ring: razor-thin bright circle right at the horizon */
        .bh-ring {
          position: absolute;
          inset: 20%;
          border-radius: 50%;
          box-shadow:
            0 0 2px 1px rgba(255, 232, 205, 0.9),
            0 0 10px 2px rgba(255, 196, 130, 0.55),
            0 0 24px 6px rgba(255, 170, 90, 0.25);
        }

        /* Event horizon: perfectly black, sits on top of everything */
        .bh-core {
          position: absolute;
          inset: 21%;
          border-radius: 50%;
          background: #000;
        }

        @keyframes bh-spin {
          to { transform: rotate(360deg); }
        }

        /* Drifts fully across the screen with a slight downward slope,
           fading in/out at the edges so it never pops into existence. */
        @keyframes bh-drift {
          0%   { transform: translate(-15vw, 0) scale(0.9);   opacity: 0; }
          6%   { opacity: 0.85; }
          50%  { transform: translate(50vw, 3vh) scale(1);    opacity: 0.85; }
          94%  { opacity: 0.85; }
          100% { transform: translate(115vw, 6vh) scale(0.9); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .blackhole {
            animation: none;
            left: 70%;
            opacity: 0.7;
          }
          .bh-disk { animation: none; }
        }
      `}</style>

      <div className="blackhole">
        <div className="bh-tilt">
          <div className="bh-disk" />
        </div>
        <div className="bh-ring" />
        <div className="bh-core" />
      </div>
    </div>
  )
}