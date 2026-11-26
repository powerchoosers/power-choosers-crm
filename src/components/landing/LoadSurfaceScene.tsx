'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sampleLoad, SPIKES, SPIKE_LIFT } from './loadProfile'

const COLS = 200
const ROWS = 96
const WIDTH = 9
const DEPTH = 7
const HEIGHT = 2.5

/**
 * Shared timing. A band of light sweeps across the day; each peak it passes shoots up and
 * stays lit, then everything settles and the cycle starts again.
 */
const TIMING = /* glsl */ `
  uniform float uTime;
  uniform float uRise;

  float cyclePos() {
    float t = mod(uTime, 13.0) / 13.0;
    return mix(-0.2, 1.25, smoothstep(0.04, 0.5, t));
  }
  float cycleFade() {
    float t = mod(uTime, 13.0) / 13.0;
    return 1.0 - smoothstep(0.9, 1.0, t);
  }
  float foundAt(float u) {
    return smoothstep(0.0, 0.07, cyclePos() - u) * cycleFade() * uRise;
  }
`

const SURFACE_VERTEX = /* glsl */ `
  attribute float aBase;
  attribute float aLift;
  attribute float aMark;
  varying vec2 vUv;
  varying vec3 vView;
  varying float vMark;
  varying float vHeight;
  varying float vScan;
  ${TIMING}

  void main() {
    vUv = uv;
    float found = foundAt(uv.x);
    // The surface rises from flat on load, left to right.
    float rise = smoothstep(0.0, 1.0, clamp(uRise * 1.5 - uv.x * 0.5, 0.0, 1.0));
    float breathe = 1.0 + 0.035 * sin(uTime * 0.55 + uv.y * 7.0 + uv.x * 3.0);
    float h = aBase * breathe * rise + aLift * found;

    vHeight = h;
    vMark = aMark * found;
    vScan = exp(-pow((uv.x - cyclePos()) * 7.0, 2.0)) * cycleFade() * uRise;

    vec4 mv = modelViewMatrix * vec4(position.x, h * ${HEIGHT.toFixed(1)}, position.z, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const SURFACE_FRAGMENT = /* glsl */ `
  uniform float uZoom;
  varying vec2 vUv;
  varying vec3 vView;
  varying float vMark;
  varying float vHeight;
  varying float vScan;

  void main() {
    // Flat-shaded lighting from screen-space derivatives: no normals to upload or update.
    vec3 normal = normalize(cross(dFdx(vView), dFdy(vView)));
    float light = clamp(dot(normal, normalize(vec3(-0.45, 0.75, 0.5))), 0.0, 1.0);

    vec3 low = vec3(0.02, 0.03, 0.09);
    vec3 mid = vec3(0.0, 0.184, 0.655);
    vec3 high = vec3(0.36, 0.49, 1.0);
    float level = clamp(vHeight / 1.25, 0.0, 1.0);
    vec3 color = mix(low, mid, smoothstep(0.08, 0.62, level));
    color = mix(color, high, smoothstep(0.6, 1.0, level));
    color *= 0.3 + 0.95 * light;

    // One fine line per week across the surface.
    float rowCoord = vUv.y * 52.0;
    float rowLine = 1.0 - smoothstep(0.0, 1.3, abs(fract(rowCoord - 0.5) - 0.5) / fwidth(rowCoord));
    color += high * rowLine * (0.3 + 0.5 * level);

    color += vec3(0.45, 0.58, 1.0) * vScan * (0.1 + 0.3 * level);
    // A found peak glows blue along its sides and turns white only at the tip.
    color += high * vMark * 0.55;
    color = mix(color, vec3(1.0), clamp(pow(vMark, 3.0) * 1.1, 0.0, 1.0));

    float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.86, vUv.x)
               * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
    float fog = smoothstep(17.5 * uZoom, 8.5 * uZoom, -vView.z);
    gl_FragColor = vec4(color, edge * fog);
  }
`

const BEACON_VERTEX = /* glsl */ `
  attribute float aBase;
  attribute float aLift;
  attribute float aU;
  uniform float uDpr;
  varying float vFound;
  ${TIMING}

  void main() {
    float found = foundAt(aU);
    vFound = found;
    float h = aBase + aLift * found;
    vec4 mv = modelViewMatrix * vec4(position.x, h * ${HEIGHT.toFixed(1)} + 0.04, position.z, 1.0);
    gl_Position = projectionMatrix * mv;
    float pulse = 0.88 + 0.12 * sin(uTime * 2.6 + aU * 40.0);
    gl_PointSize = 520.0 * uDpr * found * pulse / -mv.z;
  }
`

const BEACON_FRAGMENT = /* glsl */ `
  varying float vFound;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float halo = pow(clamp(1.0 - d, 0.0, 1.0), 2.4);
    float core = smoothstep(0.16, 0.0, d);
    vec3 color = mix(vec3(0.36, 0.49, 1.0), vec3(1.0), core);
    gl_FragColor = vec4(color, (halo * 0.75 + core) * vFound);
  }
