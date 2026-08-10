import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three'
import { Avatar } from './Avatar'
import { TL, useViewportUnit, scrollScreens, progress } from './Scrolltimeline'
import { cursorStore } from './CustomCursor';

type ModelProps = {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: number | [number, number, number]
    onClick?: (e: any) => void
    onPointerOver?: (e: any) => void
    onPointerOut?: (e: any) => void
}

// ── Models ──────────────────────────────────────────────────────────────────

export function ScifiDesk(props: ModelProps) {
    const { scene } = useGLTF('models/scifiDesk.glb')
    return <primitive object={scene} {...props} />
}
useGLTF.preload('models/scifiDesk.glb')

export function ScifiChair(props: ModelProps) {
    const { scene } = useGLTF('models/ScifiChair.compressed.glb')
    return <primitive object={scene} {...props} />
}
useGLTF.preload('models/ScifiChair.compressed.glb')

export function Monalisa(props: ModelProps) {
    const { scene } = useGLTF('models/Monalisa.glb')
    return <primitive object={scene} {...props} />
}
useGLTF.preload('models/Monalisa.glb')

export function RoomTable(props: ModelProps) {
    const { scene } = useGLTF('models/Table.compressed.glb')
    return <primitive object={scene} {...props} />
}
useGLTF.preload('models/Table.compressed.glb')

export function Goku(props: ModelProps) {
    const { scene } = useGLTF('models/Goku.compressed.glb')
    return <primitive object={scene} {...props} />
}
useGLTF.preload('models/Goku.compressed.glb')

// ── Scene layout (old Leva defaults, hardcoded) ─────────────────────────────

const SCENE = { pos: [7, -30.5, -37.5] as const, rotY: -0.6 }
const LIGHTS = { ambient: 1.5, dir: 3, dirPos: [5, 10, 5] as const }
const GROUP = { pos: [4, 0, 1.2] as const } // chair + avatar shared origin
const DESK = { pos: [0, 0, 0] as const, scale: 1 }
const CHAIR = { pos: [-4, -0.5, 0.8] as const }        // ← old file value
const AVATAR = { pos: [-3.5, -15, -1] as const }            // ← old file value
const MONA = { pos: [-1.9, 20.3, -33] as const, scale: 1, rotY: 0 }
const TABLE = { pos: [-39.4, 0, 15] as const, scale: 11.1, rotY: -1.85 }
const GOKU = { offset: [0.4, 11.6, 1.3] as const, scale: 6.2, rotY: 1.47, headOffsetY: 12 }

// Chair swivel (old tuning)
const CHAIR_START_Z = 1.2   // ← old file's startZ
const CHAIR_BACK_SWING = 7.2
const CHAIR_MAX_ROT = -(Math.PI / 4)

// ── Kamehameha + idle glow tuning (old Leva defaults) ──────────────────────

const KAME = {
    lightIntensity: 900,
    lightDistance: 250,
    lightDecay: 1.2,
    lightColor: '#3399ff',
    lightPos: [0.5, 4.0, 1] as const,
    glowScale: 2,
    glowOpacity: 0.3,
    glowColor: '#88ccff',
    ambientIntensity: 0.2,
    dirIntensity: 0.1,
    durationMs: 2000,
}

const IDLE_GLOW = {
    color: '#3399ff',
    maxIntensity: 120,
    maxOpacity: 0.18,
    interval: 5, // seconds between pulses
    rise: 0.6,
    hold: 0.8,
    fall: 0.6,
    radius: KAME.glowScale, // was glowScale * 1.4 — shrunk so it doesn't swallow the model
}

