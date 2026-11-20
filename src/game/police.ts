// Wanted level, road navigation, pursuit driving and on-foot police.
import { animateHumanoid, createHumanoid, setHumanoidShadows, setHumanoidWeapon, type Humanoid } from './humanoid'
import type { DriveCtx } from './traffic'
import { CITY, ColliderGrid, circleVsBox, clamp, damp, dampAngle, rl, wrapAngle, type Box } from './util'
import type { Vehicle } from './vehicle'

// ---------- wanted level ----------
const THRESHOLDS = [1, 3, 6, 10, 15]

export class WantedSystem {
  heat = 0
  level = 0
  searching = false
  lastSeen = 0

  addCrime(points: number): boolean {
    const before = this.level
    this.heat += points
    this.level = THRESHOLDS.filter((t) => this.heat >= t).length
    if (this.level > before) this.lastSeen = 0
    return this.level > before
  }

  /** returns true when the wanted level was just cleared by evading */
  update(dt: number, seen: boolean): boolean {
    if (this.level === 0) return false
    if (seen) {
      this.lastSeen = 0
      this.searching = false
      return false
    }
    this.lastSeen += dt
    this.searching = this.lastSeen > 3
    if (this.lastSeen > 14 + this.level * 3) {
      this.clear()
      return true
    }
    return false
  }

  clear(): void {
    this.heat = 0
    this.level = 0
    this.searching = false
    this.lastSeen = 0
  }
}

// ---------- road graph navigation ----------
export function nearestNode(x: number, z: number): [number, number] {
  const i = clamp(Math.round(x / CITY.P + CITY.N / 2), 0, CITY.N)
  const j = clamp(Math.round(z / CITY.P + CITY.N / 2), 0, CITY.N)
  return [i, j]
}

export function route(from: [number, number], to: [number, number]): [number, number][] {
  const N = CITY.N + 1
  const key = (i: number, j: number) => i * N + j
  const prev = new Map<number, number>()
  const q: [number, number][] = [from]
  prev.set(key(from[0], from[1]), -1)
  while (q.length) {
    const [i, j] = q.shift()!
    if (i === to[0] && j === to[1]) break
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue
      const k = key(ni, nj)
      if (prev.has(k)) continue
      prev.set(k, key(i, j))
      q.push([ni, nj])
    }
  }
  const out: [number, number][] = []
  let k = key(to[0], to[1])
  while (k !== -1 && prev.has(k)) {
    out.push([Math.floor(k / N), k % N])
    k = prev.get(k)!
  }
  return out.reverse()
}

const boxes: Box[] = []
/** true when no tall collider sits between the two points */
export function lineOfSight(grid: ColliderGrid, x1: number, z1: number, x2: number, z2: number): boolean {
  const d = Math.hypot(x2 - x1, z2 - z1)
  const n = Math.ceil(d / 3)
  for (let s = 1; s < n; s++) {
    const t = s / n
    const x = x1 + (x2 - x1) * t
    const z = z1 + (z2 - z1) * t
    grid.query(x, z, 0.2, boxes)
    for (const b of boxes) {
      if (b.active === false || b.h < 3) continue
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false
    }
  }
  return true
}

// ---------- pursuit driving ----------
const SPEED_CAP = [0, 26, 30, 34, 38, 42]

export class PursuitDriver {
  route: [number, number][] = []
  private replan = 0
  stuck = 0
  private reverse = 0
  leaving = false
  private losTimer = 0
  private los = false
  private leaveTo: [number, number] | null = null

  constructor(public v: Vehicle) {}

