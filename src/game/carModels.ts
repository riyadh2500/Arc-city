// Detailed procedural car models: extruded body profiles, trim, glass, wheels, lights.
import * as THREE from 'three'
import { bakeParts, bp, UNIT_BOX, type BakePart } from './bake'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeGlow } from './textures'

export type CarType = 'sedan' | 'sport' | 'suv' | 'taxi' | 'police' | 'van'

export interface CarSpec {
  name: string
  length: number
  width: number
  wheelR: number
  wheelBase: number
  maxSpeed: number
  accel: number
  brake: number
  grip: number
  cyl: number
}

export const CAR_SPECS: Record<CarType, CarSpec> = {
  sedan: { name: 'Vapid Stanier', length: 4.66, width: 1.9, wheelR: 0.34, wheelBase: 2.7, maxSpeed: 38, accel: 9, brake: 18, grip: 7, cyl: 4 },
  sport: { name: 'Pegassi Arcus', length: 4.56, width: 1.96, wheelR: 0.345, wheelBase: 2.6, maxSpeed: 58, accel: 16, brake: 24, grip: 9, cyl: 8 },
  suv: { name: 'Canis Mesa', length: 5.0, width: 2.06, wheelR: 0.42, wheelBase: 2.95, maxSpeed: 42, accel: 10, brake: 18, grip: 6, cyl: 6 },
  taxi: { name: 'Karin Cab', length: 4.66, width: 1.9, wheelR: 0.34, wheelBase: 2.7, maxSpeed: 40, accel: 10, brake: 18, grip: 7, cyl: 4 },
  police: { name: 'Bravado Cruiser', length: 4.66, width: 1.92, wheelR: 0.35, wheelBase: 2.7, maxSpeed: 46, accel: 13, brake: 22, grip: 8, cyl: 6 },
  van: { name: 'Declasse Hauler', length: 5.3, width: 2.06, wheelR: 0.4, wheelBase: 3.2, maxSpeed: 34, accel: 7, brake: 15, grip: 5.5, cyl: 4 },
}

type P = [number, number]
interface Profile {
  body: P[]
  sideWin: P[][]
  windshield: [P, P]
  rearGlass: [P, P] | null
  hlY: number
  tailY: number
  mirror: P
  door: { front: number; rear: number; bottom: number; top: number }
  seat: P
  steer: P
  rear: number
}

const SEDAN: Profile = {
  body: [[-2.3, 0.34], [-2.33, 0.6], [-2.28, 0.96], [-1.6, 1.02], [-1.02, 1.4], [-0.95, 1.46], [0.5, 1.46], [0.58, 1.44], [1.06, 1.03], [2.05, 0.94], [2.28, 0.8], [2.33, 0.58], [2.28, 0.34]],
  sideWin: [[[-0.08, 1.1], [-0.08, 1.41], [0.5, 1.41], [0.92, 1.1]], [[-1.36, 1.1], [-1.02, 1.4], [-0.22, 1.4], [-0.22, 1.1]]],
  windshield: [[1.05, 1.045], [0.57, 1.45]],
  rearGlass: [[-1.6, 1.03], [-1.0, 1.44]],
  hlY: 0.76, tailY: 0.84, mirror: [0.95, 1.12],
  door: { front: 0.95, rear: -0.15, bottom: 0.42, top: 1.1 },
  seat: [0.0, 0.62], steer: [0.58, 1.0], rear: -1.0,
}

