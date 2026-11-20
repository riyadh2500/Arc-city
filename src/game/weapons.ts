// Weapon stats and low-poly gun models (barrel along +z, grip at the origin).
import * as THREE from 'three'
import { bakeParts, bp, UNIT_BOX, type BakePart } from './bake'

export type WeaponId = 'fists' | 'knife' | 'bat' | 'pistol' | 'revolver' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'grenade'

export interface WeaponDef {
  id: WeaponId
  name: string
  /** keyboard slot: 1-9, 0 */
  key: number
  kind: 'melee' | 'gun' | 'throw'
  damage: number
  /** shots / swings per second */
  rate: number
  mag: number
  reserveStart: number
  reserveMax: number
  reload: number
  /** base spread half-angle in radians */
  spread: number
  pellets: number
  range: number
  auto: boolean
  recoil: number
  twoHanded: boolean
  /** how far the shot is heard (metres) */
  loud: number
  barrel: number
  /** field-of-view reduction when aiming (degrees) */
  zoom: number
}

const W = (d: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name' | 'key' | 'kind'>): WeaponDef => ({
  damage: 0, rate: 1, mag: 0, reserveStart: 0, reserveMax: 0, reload: 0, spread: 0, pellets: 1, range: 1.8, auto: false, recoil: 0, twoHanded: false, loud: 8, barrel: 0, zoom: 14, ...d,
})

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: W({ id: 'fists', name: 'Fists', key: 1, kind: 'melee', damage: 18, rate: 2.2, range: 1.7 }),
  knife: W({ id: 'knife', name: 'Combat Knife', key: 2, kind: 'melee', damage: 36, rate: 2.8, range: 1.9 }),
  bat: W({ id: 'bat', name: 'Baseball Bat', key: 3, kind: 'melee', damage: 42, rate: 1.6, range: 2.3 }),
  pistol: W({ id: 'pistol', name: 'Pistol', key: 4, kind: 'gun', damage: 24, rate: 4.2, mag: 12, reserveStart: 72, reserveMax: 160, reload: 1.3, spread: 0.012, range: 90, recoil: 0.018, loud: 55, barrel: 0.2 }),
  revolver: W({ id: 'revolver', name: 'Heavy Revolver', key: 5, kind: 'gun', damage: 58, rate: 1.7, mag: 6, reserveStart: 36, reserveMax: 90, reload: 2.1, spread: 0.008, range: 110, recoil: 0.055, loud: 80, barrel: 0.3 }),
  smg: W({ id: 'smg', name: 'Micro SMG', key: 6, kind: 'gun', damage: 14, rate: 13, mag: 30, reserveStart: 120, reserveMax: 300, reload: 1.7, spread: 0.028, range: 80, auto: true, recoil: 0.01, twoHanded: true, loud: 70, barrel: 0.36 }),
  shotgun: W({ id: 'shotgun', name: 'Pump Shotgun', key: 7, kind: 'gun', damage: 11, rate: 1.2, mag: 6, reserveStart: 30, reserveMax: 60, reload: 2.2, spread: 0.07, pellets: 8, range: 40, recoil: 0.07, twoHanded: true, loud: 85, barrel: 0.62 }),
  rifle: W({ id: 'rifle', name: 'Assault Rifle', key: 8, kind: 'gun', damage: 22, rate: 8.5, mag: 30, reserveStart: 120, reserveMax: 300, reload: 2.0, spread: 0.016, range: 140, auto: true, recoil: 0.016, twoHanded: true, loud: 90, barrel: 0.62 }),
  sniper: W({ id: 'sniper', name: 'Sniper Rifle', key: 9, kind: 'gun', damage: 130, rate: 0.8, mag: 5, reserveStart: 20, reserveMax: 40, reload: 2.6, spread: 0.05, range: 320, recoil: 0.09, twoHanded: true, loud: 110, barrel: 0.9, zoom: 54 }),
  grenade: W({ id: 'grenade', name: 'Grenade', key: 0, kind: 'throw', damage: 100, rate: 0.9, mag: 1, reserveStart: 4, reserveMax: 10, reload: 0.7, loud: 60 }),
}

export const WEAPON_ORDER: WeaponId[] = ['fists', 'knife', 'bat', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper', 'grenade']

const STEEL = 0x25282d
const DARK = 0x15171a
const LIGHT = 0x4a4f57
const WOOD = 0x6b4a2e

const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7 })
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
const cyl = (r: number, l: number) => new THREE.CylinderGeometry(r, r, l, 8).rotateX(Math.PI / 2)

