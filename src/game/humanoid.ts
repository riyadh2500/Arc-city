// Human-proportioned low-poly character: face, hands, shoes, clothing and a full gait rig.
// Every bone is one merged, vertex-coloured mesh, so a pedestrian costs ~12 draw calls.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp, damp } from './util'
import { buildGun, WEAPONS, type WeaponId } from './weapons'

export type HairStyle = 'short' | 'long' | 'bald' | 'cap' | 'pony' | 'buzz'
export type Outfit = 'casual' | 'jacket' | 'vest' | 'police' | 'suit'
export type HumanoidPose = 'normal' | 'phone' | 'talk'

export interface HumanoidOpts {
  shirt: number
  pants: number
  skin: number
  hair: number
  shoes?: number
  scale?: number
  hairStyle?: HairStyle
  outfit?: Outfit
  female?: boolean
}

export interface Humanoid {
  group: THREE.Group
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  footL: THREE.Group
  footR: THREE.Group
  phone: THREE.Mesh
  gunSlot: THREE.Group
  gun: THREE.Group | null
  weapon: WeaponId
  aimOn: boolean
  aimW: number
  aimPitch: number
  recoil: number
  attackT: number
  attackKind: 'punch' | 'kick'
  attackSide: number
  flashT: number
  phase: number
  amp: number
  t: number
  land: number
  wasAir: boolean
  pose: HumanoidPose
  meshes: THREE.Mesh[]
}

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 })
const phoneMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.3, metalness: 0.6, emissive: new THREE.Color(0x335577), emissiveIntensity: 0.5 })

interface Part {
  geo: THREE.BufferGeometry
  color: number
}

const _e = new THREE.Euler()
const _m = new THREE.Matrix4()

function part(
  base: THREE.BufferGeometry,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): Part {
  const g = base.clone()
  g.scale(sx, sy, sz)
  if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)))
  g.translate(x, y, z)
  return { geo: g, color }
}

function bake(parts: Part[]): THREE.BufferGeometry {
  const list = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo
    g.deleteAttribute('uv')
    const n = g.attributes.position.count
    const c = new THREE.Color(color)
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return g
  })
  return mergeGeometries(list, false)
}

const cyl = (rt: number, rb: number, h: number, seg = 9) => new THREE.CylinderGeometry(rt, rb, h, seg)
const sph = (r: number) => new THREE.SphereGeometry(r, 12, 9)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8)
const ring = (r: number, t: number) => new THREE.TorusGeometry(r, t, 4, 12)

function shade(c: number, f: number): number {
  const col = new THREE.Color(c)
  col.multiplyScalar(f)
  return col.getHex()
}

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, list: THREE.Mesh[]): THREE.Mesh {
  const m = new THREE.Mesh(geo, material)
  m.castShadow = true
  parent.add(m)
  list.push(m)
  return m
}

const IRIS = [0x3a2616, 0x2a4a6a, 0x3a5a3a, 0x1c1410]

