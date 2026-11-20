// Shared constants and math helpers for ARC CITY.

export const TAU = Math.PI * 2

/** City layout: N x N blocks, B-wide blocks, R-wide roads, P = B + R pitch. */
export const CITY = { N: 11, B: 60, R: 18, P: 78, SIDEWALK: 6, LANE: 3.6, PARK: 7.6 } as const

/** Road centre line coordinate for line index k (0..N). */
export const rl = (k: number): number => (k - CITY.N / 2) * CITY.P
/** Block centre coordinate for block index i (0..N-1). */
export const bc = (i: number): number => (i + 0.5 - CITY.N / 2) * CITY.P
export const HALF = (CITY.N / 2) * CITY.P

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt))
export const wrapAngle = (a: number): number => {
  let r = (a + Math.PI) % TAU
  if (r < 0) r += TAU
  return r - Math.PI
}
export const dampAngle = (a: number, b: number, lambda: number, dt: number): number =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt))

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
export const range = (rng: () => number, a: number, b: number): number => a + rng() * (b - a)

// Traffic light cycle shared by lights and AI. Axis 'x' = cars travelling along x.
export const LIGHT_PERIOD = 28
export type LightState = 'green' | 'yellow' | 'red'
export function lightState(axis: 'x' | 'z', time: number, i: number, j: number): LightState {
  const u = (((time + (i + j) * 2) % LIGHT_PERIOD) + LIGHT_PERIOD) % LIGHT_PERIOD
  if (axis === 'x') return u < 11 ? 'green' : u < 13 ? 'yellow' : 'red'
  return u >= 14 && u < 25 ? 'green' : u >= 25 && u < 27 ? 'yellow' : 'red'
}

export interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  h: number
  /** false = temporarily disabled (e.g. an open garage door) */
  active?: boolean
}

/** Spatial hash of axis-aligned static colliders. */
export class ColliderGrid {
  private cell = 24
  private map = new Map<number, Box[]>()
  all: Box[] = []
  private key(ix: number, iz: number): number {
    return (ix + 1024) * 4096 + (iz + 1024)
  }
  add(b: Box): void {
    this.all.push(b)
    const x0 = Math.floor(b.minX / this.cell)
    const x1 = Math.floor(b.maxX / this.cell)
    const z0 = Math.floor(b.minZ / this.cell)
    const z1 = Math.floor(b.maxZ / this.cell)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz)
        const list = this.map.get(k)
        if (list) list.push(b)
        else this.map.set(k, [b])
      }
    }
  }
  addRect(cx: number, cz: number, hx: number, hz: number, h: number): void {
    this.add({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, h })
  }
  query(x: number, z: number, r: number, out: Box[]): Box[] {
    out.length = 0
    const x0 = Math.floor((x - r) / this.cell)
    const x1 = Math.floor((x + r) / this.cell)
    const z0 = Math.floor((z - r) / this.cell)
    const z1 = Math.floor((z + r) / this.cell)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.map.get(this.key(ix, iz))
        if (!list) continue
        for (const b of list) if (!out.includes(b)) out.push(b)
      }
    }
    return out
  }
}

/** Push a circle out of a box. Returns penetration normal data or null. */
export function circleVsBox(
  x: number,
  z: number,
  r: number,
  b: Box,
): { nx: number; nz: number; depth: number } | null {
  if (b.active === false) return null
  const cx = clamp(x, b.minX, b.maxX)
  const cz = clamp(z, b.minZ, b.maxZ)
  let dx = x - cx
  let dz = z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= r * r) return null
  if (d2 < 1e-8) {
    // centre inside box: push along the shallowest axis
    const l = x - b.minX
    const rr = b.maxX - x
    const t = z - b.minZ
    const bt = b.maxZ - z
    const m = Math.min(l, rr, t, bt)
    if (m === l) return { nx: -1, nz: 0, depth: l + r }
    if (m === rr) return { nx: 1, nz: 0, depth: rr + r }
    if (m === t) return { nx: 0, nz: -1, depth: t + r }
    return { nx: 0, nz: 1, depth: bt + r }
  }
  const d = Math.sqrt(d2)
  dx /= d
  dz /= d
  return { nx: dx, nz: dz, depth: r - d }
}

/** Seconds until the light for this axis turns green (0 if green now). */
export function timeToGreen(axis: 'x' | 'z', time: number, i: number, j: number): number {
  for (let t = 0; t < LIGHT_PERIOD; t += 0.5) {
    if (lightState(axis, time + t, i, j) === 'green') return t
  }
  return LIGHT_PERIOD
}

/** Block index containing (or nearest to) a world position. */
export function blockIndex(x: number, z: number): [number, number] {
  const i = clamp(Math.floor((x + HALF) / CITY.P), 0, CITY.N - 1)
  const j = clamp(Math.floor((z + HALF) / CITY.P), 0, CITY.N - 1)
  return [i, j]
}

export const snapTo = (v: number, s: number): number => Math.max(s, Math.round(v / s) * s)
