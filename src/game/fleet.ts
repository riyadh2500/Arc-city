// Owns every vehicle: parked cars, AI traffic, police patrols/pursuits, collisions.
import * as THREE from 'three'
import type { CarSpawn } from './blocksCore'
import { PursuitDriver } from './police'
import { TrafficDriver, type DriveCtx, type Obstacle } from './traffic'
import { CITY, ColliderGrid, mulberry32, pick, rl } from './util'
import { Vehicle } from './vehicle'

const TYPES = ['sedan', 'sedan', 'suv', 'taxi', 'sport', 'van']
const COLORS = [0xc8321e, 0x1e5fc8, 0xe8e8ea, 0x1a1a1e, 0x2d8f4e, 0xd9a21c, 0x7a3fc4, 0x8a8f96, 0x2b3a67]

interface Circle {
  x: number
  z: number
  r: number
}

export interface CollisionEvent {
  a: Vehicle
  b: Vehicle
  impact: number
  x: number
  z: number
}

export interface PlayerState {
  x: number
  z: number
  vx: number
  vz: number
  vehicle: Vehicle | null
}

export class Fleet {
  vehicles: Vehicle[] = []
  drivers: TrafficDriver[] = []
  pursuits: PursuitDriver[] = []
  collisions: CollisionEvent[] = []
  readonly group = new THREE.Group()
  private rng = mulberry32(555)
  private ca: Circle[] = []
  private cb: Circle[] = []

  constructor(
    private grid: ColliderGrid,
    spawns: CarSpawn[],
    trafficCount: number,
    patrolCount: number,
    avoid: { x: number; z: number },
  ) {
    for (const s of spawns) {
      const v = new Vehicle(s.type, s.color)
      // parked cars are never perfectly straight: slight yaw, wheels turned, dusty paint
      v.steerAngle = (this.rng() - 0.5) * 0.4
      v.weather(this.rng())
      v.setPose(s.x, s.z, s.heading + (this.rng() - 0.5) * 0.07)
      this.vehicles.push(v)
      this.group.add(v.mesh)
    }
    for (let n = 0; n < trafficCount; n++) this.spawnTraffic(avoid, 60)
    for (let n = 0; n < patrolCount; n++) this.spawnTraffic(avoid, 80, undefined, 'police')
  }

