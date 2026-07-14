// A tiny external store so the DOM-side About panel can read the same
// "shrink factor" the Canvas-side pod computes every frame, without
// forcing 60fps React re-renders across the Canvas/DOM boundary.
type Listener = () => void

let shrink = 1
const listeners = new Set<Listener>()

export const podLayoutStore = {
  getShrink: () => shrink,
  setShrink: (value: number) => {
    // Only notify on meaningful change — avoids re-rendering About.tsx
    // on every sub-pixel easing step during the resize animation.
    if (Math.abs(value - shrink) > 0.002) {
      shrink = value
      listeners.forEach((l) => l())
    }
  },
  subscribe: (cb: Listener) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
}