// ─── IdleGlow — animates via refs so it never triggers re-renders ──────────
function IdleGlow({
    intensityRef,
    active,
}: {
    intensityRef: React.MutableRefObject<number>
    active: boolean
}) {
    const lightRef = useRef<THREE.PointLight>(null)
    const meshRef = useRef<THREE.Mesh>(null)

    useFrame(() => {
        const t = active ? intensityRef.current : 0
        if (lightRef.current) lightRef.current.intensity = t * IDLE_GLOW.maxIntensity
        if (meshRef.current) {
            ; (meshRef.current.material as THREE.MeshBasicMaterial).opacity = t * IDLE_GLOW.maxOpacity
        }
    })

    return (
        <>
            <pointLight
                ref={lightRef}
                intensity={0}
                distance={180}
                decay={1.5}
                color={IDLE_GLOW.color}
                position={[0, KAME.lightPos[1], 0]}
            />
            <mesh ref={meshRef} position={[0, KAME.lightPos[1], 0]}>
                <sphereGeometry args={[IDLE_GLOW.radius, 32, 32]} />
                <meshBasicMaterial color={IDLE_GLOW.color} transparent opacity={0} depthWrite={false} />
            </mesh>
        </>
    )
}

// ── Responsive scene scale (ported) ─────────────────────────────────────────
// Below 1700px of viewport width the 3D scene shrinks so it doesn't crowd
// the text overlays, easing down to 0.5x at 480px, and recenters.
const MODEL_SCALE_BREAKPOINT = 1700
const MODEL_SCALE_MIN_WIDTH = 480
const MODEL_SCALE_MIN = 0.6
const RECENTER_OFFSET_X = -1.5
const RECENTER_OFFSET_Y = 5

function getResponsiveModelScale(): number {
    if (typeof window === 'undefined') return 1
    const w = window.innerWidth
    if (w >= MODEL_SCALE_BREAKPOINT) return 1
    const t = Math.max(0, Math.min(1, (w - MODEL_SCALE_MIN_WIDTH) / (MODEL_SCALE_BREAKPOINT - MODEL_SCALE_MIN_WIDTH)))
    return MODEL_SCALE_MIN + t * (1 - MODEL_SCALE_MIN)
}

// ─────────────────────────────────────────────────────────────────────────────

