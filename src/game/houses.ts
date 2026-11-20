// Suburban houses: gable roofs with shingles, chimneys, porches, garages, shutters, landscaping.
import * as THREE from 'three'
import type { Ctx } from './blocksCore'
import { FACADES } from './textures'
import { pick } from './util'

const DOORS = [0x7a1f1f, 0x1f3a5f, 0x2f5d3a, 0x2b2b2b, 0xb8862b, 0x5b3a8a]
const SHUTTERS = [0x2f4a3a, 0x1f2f4a, 0x2b2b2b, 0x6b2a2a, 0x3a3a52]
const GREENS = [0x2f5d2c, 0x3a7233, 0x2a5228, 0x477a3a]
const FLOWERS = [0xe0405a, 0xf2c230, 0xf08ab0, 0xffffff, 0xa060e0]
const WHITE = 0xf0eee8

function tri(P: number[], U: number[], a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]): void {
  P.push(...a, ...b, ...c)
  U.push(...ua, ...ub, ...uc)
}

/** Gable roof, ridge along local x, with eave overhang. Base of the walls is y = 0. */
function roofGeo(W: number, D: number, rise: number, over: number): THREE.BufferGeometry {
  const hx = W / 2 + over
  const hz = D / 2 + over
  const e = (-over * rise) / (D / 2)
  const slant = Math.hypot(hz, rise - e) / 2.4
  const P: number[] = []
  const U: number[] = []
  const u0 = -hx / 2.4
  const u1 = hx / 2.4
  // front slope (+z)
  tri(P, U, [-hx, e, hz], [hx, e, hz], [hx, rise, 0], [u0, 0], [u1, 0], [u1, slant])
  tri(P, U, [-hx, e, hz], [hx, rise, 0], [-hx, rise, 0], [u0, 0], [u1, slant], [u0, slant])
  // back slope (-z)
  tri(P, U, [hx, e, -hz], [-hx, e, -hz], [-hx, rise, 0], [u1, 0], [u0, 0], [u0, slant])
  tri(P, U, [hx, e, -hz], [-hx, rise, 0], [hx, rise, 0], [u1, 0], [u0, slant], [u1, slant])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  g.computeVertexNormals()
  return g
}

function gableEnds(W: number, D: number, rise: number): THREE.BufferGeometry {
  const P: number[] = []
  const x = W / 2
  const z = D / 2
  P.push(x, 0, z, x, 0, -z, x, rise, 0)
  P.push(-x, 0, -z, -x, 0, z, -x, rise, 0)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.computeVertexNormals()
  return g
}