const PROFILES: Record<CarType, Profile> = {
  sedan: SEDAN,
  taxi: SEDAN,
  police: SEDAN,
  sport: {
    body: [[-2.25, 0.32], [-2.28, 0.56], [-2.22, 0.9], [-1.5, 0.98], [-0.9, 1.2], [-0.8, 1.24], [0.3, 1.24], [0.4, 1.22], [1.0, 0.96], [2.0, 0.8], [2.25, 0.66], [2.28, 0.48], [2.22, 0.32]],
    sideWin: [[[-0.05, 0.98], [0.0, 1.19], [0.34, 1.19], [0.8, 0.98]], [[-0.82, 0.99], [-0.72, 1.18], [-0.2, 1.18], [-0.2, 0.99]]],
    windshield: [[0.98, 0.97], [0.42, 1.23]],
    rearGlass: [[-1.5, 0.99], [-0.9, 1.2]],
    hlY: 0.66, tailY: 0.76, mirror: [0.85, 1.0],
    door: { front: 0.9, rear: -0.1, bottom: 0.4, top: 0.98 },
    seat: [-0.1, 0.5], steer: [0.5, 0.85], rear: -0.9,
  },
  suv: {
    body: [[-2.45, 0.4], [-2.48, 0.72], [-2.4, 1.15], [-2.36, 1.8], [-2.2, 1.84], [0.55, 1.84], [0.66, 1.8], [1.12, 1.18], [2.25, 1.06], [2.48, 0.9], [2.52, 0.62], [2.45, 0.4]],
    sideWin: [[[-0.1, 1.28], [-0.1, 1.74], [0.52, 1.74], [0.98, 1.28]], [[-2.25, 1.3], [-2.25, 1.74], [-0.3, 1.74], [-0.3, 1.3]]],
    windshield: [[1.11, 1.2], [0.67, 1.8]],
    rearGlass: [[-2.38, 1.3], [-2.36, 1.76]],
    hlY: 0.92, tailY: 1.0, mirror: [1.0, 1.3],
    door: { front: 1.0, rear: -0.1, bottom: 0.5, top: 1.28 },
    seat: [0.05, 0.82], steer: [0.65, 1.2], rear: -1.2,
  },
  van: {
    body: [[-2.65, 0.42], [-2.68, 0.8], [-2.62, 2.25], [-2.45, 2.32], [0.9, 2.32], [1.2, 2.22], [1.68, 1.32], [2.45, 1.1], [2.66, 0.9], [2.66, 0.55], [2.58, 0.42]],
    sideWin: [[[0.15, 1.5], [0.15, 2.12], [1.0, 2.12], [1.4, 1.5]]],
    windshield: [[1.66, 1.35], [1.24, 2.15]],
    rearGlass: null,
    hlY: 0.98, tailY: 1.1, mirror: [1.3, 1.6],
    door: { front: 1.3, rear: 0.1, bottom: 0.5, top: 1.5 },
    seat: [0.55, 0.95], steer: [1.2, 1.35], rear: 0.0,
  },
}

const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.5, envMapIntensity: 1.6, side: THREE.DoubleSide })
const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 })
const interiorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 })
const glowTex = makeGlow()
const glowFront = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff2d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
const glowRear = new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })

const wheelCache = new Map<number, THREE.BufferGeometry>()
function wheelGeo(r: number): THREE.BufferGeometry {
  const hit = wheelCache.get(r)
  if (hit) return hit
  const w = r * 0.62
  const prof: THREE.Vector2[] = [
    [0.66, -0.5], [0.9, -0.5], [0.985, -0.36], [1, -0.2], [1, 0.2], [0.985, 0.36], [0.9, 0.5], [0.66, 0.5],
  ].map(([rad, y]) => new THREE.Vector2(rad * r, y * w))
  const tire = new THREE.LatheGeometry(prof, 22).rotateZ(Math.PI / 2)
  const side = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2)
  const out = w * 0.5
  const parts: BakePart[] = [
    { geo: tire, color: 0x141416 },
    { geo: side(new THREE.CylinderGeometry(r * 0.7, r * 0.7, w * 0.92, 20)), color: 0x9da2ab },
    { geo: side(new THREE.CylinderGeometry(r * 0.56, r * 0.56, w * 0.94, 18)), color: 0x2b2d33 },
    { geo: side(new THREE.CylinderGeometry(r * 0.52, r * 0.52, w * 0.5, 16)), color: 0x4a4d54 },
    { geo: side(new THREE.CylinderGeometry(r * 0.15, r * 0.15, w * 0.98, 10)), color: 0xc8ccd4 },
  ]
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    for (const o of [-0.06, 0.06]) {
      const g = UNIT_BOX.clone()
      g.scale(w * 0.06, r * 0.4, r * 0.05)
      g.translate(out - w * 0.04, r * 0.36, o * r)
      g.rotateX(a)
      parts.push({ geo: g, color: 0xc4c8d0 })
    }
  }
  const g = bakeParts(parts)
  wheelCache.set(r, g)
  return g
}