export function Home() {
    const vhPx = useViewportUnit()

    const chairRef = useRef<THREE.Group>(null)
    const avatarGroupRef = useRef<THREE.Group>(null)
    const environmentRef = useRef<THREE.Group>(null)
    const sceneGroupRef = useRef<THREE.Group>(null)

    // ── Kamehameha state ──────────────────────────────────────────────────────
    const [kamehameha, setKamehameha] = useState(false)
    const kamehamehaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Idle glow refs (mutated in useFrame — no re-renders) ─────────────────
    const glowIntensityRef = useRef(0) // 0–1 normalised brightness
    const glowPhaseRef = useRef(0)     // 0=idle | 1=rising | 2=holding | 3=falling
    const glowTimerRef = useRef(0)     // seconds elapsed in current phase

    // Pre-compile shaders to avoid the first-appearance stutter.
    const { gl, scene: threeScene, camera } = useThree()
    useEffect(() => {
        gl.compile(threeScene, camera)
    }, [gl, threeScene, camera])

    const handleGokuClick = (e: { stopPropagation: () => void }) => {
        e.stopPropagation()
        if (kamehameha) return
        setKamehameha(true)
        glowPhaseRef.current = 0
        glowTimerRef.current = 0
        glowIntensityRef.current = 0
        if (kamehamehaTimer.current) clearTimeout(kamehamehaTimer.current)
        kamehamehaTimer.current = setTimeout(() => setKamehameha(false), KAME.durationMs)
    }

    useEffect(
        () => () => {
            if (kamehamehaTimer.current) clearTimeout(kamehamehaTimer.current)
        },
        []
    )

    // Responsive scene scale target, recomputed on resize, eased per-frame.
    const targetModelScaleRef = useRef(getResponsiveModelScale())
    useEffect(() => {
        const onResize = () => {
            targetModelScaleRef.current = getResponsiveModelScale()
        }
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    useFrame((_, delta) => {
        const s = scrollScreens(vhPx)

        // ── Responsive scale + recenter (smooth) ───────────────────────────────
        if (sceneGroupRef.current) {
            const targetScale = targetModelScaleRef.current
            const sc = THREE.MathUtils.lerp(sceneGroupRef.current.scale.x, targetScale, 0.08)
            sceneGroupRef.current.scale.set(sc, sc, sc)

            const shrinkRange = 1 - MODEL_SCALE_MIN
            const t = shrinkRange > 0 ? THREE.MathUtils.clamp((1 - targetScale) / shrinkRange, 0, 1) : 0
            sceneGroupRef.current.position.x = THREE.MathUtils.lerp(
                sceneGroupRef.current.position.x,
                SCENE.pos[0] + RECENTER_OFFSET_X * t,
                0.08
            )
            sceneGroupRef.current.position.y = THREE.MathUtils.lerp(
                sceneGroupRef.current.position.y,
                SCENE.pos[1] + RECENTER_OFFSET_Y * t,
                0.08
            )
        }

        // ── Idle Goku glow cycle (framerate-independent state machine) ─────────
        if (!kamehameha) {
            glowTimerRef.current += delta
            switch (glowPhaseRef.current) {
                case 0: // waiting
                    if (glowTimerRef.current >= IDLE_GLOW.interval) {
                        glowPhaseRef.current = 1
                        glowTimerRef.current = 0
                    }
                    glowIntensityRef.current = 0
                    break
                case 1: // rising
                    glowIntensityRef.current = Math.min(glowTimerRef.current / IDLE_GLOW.rise, 1)
                    if (glowTimerRef.current >= IDLE_GLOW.rise) {
                        glowPhaseRef.current = 2
                        glowTimerRef.current = 0
                    }
                    break
                case 2: // holding
                    glowIntensityRef.current = 1
                    if (glowTimerRef.current >= IDLE_GLOW.hold) {
                        glowPhaseRef.current = 3
                        glowTimerRef.current = 0
                    }
                    break
                case 3: // falling
                    glowIntensityRef.current = Math.max(1 - glowTimerRef.current / IDLE_GLOW.fall, 0)
                    if (glowTimerRef.current >= IDLE_GLOW.fall) {
                        glowPhaseRef.current = 0
                        glowTimerRef.current = 0
                    }
                    break
                default:
                    glowPhaseRef.current = 0
            }
        }

        // ── MAGIC TRICK: Slide environment away as About slides up ─────────────
        if (environmentRef.current) {
            // The About section takes 1 full screen (100vh) to slide up.
            // It finishes pinning exactly at TL.NEXT_SECTION_PIN
            const hideStart = TL.NEXT_SECTION_PIN - 1;
            const hideEnd = TL.NEXT_SECTION_PIN;
            const hideProgress = progress(s, hideStart, hideEnd);

            // Push the 3D environment UP and OUT of the camera view as the red background comes up
            environmentRef.current.position.y = hideProgress * 150; 
            
            // Turn off rendering for the environment once it's fully hidden to save performance
            environmentRef.current.visible = hideProgress < 1;
        }

        // ── Chair swivel-back (screens 0 → CHAIR_END) — old file's timing ─────
        if (!chairRef.current || !avatarGroupRef.current) return

        const chairP = progress(s, 0, TL.CHAIR_END)

        let targetZ = CHAIR_START_Z
        let targetRotationY = 0

        if (chairP <= 0.5) {
            const p = chairP / 0.5
            targetZ = CHAIR_START_Z + p * CHAIR_BACK_SWING
        } else {
            targetZ = CHAIR_START_Z + CHAIR_BACK_SWING
        }

        if (chairP > 0.5) {
            const p = Math.min((chairP - 0.5) / 0.25, 1)
            targetRotationY = p * CHAIR_MAX_ROT
        }

        chairRef.current.position.z = THREE.MathUtils.lerp(chairRef.current.position.z, targetZ, 0.05)
        chairRef.current.rotation.y = THREE.MathUtils.lerp(chairRef.current.rotation.y, targetRotationY, 0.05)


        // Avatar rides the chair: shares its rotation and z until the jump
        // finishes. (Post-jump reveal slide comes later with the About section.)
        avatarGroupRef.current.rotation.y = chairRef.current.rotation.y
        if (s <= TL.JUMP_END) {
            avatarGroupRef.current.position.set(GROUP.pos[0], GROUP.pos[1], chairRef.current.position.z)
        }
    })

    return (
        <>
            {/* The background color was removed from here so HTML shows through */}
            <group>
                {/* Global lights — dimmed during kamehameha. Warm-tinted
                    (not pure white) so the scene reads as part of the same
                    cream-toned world as the hero background/navbar. */}
                <ambientLight intensity={kamehameha ? KAME.ambientIntensity : LIGHTS.ambient} color="#fff3e0" />
                <directionalLight
                    position={LIGHTS.dirPos as unknown as [number, number, number]}
                    intensity={kamehameha ? KAME.dirIntensity : LIGHTS.dir}
                    color="#fff8ee"
                    castShadow
                />

                <group
                    ref={sceneGroupRef}
                    position={SCENE.pos as unknown as [number, number, number]}
                    rotation={[0, SCENE.rotY, 0]}
                >
                    {/* Black backdrop sphere — swallows the HTML background during kamehameha */}
                    <mesh scale={500} visible={kamehameha}>
                        <sphereGeometry args={[1, 32, 32]} />
                        <meshBasicMaterial color="#000000" side={THREE.BackSide} />
                    </mesh>

                    {/* ENVIRONMENT (Gets pushed out of view during scroll) */}
                    <group ref={environmentRef}>
                        <ScifiDesk position={[...DESK.pos]} scale={DESK.scale} />
                        <RoomTable position={[...TABLE.pos]} scale={TABLE.scale} rotation={[0, TABLE.rotY, 0]} />

                        {/* ── Goku + effects ─────────────────────────────────────────── */}
                        <group
                            position={[
                                TABLE.pos[0] + GOKU.offset[0],
                                TABLE.pos[1] + GOKU.offset[1],
                                TABLE.pos[2] + GOKU.offset[2],
                            ]}
                        >
                            <Goku scale={GOKU.scale} rotation={[0, GOKU.rotY, 0]} />

                            {/* Idle pulse glow — fires every few seconds, suppressed during kamehameha */}
                            <IdleGlow intensityRef={glowIntensityRef} active={!kamehameha} />

                            {/* Kamehameha point light — only during the click effect */}
                            <pointLight
                                intensity={kamehameha ? KAME.lightIntensity : 0}
                                distance={KAME.lightDistance}
                                decay={KAME.lightDecay}
                                color={KAME.lightColor}
                                position={[...KAME.lightPos]}
                            />

                            {kamehameha && (
                                <mesh position={[...KAME.lightPos]}>
                                    <sphereGeometry args={[KAME.glowScale, 32, 32]} />
                                    <meshBasicMaterial color={KAME.glowColor} transparent opacity={KAME.glowOpacity} />
                                </mesh>
                            )}

                            {/* Invisible click target covering the whole figure */}
                            <mesh
                                onClick={handleGokuClick}
                                onPointerOver={(e) => {
                                    e.stopPropagation()
                                    cursorStore.setHover(true)
                                }}
                                onPointerOut={(e) => {
                                    e.stopPropagation()
                                    cursorStore.setHover(false)
                                }}
                                position={[-0.5, 0, 0]}
                            >
                                <cylinderGeometry args={[2.5, 2.5, 11, 16]} />
                                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                            </mesh>
                        </group>

                        <Monalisa position={[...MONA.pos]} scale={MONA.scale} rotation={[0, MONA.rotY, 0]} />

                        <group ref={chairRef} position={[...GROUP.pos]}>
                            <ScifiChair position={[...CHAIR.pos]} scale={1} />
                        </group>
                    </group>

                    {/* AVATAR — old file's position, no extra rotation */}
                    <group ref={avatarGroupRef} position={[...GROUP.pos]}>
                        <Avatar position={[...AVATAR.pos]} />
                    </group>
                </group>
            </group>
        </>
    )
}