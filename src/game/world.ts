// The city: ground, roads, markings, merged district geometry, props, colliders.
import * as THREE from 'three'
import { buildBlock, blockTypeOf, type BlockType } from './blocksIndex'
import { Ctx, type CarSpawn, type ShopSpot } from './blocksCore'
import { Ambient } from './ambient'
import { MID } from './districts'
import type { Garage } from './garage'
import { Merger, type MatSpec } from './merge'
import { Props } from './props'
import { FACADES, makeAsphalt, makeFacadeMaterial, makeGrass, makeShingle, makeSidewalk, makeSignAtlas } from './textures'
import { CITY, ColliderGrid, HALF, bc, mulberry32, rl } from './util'

export class World {
  group = new THREE.Group()
  grid = new ColliderGrid()
  props = new Props(this.grid)
  carSpawns: CarSpawn[] = []
  shops: ShopSpot[] = []
  garages: Garage[] = []
  blockTypes: BlockType[][] = []
  policeSpot = { x: 0, z: 0 }
  private ambient: Ambient | null = null
  private night = 0
  facades: THREE.MeshStandardMaterial[]
  private glowMats: { mat: THREE.MeshStandardMaterial; max: number }[] = []

  constructor() {
    const { N, B, R } = CITY
    const asphalt = makeAsphalt()
    const sidewalk = makeSidewalk()
    const grass = makeGrass()
    this.facades = FACADES.map((f, i) => makeFacadeMaterial(f, 40 + i * 13))
    const atlas = makeSignAtlas()

    // ground + roads
    grass.repeat.set(300, 300)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
    )
    ground.position.y = -0.04
    ground.receiveShadow = true
    this.group.add(ground)