export function buildHouse(c: Ctx, lx: number, lz: number, dirX: number, dirZ: number): void {
  const r = c.rng
  const alongX = dirX !== 0
  const tx = dirZ
  const tz = dirX
  const th0 = Math.atan2(-dirX, dirZ)
  const rotY = dirX > 0 ? Math.PI / 2 : dirX < 0 ? -Math.PI / 2 : dirZ > 0 ? 0 : Math.PI
  const kind = r() < 0.3 ? 'modern' : r() < 0.35 ? 'ranch' : 'colonial'
  const W = pick(r, [12, 12, 16])
  const D = pick(r, [8, 12, 12])
  const floors = kind === 'ranch' ? 1 : 2
  const h = floors * 3.6
  const style = kind === 'modern' ? 4 : pick(r, [9, 6, 0, 10, 8, 1])
  const side = r() < 0.5 ? 1 : -1
  const shift = -side * 4
  // house centre: 2.5 m behind the lot centre, shifted so house + garage wing is centred
  const hx = lx - dirX * 2.5 + tx * shift
  const hz = lz - dirZ * 2.5 + tz * shift
  const wx = (u: number, v: number): [number, number] => [hx + tx * u + dirX * v, hz + tz * u + dirZ * v]
  const lbox = (u: number, v: number, y: number, su: number, sy: number, sv: number, color: number): void => {
    const [x, z] = wx(u, v)
    c.solidBox(x, y, z, alongX ? sv : su, sy, alongX ? su : sv, color)
  }

  c.wall(hx, hz, alongX ? D : W, h, alongX ? W : D, style, 0, true, false, false)

  const roofKey = `shingle${Math.floor(r() * 3)}`
  const wallHex = new THREE.Color(FACADES[style].wall).getHex()
  const front = D / 2

  if (kind === 'modern') {
    lbox(0, 0, h + 0.2, W + 1.6, 0.4, D + 1.6, 0x2b2e33)
    lbox(-W * 0.2, front + 0.02, h * 0.5, 3, h - 0.6, 0.12, 0x9a6b44)
    const [gx, gz] = wx(W * 0.2, front + 0.07)
    c.glass(gx, 1.8, gz, 5.2, 3.0, rotY)
    c.glass(gx, 5.4, gz, 5.2, 2.6, rotY)
  } else {
    const ridgeAlongNormal = kind === 'colonial' && r() < 0.4
    const rise = kind === 'ranch' ? 1.9 : 2.9
    const [Rw, Rd] = ridgeAlongNormal ? [D, W] : [W, D]
    const [rx, rz] = wx(0, 0)
    const th = ridgeAlongNormal ? th0 + Math.PI / 2 : th0
    c.m.add(roofKey, roofGeo(Rw, Rd, Math.min(rise, Rd * 0.38), 0.6), rx, h, rz, th)
    c.solidGeo(gableEnds(Rw, Rd, Math.min(rise, Rd * 0.38)), wallHex, rx, h, rz, th)
    // chimney
    const cu = ridgeAlongNormal ? W * 0.22 : W * 0.28
    const cv = ridgeAlongNormal ? 0 : -D * 0.22
    lbox(cu, cv, h + rise * 0.5 + 0.9, 1.0, rise + 1.8, 1.0, 0x8c4a3a)
    lbox(cu, cv, h + rise + 1.85, 1.3, 0.2, 1.3, 0x6a3a2e)
  }

  // front door + porch on a window bay
  const bays: number[] = []
  for (let k = 0; k < W / 4; k++) bays.push(-W / 2 + 2 + 4 * k)
  const u0 = pick(r, bays)
  lbox(u0, front + 0.04, 1.2, 1.7, 2.5, 0.08, WHITE)
  lbox(u0, front + 0.09, 1.1, 1.1, 2.2, 0.1, pick(r, DOORS))
  const [tgx, tgz] = wx(u0, front + 0.16)
  c.glass(tgx, 2.65, tgz, 1.1, 0.4, rotY)
  if (kind !== 'modern') {
    lbox(u0, front + 1.4, 0.1, 4.4, 0.2, 2.8, 0xb9b4aa)
    for (const s of [-1, 1]) lbox(u0 + s * 1.9, front + 2.6, 1.7, 0.24, 3.2, 0.24, WHITE)
    lbox(u0, front + 1.5, 3.4, 4.8, 0.22, 3.2, 0x3a3a40)
  } else {
    lbox(u0, front + 1.0, 3.2, 3.2, 0.2, 2.2, 0x2b2e33)
  }
  // garden path to the street
  const pathLen = 10 - front - (kind === 'modern' ? 1.2 : 3.2)
  if (pathLen > 1) {
    const [px, pz] = wx(u0, front + (kind === 'modern' ? 1.2 : 3.2) + pathLen / 2)
    c.plane('path', px, pz, alongX ? pathLen : 1.6, alongX ? 1.6 : pathLen, 0.2, 4)
  }

  // shutters, window boxes and foundation shrubs
  const style0 = FACADES[style]
  if (kind !== 'modern' && style !== 0) {
    const ww = style0.win[0] * 4
    const wh = style0.win[1] * 3.6
    const shutter = pick(r, SHUTTERS)
    for (const u of bays) {
      if (Math.abs(u - u0) < 1) continue
      for (let f = 0; f < floors; f++) {
        const y = f * 3.6 + 1.8
        if (r() < 0.75) {
          for (const s of [-1, 1]) lbox(u + s * (ww / 2 + 0.28), front + 0.05, y, 0.5, wh + 0.2, 0.07, shutter)
        }
        if (f === 0 && r() < 0.6) {
          lbox(u, front + 0.18, f * 3.6 + 0.62, ww + 0.2, 0.22, 0.34, 0x5b3f2b)
          lbox(u, front + 0.18, f * 3.6 + 0.78, ww + 0.1, 0.12, 0.3, pick(r, GREENS))
          for (let q = 0; q < 4; q++) lbox(u + (q - 1.5) * (ww / 4), front + 0.18, f * 3.6 + 0.9, 0.16, 0.16, 0.16, pick(r, FLOWERS))
        }
      }
      const [bx, bz] = wx(u + (r() - 0.5) * 1.2, front + 0.9)
      c.solidGeo(new THREE.SphereGeometry(0.5 + r() * 0.2, 8, 6), pick(r, GREENS), bx, 0.4, bz)
    }
  }

  // garage wing
  const gu = side * (W / 2 + 4)
  const gv = front - 4
  const [gx, gz] = wx(gu, gv)
  c.wall(gx, gz, 8, 3.6, 8, style, 0, true, false, false)
  if (kind !== 'modern') {
    c.m.add(roofKey, roofGeo(8, 8, 1.7, 0.5), gx, 3.6, gz, th0 + Math.PI / 2)
    c.solidGeo(gableEnds(8, 8, 1.7), wallHex, gx, 3.6, gz, th0 + Math.PI / 2)
  }
  const doorColor = kind === 'modern' ? 0x3a3d44 : WHITE
  lbox(gu, front + 0.06, 1.35, 5.2, 2.7, 0.1, doorColor)
  for (let k = 0; k < 4; k++) lbox(gu, front + 0.12, 0.45 + k * 0.62, 5.2, 0.05, 0.05, kind === 'modern' ? 0x1c1e22 : 0xb5b2aa)
  for (const s of [-1, 1]) lbox(gu + s * 2.75, front + 0.1, 1.4, 0.2, 2.8, 0.14, kind === 'modern' ? 0x1c1e22 : WHITE)
  lbox(gu, front + 0.1, 2.85, 5.7, 0.2, 0.14, kind === 'modern' ? 0x1c1e22 : WHITE)
  // driveway + family car
  const dlen = 10 - front + 0.5
  const [dcx, dcz] = wx(gu, front + dlen / 2)
  c.plane('path', dcx, dcz, alongX ? dlen : 5, alongX ? 5 : dlen, 0.2, 4)
  if (r() < 0.8) {
    const [cxx, czz] = wx(gu, front + Math.min(4.5, dlen - 2))
    c.carSpawns.push({
      x: cxx,
      z: czz,
      heading: Math.atan2(dirX, dirZ),
      type: pick(r, ['sedan', 'suv', 'sedan', 'van']),
      color: pick(r, [0xc8321e, 0x1e5fc8, 0xe8e8ea, 0x2d8f4e, 0x8a8f96, 0x2b3a67]),
    })
  }

  // hedge along the lawn edge opposite the driveway, plus a mailbox
  for (let k = 0; k < 4; k++) {
    const [qx, qz] = wx(-side * (2 + k * 1.9), 9.1)
    c.solidGeo(new THREE.CapsuleGeometry(0.55, 1.2, 3, 8).rotateZ(Math.PI / 2), pick(r, GREENS), qx, 0.7, qz, th0)
  }
  const [mx, mz] = wx(side * 14, 10)
  c.solidBox(mx, 0.6, mz, 0.12, 1.2, 0.12, 0x5b4636)
  c.solidBox(mx, 1.28, mz, alongX ? 0.55 : 0.28, 0.28, alongX ? 0.28 : 0.55, 0x2b4a7a)
  const [ax, az] = wx(-side * (W / 2 + 0.7), -D * 0.2)
  c.solidBox(ax, 0.45, az, alongX ? 0.9 : 0.5, 0.9, alongX ? 0.5 : 0.9, 0x8a9096)
  const [bx, bz] = wx(-side * 2, -D / 2 - 0.8)
  c.solidGeo(new THREE.CylinderGeometry(0.34, 0.3, 1.0, 10), 0x2f6b3a, bx, 0.5, bz)
  c.solidGeo(new THREE.CylinderGeometry(0.34, 0.3, 1.0, 10), 0x2a4a8a, bx + tx * 0.8, 0.5, bz + tz * 0.8)
}