`

function easeOutCubic(x: number) {
  return 1 - (1 - x) ** 3
}

function Surface() {
  const group = useRef<THREE.Group>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const startedAt = useRef<number | null>(null)

  const { surfaceGeometry, surfaceMaterial, beaconGeometry, beaconMaterial } = useMemo(() => {
    const count = COLS * ROWS
    const positions = new Float32Array(count * 3)
    const uvs = new Float32Array(count * 2)
    const bases = new Float32Array(count)
    const lifts = new Float32Array(count)
    const marks = new Float32Array(count)

    let i = 0
    for (let r = 0; r < ROWS; r++) {
      const day = r / (ROWS - 1)
      for (let c = 0; c < COLS; c++) {
        const u = c / (COLS - 1)
        const sample = sampleLoad(u * 24, day)
        positions[i * 3] = (u - 0.5) * WIDTH
        positions[i * 3 + 2] = (day - 0.5) * DEPTH
        uvs[i * 2] = u
        uvs[i * 2 + 1] = day
        bases[i] = sample.base
        lifts[i] = sample.lift
        marks[i] = sample.mark
        i++
      }
    }

    // Rows are indexed far-to-near so the fading edges blend in the right order.
    const indices: number[] = []
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = r * COLS + c
        const b = a + 1
        const d = a + COLS
        const e = d + 1
        indices.push(a, d, b, b, d, e)
      }
    }

    const surface = new THREE.BufferGeometry()
    surface.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    surface.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    surface.setAttribute('aBase', new THREE.BufferAttribute(bases, 1))
    surface.setAttribute('aLift', new THREE.BufferAttribute(lifts, 1))
    surface.setAttribute('aMark', new THREE.BufferAttribute(marks, 1))
    surface.setIndex(indices)

    const beaconPositions = new Float32Array(SPIKES.length * 3)
    const beaconBases = new Float32Array(SPIKES.length)
    const beaconLifts = new Float32Array(SPIKES.length)
    const beaconUs = new Float32Array(SPIKES.length)
    SPIKES.forEach((spike, n) => {
      const u = spike.hour / 24
      beaconPositions[n * 3] = (u - 0.5) * WIDTH
      beaconPositions[n * 3 + 2] = (spike.day - 0.5) * DEPTH
      beaconBases[n] = sampleLoad(spike.hour, spike.day).base
      beaconLifts[n] = spike.height * SPIKE_LIFT
      beaconUs[n] = u
    })
    const beacons = new THREE.BufferGeometry()
    beacons.setAttribute('position', new THREE.BufferAttribute(beaconPositions, 3))
    beacons.setAttribute('aBase', new THREE.BufferAttribute(beaconBases, 1))
    beacons.setAttribute('aLift', new THREE.BufferAttribute(beaconLifts, 1))
    beacons.setAttribute('aU', new THREE.BufferAttribute(beaconUs, 1))

    return {
      surfaceGeometry: surface,
      beaconGeometry: beacons,
      surfaceMaterial: new THREE.ShaderMaterial({
        vertexShader: SURFACE_VERTEX,
        fragmentShader: SURFACE_FRAGMENT,
        uniforms: { uTime: { value: 0 }, uRise: { value: 0 }, uZoom: { value: 1 } },
        transparent: true,
        side: THREE.DoubleSide,
      }),
      beaconMaterial: new THREE.ShaderMaterial({
        vertexShader: BEACON_VERTEX,
        fragmentShader: BEACON_FRAGMENT,
        uniforms: { uTime: { value: 0 }, uRise: { value: 0 }, uDpr: { value: 1 } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    }
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      surfaceGeometry.dispose()
      beaconGeometry.dispose()
      surfaceMaterial.dispose()
      beaconMaterial.dispose()
    }
  }, [surfaceGeometry, beaconGeometry, surfaceMaterial, beaconMaterial])

  useFrame((state, delta) => {
    // Count from the first drawn frame so shader compile time does not eat the intro.
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime
    const time = state.clock.elapsedTime - startedAt.current
    const rise = easeOutCubic(Math.min(time / 2.2, 1))
    for (const material of [surfaceMaterial, beaconMaterial]) {
      material.uniforms.uTime.value = time
      material.uniforms.uRise.value = rise
    }
    beaconMaterial.uniforms.uDpr.value = state.viewport.dpr

    // The surface leans gently toward the cursor and lifts away as the page scrolls.
    const ease = 1 - Math.exp(-delta * 3)
    if (group.current) {
      const targetY = -0.3 + pointer.current.x * 0.09 + Math.sin(time * 0.1) * 0.03
      const targetX = pointer.current.y * 0.035
      group.current.rotation.y += (targetY - group.current.rotation.y) * ease
      group.current.rotation.x += (targetX - group.current.rotation.x) * ease
    }
    // On tall, narrow canvases (phones) pull the camera back so the whole surface still fits.
    const aspect = state.size.width / Math.max(state.size.height, 1)
    const zoom = Math.max(1, 1.3 / aspect)
    surfaceMaterial.uniforms.uZoom.value = zoom

    const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1)
    state.camera.position.y += ((3.3 + scroll * 1.6) * zoom - state.camera.position.y) * ease
    state.camera.position.z = 10.4 * zoom
    state.camera.lookAt(0, 1.25, 0)
  })

  return (
    <group ref={group} rotation={[0, -0.3, 0]}>
      <mesh geometry={surfaceGeometry} material={surfaceMaterial} />
      <points geometry={beaconGeometry} material={beaconMaterial} renderOrder={1} />
    </group>
  )
}

export default function LoadSurfaceScene({ onReady }: { onReady: () => void }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)

  // Stop rendering once the hero is scrolled away.
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapper} className="absolute inset-0">
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 34, position: [0, 3.3, 10.4], near: 0.1, far: 80 }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 1.25, 0)
          onReady()
        }}
      >
        <Surface />
      </Canvas>
    </div>
  )
}