    const len = N * CITY.P + R
    asphalt.repeat.set(len / 12, R / 12)
    const roadMatH = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, envMapIntensity: 0.6 })
    const asphaltV = asphalt.clone()
    asphaltV.repeat.set(R / 12, len / 12)
    asphaltV.needsUpdate = true
    const roadMatV = new THREE.MeshStandardMaterial({ map: asphaltV, roughness: 0.92, envMapIntensity: 0.6 })
    for (let k = 0; k <= N; k++) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(len, R).rotateX(-Math.PI / 2), roadMatH)
      h.position.set(0, 0.02, rl(k))
      h.receiveShadow = true
      this.group.add(h)
      const v = new THREE.Mesh(new THREE.PlaneGeometry(R, len).rotateX(-Math.PI / 2), roadMatV)
      v.position.set(rl(k), 0.021, 0)
      v.receiveShadow = true
      this.group.add(v)
    }

    // materials for merged geometry
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o)
    const signMat = std({ map: atlas.texture, roughness: 0.6, emissive: new THREE.Color(0xffffff), emissiveMap: atlas.texture, emissiveIntensity: 0 })
    const glassMat = std({ color: 0x1b2a3a, roughness: 0.1, metalness: 0.8, emissive: new THREE.Color(0xffd89a), emissiveIntensity: 0, envMapIntensity: 1.5 })
    const arcMat = std({ color: 0x2f6bff, metalness: 0.8, roughness: 0.25, emissive: new THREE.Color(0x2f6bff), emissiveIntensity: 0 })
    const lampMat = std({ color: 0xffffff, emissive: new THREE.Color(0xfff2d0), emissiveIntensity: 1.8 })
    this.glowMats.push({ mat: signMat, max: 1.6 }, { mat: glassMat, max: 1.2 }, { mat: arcMat, max: 1.5 })
    sidewalk.repeat.set(1, 1)
    const grassTile = grass.clone()
    grassTile.repeat.set(1, 1)
    grassTile.needsUpdate = true
    const pathTex = sidewalk.clone()
    pathTex.needsUpdate = true
    const lotTex = asphalt.clone()
    lotTex.repeat.set(1, 1)
    lotTex.needsUpdate = true
    const shingle = makeShingle()
    const specs: Record<string, MatSpec> = {
      shingle0: { mat: std({ map: shingle, color: 0x5a5a62, roughness: 0.95 }), cast: true, receive: true },
      shingle1: { mat: std({ map: shingle, color: 0x7a5a48, roughness: 0.95 }), cast: true, receive: true },
      shingle2: { mat: std({ map: shingle, color: 0x9a4a38, roughness: 0.9 }), cast: true, receive: true },
      roof: { mat: std({ color: 0x5a5c61, roughness: 0.9 }), cast: true, receive: true },
      solid: { mat: std({ vertexColors: true, roughness: 0.75, metalness: 0.1 }), cast: true, receive: true },
      lamp: { mat: lampMat, cast: false, receive: false },
      sign: { mat: signMat, cast: false, receive: false },
      glass: { mat: glassMat, cast: false, receive: false },
      slab: { mat: std({ map: sidewalk, roughness: 0.9 }), cast: false, receive: true },
      grass: { mat: std({ map: grassTile, roughness: 1 }), cast: false, receive: true },
      path: { mat: std({ map: pathTex, roughness: 0.85, color: 0xd8d4cc }), cast: false, receive: true },
      lot: { mat: std({ map: lotTex, roughness: 0.95, color: 0xb0b0b0 }), cast: false, receive: true },
      water: { mat: std({ color: 0x2a6f9c, roughness: 0.04, metalness: 0.7, envMapIntensity: 1.8 }), cast: false, receive: true },
      arc: { mat: arcMat, cast: true, receive: false },
    }
    this.facades.forEach((f, i) => {
      specs[`f${i}`] = { mat: f, cast: true, receive: true }
    })

    // block layout, merged per 3x3 chunk
    const ctx = new Ctx(this.grid, this.props, atlas.range)
    const chunks = new Map<string, Merger>()
    const slabGeo = new THREE.BoxGeometry(B, 0.16, B)
    const suv = slabGeo.attributes.uv as THREE.BufferAttribute
    for (let k = 0; k < suv.count; k++) suv.setXY(k, suv.getX(k) * (B / 3), suv.getY(k) * (B / 3))
    for (let i = 0; i < N; i++) {
      this.blockTypes[i] = []
      for (let j = 0; j < N; j++) {
        const t = blockTypeOf(i, j)
        this.blockTypes[i][j] = t
        const key = `${Math.floor(i / 3)},${Math.floor(j / 3)}`
        let m = chunks.get(key)
        if (!m) {
          m = new Merger()
          chunks.set(key, m)
        }
        ctx.m = m
        const cx = bc(i)
        const cz = bc(j)
        m.add('slab', slabGeo, cx, 0.08, cz)
        const spot = buildBlock(ctx, t, i, j, cx, cz)
        if (spot) this.policeSpot = spot
      }
    }
    for (const m of chunks.values()) m.build(this.group, specs)
    this.carSpawns.push(...ctx.carSpawns)
    this.shops = ctx.shops
    this.garages = ctx.garages
    for (const g of this.garages) this.group.add(g.pivot)

    this.buildMarkings()
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) this.props.addTrafficLight(rl(i), rl(j), i, j)
    // street furniture around every block edge
    const rng = mulberry32(31)
    const e = B / 2 - 1
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const cx = bc(i)
        const cz = bc(j)
        const t = this.blockTypes[i][j]
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const px = dz !== 0 ? 1 : 0
          const pz = dx !== 0 ? 1 : 0
          for (const s of [-15, 15]) this.props.addLamp(cx + dx * e + px * s, cz + dz * e + pz * s, dx, dz)
          if (t !== 'park' && t !== 'plaza' && t !== 'lake' && t !== 'warehouse' && t !== 'yard') {
            this.props.addTree(cx + dx * (e - 0.5), cz + dz * (e - 0.5), 0.9 + rng() * 0.3)
          }
          if (rng() < 0.4) this.props.addBin(cx + dx * (e - 1) + px * 8, cz + dz * (e - 1) + pz * 8)
          if (rng() < 0.4) this.props.addHydrant(cx + dx * (e - 0.5) + px * -22, cz + dz * (e - 0.5) + pz * -22)
          if (rng() < 0.25) this.props.addBench(cx + dx * (e - 2) + px * -9, cz + dz * (e - 2) + pz * -9, dx !== 0 ? Math.PI / 2 : 0)
        }
      }
    }
    this.buildSurroundings(rng)
    this.addParkedCars(rng)
    this.props.build(this.group)
    this.ambient = new Ambient(this.group, bc(MID), bc(MID))
    this.setNight(0)
  }

  private buildMarkings(): void {
    const { N, R } = CITY
    const wp = this.props.whitePaint
    const yp = this.props.yellowPaint
    const y = 0.035
    for (let k = 0; k <= N; k++) {
      for (let m = 0; m < N; m++) {
        const a = rl(m) + R / 2
        const b = rl(m + 1) - R / 2
        const c = (a + b) / 2
        const l = b - a
        yp.add(c, y, rl(k) - 0.22, l, 0.02, 0.16)
        yp.add(c, y, rl(k) + 0.22, l, 0.02, 0.16)
        yp.add(rl(k) - 0.22, y, c, 0.16, 0.02, l)
        yp.add(rl(k) + 0.22, y, c, 0.16, 0.02, l)
        for (let s = a + 3; s < b - 3; s += 6) {
          for (const off of [-5.5, 5.5]) {
            wp.add(s, y, rl(k) + off, 3, 0.02, 0.14)
            wp.add(rl(k) + off, y, s, 0.14, 0.02, 3)
          }
        }
      }
    }
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const ix = rl(i)
        const iz = rl(j)
        for (const s of [-1, 1]) {
          for (let w = -R / 2 + 1.2; w < R / 2; w += 1.8) {
            wp.add(ix + w, y + 0.002, iz + s * (R / 2 + 3), 0.9, 0.02, 3.2)
            wp.add(ix + s * (R / 2 + 3), y + 0.002, iz + w, 3.2, 0.02, 0.9)
          }
        }
      }
    }
  }

  private buildSurroundings(rng: () => number): void {
    const p = this.props
    for (let t = 0; t < 1300; t++) {
      const ang = rng() * Math.PI * 2
      const r = HALF + 40 + rng() * 520
      const x = Math.cos(ang) * r
      const z = Math.sin(ang) * r
      if (Math.abs(x) < HALF + 38 && Math.abs(z) < HALF + 38) continue
      const s = 0.8 + rng() * 0.9
      p.farLeaves.add(x, 3.5 * s, z, s, s, s)
      p.trunk.add(x, 0.5, z, 0.4, 1, 0.4)
    }
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 1, flatShading: true })
    for (let h = 0; h < 22; h++) {
      const ang = (h / 22) * Math.PI * 2 + rng() * 0.3
      const r = 1050 + rng() * 160
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), hillMat)
      const sc = 170 + rng() * 150
      hill.scale.set(sc, sc * (0.35 + rng() * 0.35), sc)
      hill.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r)
      this.group.add(hill)
    }
  }

  private addParkedCars(rng: () => number): void {
    const { N, R } = CITY
    const cx = bc(MID)
    const zRoad = rl(MID + 1)
    const starters = [
      { dx: -22, type: 'sedan', color: 0x1e5fc8 },
      { dx: 6, type: 'sport', color: 0xc8321e },
      { dx: 26, type: 'taxi', color: 0xf2c418 },
    ]
    for (const s of starters) {
      this.carSpawns.push({ x: cx + s.dx, z: zRoad - CITY.PARK, heading: -Math.PI / 2, type: s.type, color: s.color })
    }
    const types = ['sedan', 'sport', 'suv', 'taxi', 'sedan', 'van']
    const colors = [0xc8321e, 0x1e5fc8, 0xe8e8ea, 0x1a1a1e, 0x2d8f4e, 0xd9a21c, 0x7a3fc4, 0x8a8f96]
    for (let n = 0; n < 46; n++) {
      const k = Math.floor(rng() * (N + 1))
      const m = Math.floor(rng() * N)
      const along = rl(m) + R / 2 + 10 + rng() * (CITY.P - R - 20)
      const side = rng() < 0.5 ? 1 : -1
      const alongX = rng() < 0.5
      const type = types[Math.floor(rng() * types.length)]
      const color = colors[Math.floor(rng() * colors.length)]
      if (alongX) {
        this.carSpawns.push({ x: along, z: rl(k) + side * CITY.PARK, heading: side > 0 ? Math.PI / 2 : -Math.PI / 2, type, color })
      } else {
        this.carSpawns.push({ x: rl(k) - side * CITY.PARK, z: along, heading: side > 0 ? 0 : Math.PI, type, color })
      }
    }
  }

  /** night: 0 day .. 1 full night */
  setNight(n: number): void {
    this.night = n
    this.props.setNight(n)
    for (const f of this.facades) f.emissiveIntensity = n * 1.5
    for (const g of this.glowMats) g.mat.emissiveIntensity = n * g.max
  }

  update(time: number): void {
    this.props.updateLights(time)
    this.props.setTime(time)
    this.ambient?.update(time, this.night)
  }

  groundHeight(x: number, z: number): number {
    const { N, B, P } = CITY
    const gx = (x + HALF) / P
    const gz = (z + HALF) / P
    const i = Math.floor(gx)
    const j = Math.floor(gz)
    if (i < 0 || j < 0 || i >= N || j >= N) return 0
    const lx = (gx - i) * P - P / 2
    const lz = (gz - j) * P - P / 2
    return Math.abs(lx) <= B / 2 && Math.abs(lz) <= B / 2 ? 0.16 : 0
  }
}