function extrudeProfile(poly: P[], width: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map(([z, y]) => new THREE.Vector2(z, y)))
  const depth = width - 2 * bevel
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  })
  g.translate(0, 0, -depth / 2)
  g.rotateY(-Math.PI / 2)
  return g
}

function quad(a: P, b: P, width: number, offset: number): THREE.BufferGeometry {
  const dz = b[0] - a[0]
  const dy = b[1] - a[1]
  const h = Math.hypot(dz, dy)
  const g = new THREE.PlaneGeometry(width, h)
  g.rotateX(Math.atan2(dz, dy))
  g.translate(0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2)
  // push slightly outward along the quad normal
  const nz = dy / h
  const ny = -dz / h
  g.translate(0, ny * offset, nz * offset)
  return g
}

function clipY(poly: P[], y: number, below: boolean): P[] {
  const out: P[] = []
  const inside = (p: P) => (below ? p[1] <= y : p[1] >= y)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ia = inside(a)
    const ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) {
      const t = (y - a[1]) / (b[1] - a[1])
      out.push([a[0] + (b[0] - a[0]) * t, y])
    }
  }
  return out
}

export interface CarRig {
  root: THREE.Group
  body: THREE.Group
  front: THREE.Group[]
  spins: THREE.Object3D[]
  steering: THREE.Object3D
  door: THREE.Group
  driver: THREE.Group
  paint: THREE.MeshStandardMaterial
  head: THREE.MeshStandardMaterial
  tail: THREE.MeshStandardMaterial
  reverse: THREE.MeshStandardMaterial
  blinkL: THREE.MeshStandardMaterial
  blinkR: THREE.MeshStandardMaterial
  barA: THREE.MeshStandardMaterial | null
  barB: THREE.MeshStandardMaterial | null
  glows: THREE.Sprite[]
  smokeAt: THREE.Vector3
}

const emissive = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 0.15, roughness: 0.3 })