export function createHumanoid(o: HumanoidOpts): Humanoid {
  const outfit = o.outfit ?? 'casual'
  const style = o.hairStyle ?? 'short'
  const female = o.female ?? (style === 'long' || style === 'pony')
  const meshes: THREE.Mesh[] = []
  const shirt = outfit === 'police' ? 0x1b2a4a : o.shirt
  const pants = outfit === 'police' ? 0x141c2e : outfit === 'suit' ? 0x1d2230 : o.pants
  const shoes = o.shoes ?? (outfit === 'suit' || outfit === 'police' ? 0x0d0d10 : 0x1c1c20)
  const sole = o.shoes === 0xf2f2f2 || outfit === 'casual' ? 0xe8e8e8 : 0x0a0a0c
  const sh = female ? 0.9 : 1
  const hipW = female ? 1.12 : 1
  const build = 0.94 + Math.random() * 0.14
  const skinDark = shade(o.skin, 0.8)
  const sleeveShort = outfit === 'casual' && Math.random() < 0.7
  const sleeveC = sleeveShort ? o.skin : shirt

  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)
  const torso = new THREE.Group()
  torso.position.set(0, 0.93, 0)
  body.add(torso)

  // ---- pelvis + trunk ----
  const trunk: Part[] = [
    part(sph(0.15), pants, 0, -0.04, 0, 1.12 * hipW * build, 0.78, 0.82),
    part(box(0.3 * hipW * build, 0.03, 0.19), 0x221a14, 0, 0.045, 0, 1, 1, 1),
    part(box(0.035, 0.026, 0.012), 0xc9c2a8, 0, 0.045, 0.098),
    part(cyl(0.118 * build * (female ? 0.9 : 1), 0.13 * build, 0.24), shirt, 0, 0.15, 0, 1, 1, 0.78),
    part(sph(0.15), shirt, 0, 0.36, 0, 1.2 * sh * build, 1.3, 0.78),
    part(sph(0.12), shirt, 0, 0.47, 0, 1.5 * sh * build, 0.55, 0.8),
    part(sph(0.062), shirt, 0.19 * sh * build, 0.5, 0),
    part(sph(0.062), shirt, -0.19 * sh * build, 0.5, 0),
    part(cyl(0.043, 0.05, 0.1), o.skin, 0, 0.6, 0),
    part(box(0.05, 0.02, 0.03), shade(shirt, 1.12), 0.034, 0.565, 0.06, 1, 1, 1, 0.2, 0, -0.5),
    part(box(0.05, 0.02, 0.03), shade(shirt, 1.12), -0.034, 0.565, 0.06, 1, 1, 1, 0.2, 0, 0.5),
  ]
  if (female) {
    trunk.push(part(sph(0.055), shirt, 0.065, 0.37, 0.085), part(sph(0.055), shirt, -0.065, 0.37, 0.085))
  }
  if (outfit === 'jacket' || outfit === 'suit') {
    const jc = outfit === 'suit' ? 0x1d2230 : shade(shirt, 0.85)
    trunk.push(
      part(cyl(0.135 * build, 0.15 * build, 0.3), jc, 0, 0.11, 0, 1, 1, 0.84),
      part(sph(0.157), jc, 0, 0.37, 0, 1.2 * sh * build, 1.22, 0.82),
      part(box(0.05, 0.3, 0.012), outfit === 'suit' ? 0xf4f4f4 : shade(jc, 1.3), 0, 0.38, 0.122),
    )
    if (outfit === 'suit') trunk.push(part(box(0.02, 0.2, 0.012), 0x8a1e2c, 0, 0.36, 0.13))
  }
  if (outfit === 'vest') {
    trunk.push(part(sph(0.155), 0xe8d21c, 0, 0.36, 0, 1.22 * sh * build, 1.24, 0.82), part(box(0.38, 0.035, 0.2), 0xe6e6e6, 0, 0.3, 0), part(box(0.38, 0.035, 0.2), 0xe6e6e6, 0, 0.42, 0))
  }
  if (outfit === 'police') {
    trunk.push(
      part(box(0.04, 0.045, 0.01), 0xd9b23c, 0.09, 0.46, 0.118),
      part(box(0.34, 0.035, 0.215), 0x0c0f18, 0, 0.045, 0),
      part(box(0.05, 0.07, 0.04), 0x15161a, -0.14, 0.02, 0.08),
    )
  }
  mesh(torso, bake(trunk), meshes)

  // ---- head ----
  const head = new THREE.Group()
  head.position.set(0, 0.61, 0)
  torso.add(head)
  const iris = IRIS[Math.floor(Math.random() * IRIS.length)]
  const lip = female ? 0xa8454e : shade(o.skin, 0.72)
  const hp: Part[] = [
    part(sph(0.1), o.skin, 0, 0.115, 0, 0.94, 1.12, 1.03),
    part(sph(0.08), o.skin, 0, 0.045, 0.014, 0.9, 0.82, 0.96),
    part(sph(0.032), o.skin, 0, 0.012, 0.068, 1, 0.8, 1),
    part(sph(0.04), o.skin, 0.056, 0.075, 0.058),
    part(sph(0.04), o.skin, -0.056, 0.075, 0.058),
    part(sph(0.02), shade(o.skin, 0.96), 0, 0.098, 0.108, 0.85, 1.3, 1.1),
    part(box(0.02, 0.04, 0.024), o.skin, 0, 0.125, 0.098),
    part(box(0.05, 0.009, 0.012), lip, 0, 0.056, 0.097),
    part(box(0.034, 0.008, 0.012), lip, 0, 0.044, 0.094),
    part(sph(0.017), 0xf2efe8, 0.038, 0.126, 0.092, 1, 0.75, 0.6),
    part(sph(0.017), 0xf2efe8, -0.038, 0.126, 0.092, 1, 0.75, 0.6),
    part(sph(0.0095), iris, 0.038, 0.126, 0.099, 1, 1, 0.6),
    part(sph(0.0095), iris, -0.038, 0.126, 0.099, 1, 1, 0.6),
    part(box(0.046, female ? 0.006 : 0.009, 0.012), o.hair, 0.038, 0.15, 0.092, 1, 1, 1, 0, 0, 0.12),
    part(box(0.046, female ? 0.006 : 0.009, 0.012), o.hair, -0.038, 0.15, 0.092, 1, 1, 1, 0, 0, -0.12),
    part(sph(0.022), shade(o.skin, 0.95), 0.097, 0.11, 0, 0.5, 1, 0.85),
    part(sph(0.022), shade(o.skin, 0.95), -0.097, 0.11, 0, 0.5, 1, 0.85),
  ]
  const hairC = o.hair
  if (outfit === 'police') {
    hp.push(part(sph(0.112), 0x141c2e, 0, 0.19, -0.005, 1, 0.55, 1.06), part(box(0.2, 0.012, 0.09), 0x0c0f18, 0, 0.175, 0.115), part(box(0.03, 0.03, 0.01), 0xd9b23c, 0, 0.2, 0.118))
  } else if (style === 'short') {
    hp.push(part(sph(0.108), hairC, 0, 0.158, -0.012, 0.99, 0.8, 1.08), part(sph(0.1), hairC, 0, 0.12, -0.05, 0.96, 0.85, 0.86), part(box(0.022, 0.07, 0.04), hairC, 0.092, 0.115, 0.01), part(box(0.022, 0.07, 0.04), hairC, -0.092, 0.115, 0.01))
  } else if (style === 'buzz') {
    hp.push(part(sph(0.104), hairC, 0, 0.152, -0.004, 0.96, 0.72, 1.04))
  } else if (style === 'long') {
    hp.push(part(sph(0.11), hairC, 0, 0.158, -0.012, 1, 0.82, 1.1), part(capsule(0.09, 0.2), hairC, 0, 0.0, -0.07, 1.15, 1.1, 0.62), part(box(0.026, 0.22, 0.07), hairC, 0.1, 0.03, 0.0), part(box(0.026, 0.22, 0.07), hairC, -0.1, 0.03, 0.0))
  } else if (style === 'pony') {
    hp.push(part(sph(0.11), hairC, 0, 0.158, -0.012, 1, 0.82, 1.1), part(capsule(0.032, 0.14), hairC, 0, 0.06, -0.14, 1, 1, 1, 0.55, 0, 0), part(sph(0.026), shade(hairC, 0.6), 0, 0.12, -0.105))
  } else if (style === 'cap') {
    const capC = 0x2c4a8a
    hp.push(part(sph(0.112), capC, 0, 0.172, -0.004, 1, 0.7, 1.08), part(box(0.16, 0.012, 0.095), capC, 0, 0.155, 0.11, 1, 1, 1, 0.12, 0, 0), part(sph(0.1), hairC, 0, 0.115, -0.05, 0.95, 0.8, 0.85))
  }
  if (!female && style !== 'bald' && outfit === 'casual' && Math.random() < 0.28) {
    hp.push(part(sph(0.084), hairC, 0, 0.03, 0.022, 0.94, 0.55, 0.96), part(box(0.05, 0.012, 0.014), hairC, 0, 0.066, 0.102))
  }
  if (Math.random() < 0.14) {
    hp.push(part(ring(0.022, 0.003), 0x111111, 0.038, 0.126, 0.104), part(ring(0.022, 0.003), 0x111111, -0.038, 0.126, 0.104), part(box(0.03, 0.004, 0.004), 0x111111, 0, 0.13, 0.106))
  }
  mesh(head, bake(hp), meshes)

  // ---- arms ----
  const mkArm = (side: number) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.2 * sh * build, 0.5, 0)
    torso.add(shoulder)
    const upper: Part[] = sleeveShort
      ? [part(cyl(0.056, 0.052, 0.15), shirt, 0, -0.075, 0), part(cyl(0.048, 0.042, 0.15), o.skin, 0, -0.215, 0)]
      : [part(cyl(0.054, 0.042, 0.29), shirt, 0, -0.145, 0)]
    mesh(shoulder, bake(upper), meshes)
    const elbow = new THREE.Group()
    elbow.position.set(0, -0.29, 0)
    shoulder.add(elbow)
    const fore: Part[] = [
      part(sph(0.041), sleeveC, 0, 0, 0),
      part(cyl(0.041, 0.031, 0.26), sleeveC, 0, -0.13, 0),
      part(sph(0.036), o.skin, 0, -0.3, 0, 1, 1.45, 0.62),
      part(box(0.062, 0.06, 0.024), o.skin, 0, -0.355, 0.002, 1, 1, 1, -0.12, 0, 0),
      part(capsule(0.011, 0.03), o.skin, -side * 0.034, -0.31, 0.014, 1, 1, 1, 0.3, 0, side * 0.5),
    ]
    if (!sleeveShort) fore.push(part(cyl(0.034, 0.034, 0.03), shade(shirt, 1.18), 0, -0.25, 0))
    if (outfit === 'police') fore.push(part(box(0.06, 0.03, 0.012), 0x0c0f18, 0, -0.27, 0))
    mesh(elbow, bake(fore), meshes)
    return { shoulder, elbow }
  }
  const aL = mkArm(1)
  const aR = mkArm(-1)

  const phone = new THREE.Mesh(box(0.035, 0.075, 0.009), phoneMat)
  phone.position.set(0.005, -0.34, 0.03)
  phone.visible = false
  aR.elbow.add(phone)
  const gunSlot = new THREE.Group()
  gunSlot.position.set(0, -0.335, 0.02)
  gunSlot.rotation.x = Math.PI / 2
  aR.elbow.add(gunSlot)

  // ---- legs ----
  const mkLeg = (side: number) => {
    const hip = new THREE.Group()
    hip.position.set(side * 0.095 * hipW * build, 0.92, 0)
    body.add(hip)
    mesh(hip, bake([part(sph(0.086), pants, 0, 0, 0), part(cyl(0.088, 0.064, 0.44), pants, 0, -0.22, 0)]), meshes)
    const knee = new THREE.Group()
    knee.position.set(0, -0.44, 0)
    hip.add(knee)
    mesh(
      knee,
      bake([
        part(sph(0.064), pants, 0, 0, 0),
        part(cyl(0.06, 0.043, 0.4), pants, 0, -0.2, 0),
        part(sph(0.058), pants, 0, -0.11, -0.018, 1, 1.5, 1),
        part(cyl(0.048, 0.049, 0.035), shade(pants, 0.85), 0, -0.37, 0),
      ]),
      meshes,
    )
    const ankle = new THREE.Group()
    ankle.position.set(0, -0.4, 0)
    knee.add(ankle)
    mesh(
      ankle,
      bake([
        part(cyl(0.036, 0.036, 0.05), shade(o.skin, 0.9), 0, -0.01, 0),
        part(sph(0.05), shoes, 0, -0.035, 0.065, 1, 0.82, 2.3),
        part(sph(0.042), shoes, 0, -0.04, -0.035),
        part(sph(0.046), shade(shoes, 1.12), 0, -0.043, 0.125, 1, 0.68, 1.2),
        part(box(0.098, 0.02, 0.28), sole, 0, -0.07, 0.058),
        part(box(0.04, 0.012, 0.07), shade(shoes, 1.5), 0, -0.01, 0.05),
      ]),
      meshes,
    )
    return { hip, knee, ankle }
  }
  const lL = mkLeg(1)
  const lR = mkLeg(-1)

  if (o.scale) group.scale.setScalar(o.scale)
  void skinDark
  return {
    group,
    body,
    torso,
    head,
    armL: aL.shoulder,
    armR: aR.shoulder,
    elbowL: aL.elbow,
    elbowR: aR.elbow,
    legL: lL.hip,
    legR: lR.hip,
    kneeL: lL.knee,
    kneeR: lR.knee,
    footL: lL.ankle,
    footR: lR.ankle,
    phone,
    gunSlot,
    gun: null,
    weapon: 'fists',
    aimOn: false,
    aimW: 0,
    aimPitch: 0,
    recoil: 0,
    attackT: 0,
    attackKind: 'punch',
    attackSide: 1,
    flashT: 0,
    phase: Math.random() * 6,
    amp: 0,
    t: Math.random() * 10,
    land: 0,
    wasAir: false,
    pose: 'normal',
    meshes,
  }
}

