// Build context shared by every block builder: merged geometry helpers + registries.
import * as THREE from 'three'
import { Merger, boxParts, tiledPlane } from './merge'
import { CITY, ColliderGrid, bc, snapTo } from './util'
import { Props } from './props'
import type { Garage } from './garage'

export interface CarSpawn {
  x: number
  z: number
  heading: number
  type: string
  color: number
}

export interface ShopSpot {
  x: number
  z: number
  name: string
  item: string
  price: number
  heal: number
}

export class Ctx {
  m = new Merger()
  carSpawns: CarSpawn[] = []
  shops: ShopSpot[] = []
  garages: Garage[] = []
  rng: () => number = Math.random
  signRange: (name: string) => [number, number]

  constructor(
    public grid: ColliderGrid,
    public props: Props,
    signRange: (name: string) => [number, number],
  ) {
    this.signRange = signRange
  }

  /** facade building: walls use facade `style`, roof is flat. Sizes snap to the window grid. */
  wall(cx: number, cz: number, w: number, h: number, d: number, style: number, y0 = 0, collide = true, clutter = true, entrance = true): void {
    w = snapTo(w, 4)
    d = snapTo(d, 4)
    h = snapTo(h, 3.6)
    const { side, top } = boxParts(w, h, d, this.rng)
    this.m.add(`f${style}`, side, cx, y0 + h / 2, cz)
    this.m.add('roof', top, cx, y0 + h / 2, cz)
    if (collide) this.grid.addRect(cx, cz, w / 2, d / 2, y0 + h)
    if (clutter) this.props.addRoofClutter(cx, y0 + h, cz, this.rng, w, d)
    this.details(cx, cz, w, h, d, style, y0, clutter, entrance)
  }

  /** street-facing direction of a building, from its position inside its block */
  private outward(cx: number, cz: number): [number, number] {
    const i = Math.round(cx / CITY.P + CITY.N / 2 - 0.5)
    const j = Math.round(cz / CITY.P + CITY.N / 2 - 0.5)
    const ox = cx - bc(i)
    const oz = cz - bc(j)
    if (Math.abs(ox) < 1 && Math.abs(oz) < 1) return [0, 1]
    return Math.abs(ox) >= Math.abs(oz) ? [Math.sign(ox), 0] : [0, Math.sign(oz)]
  }

