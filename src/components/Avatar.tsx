import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useGraph } from '@react-three/fiber'
import { useGLTF, useAnimations, useFBX } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import { TL, useViewportUnit, scrollScreens, avatarPhase } from './Scrolltimeline'
import type { AvatarPhaseName } from './Scrolltimeline'

type AvatarProps = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
}

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
  const defaultNeckRotation = useRef<THREE.Quaternion | null>(null)
  const defaultHeadRotation = useRef<THREE.Quaternion | null>(null)
  const snappedToCamera = useRef(false)
  const isAtTop = useRef(true)

  // ── Model ────────────────────────────────────────────────────────────────
  const { scene } = useGLTF('models/Avatar-transformed.glb')
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes } = useGraph(clone)

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
  useFrame(() => {
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
      {/* Same orientation wrapper as the old Avatar.jsx — the model's
          armature is authored lying "flat", so this stands it up. Without
          it the avatar renders upright-rotated relative to the chair. */}
      <group rotation-x={Math.PI / 2}>
        <primitive object={clone} />
      </group>
      {/* ⬅ LATER: stasis pod (+ Sparkles smoke) and the tech-logo orbit go
          here when the About section is added — they're post-jump features. */}
    </group>
  )
}

useGLTF.preload('models/Avatar-transformed.glb')