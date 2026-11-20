// Street furniture: trees, lamps, benches, traffic lights (all instanced).
import * as THREE from 'three'
import { InstBatch } from './batch'
import { ColliderGrid, lightState, type LightState } from './util'
import { makeGlow } from './textures'

interface Head {
  i: number
  j: number
  axis: 'x' | 'z'
  idx: number
}

function swayMaterial(u: { value: number }, p: THREE.MeshStandardMaterialParameters, amp: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(p)
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
  transformed.x += sin(uTime * 1.5 + ph + position.y * 1.4) * ${amp.toFixed(3)};
  transformed.z += cos(uTime * 1.2 + ph * 1.3 + position.x) * ${amp.toFixed(3)};
  transformed.y += sin(uTime * 2.1 + ph) * ${(amp * 0.3).toFixed(3)};
#endif`,
    )
  }
  return m
}

export class Props {
  private timeU = { value: 0 }
  trunk = new InstBatch(
    new THREE.CylinderGeometry(0.18, 0.26, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 1 }),
  )
  leaves = new InstBatch(
    new THREE.IcosahedronGeometry(1, 1),
    swayMaterial(this.timeU, { color: 0xffffff, roughness: 0.9, flatShading: true }, 0.07),
  )
  farLeaves = new InstBatch(
    new THREE.ConeGeometry(2.2, 7, 6),
    swayMaterial(this.timeU, { color: 0x2f5a2e, roughness: 1, flatShading: true }, 0.1),
    false,
    false,
  )
  bench = new InstBatch(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }),
  )
  steel = new InstBatch(
    new THREE.CylinderGeometry(1, 1, 1, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.6 }),
  )
  hydrant = new InstBatch(
    new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }),
  )
  arm = new InstBatch(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.6 }),
  )
  lampHeadMat = new THREE.MeshBasicMaterial({ color: 0x5a5648 })
  lampHead = new InstBatch(new THREE.BoxGeometry(1, 1, 1), this.lampHeadMat, false, false)
  poolMat = new THREE.MeshBasicMaterial({
    map: makeGlow(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  pool = new InstBatch(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat, false, false)
  roofBox = new InstBatch(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x7b7e84, roughness: 0.8 }),
  )
  beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a })
  beacon = new InstBatch(new THREE.SphereGeometry(0.5, 6, 4), this.beaconMat, false, false)
  whitePaint = new InstBatch(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.8 }),
    false,
  )
  yellowPaint = new InstBatch(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xe0b52a, roughness: 0.8 }),
    false,
  )

  // traffic lights
  private bulbGeo = new THREE.SphereGeometry(0.2, 8, 6)
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  private bulbs: InstBatch[] = [0, 1, 2].map(() => new InstBatch(this.bulbGeo, this.bulbMat, false, false))
  private heads: Head[] = []
  private lastState = new Map<string, LightState>()
  private bulbMeshes: (THREE.InstancedMesh | null)[] = []

  private treeColors = [0x3f7a35, 0x4b8a3b, 0x356b30, 0x5a9440, 0x6a9a3a]

  constructor(private grid: ColliderGrid) {}

  addTree(x: number, z: number, s = 1, collide = true): void {
    const h = 2.4 * s
    this.trunk.add(x, h / 2, z, s, h, s)
    const c = this.treeColors[Math.floor(Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 5) % 5]
    this.leaves.add(x, h + 1.4 * s, z, 1.9 * s, 1.5 * s, 1.9 * s, x * 3, c)
    this.leaves.add(x + 0.5 * s, h + 2.6 * s, z - 0.3 * s, 1.3 * s, 1.1 * s, 1.3 * s, z, c)
    if (collide) this.grid.addRect(x, z, 0.35, 0.35, 6)
  }

  addLamp(x: number, z: number, dx: number, dz: number): void {
    this.steel.add(x, 4, z, 0.12, 8, 0.12)
    const ax = x + dx * 1.1
    const az = z + dz * 1.1
    const rot = dx !== 0 ? 0 : Math.PI / 2
    this.arm.add(ax, 8, az, dx !== 0 ? 2.4 : 0.14, 0.14, dz !== 0 ? 2.4 : 0.14, 0)
    this.lampHead.add(x + dx * 2.2, 7.9, z + dz * 2.2, 0.9, 0.18, 0.5, rot)
    this.pool.add(x + dx * 4.2, 0.05, z + dz * 4.2, 13, 1, 13)
    this.grid.addRect(x, z, 0.25, 0.25, 8)
  }

  addBench(x: number, z: number, rotY: number): void {
    const c = Math.cos(rotY)
    const s = Math.sin(rotY)
    this.bench.add(x, 0.55, z, 1.8 * Math.abs(c) + 0.5 * Math.abs(s), 0.12, 1.8 * Math.abs(s) + 0.5 * Math.abs(c))
    this.bench.add(x - s * 0.22, 0.95, z - c * 0.22, 1.8 * Math.abs(c) + 0.1 * Math.abs(s), 0.5, 1.8 * Math.abs(s) + 0.1 * Math.abs(c))
    this.grid.addRect(x, z, 0.95 * Math.abs(c) + 0.3, 0.95 * Math.abs(s) + 0.3, 1)
  }

  addBin(x: number, z: number): void {
    this.steel.add(x, 0.5, z, 0.3, 1, 0.3)
    this.grid.addRect(x, z, 0.3, 0.3, 1)
  }

  addHydrant(x: number, z: number): void {
    this.hydrant.add(x, 0.4, z)
  }

  addRoofClutter(x: number, y: number, z: number, rng: () => number, w: number, d: number): void {
    const n = 1 + Math.floor(rng() * 3)
    for (let k = 0; k < n; k++) {
      this.roofBox.add(
        x + (rng() - 0.5) * w * 0.6,
        y + 0.7,
        z + (rng() - 0.5) * d * 0.6,
        1.5 + rng() * 2.5,
        1.4,
        1.5 + rng() * 2.5,
        rng() * 3,
      )
    }
  }

  addTrafficLight(cx: number, cz: number, i: number, j: number): void {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = cx + sx * 10.8
        const pz = cz + sz * 10.8
        this.steel.add(px, 2.75, pz, 0.1, 5.5, 0.1)
        this.grid.addRect(px, pz, 0.25, 0.25, 6)
        // head facing x-traffic approaching from the sx side
        this.addHead(px + sx * 0.45, 5.4, pz, 'x', sx, 0, i, j)
        this.addHead(px, 5.4, pz + sz * 0.45, 'z', 0, sz, i, j)
      }
    }
  }

  private addHead(x: number, y: number, z: number, axis: 'x' | 'z', fx: number, fz: number, i: number, j: number): void {
    this.arm.add(x, y, z, 0.6, 1.8, 0.6)
    const idx = this.bulbs[0].count
    for (let b = 0; b < 3; b++) {
      this.bulbs[b].add(x + fx * 0.33, y + 0.55 - b * 0.55, z + fz * 0.33, 1, 1, 1, 0, 0x222222)
    }
    this.heads.push({ i, j, axis, idx })
  }

  build(parent: THREE.Object3D): void {
    for (const b of [
      this.trunk, this.leaves, this.farLeaves, this.bench, this.steel, this.hydrant, this.arm,
      this.lampHead, this.pool, this.roofBox, this.beacon, this.whitePaint, this.yellowPaint,
    ]) {
      b.build(parent)
    }
    this.bulbMeshes = this.bulbs.map((b) => b.build(parent))
  }

  setTime(t: number): void {
    this.timeU.value = t
  }

  setNight(n: number): void {
    this.lampHeadMat.color.setRGB(0.35 + n * 0.65, 0.33 + n * 0.55, 0.28 + n * 0.3)
    this.poolMat.opacity = n * 0.75
    this.beaconMat.color.setRGB(0.5 + n * 0.5, 0.1, 0.1)
  }

  private static ON = [new THREE.Color(0xff3b30), new THREE.Color(0xffc21a), new THREE.Color(0x2bff6a)]
  private static OFF = [new THREE.Color(0x3a1210), new THREE.Color(0x3a2e0a), new THREE.Color(0x0b2a14)]

  updateLights(time: number): void {
    const changed = new Set<number>()
    for (const h of this.heads) {
      const st = lightState(h.axis, time, h.i, h.j)
      const key = `${h.i},${h.j},${h.axis}`
      if (this.lastState.get(key) === st) continue
      this.lastState.set(key, st)
      // apply to every head with the same key
      for (const o of this.heads) {
        if (o.i !== h.i || o.j !== h.j || o.axis !== h.axis) continue
        for (let b = 0; b < 3; b++) {
          const m = this.bulbMeshes[b]
          if (!m) continue
          const isOn = (st === 'red' && b === 0) || (st === 'yellow' && b === 1) || (st === 'green' && b === 2)
          m.setColorAt(o.idx, isOn ? Props.ON[b] : Props.OFF[b])
          changed.add(b)
        }
      }
    }
    for (const b of changed) {
      const ic = this.bulbMeshes[b]?.instanceColor
      if (ic) ic.needsUpdate = true
    }
  }
}
