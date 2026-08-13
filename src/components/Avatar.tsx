import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame, useGraph } from '@react-three/fiber'
import { useGLTF, useAnimations, useFBX, useTexture, Billboard } from '@react-three/drei'
import { SkeletonUtils, mergeBufferGeometries } from 'three-stdlib'
import * as THREE from 'three'
import { TL, ABOUT_UNPIN, useViewportUnit, scrollScreens, avatarPhase, dampLerp } from './Scrolltimeline'
import type { AvatarPhaseName } from './Scrolltimeline'
import { SYSTEM_TECHS, techStore } from './TechStore'
import { cursorStore } from './CustomCursor'

type AvatarProps = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
}

// ─── Tech stack that orbits the stasis pod, sun-and-planets style ──────────
type TechIcon = { name: string; tex: string; size?: number; focusScale?: number }

const PLANET_SIZE_SCALE = 0.7

const TECH_ICONS: TechIcon[] = [
  { name: 'angular', tex: '/logos/angular.webp' },
  { name: 'csharp', tex: '/logos/csharp.webp' },
  { name: 'mssql', tex: '/logos/mssql.webp', size: 9, focusScale: 1.25 },
  { name: 'nextjs', tex: '/logos/nextjs.webp' },
  { name: 'node', tex: '/logos/node.webp' },
  { name: 'react', tex: '/logos/react.webp' },
  { name: 'threejs', tex: '/logos/threejs.webp' },
  { name: 'ubuntu', tex: '/logos/linux.webp' },
]

// ─── Focus animation tuning ─────────────────────────────────────────────────
const FOCUS_SCALE_MULT = 1.7
const DIM_SCALE_MULT = 0.8
const DIM_OPACITY = 0.18
const FOCUS_LERP = 0.08
const FOCUS_ORBIT_FACTOR = 0.15

// ─── Stasis Pod defaults ────────────────────────────────────────────────────
const POD_DEFAULTS = {
  x: 2.5,
  y: -6.5,
  z: 42.1,
  scale: 7.1,
  rotY: 1.83,
}

// ─── Avatar-in-pod defaults (including rotation) ──────────────────────────
const IN_POD_DEFAULTS = {
  scale: 0.64,
  x: -23.5,
  y: -2.0,
  z: -8.5,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
}

// ─── Small-screen pod layout ────────────────────────────────────────────────
const SMALL_SCREEN = {
  breakpoint: 2200,
  xOffset: 15.8,
  yOffset: -2.2,
  heightFrac: 0.62,
  bottomNdc: -0.95,
}

// ─── Mobile stacked layout (≤1000px): pod on top, About panel below ────────
// Exported: About.tsx derives its "does the content fit?" check from these
// same values, so the two layouts can never drift apart.
export const MOBILE = {
  breakpoint: 1000,
  xOffset: 0,       // nudge from horizontal center
  yOffset: 0,       // nudge from the top-anchored rest position
  heightFrac: 0.34, // pod may occupy at most this fraction of viewport height
  topNdc: 0.67,     // NDC y where the pod's top edge sits (1 = very top)
}

// ─── Tech Orbit ─────────────────────────────────────────────────────────────
const ORBIT = {
  autoOrbit: true,
  speed: 0.5,
  tilt: 0,
  yOffset: 3.0,
}

const ORBIT_RADIUS = 18

type OrbitPlanetData = {
  name: string
  baseAngle: number
  radius: number
  y: number
  size: number
  focusScale?: number
}

const orbitPlanets: OrbitPlanetData[] = TECH_ICONS.map((icon, i) => {
  const angle = (i / TECH_ICONS.length) * Math.PI * 2 - Math.PI / 2
  return {
    name: icon.name,
    baseAngle: angle,
    radius: ORBIT_RADIUS,
    y: 0,
    size: (icon.size ?? 6) * PLANET_SIZE_SCALE,
    focusScale: icon.focusScale,
  }
})

