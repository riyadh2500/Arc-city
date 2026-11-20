// Block builders (part 2): shops, old town, industrial, suburbs.
import * as THREE from 'three'
import type { Ctx } from './blocksCore'
import { buildGarage } from './garage'
import { buildHouse } from './houses'
import { CITY, pick, range, snapTo } from './util'

const B = CITY.B

const SHOP_ITEMS: Record<string, { item: string; price: number; heal: number }> = {
  'CAFE 402': { item: 'Coffee', price: 8, heal: 15 },
  PIZZA: { item: 'Pizza slice', price: 14, heal: 30 },
  DINER: { item: 'Burger', price: 12, heal: 25 },
  PHARMACY: { item: 'Medkit', price: 40, heal: 100 },
  'ARC MART': { item: 'Snack pack', price: 10, heal: 20 },
  DONUTS: { item: 'Donut box', price: 9, heal: 15 },
}

export interface ShopOpts {
  styles: number[]
  names: string[]
  minF: number
  maxF: number
  garage?: string
}

export function buildShops(c: Ctx, cx: number, cz: number, o: ShopOpts): void {
  const r = c.rng
  let k = 0
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = cx + sx * 13
      const z = cz + sz * 13
      const alongX = k % 2 === 0
      const dirX = alongX ? sx : 0
      const dirZ = alongX ? 0 : sz
      if (o.garage && k === 0) {
        buildGarage(c, x, z, dirX, dirZ, o.garage)
        k++
        continue
      }
      const w = snapTo(range(r, 16, 22), 4)
      const d = snapTo(range(r, 14, 20), 4)
      const h = 3.6 * Math.floor(range(r, o.minF, o.maxF + 1))
      c.wall(x, z, w, h, d, pick(r, o.styles), 0, true, true, false)
      const half = alongX ? w / 2 : d / 2
      const span = (alongX ? d : w) - 4
      const rotY = alongX ? (dirX > 0 ? Math.PI / 2 : -Math.PI / 2) : dirZ > 0 ? 0 : Math.PI
      const fx = x + dirX * (half + 0.06)
      const fz = z + dirZ * (half + 0.06)
      const name = pick(r, o.names)
      c.sign(name, fx, 5.2, fz, Math.min(8, span), rotY)
      c.glass(fx + dirX * 0.01, 1.7, fz + dirZ * 0.01, Math.min(11, span), 2.8, rotY)
      const aw = Math.min(11, span) + 1
      c.solidBox(fx + dirX * 0.9, 3.7, fz + dirZ * 0.9, alongX ? 1.8 : aw, 0.15, alongX ? aw : 1.8, pick(r, [0xb02a2a, 0x2a5ab0, 0x2a8a52, 0xd0a020]))
      const it = SHOP_ITEMS[name]
      if (it) c.shops.push({ x: fx + dirX * 2.4, z: fz + dirZ * 2.4, name, ...it })
      k++
    }
  }
  c.props.addTree(cx, cz, 1)
}

export function buildWarehouse(c: Ctx, cx: number, cz: number): void {
  const r = c.rng
  c.plane('lot', cx, cz, 52, 52, 0.17, 12)
  c.wall(cx - 2, cz - 8, 40, 10.8, 28, 7)
  c.sign(pick(r, ['CARGO', 'PORT CO.']), cx - 2, 8.6, cz - 8 + 14.06, 10, 0)
  c.wall(cx + 16, cz + 16, 16, 7.2, 12, 5)
  // smokestack with red/white bands
  const sx = cx - 20
  const sz = cz + 14
  for (let k = 0; k < 6; k++) {
    c.solidGeo(new THREE.CylinderGeometry(1.3 - k * 0.04, 1.34 - k * 0.04, 6, 12), k % 2 ? 0xe8e8e8 : 0xc23b2e, sx, 3 + k * 6, sz)
  }
  c.grid.addRect(sx, sz, 1.4, 1.4, 36)
  for (const [tx, tz] of [[cx + 14, cz - 14], [cx + 14, cz - 4]] as const) {
    c.solidGeo(new THREE.CylinderGeometry(4, 4, 8, 20), 0xaab0b8, tx, 4, tz)
    c.grid.addRect(tx, tz, 4, 4, 8)
  }
  containerPile(c, cx - 16, cz + 22, 3)
  containerPile(c, cx - 4, cz + 22, 2)
  fence(c, cx, cz)
}

