// Enterable garages: hollow building, rolling door, interior props, respray bay.
import * as THREE from 'three'
import type { Ctx } from './blocksCore'
import type { Box } from './util'

const W = 22
const D = 18
const T = 0.5
const H = 6.4
const OPEN_W = 10
const OPEN_H = 4.6

let doorTex: THREE.CanvasTexture | null = null
function doorTexture(): THREE.CanvasTexture {
  if (doorTex) return doorTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#6d7480'
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = '#4a505a'
  g.lineWidth = 3
  for (let y = 8; y < 128; y += 16) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(128, y)
    g.stroke()
  }
  doorTex = new THREE.CanvasTexture(c)
  doorTex.colorSpace = THREE.SRGBColorSpace
  return doorTex
}

export class Garage {
  open = 0
  private target = 0
  readonly door: THREE.Mesh
  readonly pivot = new THREE.Group()
  private doorBox: Box
  /** world point just outside the door */
  readonly frontX: number
  readonly frontZ: number

  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly fx: number,
    readonly fz: number,
    doorBox: Box,
    readonly name: string,
  ) {
    this.doorBox = doorBox
    this.frontX = cx + fx * (D / 2 + 3)
    this.frontZ = cz + fz * (D / 2 + 3)
    const mat = new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.6, metalness: 0.4 })
    this.door = new THREE.Mesh(new THREE.BoxGeometry(OPEN_W, OPEN_H, 0.18), mat)
    this.door.position.set(0, -OPEN_H / 2, 0)
    this.door.castShadow = true
    this.pivot.add(this.door)
    this.pivot.position.set(cx + fx * (D / 2 - T / 2), OPEN_H, cz + fz * (D / 2 - T / 2))
    this.pivot.rotation.y = Math.atan2(fx, fz)
  }

  /** local (u across, v along front) of a world point relative to the garage centre */
  local(x: number, z: number): [number, number] {
    const dx = x - this.cx
    const dz = z - this.cz
    const v = dx * this.fx + dz * this.fz
    const u = dx * -this.fz + dz * this.fx
    return [u, v]
  }

  contains(x: number, z: number): boolean {
    const [u, v] = this.local(x, z)
    return Math.abs(u) < W / 2 - 0.6 && Math.abs(v) < D / 2 - 0.4
  }

  /** inside and well away from the door line */
  inBay(x: number, z: number): boolean {
    const [u, v] = this.local(x, z)
    return Math.abs(u) < 6.5 && v < 3 && v > -D / 2 + 1.5
  }

  distToDoor(x: number, z: number): number {
    return Math.hypot(x - this.frontX, z - this.frontZ)
  }

  setOpen(open: boolean): void {
    this.target = open ? 1 : 0
  }

  update(dt: number): void {
    this.open += (this.target - this.open) * Math.min(1, dt * 3)
    this.pivot.scale.y = Math.max(0.04, 1 - this.open)
    this.doorBox.active = this.open < 0.55
  }
}