  drive(ctx: DriveCtx, level: number, target: { x: number; z: number; vx: number; vz: number }): void {
    const v = this.v
    const dt = ctx.dt
    this.replan -= dt
    this.losTimer -= dt
    const dx = target.x - v.x
    const dz = target.z - v.z
    const dist = Math.hypot(dx, dz)
    if (this.losTimer <= 0) {
      this.losTimer = 0.3
      this.los = dist < 55 && lineOfSight(ctx.grid, v.x, v.z, target.x, target.z)
    }
    let ax: number
    let az: number
    let cap = SPEED_CAP[clamp(level, 1, 5)]
    if (this.leaving) {
      cap = 16
      if (!this.leaveTo || Math.hypot(rl(this.leaveTo[0]) - v.x, rl(this.leaveTo[1]) - v.z) < 14) {
        this.leaveTo = [Math.floor(Math.random() * (CITY.N + 1)), Math.floor(Math.random() * (CITY.N + 1))]
        this.route = route(nearestNode(v.x, v.z), this.leaveTo)
      }
    }
    if (!this.leaving && this.los) {
      const lead = clamp(dist / 25, 0, 1.2)
      ax = target.x + target.vx * lead * 0.6
      az = target.z + target.vz * lead * 0.6
    } else {
      if (this.replan <= 0 || this.route.length === 0) {
        this.replan = 1.4
        const goal = this.leaving && this.leaveTo ? this.leaveTo : nearestNode(target.x, target.z)
        this.route = route(nearestNode(v.x, v.z), goal)
      }
      // skip nodes already reached / behind
      while (this.route.length > 1 && Math.hypot(rl(this.route[0][0]) - v.x, rl(this.route[0][1]) - v.z) < 16) this.route.shift()
      const n0 = this.route[0] ?? nearestNode(target.x, target.z)
      ax = rl(n0[0])
      az = rl(n0[1])
      if (this.route.length === 1 && !this.leaving) {
        ax = target.x
        az = target.z
      }
      // cut corners onto the next leg when close
      const n1 = this.route[1]
      if (n1 && Math.hypot(ax - v.x, az - v.z) < 26) {
        ax = (ax + rl(n1[0])) / 2
        az = (az + rl(n1[1])) / 2
      }
    }
    const err = wrapAngle(Math.atan2(ax - v.x, az - v.z) - v.heading)
    const inp = v.input
    let desired = cap * (1 - Math.min(1, Math.abs(err)) * 0.65)
    if (!this.los && Math.hypot(ax - v.x, az - v.z) < 22 && Math.abs(err) > 0.5) desired = Math.min(desired, 9)

    // avoid ramming civilians unless it is the player's car
    const fx = v.fx
    const fz = v.fz
    for (const o of ctx.vehicles) {
      if (o === v || o.driver === 'player') continue
      const rx = o.x - v.x
      const rz = o.z - v.z
      const along = rx * fx + rz * fz
      if (along > 0 && along < 14 && Math.abs(rx * fz - rz * fx) < 2.1) desired = Math.min(desired, Math.max(3, along * 1.0))
    }

    inp.handbrake = false
    if (this.reverse > 0) {
      this.reverse -= dt
      inp.throttle = 0
      inp.brake = 1
      inp.steer = -clamp(err * 2, -1, 1)
    } else {
      inp.steer = clamp(err * 2.4, -1, 1)
      const vF = v.speedF
      if (vF < desired) {
        inp.throttle = 1
        inp.brake = 0
      } else {
        inp.throttle = 0
        inp.brake = clamp((vF - desired) * 0.3, 0, 1)
      }
      // very close to a stationary target: stop pushing
      if (this.los && dist < 5.5 && target.vx * target.vx + target.vz * target.vz < 4) {
        inp.throttle = 0
        inp.brake = 0.6
      }
      if (Math.abs(vF) < 0.8 && inp.throttle > 0.5 && !(this.los && dist < 6)) this.stuck += dt
      else this.stuck = Math.max(0, this.stuck - dt * 2)
      if (this.stuck > 1.2) {
        this.reverse = 1.3
        this.stuck = 0
      }
    }
    v.siren = !this.leaving
  }
}

// ---------- on-foot officers ----------
export class CopFoot {
  readonly h: Humanoid
  x: number
  z: number
  heading = 0
  speed = 0
  hold = 0
  health = 100
  dead = false
  deadT = 0
  fireCd = 0.4 + Math.random()
  aiming = false
  los = false
  losT = 0
  private boxes: Box[] = []

  constructor(x: number, z: number) {
    this.x = x
    this.z = z
    this.h = createHumanoid({ shirt: 0x1b2a4a, pants: 0x141c2e, skin: 0xd9a577, hair: 0x2a2a30, outfit: 'police', hairStyle: 'short' })
    this.h.group.position.set(x, 0, z)
    setHumanoidWeapon(this.h, 'pistol')
  }

  update(dt: number, px: number, pz: number, grid: ColliderGrid, canSeeBoost: boolean): number {
    if (this.dead) {
      this.deadT += dt
      this.h.group.rotation.x = dampAngle(this.h.group.rotation.x, -Math.PI / 2, 9, dt)
      this.h.group.position.set(this.x, 0.2, this.z)
      return 999
    }
    const dx = px - this.x
    const dz = pz - this.z
    const d = Math.hypot(dx, dz)
    const top = canSeeBoost ? 6.4 : 5.2
    const want = d > 1.1 ? top * (this.aiming ? 0.55 : 1) : 0
    this.h.aimOn = this.aiming
    this.speed = damp(this.speed, want, 8, dt)
    if (d > 0.01) {
      this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 10, dt)
      this.x += (dx / d) * this.speed * dt
      this.z += (dz / d) * this.speed * dt
    }
    grid.query(this.x, this.z, 1, this.boxes)
    for (const b of this.boxes) {
      const hit = circleVsBox(this.x, this.z, 0.4, b)
      if (hit) {
        this.x += hit.nx * hit.depth
        this.z += hit.nz * hit.depth
      }
    }
    this.h.group.position.set(this.x, 0.16, this.z)
    this.h.group.rotation.y = this.heading
    animateHumanoid(this.h, dt, this.speed, false)
    return d
  }

  dispose(): void {
    this.h.group.removeFromParent()
  }
}

export function setCopShadows(c: CopFoot, near: boolean): void {
  setHumanoidShadows(c.h, near)
}

