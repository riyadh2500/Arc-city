// Block builders (part 1): downtown towers, midrise, police HQ, plaza, parks, lakes, condos.
import * as THREE from 'three'
import type { Ctx } from './blocksCore'
import { CITY, pick, range, snapTo } from './util'

const B = CITY.B

export function buildTower(c: Ctx, cx: number, cz: number): void {
  const r = c.rng
  if (r() < 0.55) {
    const style = pick(r, [2, 3, 2, 4])
    c.wall(cx, cz, 44, 10.8, 44, 10)
    const w = snapTo(range(r, 24, 32), 4)
    const d = snapTo(range(r, 24, 32), 4)
    const h = snapTo(range(r, 70, 170), 3.6)
    c.wall(cx, cz, w, h, d, style, 10.8, false, false)
    c.grid.addRect(cx, cz, w / 2, d / 2, h + 10.8)
    c.wall(cx, cz, w * 0.6, 14.4, d * 0.6, style, h + 10.8, false, false)
    const top = h + 10.8 + 14.4
    c.props.steel.add(cx, top + 8, cz, 0.35, 16, 0.35)
    c.props.beacon.add(cx, top + 16.5, cz, 1.2, 1.2, 1.2)
  } else {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = snapTo(range(r, 16, 21), 4)
        const d = snapTo(range(r, 16, 21), 4)
        const h = snapTo(range(r, 28, 110), 3.6)
        c.wall(cx + sx * 12.5, cz + sz * 12.5, w, h, d, pick(r, [0, 2, 3, 4, 5, 6, 10]))
        if (r() < 0.4) c.props.beacon.add(cx + sx * 12.5, h + 0.8, cz + sz * 12.5, 0.8, 0.8, 0.8)
      }
    }
  }
}

export function buildMidrise(c: Ctx, cx: number, cz: number): void {
  const r = c.rng
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = snapTo(range(r, 16, 22), 4)
      const d = snapTo(range(r, 16, 22), 4)
      const h = 3.6 * Math.floor(range(r, 5, 12))
      c.wall(cx + sx * 13, cz + sz * 13, w, h, d, pick(r, [0, 4, 5, 6, 10]))
      if (r() < 0.6) c.props.addTree(cx + sx * 4.5 + (r() - 0.5) * 3, cz + sz * 4.5 + (r() - 0.5) * 3, 0.8 + r() * 0.5)
    }
  }
}

/** Police HQ at the west of the plaza; cruisers parked in front, respawn point on the sidewalk. */
export function buildPolice(c: Ctx, cx: number, cz: number): { x: number; z: number } {
  c.plane('lot', cx + 12, cz, 36, 56, 0.17, 12)
  c.wall(cx - 12, cz, 24, 18, 36, 10)
  c.wall(cx - 12, cz, 10, 28.8, 10, 10, 18, false, false)
  c.sign('POLICE DEPT', cx + 0.1, 11, cz, 10, Math.PI / 2)
  c.glass(cx + 0.05, 3, cz, 14, 3.4, Math.PI / 2)
  for (let k = 0; k < 4; k++) {
    c.carSpawns.push({ x: cx + 9, z: cz - 16 + k * 10.5, heading: Math.PI / 2, type: 'police', color: 0x15181f })
  }
  c.solidBox(cx + 0.9, 0.35, cz, 1.6, 0.4, 14, 0x3a6ab0)
  c.props.addTree(cx + 20, cz - 24, 1)
  c.props.addTree(cx + 20, cz + 24, 1)
  return { x: cx + 22, z: cz + 1 }
}