  /** Places an AI car on a random lane between minDist and maxDist from `avoid`. */
  spawnTraffic(avoid: { x: number; z: number }, minDist: number, existing?: Vehicle, type?: string, maxDist = 99999): Vehicle | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const axis = this.rng() < 0.5 ? 'x' : 'z'
      const dir = this.rng() < 0.5 ? 1 : -1
      const line = Math.floor(this.rng() * (CITY.N + 1))
      const m0 = Math.floor(this.rng() * CITY.N)
      const along = rl(m0) + CITY.P / 2 + (this.rng() - 0.5) * 20
      const off = CITY.LANE
      let x: number
      let z: number
      if (axis === 'x') {
        x = along
        z = rl(line) + (dir > 0 ? off : -off)
      } else {
        x = rl(line) + (dir > 0 ? -off : off)
        z = along
      }
      const d = Math.hypot(x - avoid.x, z - avoid.z)
      if (d < minDist || d > maxDist) continue
      if (this.vehicles.some((o) => o !== existing && Math.hypot(o.x - x, o.z - z) < 10)) continue
      const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI
      const v = existing ?? new Vehicle(type ?? pick(this.rng, TYPES), pick(this.rng, COLORS))
      v.setPose(x, z, heading)
      const next = dir > 0 ? m0 + 1 : m0
      const driver = new TrafficDriver(v, axis, dir, line, next, this.rng)
      v.vx = Math.sin(heading) * driver.cruise * 0.8
      v.vz = Math.cos(heading) * driver.cruise * 0.8
      v.driver = 'ai'
      v.siren = false
      this.drivers = this.drivers.filter((dr) => dr.v !== v)
      this.pursuits = this.pursuits.filter((p) => p.v !== v)
      this.drivers.push(driver)
      if (!existing) {
        this.vehicles.push(v)
        this.group.add(v.mesh)
      }
      return v
    }
    return null
  }

  startPursuit(v: Vehicle): void {
    this.drivers = this.drivers.filter((d) => d.v !== v)
    if (!this.pursuits.some((p) => p.v === v)) this.pursuits.push(new PursuitDriver(v))
    v.driver = 'ai'
    v.siren = true
  }

  /** Pursuit car becomes an ordinary parked car (officer got out). */
  park(v: Vehicle): void {
    this.pursuits = this.pursuits.filter((p) => p.v !== v)
    this.drivers = this.drivers.filter((d) => d.v !== v)
    v.driver = 'none'
    v.siren = true
    v.blinker = 0
  }

  remove(v: Vehicle): void {
    this.pursuits = this.pursuits.filter((p) => p.v !== v)
    this.drivers = this.drivers.filter((d) => d.v !== v)
    this.vehicles = this.vehicles.filter((o) => o !== v)
    v.dispose()
  }

  /** A destroyed car stops being driven by anyone. */
  abandon(v: Vehicle): void {
    this.drivers = this.drivers.filter((d) => d.v !== v)
    this.pursuits = this.pursuits.filter((p) => p.v !== v)
    v.driver = 'none'
    v.siren = false
    v.blinker = 0
  }

  /** Remove AI control (player hijacked the car) and spawn a replacement. */
  release(v: Vehicle, player: { x: number; z: number }): void {
    this.drivers = this.drivers.filter((d) => d.v !== v)
    this.pursuits = this.pursuits.filter((p) => p.v !== v)
    v.driver = 'none'
    v.siren = false
    if (v.role !== 'police') this.spawnTraffic(player, 90)
  }

  nearest(x: number, z: number, maxDist: number): Vehicle | null {
    let best: Vehicle | null = null
    let bd = maxDist
    for (const v of this.vehicles) {
      if (v.driver === 'player') continue
      const d = Math.hypot(v.x - x, v.z - z)
      if (d < bd) {
        bd = d
        best = v
      }
    }
    return best
  }

  sirenCars(): Vehicle[] {
    return this.vehicles.filter((v) => v.siren)
  }

  update(
    dt: number,
    time: number,
    peds: Obstacle[],
    player: PlayerState,
    level: number,
  ): number {
    this.collisions.length = 0
    const ctx: DriveCtx = { time, dt, vehicles: this.vehicles, peds, sirens: this.sirenCars(), grid: this.grid, player }
    for (const d of this.drivers) d.drive(ctx)
    const target = { x: player.x, z: player.z, vx: player.vx, vz: player.vz }
    for (const p of this.pursuits) p.drive(ctx, Math.max(1, level), target)
    let maxImpact = 0
    const sub = dt > 1 / 50 ? 2 : 1
    const h = dt / sub
    for (let s = 0; s < sub; s++) {
      for (const v of this.vehicles) {
        if (v.driver === 'none') {
          v.input.throttle = 0
          v.input.brake = 0
          v.input.steer = 0
          v.input.handbrake = true
          if (v.speed < 0.04 && Math.abs(v.yawRate) < 0.01) continue
        }
        v.update(h)
        const imp = v.collideStatic(this.grid)
        if (v.driver === 'player') maxImpact = Math.max(maxImpact, imp)
      }
      maxImpact = Math.max(maxImpact, this.vehicleCollisions())
    }
    for (const d of this.drivers) {
      if (d.stuck > 14) {
        d.stuck = 0
        this.spawnTraffic(player, 70, d.v)
      }
    }
    for (const v of this.vehicles) v.syncMesh()
    return maxImpact
  }

  private vehicleCollisions(): number {
    let maxImpact = 0
    const vs = this.vehicles
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]
      for (let j = i + 1; j < vs.length; j++) {
        const b = vs[j]
        const dx = b.x - a.x
        const dz = b.z - a.z
        if (dx * dx + dz * dz > 40) continue
        a.circles(this.ca)
        b.circles(this.cb)
        for (const p of this.ca) {
          for (const q of this.cb) {
            let nx = q.x - p.x
            let nz = q.z - p.z
            const d = Math.hypot(nx, nz)
            const min = p.r + q.r
            if (d >= min || d < 1e-5) continue
            nx /= d
            nz /= d
            const pen = (min - d) * 0.5
            a.x -= nx * pen
            a.z -= nz * pen
            b.x += nx * pen
            b.z += nz * pen
            p.x -= nx * pen
            p.z -= nz * pen
            q.x += nx * pen
            q.z += nz * pen
            const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz
            if (vn < 0) {
              const j2 = -(1 + 0.25) * vn * 0.5
              a.vx -= j2 * nx
              a.vz -= j2 * nz
              b.vx += j2 * nx
              b.vz += j2 * nz
              const impact = -vn
              if (a.driver === 'player' || b.driver === 'player') maxImpact = Math.max(maxImpact, impact)
              a.hit = Math.max(a.hit, impact)
              b.hit = Math.max(b.hit, impact)
              if (impact > 3) {
                a.damage(impact * 1.2)
                b.damage(impact * 1.2)
                this.collisions.push({ a, b, impact, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 })
              }
            }
          }
        }
      }
    }
    return maxImpact
  }
}