export function buildYard(c: Ctx, cx: number, cz: number): void {
  c.plane('lot', cx, cz, 52, 52, 0.17, 12)
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue
      containerPile(c, cx + i * 15, cz + j * 14, 1 + Math.floor(c.rng() * 3), c.rng() < 0.5)
    }
  }
  // gantry crane
  for (const lx of [-8, 8]) {
    for (const lz of [-3, 3]) {
      c.solidBox(cx + lx, 9, cz + lz + 0, 1.2, 18, 1.2, 0xe0b52a)
      c.grid.addRect(cx + lx, cz + lz, 0.7, 0.7, 18)
    }
  }
  c.solidBox(cx, 18.6, cz, 18, 1.2, 8, 0xe0b52a)
  c.solidBox(cx, 20, cz, 3, 1.4, 3, 0x3a3f46)
  c.props.beacon.add(cx, 21.2, cz, 1, 1, 1)
  fence(c, cx, cz)
}

function containerPile(c: Ctx, x: number, z: number, high: number, rot = false): void {
  const colors = [0xb5412e, 0x2e6bb5, 0xd6a02a, 0x3a8a4a, 0x7a7f86, 0xdadde2]
  for (let h = 0; h < high; h++) {
    const col = colors[Math.floor(c.rng() * colors.length)]
    c.solidBox(x, 1.3 + h * 2.6, z, rot ? 2.5 : 12, 2.6, rot ? 12 : 2.5, col)
  }
  c.grid.addRect(x, z, rot ? 1.3 : 6.1, rot ? 6.1 : 1.3, high * 2.6)
}

function fence(c: Ctx, cx: number, cz: number): void {
  const e = 25.5
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    for (const t of [-15, 15]) {
      c.solidBox(cx + sx * e + (sx !== 0 ? 0 : t), 1.2, cz + sz * e + (sz !== 0 ? 0 : t), sx !== 0 ? 0.12 : 20, 2.4, sz !== 0 ? 0.12 : 20, 0x7d848c)
    }
  }
}

export function buildSuburb(c: Ctx, cx: number, cz: number): void {
  const r = c.rng
  let k = 0
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = cx + sx * 13
      const lz = cz + sz * 13
      const alongX = k % 2 === 0
      const dirX = alongX ? sx : 0
      const dirZ = alongX ? 0 : sz
      c.plane('grass', lx, lz, 25, 25, 0.18, 8)
      buildHouse(c, lx, lz, dirX, dirZ)
      // low white fence along the lawn edge (cosmetic)
      const e = 12.2
      for (const [ax, az] of [[dirX, dirZ], [-dirX, -dirZ], [dirZ, dirX], [-dirZ, -dirX]] as const) {
        if (ax === dirX && az === dirZ) continue
        c.solidBox(lx + ax * e, 0.55, lz + az * e, ax !== 0 ? 0.08 : 24, 0.9, az !== 0 ? 0.08 : 24, 0xf0eee8)
      }
      c.props.addTree(lx - dirX * 9 + (alongX ? 0 : 7), lz - dirZ * 9 + (alongX ? 7 : 0), 1 + r() * 0.5)
      c.props.addTree(lx + dirX * 6 - (alongX ? 0 : 8), lz + dirZ * 6 - (alongX ? 8 : 0), 0.8 + r() * 0.4)
      k++
    }
  }
  void B
}