export function buildCar(type: CarType, color: number): CarRig {
  const s = CAR_SPECS[type]
  const pr = PROFILES[type]
  const W = s.width
  const L = s.length
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const baseColor = type === 'police' ? 0x15181f : color
  const paint = new THREE.MeshPhysicalMaterial({ color: baseColor, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.4 })
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = shadow
    body.add(m)
    return m
  }

  // lower body full width, narrower greenhouse above the beltline gives a real shoulder
  const belt = pr.door.top
  const Wu = W * 0.88
  add(extrudeProfile(clipY(pr.body, belt, true), W, 0.07), paint)
  add(extrudeProfile(clipY(pr.body, belt, false), Wu, 0.035), paint)

  // glass: side slabs + windshield + rear glass
  const glassParts: THREE.BufferGeometry[] = pr.sideWin.map((w) => extrudeProfile(w, Wu + 0.03, 0))
  glassParts.push(quad(pr.windshield[0], pr.windshield[1], Wu * 0.94, 0.012))
  if (pr.rearGlass) glassParts.push(quad(pr.rearGlass[0], pr.rearGlass[1], Wu * 0.9, 0.012))
  add(mergeGeometries(glassParts.map((g) => (g.index ? g.toNonIndexed() : g)), false), glassMat, false)

  // trim: bumpers, grille, plates, seams, arches, underbody, mirrors, exhaust
  const dark = 0x15161a
  const chrome = 0xaeb3bc
  const hw = W / 2
  const trim: BakePart[] = [
    bp(UNIT_BOX, type === 'sport' ? baseColor : dark, 0, 0.42, L / 2 - 0.02, W * 0.99, 0.2, 0.16),
    bp(UNIT_BOX, type === 'sport' ? baseColor : dark, 0, 0.44, -L / 2 + 0.02, W * 0.99, 0.2, 0.16),
    bp(UNIT_BOX, dark, 0, 0.3, 0, W * 0.9, 0.1, L * 0.9),
    bp(UNIT_BOX, dark, 0, pr.hlY - 0.12, L / 2 - 0.04, W * 0.46, 0.13, 0.05),
    bp(UNIT_BOX, chrome, 0, pr.hlY - 0.03, L / 2 - 0.035, W * 0.46, 0.015, 0.05),
    bp(UNIT_BOX, 0xe8e8ea, 0, 0.5, L / 2 + 0.07, 0.5, 0.12, 0.02),
    bp(UNIT_BOX, 0xe8e8ea, 0, 0.55, -L / 2 - 0.06, 0.5, 0.12, 0.02),
    bp(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8), chrome, hw * 0.55, 0.3, -L / 2 - 0.05, 1, 1, 1, Math.PI / 2, 0, 0),
  ]
  for (const sx of [-1, 1]) {
    trim.push(bp(UNIT_BOX, paint.color.getHex(), sx * (hw + 0.07), pr.mirror[1], pr.mirror[0], 0.11, 0.09, 0.16))
    trim.push(bp(UNIT_BOX, dark, sx * (hw + 0.07), pr.mirror[1], pr.mirror[0] - 0.02, 0.09, 0.07, 0.01 + 0.15))
    trim.push(bp(UNIT_BOX, dark, sx * ((Wu / 2 + hw + 0.07) / 2), pr.mirror[1] - 0.03, pr.mirror[0] - 0.02, hw + 0.07 - Wu / 2, 0.03, 0.04))
    // side skirts, wheel arch lips, fog lamps
    trim.push(bp(UNIT_BOX, dark, sx * (hw - 0.01), 0.37, -0.1, 0.07, 0.13, L * 0.42))
    trim.push(bp(UNIT_BOX, 0xffe9b0, sx * hw * 0.6, 0.38, L / 2 + 0.0, 0.14, 0.05, 0.03))
    for (const wz of [s.wheelBase / 2, -s.wheelBase / 2]) {
      trim.push(bp(new THREE.TorusGeometry(s.wheelR + 0.1, 0.03, 6, 18, Math.PI).rotateY(Math.PI / 2), baseColor, sx * (hw + 0.004), s.wheelR, wz))
    }
    for (const z of [pr.door.front, pr.door.rear, pr.door.rear - 1.0]) {
      trim.push(bp(UNIT_BOX, 0x0d0e10, sx * (hw + 0.004), (pr.door.bottom + pr.door.top) / 2, z, 0.012, pr.door.top - pr.door.bottom, 0.014))
    }
    trim.push(bp(UNIT_BOX, chrome, sx * (hw + 0.012), pr.door.top - 0.1, pr.door.rear + 0.22, 0.02, 0.025, 0.16))
    for (const wz of [s.wheelBase / 2, -s.wheelBase / 2]) {
      trim.push(bp(new THREE.CircleGeometry(s.wheelR + 0.1, 20), 0x0a0a0c, sx * (hw + 0.006), s.wheelR, wz, 1, 1, 1, 0, sx * Math.PI / 2, 0))
    }
  }
  for (let k = 0; k < 3; k++) trim.push(bp(UNIT_BOX, chrome, 0, pr.hlY - 0.08 - k * 0.04, L / 2 - 0.02, W * 0.4, 0.012, 0.04))
  trim.push(bp(UNIT_BOX, dark, 0, pr.windshield[0][1] + 0.02, pr.windshield[0][0] - 0.08, Wu * 0.7, 0.012, 0.014))
  for (const sx of type === 'sport' ? [-1, 1] : [1]) {
    trim.push(bp(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), chrome, sx * hw * 0.55, 0.3, -L / 2 - 0.08, 1, 1, 1, Math.PI / 2, 0, 0))
  }
  if (type === 'suv') {
    for (const sx of [-1, 1]) trim.push(bp(UNIT_BOX, chrome, sx * (Wu / 2 - 0.08), pr.body[4][1] + 0.04, -0.9, 0.04, 0.05, 2.4))
  }
  if (type === 'police') {
    for (const sx of [-1, 1]) trim.push(bp(UNIT_BOX, 0xf2f3f5, sx * (hw + 0.012), (pr.door.bottom + pr.door.top) / 2 - 0.05, (pr.door.front + pr.door.rear - 1.0) / 2 + 0.2, 0.014, pr.door.top - pr.door.bottom - 0.12, pr.door.front - pr.door.rear + 1.3))
    trim.push(bp(UNIT_BOX, 0xf2f3f5, 0, 1.48, -0.2, W * 0.7, 0.02, 1.3))
    trim.push(bp(UNIT_BOX, 0xf2f3f5, 0, 0.99, 1.65, W * 0.76, 0.02, 0.9))
  }
  if (type === 'taxi') {
    for (const sx of [-1, 1]) trim.push(bp(UNIT_BOX, 0x15161a, sx * (hw + 0.012), 0.8, -0.5, 0.012, 0.06, 2.2))
  }
  if (type === 'sport') trim.push(bp(UNIT_BOX, dark, 0, pr.body[2][1] + 0.26, -L / 2 + 0.35, W * 0.9, 0.05, 0.38), bp(UNIT_BOX, dark, 0.7, pr.body[2][1] + 0.12, -L / 2 + 0.35, 0.05, 0.26, 0.1), bp(UNIT_BOX, dark, -0.7, pr.body[2][1] + 0.12, -L / 2 + 0.35, 0.05, 0.26, 0.1))
  if (type === 'suv' || type === 'van') trim.push(bp(UNIT_BOX, dark, 0, pr.body[pr.body.length - 4][1] + 0.1, 0, W * 0.9, 0.04, 0.1))
  if (type === 'taxi') trim.push(bp(UNIT_BOX, 0xfff1a0, 0, pr.body[6][1] + 0.12, -0.2, 0.7, 0.2, 0.3))
  add(bakeParts(trim), trimMat)

  // interior
  const seatC = type === 'police' ? 0x1d2026 : 0x3a3228
  const [sz, sy] = pr.seat
  const interior: BakePart[] = [bp(UNIT_BOX, 0x1c1d21, 0, sy + 0.3, pr.steer[0] + 0.3, W * 0.8, 0.2, 0.45)]
  for (const sx of [-0.42, 0.42]) {
    interior.push(bp(UNIT_BOX, seatC, sx, sy, sz, 0.5, 0.14, 0.55), bp(UNIT_BOX, seatC, sx, sy + 0.32, sz - 0.28, 0.5, 0.55, 0.12, -0.15, 0, 0))
  }
  if (type !== 'van') interior.push(bp(UNIT_BOX, seatC, 0, sy, pr.rear, 1.4, 0.14, 0.5), bp(UNIT_BOX, seatC, 0, sy + 0.32, pr.rear - 0.26, 1.4, 0.5, 0.12))
  add(bakeParts(interior), interiorMat, false)

  // driver seat anchor; the character is created lazily when the car is occupied
  const driver = new THREE.Group()
  driver.position.set(0.42, sy + 0.12, sz - 0.12)
  driver.visible = false
  body.add(driver)

  // steering wheel
  const steerTilt = new THREE.Group()
  steerTilt.position.set(0.42, pr.steer[1], pr.steer[0])
  steerTilt.rotation.x = -1.0
  const steering = new THREE.Group()
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 16), new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.6 }))
  steering.add(sw)
  steerTilt.add(steering)
  body.add(steerTilt)

  // driver door (left, +x side): swings open on enter/exit
  const door = new THREE.Group()
  door.position.set(hw + 0.03, 0, pr.door.front)
  const dh = pr.door.top - pr.door.bottom
  const dl = pr.door.front - pr.door.rear
  const panel = new THREE.Mesh(UNIT_BOX, paint)
  panel.scale.set(0.05, dh, dl)
  panel.position.set(0, pr.door.bottom + dh / 2, -dl / 2)
  panel.castShadow = true
  door.add(panel)
  body.add(door)

  // lights
  const head2 = emissive(0xfff6d8)
  const tail = emissive(0x7a1010)
  tail.emissive.set(0xff1010)
  const reverse = emissive(0xdddddd)
  reverse.emissiveIntensity = 0
  const blinkL = emissive(0xff9a00)
  blinkL.emissiveIntensity = 0.05
  const blinkR = emissive(0xff9a00)
  blinkR.emissiveIntensity = 0.05
  const mk = (mat: THREE.Material, parts: [number, number, number, number, number, number][]) => {
    const g = bakeParts(parts.map((p) => bp(UNIT_BOX, 0xffffff, p[0], p[1], p[2], p[3], p[4], p[5])))
    g.deleteAttribute('color')
    add(g, mat, false)
  }
  mk(head2, [[hw * 0.68, pr.hlY, L / 2 - 0.02, 0.42, 0.15, 0.06], [-hw * 0.68, pr.hlY, L / 2 - 0.02, 0.42, 0.15, 0.06], [hw * 0.68, pr.hlY + 0.1, L / 2 - 0.015, 0.4, 0.02, 0.05], [-hw * 0.68, pr.hlY + 0.1, L / 2 - 0.015, 0.4, 0.02, 0.05]])
  mk(tail, [[hw * 0.66, pr.tailY, -L / 2 + 0.0, 0.5, 0.13, 0.06], [-hw * 0.66, pr.tailY, -L / 2 + 0.0, 0.5, 0.13, 0.06]])
  mk(reverse, [[hw * 0.3, pr.tailY - 0.02, -L / 2 - 0.01, 0.16, 0.08, 0.05], [-hw * 0.3, pr.tailY - 0.02, -L / 2 - 0.01, 0.16, 0.08, 0.05]])
  mk(blinkL, [[hw - 0.12, pr.hlY - 0.15, L / 2 - 0.01, 0.16, 0.07, 0.05], [hw - 0.12, pr.tailY - 0.14, -L / 2 - 0.0, 0.16, 0.07, 0.05]])
  mk(blinkR, [[-hw + 0.12, pr.hlY - 0.15, L / 2 - 0.01, 0.16, 0.07, 0.05], [-hw + 0.12, pr.tailY - 0.14, -L / 2 - 0.0, 0.16, 0.07, 0.05]])

  let barA: THREE.MeshStandardMaterial | null = null
  let barB: THREE.MeshStandardMaterial | null = null
  if (type === 'police') {
    barA = emissive(0xff1a1a)
    barB = emissive(0x1a3cff)
    const roofY = 1.5
    const baseBar = new THREE.Mesh(UNIT_BOX, new THREE.MeshStandardMaterial({ color: 0x15161a }))
    baseBar.scale.set(1.15, 0.06, 0.36)
    baseBar.position.set(0, roofY, -0.2)
    body.add(baseBar)
    const a = new THREE.Mesh(UNIT_BOX, barA)
    a.scale.set(0.5, 0.11, 0.3)
    a.position.set(0.3, roofY + 0.08, -0.2)
    const b = new THREE.Mesh(UNIT_BOX, barB)
    b.scale.set(0.5, 0.11, 0.3)
    b.position.set(-0.3, roofY + 0.08, -0.2)
    body.add(a, b)
  }

  const glows: THREE.Sprite[] = []
  for (const sx of [-1, 1]) {
    const f = new THREE.Sprite(glowFront)
    f.scale.set(2.2, 2.2, 1)
    f.position.set(sx * hw * 0.68, pr.hlY, L / 2 + 0.3)
    f.visible = false
    const r = new THREE.Sprite(glowRear)
    r.scale.set(1.5, 1.5, 1)
    r.position.set(sx * hw * 0.66, pr.tailY, -L / 2 - 0.2)
    r.visible = false
    body.add(f, r)
    glows.push(f, r)
  }

  // wheels
  const front: THREE.Group[] = []
  const spins: THREE.Object3D[] = []
  const wg = wheelGeo(s.wheelR)
  for (const sx of [-1, 1]) {
    for (const sz2 of [1, -1]) {
      const pivot = new THREE.Group()
      pivot.position.set(sx * (hw - 0.14), s.wheelR, sz2 * s.wheelBase * 0.5)
      const spin = new THREE.Group()
      const wm = new THREE.Mesh(wg, wheelMat)
      wm.castShadow = true
      if (sx < 0) wm.rotation.y = Math.PI
      spin.add(wm)
      pivot.add(spin)
      root.add(pivot)
      spins.push(spin)
      if (sz2 > 0) front.push(pivot)
    }
  }

  return {
    root, body, front, spins, steering, door, driver, paint,
    head: head2, tail, reverse, blinkL, blinkR, barA, barB, glows,
    smokeAt: new THREE.Vector3(0, pr.body[pr.body.length - 4][1] + 0.1, L / 2 - 0.7),
  }
}