export function setHumanoidShadows(h: Humanoid, on: boolean): void {
  for (const m of h.meshes) m.castShadow = on
}

/** Smoothly drive a joint towards target rotations. */
function pose(o: THREE.Object3D, rx: number, ry: number, rz: number, k: number, dt: number): void {
  o.rotation.x = damp(o.rotation.x, rx, k, dt)
  o.rotation.y = damp(o.rotation.y, ry, k, dt)
  o.rotation.z = damp(o.rotation.z, rz, k, dt)
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Show the muzzle flash for a moment (call when a shot is fired). */
export function fireFlash(h: Humanoid): void {
  h.flashT = 0.06
  h.recoil = 1
  const f = h.gun?.getObjectByName('flash')
  if (f) {
    f.visible = true
    f.rotation.z = Math.random() * Math.PI
  }
}

/** Equip a gun in the right hand, or null / 'fists' for bare hands. */
export function setHumanoidWeapon(h: Humanoid, id: WeaponId | null): void {
  if (h.gun) {
    h.gunSlot.remove(h.gun)
    h.gun = null
  }
  h.weapon = id ?? 'fists'
  if (id && id !== 'fists') {
    h.gun = buildGun(id)
    h.gunSlot.rotation.x = WEAPONS[id].kind === 'melee' ? -0.45 : Math.PI / 2
    h.gunSlot.add(h.gun)
  }
}

export function triggerAttack(h: Humanoid, kind: 'punch' | 'kick'): void {
  h.attackKind = kind
  h.attackT = kind === 'kick' ? 0.42 : 0.34
  h.attackSide = -h.attackSide || 1
}

/** World position of the muzzle (or the fist when unarmed). */
export function muzzleWorld(h: Humanoid, out: THREE.Vector3): THREE.Vector3 {
  h.group.updateWorldMatrix(true, true)
  const f = h.gun?.getObjectByName('flash')
  if (f) return f.getWorldPosition(out)
  return h.elbowR.getWorldPosition(out)
}

/**
 * speed in m/s. Blends idle fidgets, walk, jog and sprint gaits, jump, fall and landing,
 * plus weapon aiming, recoil, punches and kicks.
 * vy (optional) is the vertical velocity so rising and falling use different poses.
 */
export function animateHumanoid(h: Humanoid, dt: number, speed: number, airborne: boolean, vy = 0): void {
  h.t += dt
  const t = h.t
  const K = 22
  if (h.wasAir && !airborne) h.land = 0.3
  h.wasAir = airborne
  h.land = Math.max(0, h.land - dt)
  const landK = h.land / 0.3
  h.recoil = Math.max(0, h.recoil - dt * 7)
  h.attackT = Math.max(0, h.attackT - dt)
  if (h.flashT > 0) {
    h.flashT -= dt
    if (h.flashT <= 0) {
      const f = h.gun?.getObjectByName('flash')
      if (f) f.visible = false
    }
  }
  const armed = h.gun !== null && WEAPONS[h.weapon].kind === 'gun'
  h.aimW = damp(h.aimW, h.aimOn && armed ? 1 : 0, 14, dt)
  const dur = h.attackKind === 'kick' ? 0.42 : 0.34
  const atk = h.attackT > 0 ? Math.sin((1 - h.attackT / dur) * Math.PI) : 0

  if (airborne) {
    const rising = vy > 0
    pose(h.legL, rising ? -0.85 : -0.5, 0, 0.04, 16, dt)
    pose(h.legR, rising ? 0.25 : 0.1, 0, -0.04, 16, dt)
    pose(h.kneeL, rising ? 1.35 : 0.8, 0, 0, 16, dt)
    pose(h.kneeR, rising ? 0.9 : 0.4, 0, 0, 16, dt)
    pose(h.footL, rising ? 0.5 : 0.1, 0, 0, 16, dt)
    pose(h.footR, 0.5, 0, 0, 16, dt)
    const gunUp = armed && h.aimW > 0.5
    pose(h.armL, rising ? -2.4 : -1.1, 0, rising ? 0.45 : 1.0, 14, dt)
    pose(h.armR, gunUp ? -(Math.PI / 2 + h.aimPitch) : rising ? -2.4 : -1.1, 0, gunUp ? -0.06 : rising ? -0.45 : -1.0, 14, dt)
    pose(h.elbowL, -0.35, 0, 0, 14, dt)
    pose(h.elbowR, gunUp ? -0.2 : -0.35, 0, 0, 14, dt)
    pose(h.torso, rising ? 0.12 : 0.05, 0, 0, 10, dt)
    pose(h.head, -0.1, 0, 0, 10, dt)
    pose(h.body, 0, 0, 0, 12, dt)
    h.body.position.y = damp(h.body.position.y, 0, 12, dt)
    h.phone.visible = false
    return
  }

  const run = clamp((speed - 2.6) / 5.2, 0, 1)
  h.amp = damp(h.amp, clamp(speed / 1.1, 0, 1), 9, dt)
  const mv = h.amp
  if (speed > 0.15) h.phase += dt * ((Math.PI * 2 * speed) / (1.0 + 0.55 * speed))
  const p = h.phase

  const A = clamp(0.2 + 0.1 * speed, 0, 0.95) * mv
  const Kmax = clamp(0.32 + 0.17 * speed, 0, 1.9)
  const sL = Math.sin(p)
  const sR = Math.sin(p + Math.PI)
  const cL = Math.cos(p)
  const cR = Math.cos(p + Math.PI)
  const fL = A * sL
  const fR = A * sR
  const stance = 0.09 * mv
  const kneeL = Kmax * Math.pow(Math.max(0, cL), 1.3) * mv + stance
  let kneeR = Kmax * Math.pow(Math.max(0, cR), 1.3) * mv + stance
  const toeL = Math.max(0, -sL) * (0.3 + run * 0.5) * mv
  const toeR = Math.max(0, -sR) * (0.3 + run * 0.5) * mv

  const idle = 1 - mv
  const shift = Math.sin(t * 0.37) * idle
  const breathe = Math.sin(t * 1.9)
  const glance = Math.sin(t * 0.42) * Math.max(0, Math.sin(t * 0.17)) * idle
  const crouch = landK * landK

  let legRx = -fR - crouch * 0.55 - shift * 0.03
  if (h.attackKind === 'kick' && atk > 0) {
    legRx = lerp(legRx, -1.55, atk)
    kneeR = lerp(kneeR, 0.25, atk)
  }
  pose(h.legL, -fL - crouch * 0.55 + shift * 0.03, 0, 0.02, K, dt)
  pose(h.legR, legRx, 0, -0.02, K, dt)
  pose(h.kneeL, kneeL + crouch * 1.05 + Math.max(0, shift) * 0.07, 0, 0, K, dt)
  pose(h.kneeR, kneeR + crouch * 1.05 + Math.max(0, -shift) * 0.07, 0, 0, K, dt)
  pose(h.footL, clamp((fL - kneeL) * 0.55, -0.6, 0.7) + toeL - Math.max(0, sL) * 0.18 * mv + crouch * 0.4, 0, 0, K, dt)
  pose(h.footR, clamp((fR - kneeR) * 0.55, -0.6, 0.7) + toeR - Math.max(0, sR) * 0.18 * mv + crouch * 0.4, 0, 0, K, dt)

  const twist0 = sL * (0.16 + run * 0.1) * mv
  pose(h.body, 0, -twist0 * 0.6, sL * 0.045 * mv + shift * 0.02, K, dt)
  const walkDip = 0.84 * (1 - Math.cos(A * Math.abs(sL))) * 0.8 * (1 - run)
  const runBounce = run * mv * (0.06 * Math.abs(sL) - 0.03)
  h.body.position.y = damp(h.body.position.y, -walkDip + runBounce - crouch * 0.2, 20, dt)
  h.body.position.x = damp(h.body.position.x, shift * 0.012, 6, dt)

  let lean = (0.035 + run * 0.3) * mv + crouch * 0.35
  const swing = 0.85 * (0.6 + run * 0.5)
  let armLx = fL * swing + breathe * 0.01
  let armRx = fR * swing - breathe * 0.01
  let elL = -(0.2 + run * 1.05 * mv + Math.max(0, -armLx) * 0.35 * mv + idle * 0.06)
  let elR = -(0.2 + run * 1.05 * mv + Math.max(0, -armRx) * 0.35 * mv + idle * 0.06)
  let armRz = -(0.07 + run * 0.05 + idle * 0.03)
  let armLz = 0.07 + run * 0.05 + idle * 0.03
  let headX = -lean * 0.7 + Math.sin(2 * p) * 0.025 * mv
  let headY = -twist0 * 0.9 + glance * 0.5
  let twist = twist0
  h.phone.visible = false
  if (idle > 0.7 && h.pose === 'phone') {
    armRx = -1.95
    elR = -1.5
    armRz = -0.12
    headX = 0.32 + Math.sin(t * 0.9) * 0.03
    headY = 0
    h.phone.visible = true
  } else if (idle > 0.7 && h.pose === 'talk') {
    armRx = -0.75 + Math.sin(t * 2.3) * 0.28
    elR = -1.25 + Math.sin(t * 2.3 + 1) * 0.35
    armLx = -0.25 + Math.sin(t * 1.7) * 0.15
    elL = -0.6
    headX = Math.sin(t * 2.0) * 0.06
    headY = Math.sin(t * 0.8) * 0.3
  }

  // weapon handling: low-ready carry, raised aim, recoil kick
  if (armed) {
    const aw = h.aimW
    const def = WEAPONS[h.weapon]
    const aimRx = -(Math.PI / 2 + h.aimPitch) + h.recoil * 0.22
    const lowRx = -0.5 + armRx * 0.15
    armRx = lerp(lowRx, aimRx, aw)
    elR = lerp(-0.8, -0.18 - h.recoil * 0.25, aw)
    armRz = lerp(-0.1, -0.05, aw)
    if (def.twoHanded) {
      armLx = lerp(-0.85, aimRx + 0.12, aw)
      armLz = lerp(-0.35, -0.3, aw)
      elL = lerp(-1.1, -0.55, aw)
    } else if (aw > 0.1) {
      armLx = lerp(armLx, -0.3, aw)
    }
    headX = headX - h.aimPitch * 0.7 * aw
    lean += h.recoil * -0.04 + aw * 0.04
    twist = lerp(twist, -0.18, aw)
  }
  if (atk > 0 && h.attackKind === 'punch') {
    const right = h.attackSide > 0
    const s = atk
    if (right) {
      armRx = lerp(armRx, -1.5, s)
      elR = lerp(elR, -0.12, s)
      armRz = lerp(armRz, -0.05, s)
      twist = lerp(twist, 0.7, s)
    } else {
      armLx = lerp(armLx, -1.5, s)
      elL = lerp(elL, -0.12, s)
      armLz = lerp(armLz, 0.05, s)
      twist = lerp(twist, -0.7, s)
    }
    lean += 0.22 * s
  } else if (atk > 0 && h.attackKind === 'kick') {
    lean -= 0.18 * atk
    armLx = lerp(armLx, -0.6, atk)
    armRx = lerp(armRx, 0.5, atk)
  }
  pose(h.armL, armLx, 0, armLz, K, dt)
  pose(h.armR, armRx, 0, armRz, K, dt)
  pose(h.elbowL, elL, 0, 0, K, dt)
  pose(h.elbowR, elR, 0, 0, K, dt)

  pose(h.torso, lean + breathe * 0.008, twist, -sL * 0.03 * mv - shift * 0.015, K, dt)
  h.torso.scale.y = 1 + breathe * 0.006
  pose(h.head, headX, headY - twist * 0.6, sL * 0.02 * mv, 14, dt)
}

/** Pose for a driver sitting at the wheel. Call every frame while occupied. */
export function seatHumanoid(h: Humanoid, steer: number, dt: number): void {
  h.t += dt
  const k = 12
  pose(h.body, 0, 0, 0, k, dt)
  h.body.position.y = damp(h.body.position.y, 0, k, dt)
  h.body.position.x = 0
  pose(h.legL, -1.42, 0, 0.05, k, dt)
  pose(h.legR, -1.32, 0, -0.05, k, dt)
  pose(h.kneeL, 1.4, 0, 0, k, dt)
  pose(h.kneeR, 1.35, 0, 0, k, dt)
  pose(h.footL, 0.1, 0, 0, k, dt)
  pose(h.footR, 0.2, 0, 0, k, dt)
  pose(h.armL, -1.15, 0, 0.1 - steer * 0.12, k, dt)
  pose(h.armR, -1.15, 0, -0.1 - steer * 0.12, k, dt)
  pose(h.elbowL, -0.3 - Math.max(0, steer) * 0.15, 0, 0, k, dt)
  pose(h.elbowR, -0.3 - Math.max(0, -steer) * 0.15, 0, 0, k, dt)
  pose(h.torso, 0.22, -steer * 0.14, -steer * 0.04, k, dt)
  pose(h.head, -0.2 + Math.sin(h.t * 0.6) * 0.02, steer * 0.4 + Math.sin(h.t * 0.3) * 0.08, 0, 10, dt)
  h.phone.visible = false
}
