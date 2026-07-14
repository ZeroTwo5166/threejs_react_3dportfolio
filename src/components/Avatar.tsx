import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useGraph } from '@react-three/fiber'
import { useGLTF, useAnimations, useFBX, useTexture, Sparkles, Billboard } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import { useControls } from 'leva'
import { TL, ABOUT_UNPIN, useViewportUnit, scrollScreens, avatarPhase } from './Scrolltimeline'
import type { AvatarPhaseName } from './Scrolltimeline'
import { SYSTEM_TECHS, techStore } from './TechStore'

type AvatarProps = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
}

// ─── Tech stack that orbits the stasis pod, sun-and-planets style ──────────
type TechIcon = { name: string; tex: string; size?: number; focusScale?: number }


const PLANET_SIZE_SCALE = 0.7

const TECH_ICONS: TechIcon[] = [
  { name: 'angular', tex: '/logos/angular.png' },
  { name: 'csharp',  tex: '/logos/csharp.png' },
  { name: 'mssql',   tex: '/logos/mssql.png', size: 9, focusScale: 1.25 },
  { name: 'nextjs',  tex: '/logos/nextjs.png' },
  { name: 'node',    tex: '/logos/node.png' },
  { name: 'react',   tex: '/logos/react.png' },
  { name: 'threejs', tex: '/logos/threejs.png' },
  { name: 'ubuntu',  tex: '/logos/linux.png' },
]

// ─── Focus animation tuning ─────────────────────────────────────────────────
// How the orbit logos react when a system row is toggled in the About panel.
const FOCUS_SCALE_MULT   = 1.7   // highlighted logo grows to 170%
const DIM_SCALE_MULT     = 0.8   // non-focused logos shrink slightly
const DIM_OPACITY        = 0.18  // ...and fade back
const FOCUS_LERP         = 0.08  // per-frame easing toward targets
const FOCUS_ORBIT_FACTOR = 0.15  // orbit slows to 15% speed while focused

// ─── Stasis Pod defaults ────────────────────────────────────────────────────
// These seed the Leva panel's initial slider values. Drag the panel to
// reposition the pod for the About section, then read the values off the
// panel and update these defaults to lock them back in.
//
// IMPORTANT: podX/podY/podZ are treated as WORLD-space coordinates (see
// the worldToLocal conversion in useFrame below) — they are NOT the same
// as the pod's local position inside its parent group.
const POD_DEFAULTS = {
  x: -1.2,
  y: -6.5,
  z: 42.1,
  scale: 7.1,
  rotY: 1.83,
}

// ─── Avatar-in-pod defaults ─────────────────────────────────────────────────
// During the jump the avatar model blends toward the pod: it shrinks to
// `scale` and moves to (pod position + x/y/z offset). The offsets are
// RELATIVE TO THE POD in the pod's parent space, so repositioning the pod
// via the Leva sliders keeps the avatar seated correctly inside it.
// Tune live via the "Avatar in Pod" Leva folder, then copy values here.
const IN_POD_DEFAULTS = {
  scale: 0.64,
  x: -23.5,
  y: -2.0,
  z: -8.5,
}

// ─── Small-screen pod layout ────────────────────────────────────────────────
// Below this viewport width the About panel stacks on TOP (see the
// max-width: 2000px rules in About.tsx) and the pod is AUTO-FITTED to the
// lower part of the viewport: its bottom is anchored just above the
// viewport's bottom edge, and its scale is capped so it occupies at most
// `heightFrac` of the viewport height. Both are computed by projecting
// through the real camera every frame, so the pod can never extend below
// the viewport — which is what previously made it hang over the Projects
// section during the exit, and left dead space on phones.
const SMALL_SCREEN = {
  breakpoint: 2200, // px — must match the About.tsx media query
  xOffset: 20,       // world-units horizontal shift (e.g. to centre the pod)
  yOffset: -6.7,
  heightFrac: 0.68,  // pod may fill at most this fraction of the viewport height
  bottomNdc: -0.95, // pod bottom anchor, in NDC (-1 = exact viewport bottom)
}

// ─── Tech Orbit (old Leva defaults, hardcoded) ─────────────────────────────
// The pod is the "sun", these logos are the "planets". Positions start on
// an evenly-spaced radius-25 circle — the same layout the old Leva sliders
// defaulted to before anything was dragged. Adjust x/y/z per icon here if
// you want to hand-tune specific spots later.
const ORBIT = {
  autoOrbit: true,
  speed: 1,
  tilt: 0,
  yOffset: 3.0,
}

