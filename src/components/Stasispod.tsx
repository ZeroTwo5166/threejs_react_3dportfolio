import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export type StasisPodProps = {
  podX: number
  podY: number
  podZ: number
  podScale: number
  podRotY: number
  spin?: boolean
}

export function StasisPodModel({ podX, podY, podZ, podScale, podRotY, spin = false }: StasisPodProps) {
  const { scene } = useGLTF('models/transparentStasisPod.glb')
  const group = useRef<THREE.Group>(null)

  // Clone + recenter as a pure derivation (useMemo), not a mutation of the
  // shared cached `scene` — useGLTF returns the SAME object every time this
  // URL is used anywhere in the app. Cloning means this instance owns its
  // own copy and can't fight with (or be corrupted by) any other place
  // that loads the same GLB, and dev-mode double-invocation just produces
  // a redundant independent clone instead of compounding an offset.
  const centeredScene = useMemo(() => {
    const clone = scene.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    clone.position.sub(center)

    // Force the glass to render AFTER whatever's inside it (avatar, smoke,
    // etc.) with depth writes off — this is what actually produces "visible
    // through the glass" instead of one fully occluding the other.
    clone.traverse((child: any) => {
      if (child.isMesh && child.material) {
        if (child.material.transparent || child.material.opacity < 1) {
          child.material.transparent = true
          child.material.depthWrite = false
          child.renderOrder = 2
        }
      }
    })

    return clone
  }, [scene])

  useFrame((_, delta) => {
    if (group.current && spin) group.current.rotation.y += delta * 0.2
  })

  return (
    <group ref={group} position={[podX, podY, podZ]} scale={podScale} rotation={[0, podRotY, 0]}>
      <primitive object={centeredScene} />
    </group>
  )
}
useGLTF.preload('models/transparentStasisPod.glb')