/** Build a garage at (cx,cz) whose opening faces (fx,fz) (axis-aligned unit vector). */
export function buildGarage(ctx: Ctx, cx: number, cz: number, fx: number, fz: number, sign: string): Garage {
  const pu = { x: -fz, z: fx }
  const wp = (u: number, v: number): [number, number] => [cx + pu.x * u + fx * v, cz + pu.z * u + fz * v]
  const rotY = Math.atan2(fx, fz)
  const concrete = 0x9ea3a8
  // axis-aligned rect from local ranges
  const wallRect = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: number, collide: boolean) => {
    const a = wp(u0, v0)
    const b = wp(u1, v1)
    const minX = Math.min(a[0], b[0])
    const maxX = Math.max(a[0], b[0])
    const minZ = Math.min(a[1], b[1])
    const maxZ = Math.max(a[1], b[1])
    ctx.solidBox((minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2, maxX - minX, y1 - y0, maxZ - minZ, color)
    if (collide) ctx.rect(minX, maxX, minZ, maxZ, y1)
  }
  wallRect(-W / 2, W / 2, -D / 2, -D / 2 + T, 0, H, concrete, true)
  wallRect(-W / 2, -W / 2 + T, -D / 2, D / 2, 0, H, concrete, true)
  wallRect(W / 2 - T, W / 2, -D / 2, D / 2, 0, H, concrete, true)
  wallRect(-W / 2, -OPEN_W / 2, D / 2 - T, D / 2, 0, H, concrete, true)
  wallRect(OPEN_W / 2, W / 2, D / 2 - T, D / 2, 0, H, concrete, true)
  wallRect(-OPEN_W / 2, OPEN_W / 2, D / 2 - T, D / 2, OPEN_H, H, concrete, false)
  wallRect(-W / 2, W / 2, -D / 2, D / 2, H, H + 0.4, 0x5a5c61, false)
  // floor
  wallRect(-W / 2 + T, W / 2 - T, -D / 2 + T, D / 2 - T, 0.16, 0.19, 0x4a4e54, false)
  // yellow bay lines
  for (const s of [-1, 1]) wallRect(s * 6.6 - 0.08, s * 6.6 + 0.08, -D / 2 + 1, 2.5, 0.19, 0.2, 0xe0b52a, false)
  // ceiling light strips (emissive 'lamp' key)
  for (const v of [-5.5, 0, 5.5]) {
    const p = wp(0, v)
    ctx.solidBox(p[0], H - 0.12, p[1], fx !== 0 ? 0.35 : W * 0.6, 0.08, fz !== 0 ? 0.35 : W * 0.6, 0xffffff, 0, 'lamp')
  }
  // props: workbench, tyre stacks, barrels, shelf
  const bench = wp(-W / 2 + 2.2, -D / 2 + 1.4)
  const alongX = Math.abs(fx) > 0
  ctx.solidBox(bench[0], 0.55, bench[1], alongX ? 1.0 : 3.2, 1.0, alongX ? 3.2 : 1.0, 0x6b4a2e)
  ctx.grid.addRect(bench[0], bench[1], alongX ? 0.5 : 1.6, alongX ? 1.6 : 0.5, 1.2)
  for (let k = 0; k < 3; k++) {
    const t = wp(W / 2 - 1.6, -D / 2 + 1.5 + k * 1.1)
    ctx.solidGeo(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), 0x141416, t[0], 0.6, t[1])
    ctx.solidGeo(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), 0x141416, t[0], 1.4, t[1])
    ctx.grid.addRect(t[0], t[1], 0.5, 0.5, 1.8)
  }
  const barrel = wp(-W / 2 + 1.4, 3)
  ctx.solidGeo(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12), 0xb02a2a, barrel[0], 0.7, barrel[1])
  ctx.grid.addRect(barrel[0], barrel[1], 0.45, 0.45, 1.2)
  // lift platform
  const lift = wp(0, -D / 2 + 4.5)
  ctx.solidBox(lift[0], 0.3, lift[1], fx !== 0 ? 4.6 : 2.0, 0.22, fz !== 0 ? 4.6 : 2.0, 0xe0b52a)

  // facade sign above the opening
  const sp = wp(0, D / 2 + 0.06)
  ctx.sign(sign, sp[0], 5.5, sp[1], 8, rotY)
  // frame glow on either side of the door
  for (const s of [-1, 1]) {
    const p = wp(s * (OPEN_W / 2 + 0.2), D / 2 + 0.06)
    ctx.solidBox(p[0], 2.3, p[1], 0.3, 4.6, 0.3, 0xffb02e, 0, 'lamp')
  }

  const door: Box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: OPEN_H, active: true }
  const a = wp(-OPEN_W / 2, D / 2 - 0.6)
  const b = wp(OPEN_W / 2, D / 2)
  door.minX = Math.min(a[0], b[0])
  door.maxX = Math.max(a[0], b[0])
  door.minZ = Math.min(a[1], b[1])
  door.maxZ = Math.max(a[1], b[1])
  ctx.grid.add(door)
  const g = new Garage(cx, cz, fx, fz, door, sign)
  ctx.garages.push(g)
  // showcase cars parked inside
  const h = Math.atan2(fx, fz)
  const c1 = wp(-7.6, -3)
  const c2 = wp(7.6, -3.5)
  ctx.carSpawns.push({ x: c1[0], z: c1[1], heading: h, type: 'sport', color: 0xf2f2f4 }, { x: c2[0], z: c2[1], heading: h, type: 'suv', color: 0x0e0e12 })
  return g
}