  /** plinth, cornice, entrance, balconies, water tank and tower crown lights */
  private details(cx: number, cz: number, w: number, h: number, d: number, style: number, y0: number, clutter: boolean, entrance: boolean): void {
    const r = this.rng
    const stone = style === 1 || style === 8 ? 0xb8a38a : style === 2 || style === 3 ? 0x2a2f36 : 0xa9a69f
    const top = y0 + h
    if (y0 === 0) this.solidBox(cx, 0.4, cz, w + 0.3, 0.8, d + 0.3, 0x5f5c57)
    // cornice ring
    this.solidBox(cx, top, cz + d / 2 + 0.1, w + 0.5, 0.5, 0.5, stone)
    this.solidBox(cx, top, cz - d / 2 - 0.1, w + 0.5, 0.5, 0.5, stone)
    this.solidBox(cx + w / 2 + 0.1, top, cz, 0.5, 0.5, d, stone)
    this.solidBox(cx - w / 2 - 0.1, top, cz, 0.5, 0.5, d, stone)
    const [ox, oz] = this.outward(cx, cz)
    const faceLen = ox !== 0 ? d : w
    const fx = cx + ox * (w / 2)
    const fz = cz + oz * (d / 2)
    // tangent unit vector (along the facade)
    const tx = ox !== 0 ? 0 : 1
    const tz = ox !== 0 ? 1 : 0
    const rotY = ox > 0 ? Math.PI / 2 : ox < 0 ? -Math.PI / 2 : oz > 0 ? 0 : Math.PI
    if (entrance && y0 === 0 && h >= 7.2) {
      for (const s of [-1, 1]) this.solidBox(fx + tx * s * 1.9 + ox * 0.15, 1.7, fz + tz * s * 1.9 + oz * 0.15, 0.3, 3.4, 0.3, 0x2b2e33)
      this.solidBox(fx + ox * 0.9, 3.55, fz + oz * 0.9, ox !== 0 ? 1.8 : 4.6, 0.22, ox !== 0 ? 4.6 : 1.8, 0x2b2e33)
      this.solidBox(fx + ox * 0.45, 0.08, fz + oz * 0.45, ox !== 0 ? 0.9 : 4, 0.16, ox !== 0 ? 4 : 0.9, 0x8d8a84)
      this.glass(fx + ox * 0.06, 1.6, fz + oz * 0.06, 3.5, 3.0, rotY)
    }
    // balconies on residential facades
    if ((style === 4 || style === 5) && h >= 10.8 && clutter) {
      const floors = Math.round(h / 3.6)
      for (let f = 1; f < floors; f++) {
        for (let k = 0; k < faceLen / 4; k++) {
          if (r() > 0.55) continue
          const t = -faceLen / 2 + 2 + 4 * k
          const bx = fx + tx * t + ox * 0.65
          const bz = fz + tz * t + oz * 0.65
          const sx = ox !== 0 ? 1.3 : 2.6
          const sz = ox !== 0 ? 2.6 : 1.3
          this.solidBox(bx, y0 + f * 3.6 + 0.28, bz, sx, 0.16, sz, 0xcfcac0)
          this.solidBox(bx + ox * 0.62, y0 + f * 3.6 + 0.8, bz + oz * 0.62, ox !== 0 ? 0.05 : 2.6, 0.9, ox !== 0 ? 2.6 : 0.05, 0x2c3138)
        }
      }
    }
    // rooftop water tank on mid-rise roofs
    if (clutter && top < 60 && r() < 0.28) {
      const px = cx + (r() - 0.5) * w * 0.4
      const pz = cz + (r() - 0.5) * d * 0.4
      this.solidBox(px, top + 0.45, pz, 2.6, 0.9, 2.6, 0x4a4540)
      this.solidGeo(new THREE.CylinderGeometry(1.3, 1.3, 2.6, 12), 0x7a6450, px, top + 2.2, pz)
      this.solidGeo(new THREE.ConeGeometry(1.4, 0.8, 12), 0x5a4a3c, px, top + 3.9, pz)
    }
    // glowing crown + corner strips on tall glass towers
    if ((style === 2 || style === 3) && top >= 60 && y0 > 0) {
      const g = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => this.m.add('arc', new THREE.BoxGeometry(sx, sy, sz), x, y, z)
      for (const sxn of [-1, 1]) {
        for (const szn of [-1, 1]) g(0.22, h, 0.22, cx + sxn * (w / 2 + 0.02), y0 + h / 2, cz + szn * (d / 2 + 0.02))
      }
      g(w + 0.3, 0.3, 0.2, cx, top - 0.6, cz + d / 2 + 0.2)
      g(w + 0.3, 0.3, 0.2, cx, top - 0.6, cz - d / 2 - 0.2)
      g(0.2, 0.3, d + 0.3, cx + w / 2 + 0.2, top - 0.6, cz)
      g(0.2, 0.3, d + 0.3, cx - w / 2 - 0.2, top - 0.6, cz)
    }
  }

  solidBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, rotY = 0, key = 'solid'): void {
    this.m.add(key, new THREE.BoxGeometry(sx, sy, sz), cx, cy, cz, rotY, color)
  }

  solidGeo(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rotY = 0, key = 'solid'): void {
    this.m.add(key, geo, x, y, z, rotY, color)
  }

  plane(key: string, cx: number, cz: number, w: number, d: number, y: number, tile: number): void {
    this.m.add(key, tiledPlane(w, d, tile), cx, y, cz)
  }

  /** shop sign from the shared atlas, facing +z in local space then rotated by rotY */
  sign(name: string, x: number, y: number, z: number, width: number, rotY: number): void {
    const g = new THREE.PlaneGeometry(width, width / 4)
    const [v0, v1] = this.signRange(name)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0))
    this.m.add('sign', g, x, y, z, rotY)
  }

  glass(x: number, y: number, z: number, w: number, h: number, rotY: number): void {
    this.m.add('glass', new THREE.PlaneGeometry(w, h), x, y, z, rotY)
  }

  /** Rectangular colliders for a world-space axis aligned rect. */
  rect(minX: number, maxX: number, minZ: number, maxZ: number, h: number): void {
    this.grid.add({ minX, maxX, minZ, maxZ, h })
  }
}