const ORBIT_RADIUS = 18

type OrbitPlanetData = {
  name: string
  x: number
  y: number
  z: number
  size: number
  focusScale?: number
}

const orbitPlanets: OrbitPlanetData[] = TECH_ICONS.map((icon, i) => {
  const angle = (i / TECH_ICONS.length) * Math.PI * 2 - Math.PI / 2
  return {
    name: icon.name,
    x: Number((ORBIT_RADIUS * Math.cos(angle)).toFixed(1)),
    y: 0,
    z: Number((ORBIT_RADIUS * Math.sin(angle)).toFixed(1)),
    size: (icon.size ?? 6) * PLANET_SIZE_SCALE,
    focusScale: icon.focusScale,
  }
})

// A single "planet" — a billboarded logo plane that always faces the
// camera. Reacts to the About panel: when a system row is toggled on (via
// techStore), the matching logo eases up in scale while every other logo
// shrinks and dims. Driven per-frame from the store — no React re-renders.
type OrbitPlanetProps = {
  name: string
  texture: THREE.Texture
  position: [number, number, number]
  size: number
  focusScale?: number
}

function OrbitPlanet({ name, texture, position, size, focusScale = FOCUS_SCALE_MULT }: OrbitPlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    const selected = techStore.getSelected()
    const focusSet = selected ? SYSTEM_TECHS[selected] : null

    let targetScale = size
    let targetOpacity = 1

    if (focusSet) {
      if (focusSet.includes(name)) {
        targetScale = size * focusScale
      } else {
        targetScale = size * DIM_SCALE_MULT
        targetOpacity = DIM_OPACITY
      }
    }

    if (meshRef.current) {
      const s = THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, FOCUS_LERP)
      meshRef.current.scale.setScalar(s)
    }
    if (matRef.current) {
      matRef.current.opacity = THREE.MathUtils.lerp(matRef.current.opacity, targetOpacity, FOCUS_LERP)
    }
  })

  return (
    <Billboard position={position} follow>
      <mesh ref={meshRef} scale={size}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={matRef}
          map={texture}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  )
}

// The full orbit system — logos spin slowly around the pod (toggle via
// `autoOrbit`). While a system is focused from the About panel, the spin
// eases down to a crawl so the highlighted logo is easy to look at.
type TechOrbitProps = {
  planets: OrbitPlanetData[]
  autoOrbit: boolean
  speed: number
  tilt: number
}

function TechOrbit({ planets, autoOrbit, speed, tilt }: TechOrbitProps) {
  const textures = useTexture(TECH_ICONS.map((t) => t.tex))
  const spinRef = useRef<THREE.Group>(null)
  const currentSpeed = useRef(speed)

  useFrame((state, delta) => {
    if (autoOrbit && spinRef.current) {
      const focused = techStore.getSelected() !== null
      const targetSpeed = focused ? speed * FOCUS_ORBIT_FACTOR : speed
      currentSpeed.current = THREE.MathUtils.lerp(currentSpeed.current, targetSpeed, 0.05)
      spinRef.current.rotation.y += delta * currentSpeed.current
    }
  })

  return (
    <group rotation-x={tilt}>
      <group ref={spinRef}>
        {planets.map((p, i) => (
          <OrbitPlanet
            key={p.name}
            name={p.name}
            texture={textures[i]}
            position={[p.x, p.y, p.z]}
            size={p.size}
            focusScale={p.focusScale}
          />
        ))}
      </group>
    </group>
  )
}

useTexture.preload(TECH_ICONS.map((t) => t.tex))

// Which clip renders each phase. 'standing' holds SitToStand's last frame;
// 'landed' holds Jumping's last frame.
const PHASE_CLIP: Record<AvatarPhaseName, 'Typing' | 'SitToStand' | 'Turning' | 'Walking' | 'Jumping'> = {
  typing: 'Typing',
  sitToStand: 'SitToStand',
  standing: 'SitToStand',
  turning: 'Turning',
  walking: 'Walking',
  jumping: 'Jumping',
  landed: 'Jumping',
}

// World-space point the head/neck snap to once standing (old tuning).
const HEAD_FOLLOW_TARGET = new THREE.Vector3(-32, 138, 253)