// ─── Orbit Planet component ─────────────────────────────────────────────────
// Position is computed directly here (pure translation) each frame from a
// shared angle ref, rather than by rotating a parent group and letting
// Billboard's position sweep automatically. drei's Billboard computes its
// camera-facing counter-rotation from its own matrixWorld via
// updateWorldMatrix(false, false) — it does NOT force its parent's matrix
// to refresh first, and Object3D.matrixWorld is a cached value only
// recomputed during the renderer's own per-frame traversal (which runs
// AFTER useFrame callbacks). So a Billboard nested inside a group whose
// .rotation is mutated every frame reads a one-frame-stale rotation,
// which shows up as visible jitter under continuous auto-rotation.
// Position changes don't feed into that counter-rotation calc at all
// (getWorldQuaternion ignores translation), so animating position instead
// of parent rotation sidesteps the bug entirely.
type OrbitPlanetProps = {
  name: string
  texture: THREE.Texture
  baseAngle: number
  radius: number
  y: number
  angleRef: MutableRefObject<number>
  size: number
  focusScale?: number
}

function OrbitPlanet({ name, texture, baseAngle, radius, y, angleRef, size, focusScale = FOCUS_SCALE_MULT }: OrbitPlanetProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((_, delta) => {
    if (groupRef.current) {
      // Matches the direction of the old rotation.y += approach: rotating a
      // point by +θ around Y is equivalent to evaluating cos/sin at
      // (baseAngle - θ), not (baseAngle + θ).
      const angle = baseAngle - angleRef.current
      groupRef.current.position.set(radius * Math.cos(angle), y, radius * Math.sin(angle))
    }

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
      const s = dampLerp(meshRef.current.scale.x, targetScale, FOCUS_LERP, delta)
      meshRef.current.scale.setScalar(s)
    }
    if (matRef.current) {
      matRef.current.opacity = dampLerp(matRef.current.opacity, targetOpacity, FOCUS_LERP, delta)
    }
  })

  return (
    <Billboard ref={groupRef} follow>
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

// ─── Tech Orbit system ──────────────────────────────────────────────────────
type TechOrbitProps = {
  planets: OrbitPlanetData[]
  autoOrbit: boolean
  speed: number
  tilt: number
}

function TechOrbit({ planets, autoOrbit, speed, tilt }: TechOrbitProps) {
  const textures = useTexture(TECH_ICONS.map((t) => t.tex))
  const angleRef = useRef(0)
  const currentSpeed = useRef(speed)

  useFrame((_, delta) => {
    if (autoOrbit) {
      const focused = techStore.getSelected() !== null
      const targetSpeed = focused ? speed * FOCUS_ORBIT_FACTOR : speed
      currentSpeed.current = dampLerp(currentSpeed.current, targetSpeed, 0.05, delta)
      angleRef.current += delta * currentSpeed.current
    }
  })

  return (
    <group rotation-x={tilt}>
      {planets.map((p, i) => (
        <OrbitPlanet
          key={p.name}
          name={p.name}
          texture={textures[i]}
          baseAngle={p.baseAngle}
          radius={p.radius}
          y={p.y}
          angleRef={angleRef}
          size={p.size}
          focusScale={p.focusScale}
        />
      ))}
    </group>
  )
}

useTexture.preload(TECH_ICONS.map((t) => t.tex))

// ─── Phase-to-clip mapping ──────────────────────────────────────────────────
const PHASE_CLIP: Record<AvatarPhaseName, 'Typing' | 'SitToStand' | 'Turning' | 'Walking' | 'Jumping'> = {
  typing: 'Typing',
  sitToStand: 'SitToStand',
  standing: 'SitToStand',
  turning: 'Turning',
  walking: 'Walking',
  jumping: 'Jumping',
  landed: 'Jumping',
}

const HEAD_FOLLOW_TARGET = new THREE.Vector3(-32, 138, 253)

// In the About section (phase 'landed'), the head tracks the mouse cursor
// instead of the fixed HEAD_FOLLOW_TARGET: the target swings around that
// same base point by up to this many world units per axis, mapped from
// normalized pointer position (-1..1). Vertical range is asymmetric —
// looking down tucks the chin toward the chest/collar geometry, which reads
// as far less rotation than the same swing upward (which opens a visible
// gap under the chin), so it needs a much bigger push to look comparable.
const CURSOR_FOLLOW_RANGE_X = 100
const CURSOR_FOLLOW_RANGE_Y_UP = 70
const CURSOR_FOLLOW_RANGE_Y_DOWN = 170
const CURSOR_FOLLOW_LERP = 0.12

// Collapses a static prop model's fragmented mesh hierarchy into one merged
// mesh per unique material. The stasis pod GLB ships ~100+ separate tiny
// meshes (individual bolts/supports/panels) that all share a handful of
// materials — each one costs its own draw call. profiling (renderer.info)
// showed draw calls jumping 27 (Home) → 175 (About) specifically because
// this pod becomes visible there; merging by material collapses that back
// down to roughly one draw call per material. One-time CPU cost at mount,
// paid once, instead of every frame for as long as the pod is on screen.
function mergeStaticMeshesByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true)

  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return
    if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    const mat = Array.isArray(material) ? material[0] : material
    if (!mat || !mesh.geometry) return

    // Bake this mesh's world transform into a geometry clone so every
    // merged vertex lands in the same space, then group by material so
    // mergeBufferGeometries only ever combines compatible attribute sets.
    const geom = mesh.geometry.clone()
    geom.applyMatrix4(mesh.matrixWorld)
    const list = byMaterial.get(mat) ?? []
    list.push(geom)
    byMaterial.set(mat, list)
  })

  const group = new THREE.Group()
  for (const [material, geoms] of byMaterial) {
    const merged = geoms.length > 1 ? mergeBufferGeometries(geoms, false) : geoms[0]

    // mergeBufferGeometries returns null if this material's meshes don't
    // all share the same attribute set (e.g. one has uv2, another doesn't)
    // — fall back to adding them individually rather than losing geometry.
    if (!merged) {
      for (const g of geoms) group.add(new THREE.Mesh(g, material))
      continue
    }

    const mesh = new THREE.Mesh(merged, material)
    mesh.frustumCulled = false

    // KHR_materials_transmission (real physical glass refraction) makes
    // Three.js render the entire opaque scene to an offscreen target
    // every frame just to sample it for refraction — a large, constant
    // cost totally independent of the transmissive mesh's own triangle
    // count or screen size. Profiling confirmed this: the pod's glass
    // panel is only 576 of its 16,407 total triangles, yet was the sole
    // reason About ran at ~58fps vs Home's 100+ (removing the pod
    // entirely, and only that, fixed it). Falling back to plain alpha
    // blending reads as "glass" for a small decorative panel at a
    // fraction of the cost.
    const physMat = material as THREE.Material & { transmission?: number; opacity: number }
    if (physMat.transmission) {
      physMat.transmission = 0
      physMat.transparent = true
      physMat.opacity = Math.min(physMat.opacity, 0.35)
      physMat.depthWrite = false
      mesh.renderOrder = 2
    } else if (material.transparent || (material as THREE.Material & { opacity: number }).opacity < 1) {
      material.transparent = true
      material.depthWrite = false
      mesh.renderOrder = 2
    }
    group.add(mesh)
  }
  return group
}

