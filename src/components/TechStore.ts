export type SystemLabel = 'CORE' | 'FRONTEND' | 'DATA CORE' | 'RUNTIME' | 'VISUALS'

type Listener = (selected: SystemLabel | null) => void

let selectedSystem: SystemLabel | null = null
const listeners = new Set<Listener>()

export const techStore = {
  getSelected: (): SystemLabel | null => selectedSystem,

  // Toggle behaviour: clicking the already-active system deselects it.
  toggle(label: SystemLabel) {
    selectedSystem = selectedSystem === label ? null : label
    listeners.forEach((l) => l(selectedSystem))
  },

  clear() {
    if (selectedSystem === null) return
    selectedSystem = null
    listeners.forEach((l) => l(null))
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

// Maps each About-panel system row to the logo names used in Avatar.tsx's
// TECH_ICONS array. One row can light up several logos (e.g. FRONTEND).
export const SYSTEM_TECHS: Record<SystemLabel, string[]> = {
  CORE: ['csharp'],
  FRONTEND: ['react', 'nextjs', 'angular'],
  'DATA CORE': ['mssql'],
  RUNTIME: ['node', 'ubuntu'],
  VISUALS: ['threejs'],
}