export function buildPlaza(c: Ctx, cx: number, cz: number): void {
  c.plane('grass', cx, cz, B, B, 0.18, 8)
  const paved = new THREE.CircleGeometry(24, 40).rotateX(-Math.PI / 2)
  c.m.add('path', paved, cx, 0.2, cz)
  c.solidGeo(new THREE.CylinderGeometry(6.5, 7, 1.1, 28), 0xb9b5ac, cx, 0.7, cz)
  c.m.add('water', new THREE.CircleGeometry(6, 28).rotateX(-Math.PI / 2), cx, 1.26, cz)
  c.solidGeo(new THREE.CylinderGeometry(0.7, 1.1, 3.4, 12), 0xc7c3ba, cx, 2.4, cz)
  c.grid.addRect(cx, cz, 6.8, 6.8, 2)
  c.m.add('arc', new THREE.TorusGeometry(10, 1, 12, 40, Math.PI), cx, 0.4, cz - 17)
  c.grid.addRect(cx - 10, cz - 17, 1.2, 1.2, 4)
  c.grid.addRect(cx + 10, cz - 17, 1.2, 1.2, 4)
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2 + 0.3
    const x = cx + Math.cos(ang) * 26
    const z = cz + Math.sin(ang) * 26
    if (Math.abs(x - cx) > 27 || Math.abs(z - cz) > 27) continue
    c.props.addTree(x, z, 1.1)
  }
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4
    c.props.addBench(cx + Math.cos(ang) * 12, cz + Math.sin(ang) * 12, -ang + Math.PI / 2)
  }
}

export function buildPark(c: Ctx, cx: number, cz: number): void {
  const r = c.rng
  c.plane('grass', cx, cz, B, B, 0.18, 8)
  c.plane('path', cx, cz, 4, B, 0.19, 4)
  c.plane('path', cx, cz, B, 4, 0.2, 4)
  const px = cx + pick(r, [-1, 1]) * 15
  const pz = cz + pick(r, [-1, 1]) * 15
  c.m.add('water', new THREE.CircleGeometry(8, 24).rotateX(-Math.PI / 2), px, 0.22, pz)
  c.grid.addRect(px, pz, 7, 7, 0.5)
  for (let t = 0; t < 26; t++) {
    const x = cx + (r() - 0.5) * 54
    const z = cz + (r() - 0.5) * 54
    if (Math.abs(x - cx) < 3.5 || Math.abs(z - cz) < 3.5) continue
    if (Math.hypot(x - px, z - pz) < 10) continue
    c.props.addTree(x, z, 0.9 + r() * 0.7)
  }
  for (const [bx, bz, rot] of [[cx + 5, cz - 12, 0], [cx - 5, cz + 12, Math.PI], [cx + 12, cz + 5, Math.PI / 2], [cx - 12, cz - 5, -Math.PI / 2]] as const) {
    c.props.addBench(bx, bz, rot)
  }
}

export function buildLake(c: Ctx, cx: number, cz: number): void {
  const r = c.rng
  c.plane('grass', cx, cz, B, B, 0.18, 8)
  c.m.add('path', new THREE.RingGeometry(21, 24, 36).rotateX(-Math.PI / 2), cx, 0.2, cz)
  c.m.add('water', new THREE.CircleGeometry(21, 36).rotateX(-Math.PI / 2), cx, 0.22, cz)
  c.grid.addRect(cx, cz, 18, 18, 0.5)
  c.plane('path', cx, cz, 2.5, 46, 0.21, 4)
  for (let t = 0; t < 22; t++) {
    const a = r() * Math.PI * 2
    const rad = 25 + r() * 3.5
    const x = cx + Math.cos(a) * rad
    const z = cz + Math.sin(a) * rad
    if (Math.abs(x - cx) > 28 || Math.abs(z - cz) > 28) continue
    c.props.addTree(x, z, 0.9 + r() * 0.6)
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4
    c.props.addBench(cx + Math.cos(a) * 22.5, cz + Math.sin(a) * 22.5, -a)
  }
}

export function buildCondo(c: Ctx, cx: number, cz: number): void {
  const r = c.rng
  for (const [ox, oz] of [[-13, -13], [13, -13], [0, 14]] as const) {
    const w = snapTo(range(r, 14, 20), 4)
    const d = snapTo(range(r, 14, 18), 4)
    const h = 3.6 * Math.floor(range(r, 5, 10))
    c.wall(cx + ox, cz + oz, w, h, d, pick(r, [4, 10, 0, 6]))
  }
  c.plane('grass', cx, cz, 10, 10, 0.18, 8)
  c.props.addTree(cx, cz - 1, 1.2)
  c.props.addTree(cx + 4, cz + 3, 0.9)
}