export function Avatar(props: AvatarProps) {
  const vhPx = useViewportUnit()

  const group = useRef<THREE.Group>(null)
  const podRef = useRef<THREE.Group>(null)
  const modelRef = useRef<THREE.Group>(null)
  const defaultNeckRotation = useRef<THREE.Quaternion | null>(null)
  const defaultHeadRotation = useRef<THREE.Quaternion | null>(null)
  const snappedToCamera = useRef(false)
  const isAtTop = useRef(true)

  // GPU warm-up window (see podRef.current.visible below) — the pod and
  // its 8 tech-orbit logo textures otherwise get their first real draw
  // call at the exact scroll position where the avatar jumps in, which is
  // what caused the one-time stutter.
  const mountTimeRef = useRef(Date.now())

  const podWorldTarget = useRef(new THREE.Vector3())
  const localTargetTmp = useRef(new THREE.Vector3())
  const probeA = useRef(new THREE.Vector3())
  const probeB = useRef(new THREE.Vector3())
  const parentScaleTmp = useRef(new THREE.Vector3())
  const desiredHeadTargetTmp = useRef(new THREE.Vector3())
  const headTargetRef = useRef(HEAD_FOLLOW_TARGET.clone())

  // Blend-into-pod rotation: the target orientation is constant
  // (IN_POD_DEFAULTS never changes at runtime), so it's computed once here
  // instead of allocating a fresh Quaternion/Euler every frame in useFrame.
  const identityQuatRef = useRef(new THREE.Quaternion())
  const inPodQuatRef = useRef(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(IN_POD_DEFAULTS.rotX, IN_POD_DEFAULTS.rotY, IN_POD_DEFAULTS.rotZ)
    )
  )

  // ── Layout Constants ──────────────────────────────────────────────────────
  const modelScale = 1
  const podX = POD_DEFAULTS.x
  const podY = POD_DEFAULTS.y
  const podZ = POD_DEFAULTS.z
  const podScale = POD_DEFAULTS.scale
  const podRotY = POD_DEFAULTS.rotY
  const podLocked = false

  const inPodScale = IN_POD_DEFAULTS.scale
  const inPodX = IN_POD_DEFAULTS.x
  const inPodY = IN_POD_DEFAULTS.y
  const inPodZ = IN_POD_DEFAULTS.z

  const smallXOffset = SMALL_SCREEN.xOffset
  const smallYOffset = SMALL_SCREEN.yOffset
  const smallHeightFrac = SMALL_SCREEN.heightFrac

  const mobileXOffset = MOBILE.xOffset
  const mobileYOffset = MOBILE.yOffset
  const mobileHeightFrac = MOBILE.heightFrac
  const mobileTopNdc = MOBILE.topNdc

  // ── Small-screen / mobile state ───────────────────────────────────────────
  const smallTargetRef = useRef(
    typeof window !== 'undefined' && window.innerWidth < SMALL_SCREEN.breakpoint ? 1 : 0
  )
  const smallTRef = useRef(smallTargetRef.current)
  const mobileTargetRef = useRef(
    typeof window !== 'undefined' && window.innerWidth <= MOBILE.breakpoint ? 1 : 0
  )
  const mobileTRef = useRef(mobileTargetRef.current)

  useEffect(() => {
    const onResize = () => {
      smallTargetRef.current = window.innerWidth < SMALL_SCREEN.breakpoint ? 1 : 0
      mobileTargetRef.current = window.innerWidth <= MOBILE.breakpoint ? 1 : 0
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Models ────────────────────────────────────────────────────────────────
  const { scene } = useGLTF('models/Avatar-transformed.glb')
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes } = useGraph(clone)

  const { scene: podScene } = useGLTF('models/transparentStasisPod.compressed.glb')
  const podClone = useMemo(() => {
    const cloned = SkeletonUtils.clone(podScene)
    return mergeStaticMeshesByMaterial(cloned)
  }, [podScene])

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

  // ── Clips ──────────────────────────────────────────────────────────────────
  const { animations: typingAnimation } = useFBX('animations/Typing.fbx')
  const { animations: standingAnimation } = useFBX('animations/Idle.fbx')
  const { animations: sitToStandAnimation } = useFBX('animations/Sit_To_Stand.fbx')
  const { animations: turningAnimation } = useFBX('animations/Turning.fbx')
  const { animations: walkingAnimation } = useFBX('animations/Walking.fbx')
  const { animations: jumpingAnimation } = useFBX('animations/Jumping.fbx')

  // ── Track stitching ──────────────────────────────────────────────────────
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

  // ── Main loop ─────────────────────────────────────────────────────────────
  useFrame((state, delta) => {
    const s = scrollScreens(vhPx)
    const { phase, p } = avatarPhase(s)

    // Head follow
    if (!snappedToCamera.current && phase === 'sitToStand' && p >= 1) {
      snappedToCamera.current = true
    }
    if (phase !== 'typing' && phase !== 'sitToStand') snappedToCamera.current = true

    const headFollowActive = snappedToCamera.current && s >= TL.HEAD_FOLLOW_START
    const neck = nodes.mixamorigNeck as THREE.Bone | undefined
    const head = nodes.mixamorigHead as THREE.Bone | undefined

    if (headFollowActive) {
      // In the About section (landed, in the stasis pod), swing the look
      // target around HEAD_FOLLOW_TARGET based on the mouse position so the
      // head appears to track the cursor. Elsewhere (walking up to the pod,
      // etc.) it keeps looking at the fixed point as before.
      const pointer = phase === 'landed' ? cursorStore.getNDC() : null
      const desired = desiredHeadTargetTmp.current
      if (pointer) {
        const rangeY = pointer.y >= 0 ? CURSOR_FOLLOW_RANGE_Y_UP : CURSOR_FOLLOW_RANGE_Y_DOWN
        desired.set(
          HEAD_FOLLOW_TARGET.x + pointer.x * CURSOR_FOLLOW_RANGE_X,
          HEAD_FOLLOW_TARGET.y + pointer.y * rangeY,
          HEAD_FOLLOW_TARGET.z
        )
      } else {
        desired.copy(HEAD_FOLLOW_TARGET)
      }

      const followTarget = headTargetRef.current
      followTarget.x = dampLerp(followTarget.x, desired.x, CURSOR_FOLLOW_LERP, delta)
      followTarget.y = dampLerp(followTarget.y, desired.y, CURSOR_FOLLOW_LERP, delta)
      followTarget.z = dampLerp(followTarget.z, desired.z, CURSOR_FOLLOW_LERP, delta)

      neck?.lookAt(followTarget)
      head?.lookAt(followTarget)
    } else {
      if (defaultNeckRotation.current && neck) neck.quaternion.slerp(defaultNeckRotation.current, 1 - Math.pow(1 - 0.1, delta * 60))
      if (defaultHeadRotation.current && head) head.quaternion.slerp(defaultHeadRotation.current, 1 - Math.pow(1 - 0.1, delta * 60))
    }

    // ── Small-screen auto-fit ─────────────────────────────────────────────
    smallTRef.current = dampLerp(smallTRef.current, smallTargetRef.current, 0.08, delta)
    const smallT = smallTRef.current
    mobileTRef.current = dampLerp(mobileTRef.current, mobileTargetRef.current, 0.08, delta)
    const mobileT = mobileTRef.current

    let effPodX = podX + smallXOffset * smallT

    const cam = state.camera as THREE.PerspectiveCamera
    probeA.current.set(effPodX, 0, podZ).project(cam)
    const ndcAtY0 = probeA.current.y
    probeB.current.set(effPodX, 10, podZ).project(cam)
    const ndcPerY = (probeB.current.y - ndcAtY0) / 10

    const basePodScale = podScale * modelScale

    let effPodY = podY
    let effPodScale = basePodScale

    if (podRef.current && podRef.current.parent && ndcPerY > 1e-6 && smallT > 0.001) {
      const viewportWorldH = 2 / ndcPerY
      const parentScaleY =
        podRef.current.parent.getWorldScale(parentScaleTmp.current).y || 1

      const maxHalfWorld = (smallHeightFrac * viewportWorldH) / 2
      const fitScale = Math.min(
        basePodScale,
        maxHalfWorld / (podBaseHalfHeight * parentScaleY)
      )
      const halfWorld = podBaseHalfHeight * fitScale * parentScaleY

      const bottomWorldY = (SMALL_SCREEN.bottomNdc - ndcAtY0) / ndcPerY
      const smallRestY = bottomWorldY + halfWorld + smallYOffset

      effPodY = THREE.MathUtils.lerp(podY, smallRestY, smallT)
      effPodScale = THREE.MathUtils.lerp(basePodScale, fitScale, smallT)

      // ── Mobile (≤1000px): shrink further, anchor to top, center on x ────
      // The About panel drops to the bottom half via CSS (About.tsx), so the
      // pod claims the top band of the viewport and the two never overlap.
      if (mobileT > 0.001) {
        const maxHalfMobile = (mobileHeightFrac * viewportWorldH) / 2
        const mobileFitScale = Math.min(
          effPodScale,
          maxHalfMobile / (podBaseHalfHeight * parentScaleY)
        )
        const mobileHalfWorld = podBaseHalfHeight * mobileFitScale * parentScaleY

        // Pod's top edge sits at mobileTopNdc, so its center hangs below it.
        const topWorldY = (mobileTopNdc - ndcAtY0) / ndcPerY
        const mobileRestY = topWorldY - mobileHalfWorld + mobileYOffset

        effPodScale = THREE.MathUtils.lerp(effPodScale, mobileFitScale, mobileT)
        effPodY = THREE.MathUtils.lerp(effPodY, mobileRestY, mobileT)

        // Horizontal centering: solve for the world x whose NDC x is 0.
        probeA.current.set(effPodX, 0, podZ).project(cam)
        const ndcX0 = probeA.current.x
        probeB.current.set(effPodX + 10, 0, podZ).project(cam)
        const ndcPerX = (probeB.current.x - ndcX0) / 10
        if (Math.abs(ndcPerX) > 1e-6) {
          const centeredX = effPodX + (0 - ndcX0) / ndcPerX + mobileXOffset
          effPodX = THREE.MathUtils.lerp(effPodX, centeredX, mobileT)
        }
      }
    }

    const podShrink = effPodScale / Math.max(basePodScale, 1e-6)

    // ── Pod positioning ────────────────────────────────────────────────────
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
          const riseP = Math.max(0, Math.min(s - riseStart, 1))
          targetWorldY = effPodY - (1 - riseP) * worldPerScreen
        } else {
          targetWorldY = effPodY + (s - ABOUT_UNPIN) * worldPerScreen
        }

        // Setting `.visible = false` makes Three.js skip the draw call
        // entirely — so the pod's materials and the 8 tech-orbit logo
        // textures were never actually uploaded to the GPU until the very
        // first time this flipped true, which happens right as the avatar
        // jumps in. That first real draw call is what caused the one-time
        // FPS drop.
        //
        // Fix: force it visible for a brief window right after mount so
        // it gets a few genuine warm-up frames while parked at its
        // already-computed off-screen position (frustumCulled=false on
        // the pod meshes means that draw call is cheap even off-screen).
        // After the window, fall back to the original distance-based
        // hiding so there's no lasting extra draw cost for the rest of
        // the scroll.
        const warmingUp = Date.now() - mountTimeRef.current < 1200
        podRef.current.visible =
          warmingUp || (s > riseStart - 0.1 && s < ABOUT_UNPIN + 1.5)
      }

      podWorldTarget.current.set(effPodX, targetWorldY, podZ)
      localTargetTmp.current.copy(podWorldTarget.current)
      podRef.current.parent.worldToLocal(localTargetTmp.current)
      podRef.current.position.copy(localTargetTmp.current)
    }

    // ── Avatar blend into pod ─────────────────────────────────────────────
    if (modelRef.current && podRef.current) {
      let t = 0
      if (phase === 'jumping') t = p
      else if (phase === 'landed') t = 1

      const eased = t * t * (3 - 2 * t)

      const scaledInPodScale = inPodScale * modelScale
      const scaledInPodX = inPodX * modelScale
      const scaledInPodY = inPodY * modelScale
      const scaledInPodZ = inPodZ * modelScale

      // Scale
      const sc = THREE.MathUtils.lerp(1, scaledInPodScale * podShrink, eased)
      modelRef.current.scale.setScalar(sc)

      // Position
      modelRef.current.position.set(
        (podRef.current.position.x + scaledInPodX * podShrink) * eased,
        (podRef.current.position.y + scaledInPodY * podShrink) * eased,
        (podRef.current.position.z + scaledInPodZ * podShrink) * eased,
      )

      // Rotation (interpolate from identity to in-pod rotation)
      modelRef.current.quaternion.copy(identityQuatRef.current).slerp(inPodQuatRef.current, eased)

      modelRef.current.visible = phase === 'landed' ? podRef.current.visible : true
    }

    // ── Animation scrubbing ──────────────────────────────────────────────
    const typing = actions['Typing']
    const sitToStand = actions['SitToStand']
    const turning = actions['Turning']
    const walking = actions['Walking']
    const jumping = actions['Jumping']
    if (!typing || !sitToStand || !turning || !walking || !jumping) return

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
      <group ref={podRef}>
        <primitive object={podClone} />
        <group
          scale={[1 / (podScale * modelScale), 1 / (podScale * modelScale), 1 / (podScale * modelScale)]}
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

      <group ref={modelRef}>
        <group rotation-x={Math.PI / 2}>
          <primitive object={clone} />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('models/Avatar-transformed.glb')
useGLTF.preload('models/transparentStasisPod.compressed.glb')

// These have no Suspense-driven eager entry point the way the GLTFs above
// do (useFBX is called deep inside Avatar()'s render, after two useGLTF
// calls that must resolve first) — so without an explicit preload, the
// loading manager's `total` only grows to include them on a second render
// pass, well after the first wave of assets can already read as 100%.
// That's what made the Preloader's percentage dip back down after
// reaching 100, and occasionally made it hang waiting to re-settle.
useFBX.preload('animations/Typing.fbx')
useFBX.preload('animations/Idle.fbx')
useFBX.preload('animations/Sit_To_Stand.fbx')
useFBX.preload('animations/Turning.fbx')
useFBX.preload('animations/Walking.fbx')
useFBX.preload('animations/Jumping.fbx')