function parts(id: WeaponId): BakePart[] {
  switch (id) {
    case 'pistol':
      return [
        bp(UNIT_BOX, STEEL, 0, 0.04, 0.09, 0.034, 0.05, 0.2),
        bp(UNIT_BOX, DARK, 0, 0.0, 0.12, 0.03, 0.03, 0.09),
        bp(UNIT_BOX, DARK, 0, -0.045, -0.015, 0.032, 0.11, 0.045, -0.2, 0, 0),
        bp(cyl(0.011, 0.06), LIGHT, 0, 0.045, 0.2),
      ]
    case 'smg':
      return [
        bp(UNIT_BOX, STEEL, 0, 0.045, 0.13, 0.045, 0.075, 0.3),
        bp(cyl(0.012, 0.12), LIGHT, 0, 0.05, 0.36),
        bp(UNIT_BOX, DARK, 0, -0.07, 0.1, 0.028, 0.14, 0.05),
        bp(UNIT_BOX, DARK, 0, -0.05, -0.02, 0.034, 0.11, 0.045, -0.2, 0, 0),
        bp(UNIT_BOX, LIGHT, 0, 0.095, 0.12, 0.02, 0.02, 0.12),
        bp(UNIT_BOX, DARK, 0, 0.03, -0.12, 0.03, 0.05, 0.12),
      ]
    case 'shotgun':
      return [
        bp(cyl(0.017, 0.6), STEEL, 0, 0.05, 0.34),
        bp(cyl(0.021, 0.2), WOOD, 0, 0.02, 0.28),
        bp(UNIT_BOX, STEEL, 0, 0.045, 0.02, 0.05, 0.08, 0.16),
        bp(UNIT_BOX, WOOD, 0, 0.0, -0.17, 0.05, 0.1, 0.3, 0.1, 0, 0),
        bp(UNIT_BOX, DARK, 0, -0.05, -0.01, 0.034, 0.11, 0.045, -0.2, 0, 0),
      ]
    case 'rifle':
      return [
        bp(UNIT_BOX, STEEL, 0, 0.05, 0.12, 0.05, 0.085, 0.42),
        bp(cyl(0.012, 0.36), LIGHT, 0, 0.055, 0.5),
        bp(UNIT_BOX, DARK, 0.0, -0.055, 0.18, 0.03, 0.15, 0.055, 0.15, 0, 0),
        bp(UNIT_BOX, DARK, 0, -0.05, -0.02, 0.034, 0.11, 0.045, -0.2, 0, 0),
        bp(UNIT_BOX, STEEL, 0, 0.03, -0.2, 0.045, 0.09, 0.28),
        bp(UNIT_BOX, DARK, 0, 0.115, 0.15, 0.03, 0.04, 0.2),
        bp(UNIT_BOX, LIGHT, 0, 0.0, 0.36, 0.04, 0.05, 0.18),
      ]
    case 'revolver':
      return [
        bp(cyl(0.017, 0.3), STEEL, 0, 0.05, 0.18),
        bp(cyl(0.032, 0.09), LIGHT, 0, 0.035, 0.05),
        bp(UNIT_BOX, STEEL, 0, 0.04, 0.02, 0.034, 0.06, 0.1),
        bp(UNIT_BOX, WOOD, 0, -0.045, -0.02, 0.036, 0.11, 0.05, -0.25, 0, 0),
      ]
    case 'sniper':
      return [
        bp(UNIT_BOX, STEEL, 0, 0.05, 0.1, 0.045, 0.08, 0.5),
        bp(cyl(0.012, 0.62), LIGHT, 0, 0.055, 0.7),
        bp(UNIT_BOX, DARK, 0, -0.04, 0.0, 0.034, 0.11, 0.045, -0.2, 0, 0),
        bp(UNIT_BOX, WOOD, 0, 0.0, -0.25, 0.05, 0.1, 0.34),
        bp(cyl(0.025, 0.34), DARK, 0, 0.13, 0.15),
        bp(UNIT_BOX, DARK, 0, 0.1, 0.15, 0.02, 0.05, 0.03),
      ]
    case 'knife':
      return [
        bp(UNIT_BOX, 0xc9ced6, 0, 0.0, 0.17, 0.012, 0.035, 0.26),
        bp(UNIT_BOX, DARK, 0, 0.0, -0.01, 0.03, 0.035, 0.12),
        bp(UNIT_BOX, LIGHT, 0, 0.0, 0.05, 0.05, 0.02, 0.02),
      ]
    case 'bat':
      return [
        bp(cyl(0.03, 0.8), 0xb8864a, 0, 0.0, 0.34),
        bp(cyl(0.015, 0.2), 0xb8864a, 0, 0.0, -0.06),
        bp(cyl(0.035, 0.06), 0x8a5a30, 0, 0.0, 0.72),
      ]
    case 'grenade':
      return [bp(new THREE.SphereGeometry(0.05, 8, 6), 0x3a4a32, 0, 0.0, 0.06), bp(UNIT_BOX, LIGHT, 0, 0.055, 0.06, 0.02, 0.03, 0.02)]
    default:
      return []
  }
}

const protos = new Map<WeaponId, THREE.Group>()

/** A fresh gun with a hidden muzzle flash named "flash". */
export function buildGun(id: WeaponId): THREE.Group {
  let proto = protos.get(id)
  if (!proto) {
    proto = new THREE.Group()
    const m = new THREE.Mesh(bakeParts(parts(id)), gunMat)
    m.castShadow = true
    proto.add(m)
    const def = WEAPONS[id]
    const flash = new THREE.Group()
    flash.name = 'flash'
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat)
    const b = a.clone()
    b.rotation.z = Math.PI / 2
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat)
    c.rotation.y = Math.PI / 2
    c.position.z = 0.05
    a.position.z = 0.05
    b.position.z = 0.05
    flash.add(a, b, c)
    flash.position.set(0, 0.05, def.barrel + 0.12)
    flash.visible = false
    proto.add(flash)
    protos.set(id, proto)
  }
  const g = proto.clone(true)
  return g
}