export function Avatar(props: AvatarProps) {
  const vhPx = useViewportUnit()

  const group = useRef<THREE.Group>(null)
  const podRef = useRef<THREE.Group>(null)
  const modelRef = useRef<THREE.Group>(null) // blends the model into the pod during the jump
  const defaultNeckRotation = useRef<THREE.Quaternion | null>(null)
  const defaultHeadRotation = useRef<THREE.Quaternion | null>(null)
  const snappedToCamera = useRef(false)
  const isAtTop = useRef(true)

  // Reused every frame for the world→local pod position conversion, so we
  // don't allocate a new Vector3 60 times a second.
  const podWorldTarget = useRef(new THREE.Vector3())
  // Scratch vectors for the per-frame camera projection probes and the
  // parent world-scale lookup used by the small-screen auto-fit.
  const probeA = useRef(new THREE.Vector3())
  const probeB = useRef(new THREE.Vector3())
  const parentScaleTmp = useRef(new THREE.Vector3())

  // ── Stasis Pod controls — drag these live to reposition the pod for the
  // About section. podX/podY/podZ are WORLD-space coordinates (converted
  // to local space each frame below), so the sliders behave the same
  // regardless of how much the parent chain (chair-swivel rotation, scene
  // rotation) currently has applied.
  // podLocked skips the scroll-driven rise animation and just pins the pod
  // at (podX, podY, podZ) so you can see it immediately without scrolling
  // all the way to the jump landing every time you tweak a value. Turn it
  // back off once you're happy with the position.
  const { podX, podY, podZ, podScale, podRotY, podLocked } = useControls('Stasis Pod', {
    podX: { value: POD_DEFAULTS.x, min: -100, max: 100, step: 0.1 },
    podY: { value: POD_DEFAULTS.y, min: -100, max: 100, step: 0.1 },
    podZ: { value: POD_DEFAULTS.z, min: -200, max: 200, step: 0.1 },
    podScale: { value: POD_DEFAULTS.scale, min: 0.1, max: 50, step: 0.1 },
    podRotY: { value: POD_DEFAULTS.rotY, min: -Math.PI, max: Math.PI, step: 0.01 },
    podLocked: { value: false, label: 'Lock pod visible (tuning mode)' },
  })

  // ── Avatar-in-pod controls — how the model shrinks/repositions into the
  // pod during the jump. Offsets are relative to the pod. Turn podLocked
  // on and scroll past the jump (phase 'landed') to tune the seated pose.
  const { inPodScale, inPodX, inPodY, inPodZ } = useControls('Avatar in Pod', {
    inPodScale: { value: IN_POD_DEFAULTS.scale, min: 0.05, max: 1, step: 0.01 },
    inPodX: { value: IN_POD_DEFAULTS.x, min: -30, max: 30, step: 0.1 },
    inPodY: { value: IN_POD_DEFAULTS.y, min: -30, max: 30, step: 0.1 },
    inPodZ: { value: IN_POD_DEFAULTS.z, min: -30, max: 30, step: 0.1 },
  })

  // ── Small-screen pod controls — how the pod auto-fits when the viewport
  // is narrower than SMALL_SCREEN.breakpoint. heightFrac is the main knob:
  // how much of the viewport height the pod may occupy (it stays anchored
  // to the bottom edge regardless).
  const { smallXOffset, smallYOffset, smallHeightFrac } = useControls('Pod (below 2000px)', {
    smallXOffset: { value: SMALL_SCREEN.xOffset, min: -60, max: 60, step: 0.1 },
    smallYOffset: { value: SMALL_SCREEN.yOffset, min: -60, max: 60, step: 0.1 }, // <-- ADD THIS
    smallHeightFrac: { value: SMALL_SCREEN.heightFrac, min: 0.2, max: 0.85, step: 0.01 },
  })

  // 0 = wide layout, 1 = stacked layout; target flips on resize, the
  // per-frame value eases toward it so the pod glides instead of popping.
  const smallTargetRef = useRef(
    typeof window !== 'undefined' && window.innerWidth < SMALL_SCREEN.breakpoint ? 1 : 0
  )
  const smallTRef = useRef(smallTargetRef.current)
  useEffect(() => {
    const onResize = () => {
      smallTargetRef.current = window.innerWidth < SMALL_SCREEN.breakpoint ? 1 : 0
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Model ────────────────────────────────────────────────────────────────
  const { scene } = useGLTF('models/Avatar-transformed.glb')
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes } = useGraph(clone)

  // ── Stasis pod ───────────────────────────────────────────────────────────
  const { scene: podScene } = useGLTF('models/transparentStasisPod.glb')
  const podClone = useMemo(() => {
    const cloned = SkeletonUtils.clone(podScene)
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh
      if ((mesh as any).isMesh) {
        // Force the GPU to never cull this model, ensuring it pre-compiles
        mesh.frustumCulled = false

        const material = mesh.material as THREE.Material | THREE.Material[] | undefined
        const materials = Array.isArray(material) ? material : material ? [material] : []
        materials.forEach((mat) => {
          // Force the glass to render properly over the avatar and smoke
          if (mat.transparent || mat.opacity < 1) {
            mat.transparent = true
            mat.depthWrite = false
            // Force the glass to render AFTER the smoke
            mesh.renderOrder = 2
          }
        })
      }
    })
    return cloned
  }, [podScene])

  // Half the pod's height in its own (unscaled) local units — measured once,
  // used by the small-screen auto-fit to convert "fraction of viewport"
  // into a concrete pod scale and to anchor the pod's bottom edge.
  const podBaseHalfHeight = useMemo(() => {
    const box = new THREE.Box3().setFromObject(podClone)
    const size = box.getSize(new THREE.Vector3())
    return Math.max(size.y / 2, 1e-6)
  }, [podClone])

  useEffect(() => {
    const neck = nodes.mixamorigNeck as THREE.Bone | undefined
    const head = nodes.mixamorigHead as THREE.Bone | undefined
    if (neck) defaultNeckRotation.current = neck.quaternion.clone()
    if (head) defaultHeadRotation.current = head.quaternion.clone()
  }, [nodes])

  // ── Clips ────────────────────────────────────────────────────────────────
  const { animations: typingAnimation } = useFBX('animations/Typing.fbx')
  const { animations: standingAnimation } = useFBX('animations/Idle.fbx')
  const { animations: sitToStandAnimation } = useFBX('animations/Sit_To_Stand.fbx')
  const { animations: turningAnimation } = useFBX('animations/Turning.fbx')
  const { animations: walkingAnimation } = useFBX('animations/Walking.fbx')
  const { animations: jumpingAnimation } = useFBX('animations/Jumping.fbx')

  // ── Track stitching (ported verbatim) ────────────────────────────────────
  // Pins the turn clip in place at the sit-to-stand end pose, then rebases
  // the walk clip to start at the turn's end (position + rotation), then
  // rebases the jump to start at the walk's end — so scrubbing across phase
  // boundaries never teleports the hips.
  useMemo(() => {
    if (!sitToStandAnimation[0] || !turningAnimation[0] || !walkingAnimation[0] || !jumpingAnimation[0]) return

    const stripHeadAndNeck = (anim: THREE.AnimationClip[]) => {
      anim[0].tracks = anim[0].tracks.filter(
        (t) => !t.name.includes('Neck') && !t.name.includes('Head')
      )
    }

    stripHeadAndNeck(sitToStandAnimation)
    stripHeadAndNeck(turningAnimation)
    stripHeadAndNeck(walkingAnimation)
    stripHeadAndNeck(jumpingAnimation)

    const find = (clip: THREE.AnimationClip, name: string) =>
      clip.tracks.find((t) => t.name.includes(name))

    const sitPosTrack = find(sitToStandAnimation[0], 'mixamorigHips.position')
    const turnPosTrack = find(turningAnimation[0], 'mixamorigHips.position')
    const turnQuatTrack = find(turningAnimation[0], 'mixamorigHips.quaternion')
    const walkPosTrack = find(walkingAnimation[0], 'mixamorigHips.position')
    const walkQuatTrack = find(walkingAnimation[0], 'mixamorigHips.quaternion')
    const jumpPosTrack = find(jumpingAnimation[0], 'mixamorigHips.position')
    const jumpQuatTrack = find(jumpingAnimation[0], 'mixamorigHips.quaternion')

    if (!sitPosTrack || !turnPosTrack || !walkPosTrack || !turnQuatTrack || !walkQuatTrack || !jumpPosTrack || !jumpQuatTrack) return

    const sitLen = sitPosTrack.values.length
    const finalX = sitPosTrack.values[sitLen - 3]
    const finalY = sitPosTrack.values[sitLen - 2]
    const finalZ = sitPosTrack.values[sitLen - 1]
    for (let i = 0; i < turnPosTrack.values.length; i += 3) {
      turnPosTrack.values[i] = finalX
      turnPosTrack.values[i + 1] = finalY
      turnPosTrack.values[i + 2] = finalZ
    }

    const walkStartX = walkPosTrack.values[0]
    const walkStartY = walkPosTrack.values[1]
    const walkStartZ = walkPosTrack.values[2]

    const tqLen = turnQuatTrack.values.length
    const finalTurnQ = new THREE.Quaternion(
      turnQuatTrack.values[tqLen - 4],
      turnQuatTrack.values[tqLen - 3],
      turnQuatTrack.values[tqLen - 2],
      turnQuatTrack.values[tqLen - 1]
    )
    const startWalkQ = new THREE.Quaternion(
      walkQuatTrack.values[0], walkQuatTrack.values[1],
      walkQuatTrack.values[2], walkQuatTrack.values[3]
    )
    const qOffset = finalTurnQ.clone().multiply(startWalkQ.clone().invert())

    for (let i = 0; i < walkQuatTrack.values.length; i += 4) {
      const q = new THREE.Quaternion(
        walkQuatTrack.values[i], walkQuatTrack.values[i + 1],
        walkQuatTrack.values[i + 2], walkQuatTrack.values[i + 3]
      )
      q.premultiply(qOffset)
      walkQuatTrack.values[i] = q.x
      walkQuatTrack.values[i + 1] = q.y
      walkQuatTrack.values[i + 2] = q.z
      walkQuatTrack.values[i + 3] = q.w
    }
    for (let i = 0; i < walkPosTrack.values.length; i += 3) {
      const local = new THREE.Vector3(
        walkPosTrack.values[i] - walkStartX,
        walkPosTrack.values[i + 1] - walkStartY,
        walkPosTrack.values[i + 2] - walkStartZ
      )
      local.applyQuaternion(qOffset)
      walkPosTrack.values[i] = finalX + local.x
      walkPosTrack.values[i + 1] = finalY + local.y
      walkPosTrack.values[i + 2] = finalZ + local.z
    }

    const wLen = walkPosTrack.values.length
    const walkEndX = walkPosTrack.values[wLen - 3]
    const walkEndY = walkPosTrack.values[wLen - 2]
    const walkEndZ = walkPosTrack.values[wLen - 1]

    const wqLen = walkQuatTrack.values.length
    const walkEndQ = new THREE.Quaternion(
      walkQuatTrack.values[wqLen - 4], walkQuatTrack.values[wqLen - 3],
      walkQuatTrack.values[wqLen - 2], walkQuatTrack.values[wqLen - 1]
    )
    const jumpStartQ = new THREE.Quaternion(
      jumpQuatTrack.values[0], jumpQuatTrack.values[1],
      jumpQuatTrack.values[2], jumpQuatTrack.values[3]
    )

    const jumpQOffset = walkEndQ.clone().multiply(jumpStartQ.clone().invert())

    // Keep only the yaw component so the jump doesn't inherit lean.
    const jumpEuler = new THREE.Euler().setFromQuaternion(jumpQOffset, 'YXZ')
    jumpEuler.x = 0
    jumpEuler.z = 0
    jumpQOffset.setFromEuler(jumpEuler)

    for (let i = 0; i < jumpQuatTrack.values.length; i += 4) {
      const q = new THREE.Quaternion(
        jumpQuatTrack.values[i], jumpQuatTrack.values[i + 1],
        jumpQuatTrack.values[i + 2], jumpQuatTrack.values[i + 3]
      )
      q.premultiply(jumpQOffset)
      jumpQuatTrack.values[i] = q.x
      jumpQuatTrack.values[i + 1] = q.y
      jumpQuatTrack.values[i + 2] = q.z
      jumpQuatTrack.values[i + 3] = q.w
    }

    const jumpStartX = jumpPosTrack.values[0]
    const jumpStartY = jumpPosTrack.values[1]
    const jumpStartZ = jumpPosTrack.values[2]

    for (let i = 0; i < jumpPosTrack.values.length; i += 3) {
      const local = new THREE.Vector3(
        jumpPosTrack.values[i] - jumpStartX,
        jumpPosTrack.values[i + 1] - jumpStartY,
        jumpPosTrack.values[i + 2] - jumpStartZ
      )
      local.applyQuaternion(jumpQOffset)
      jumpPosTrack.values[i] = walkEndX + local.x
      jumpPosTrack.values[i + 1] = walkEndY + local.y
      jumpPosTrack.values[i + 2] = walkEndZ + local.z
    }
  }, [sitToStandAnimation, turningAnimation, walkingAnimation, jumpingAnimation])

  typingAnimation[0].name = 'Typing'
  standingAnimation[0].name = 'Standing'
  sitToStandAnimation[0].name = 'SitToStand'
  turningAnimation[0].name = 'Turning'
  walkingAnimation[0].name = 'Walking'
  jumpingAnimation[0].name = 'Jumping'

  const clips = useMemo(
    () => [
      typingAnimation[0],
      standingAnimation[0],
      sitToStandAnimation[0],
      turningAnimation[0],
      walkingAnimation[0],
      jumpingAnimation[0],
    ],
    [typingAnimation, standingAnimation, sitToStandAnimation, turningAnimation, walkingAnimation, jumpingAnimation]
  )

  const { actions, mixer } = useAnimations(clips, group)

  useEffect(() => {
    if (!actions || !mixer) return
    for (const name of ['SitToStand', 'Turning', 'Walking', 'Jumping'] as const) {
      const a = actions[name]
      if (a) {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = true
      }
    }
    actions['Typing']?.reset().play()
  }, [actions, mixer])

  useEffect(() => () => { mixer?.stopAllAction() }, [mixer])

  // ── Scroll-scrubbed phase machine ────────────────────────────────────────
  useFrame((state) => {
    const s = scrollScreens(vhPx)
    const { phase, p } = avatarPhase(s)

    // Head snaps to the camera target once the stand-up completes.
    if (!snappedToCamera.current && phase === 'sitToStand' && p >= 1) {
      snappedToCamera.current = true
    }
    if (phase !== 'typing' && phase !== 'sitToStand') snappedToCamera.current = true

    const headFollowActive = snappedToCamera.current && s >= TL.HEAD_FOLLOW_START
    const neck = nodes.mixamorigNeck as THREE.Bone | undefined
    const head = nodes.mixamorigHead as THREE.Bone | undefined

    if (headFollowActive) {
      neck?.lookAt(HEAD_FOLLOW_TARGET)
      head?.lookAt(HEAD_FOLLOW_TARGET)
    } else {
      if (defaultNeckRotation.current && neck) neck.quaternion.slerp(defaultNeckRotation.current, 0.1)
      if (defaultHeadRotation.current && head) head.quaternion.slerp(defaultHeadRotation.current, 0.1)
    }

    // ── Small-screen layout: bottom-anchored auto-fit ────────────────────
    // Eases 0→1 when the viewport drops below SMALL_SCREEN.breakpoint.
    // Instead of blind world-unit offsets (which could push the pod's tail
    // below the viewport — making it bleed over the Projects section on
    // exit, and leaving dead space on phones), the pod's resting position
    // and scale are derived from the camera projection itself:
    //   • scale is capped so the pod is at most `smallHeightFrac` of the
    //     viewport height,
    //   • its bottom edge is anchored at SMALL_SCREEN.bottomNdc — just
    //     above the viewport's bottom edge.
    // Because the pod then always fits inside the viewport while pinned,
    // the enter/exit lockstep carries it fully off-screen exactly as About
    // leaves — it geometrically cannot overlap neighbouring sections.
    smallTRef.current = THREE.MathUtils.lerp(smallTRef.current, smallTargetRef.current, 0.08)
    const smallT = smallTRef.current
    const effPodX = podX + smallXOffset * smallT

    // Linear fit of NDC-y as a function of world-y at the pod's depth,
    // from two projected probe points. 1 screen of scroll = 2 NDC units,
    // so the true viewport height in world units is 2 / ndcPerY — used
    // both for the auto-fit and for the enter/exit lockstep (more accurate
    // than the fov/tan estimate if the camera is ever pitched).
    const cam = state.camera as THREE.PerspectiveCamera
    probeA.current.set(effPodX, 0, podZ).project(cam)
    const ndcAtY0 = probeA.current.y
    probeB.current.set(effPodX, 10, podZ).project(cam)
    const ndcPerY = (probeB.current.y - ndcAtY0) / 10

    let effPodY = podY
    let effPodScale = podScale

    if (podRef.current && podRef.current.parent && ndcPerY > 1e-6 && smallT > 0.001) {
      const viewportWorldH = 2 / ndcPerY
      // The pod's rendered size also inherits its parents' scale (e.g. the
      // responsive scene shrink in Home.tsx), so fit against world scale.
      const parentScaleY =
        podRef.current.parent.getWorldScale(parentScaleTmp.current).y || 1

      const maxHalfWorld = (smallHeightFrac * viewportWorldH) / 2
      const fitScale = Math.min(
        podScale,
        maxHalfWorld / (podBaseHalfHeight * parentScaleY)
      )
      const halfWorld = podBaseHalfHeight * fitScale * parentScaleY

      // World-space Y whose projection lands on the bottom anchor line.
      const bottomWorldY = (SMALL_SCREEN.bottomNdc - ndcAtY0) / ndcPerY
      
      // --> ADD smallYOffset TO THIS LINE <--
      const smallRestY = bottomWorldY + halfWorld + smallYOffset 

      effPodY = THREE.MathUtils.lerp(podY, smallRestY, smallT)
      effPodScale = THREE.MathUtils.lerp(podScale, fitScale, smallT)
    }

    // How much the small-screen fit shrank the pod relative to the wide
    // layout — the seated avatar's in-pod scale/offsets follow this.
    const podShrink = effPodScale / Math.max(podScale, 1e-6)

    // ── Stasis pod — glued to the About section ──────────────────────────
    // Three regimes, all moving at exactly one viewport of world units
    // (at the pod's depth) per screen of scroll, LINEARLY — the same rate
    // the page content moves — so the pod never slides relative to About:
    //   1. ENTER  (NEXT_SECTION_PIN-1 → NEXT_SECTION_PIN): rises with
    //      About's top edge, from one screen below its resting spot.
    //   2. PINNED (NEXT_SECTION_PIN → ABOUT_UNPIN): About's sticky is
    //      pinned; the pod holds at its resting Y.
    //   3. EXIT   (s > ABOUT_UNPIN): About scrolls off the top; the pod
    //      rides up with it and leaves the viewport.
    // Outside a small margin around that window the pod group is hidden
    // entirely, so it can never bleed over neighbouring sections (and the
    // Sparkles stop costing anything).
    //
    // podX/podY/podZ are WORLD-space coordinates — podRef is nested inside
    // rotated parent groups, so the desired world target is converted
    // through parent.worldToLocal() each frame. That keeps the Leva
    // sliders behaving like plain world coordinates no matter what the
    // chair/scene rotation is doing.
    if (podRef.current && podRef.current.parent) {
      podRef.current.scale.set(effPodScale, effPodScale, effPodScale)
      podRef.current.rotation.set(0, podRotY, 0)

      let targetWorldY: number

      if (podLocked) {
        targetWorldY = effPodY
        podRef.current.visible = true
      } else {
        const worldPerScreen =
          ndcPerY > 1e-6
            ? 2 / ndcPerY
            : 2 *
              Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) *
              Math.abs(cam.position.z - podZ)

        const riseStart = TL.NEXT_SECTION_PIN - 1

        if (s <= ABOUT_UNPIN) {
          // ENTER + PINNED
          const riseP = Math.max(0, Math.min(s - riseStart, 1))
          targetWorldY = effPodY - (1 - riseP) * worldPerScreen
        } else {
          // EXIT — rides up with About as it scrolls off
          targetWorldY = effPodY + (s - ABOUT_UNPIN) * worldPerScreen
        }

        // Hidden until the entry window approaches, and again once the
        // exit has carried it well past the top of the viewport.
        podRef.current.visible = s > riseStart - 0.1 && s < ABOUT_UNPIN + 1.5
      }

      podWorldTarget.current.set(effPodX, targetWorldY, podZ)
      const localTarget = podRef.current.parent.worldToLocal(podWorldTarget.current.clone())
      podRef.current.position.copy(localTarget)
    }

    // ── Avatar shrinks into the pod during the jump ──────────────────────
    // Blends the model wrapper from its rest transform (scale 1, origin)
    // toward the pod's CURRENT local position + tuned offset. Tracking
    // podRef.position live means the avatar rides the pod through both
    // the rise AND the exit — it's glued to the About section for free.
    // Runs after the pod block above so this frame's pod position is
    // fresh. Once landed, the model shares the pod's visibility so it
    // can't linger over other sections either.
    if (modelRef.current && podRef.current) {
      let t = 0
      if (phase === 'jumping') t = p
      else if (phase === 'landed') t = 1

      const eased = t * t * (3 - 2 * t) // smoothstep — soft start and landing

      // The in-pod scale AND offsets are multiplied by podShrink so the
      // seated avatar stays proportionally placed inside the pod when the
      // small-screen layout shrinks it.
      const sc = THREE.MathUtils.lerp(1, inPodScale * podShrink, eased)
      modelRef.current.scale.setScalar(sc)

      modelRef.current.position.set(
        (podRef.current.position.x + inPodX * podShrink) * eased,
        (podRef.current.position.y + inPodY * podShrink) * eased,
        (podRef.current.position.z + inPodZ * podShrink) * eased,
      )

      modelRef.current.visible = phase === 'landed' ? podRef.current.visible : true
    }

    const typing = actions['Typing']
    const sitToStand = actions['SitToStand']
    const turning = actions['Turning']
    const walking = actions['Walking']
    const jumping = actions['Jumping']
    if (!typing || !sitToStand || !turning || !walking || !jumping) return

    // At the very top: live typing loop.
    if (s <= 0) {
      if (!isAtTop.current) {
        isAtTop.current = true
        snappedToCamera.current = false
        typing.reset().setEffectiveWeight(1).play()
        typing.crossFadeFrom(sitToStand, 0.25, true)
        turning.setEffectiveWeight(0)
        walking.setEffectiveWeight(0)
        jumping.setEffectiveWeight(0)
      }
      typing.paused = false
      return
    }

    // Leaving the top: hand off to the scroll-scrubbed actions.
    if (isAtTop.current) {
      isAtTop.current = false
      sitToStand.reset().setEffectiveWeight(1).play()
      sitToStand.crossFadeFrom(typing, 0.15, true)
      turning.reset().setEffectiveWeight(0).play()
      walking.reset().setEffectiveWeight(0).play()
      jumping.reset().setEffectiveWeight(0).play()
    }

    sitToStand.paused = true
    turning.paused = true
    walking.paused = true
    jumping.paused = true

    // One clip active per phase; time scrubbed by phase progress.
    const activeClip = PHASE_CLIP[phase]
    sitToStand.setEffectiveWeight(activeClip === 'SitToStand' ? 1 : 0)
    turning.setEffectiveWeight(activeClip === 'Turning' ? 1 : 0)
    walking.setEffectiveWeight(activeClip === 'Walking' ? 1 : 0)
    jumping.setEffectiveWeight(activeClip === 'Jumping' ? 1 : 0)

    switch (phase) {
      case 'sitToStand':
        sitToStand.time = p * sitToStand.getClip().duration
        break
      case 'standing':
        sitToStand.time = sitToStand.getClip().duration
        break
      case 'turning':
        turning.time = p * turning.getClip().duration
        break
      case 'walking':
        walking.time = p * walking.getClip().duration
        break
      case 'jumping':
        jumping.time = p * jumping.getClip().duration
        break
      case 'landed':
        jumping.time = jumping.getClip().duration
        break
      default:
        break
    }
  })

  return (
    <group ref={group} {...props} dispose={null}>
      {/* Pod and Smoke are siblings inside the same podRef group, so they
          scale and travel together perfectly. */}
      <group ref={podRef}>
        <primitive object={podClone} />
        <Sparkles
          count={5000}
          scale={[1.7, 5, 1.2]}
          size={100}
          speed={15}
          opacity={0.4}
          color="#F5F5F5"
          noise={2}
          position={[0, 2.5, 0]}
        />

        {/* Tech stack orbiting the pod like planets around a sun. Nested
            here so it rises with the pod and inherits its position/rotation
            for free. Counter-scaled so each icon's manual X/Y/Z stays in
            real world units regardless of podScale — but the counter-scale
            deliberately does NOT cancel the small-screen podShrink, so the
            whole orbit shrinks with the pod in the stacked layout. */}
        <group
          scale={[1 / podScale, 1 / podScale, 1 / podScale]}
          position-y={ORBIT.yOffset}
        >
          <TechOrbit
            planets={orbitPlanets}
            autoOrbit={ORBIT.autoOrbit}
            speed={ORBIT.speed}
            tilt={ORBIT.tilt}
          />
        </group>
      </group>

      {/* Model wrapper — blended toward the pod during the jump (scale +
          position driven in useFrame). Inside it, the same orientation
          wrapper as before: the armature is authored lying "flat", so the
          rotation-x stands it up. */}
      <group ref={modelRef}>
        <group rotation-x={Math.PI / 2}>
          <primitive object={clone} />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('models/Avatar-transformed.glb')
useGLTF.preload('models/transparentStasisPod.glb')