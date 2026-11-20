// Lane-following traffic AI: lights, yielding, indicators, sirens, district speed limits.
import { DISTRICT_SPEED, districtAt } from './districts'
import { CITY, ColliderGrid, clamp, lightState, rl, wrapAngle } from './util'
import type { Vehicle } from './vehicle'

type Axis = 'x' | 'z'
interface WP {
  x: number
  z: number
  entry?: { i: number; j: number; axis: Axis }
  signal?: number
}

function lanePoint(axis: Axis, dir: number, line: number, along: number): [number, number] {
  const off = CITY.LANE
  if (axis === 'x') return [along, rl(line) + (dir > 0 ? off : -off)]
  return [rl(line) + (dir > 0 ? -off : off), along]
}

export interface Obstacle {
  x: number
  z: number
}

export interface DriveCtx {
  time: number
  dt: number
  vehicles: Vehicle[]
  peds: Obstacle[]
  sirens: Vehicle[]
  grid: ColliderGrid
  player: { x: number; z: number; vx: number; vz: number; vehicle: Vehicle | null }
}

export class TrafficDriver {
  axis: Axis
  dir: number
  line: number
  next: number
  queue: WP[] = []
  cruise: number
  stuck = 0
  private rng: () => number
  private shift = 0
  private panic = 0
  private blockedFor = 0
  private signalOff = 0

  constructor(public v: Vehicle, axis: Axis, dir: number, line: number, next: number, rng: () => number) {
    this.axis = axis
    this.dir = dir
    this.line = line
    this.next = next
    this.rng = rng
    this.cruise = 9 + rng() * 5
  }

  private plan(): void {
    const R = CITY.R
    const { axis, dir, line, next } = this
    const N = CITY.N
    const c = rl(next)
    const entry = lanePoint(axis, dir, line, c - dir * (R / 2 + 1))
    const opts: { kind: 'straight' | 'turn'; cd: number }[] = []
    if (next + dir >= 0 && next + dir <= N) opts.push({ kind: 'straight', cd: 0 }, { kind: 'straight', cd: 0 })
    for (const cd of [-1, 1]) if (line + cd >= 0 && line + cd <= N) opts.push({ kind: 'turn', cd })
    let pick = opts[Math.floor(this.rng() * opts.length)]
    if (!pick) pick = { kind: 'turn', cd: line > 0 ? -1 : 1 }
    const ij = axis === 'x' ? { i: next, j: line } : { i: line, j: next }
    let signal = 0
    if (pick.kind === 'turn') {
      const ox = axis === 'x' ? dir : 0
      const oz = axis === 'z' ? dir : 0
      const nx = axis === 'z' ? pick.cd : 0
      const nz = axis === 'x' ? pick.cd : 0
      const heading = Math.atan2(ox, oz)
      const leftDot = nx * Math.cos(heading) + nz * -Math.sin(heading)
      signal = leftDot > 0 ? 1 : -1
    }
    this.queue.push({ x: entry[0], z: entry[1], entry: { ...ij, axis }, signal })
    if (pick.kind === 'straight') {
      const exit = lanePoint(axis, dir, line, c + dir * (R / 2 + 1))
      this.queue.push({ x: (entry[0] + exit[0]) / 2, z: (entry[1] + exit[1]) / 2 }, { x: exit[0], z: exit[1] })
      this.next = next + dir
    } else {
      const a2: Axis = axis === 'x' ? 'z' : 'x'
      const exit = lanePoint(a2, pick.cd, next, rl(line) + pick.cd * (R / 2 + 1))
      const ctrl: [number, number] = axis === 'x' ? [exit[0], entry[1]] : [entry[0], exit[1]]
      for (let t = 1; t <= 6; t++) {
        const u = t / 6
        const w0 = (1 - u) * (1 - u)
        const w1 = 2 * u * (1 - u)
        const w2 = u * u
        this.queue.push({ x: w0 * entry[0] + w1 * ctrl[0] + w2 * exit[0], z: w0 * entry[1] + w1 * ctrl[1] + w2 * exit[1] })
      }
      const oldLine = this.line
      this.axis = a2
      this.dir = pick.cd
      this.line = next
      this.next = oldLine + pick.cd
    }
  }

  drive(ctx: DriveCtx): void {
    const { time, dt } = ctx
    const v = this.v
    if (this.queue.length === 0) this.plan()
    let wp = this.queue[0]
    const dx0 = wp.x - v.x
    const dz0 = wp.z - v.z
    if (dx0 * dx0 + dz0 * dz0 < 3.5 * 3.5) {
      this.queue.shift()
      if (this.queue.length === 0) this.plan()
      wp = this.queue[0]
    }
    this.panic = Math.max(0, this.panic - dt)
    if (v.hit > 6) this.panic = 4
    const fx = v.fx
    const fz = v.fz

    // siren yield: drift right and slow down when an emergency vehicle is behind
    let yieldTo = false
    for (const s of ctx.sirens) {
      if (s === v) continue
      const rx = s.x - v.x
      const rz = s.z - v.z
      const along = rx * fx + rz * fz
      if (along < 4 && along > -55 && Math.abs(rx * fz - rz * fx) < 9) {
        yieldTo = true
        break
      }
    }
    this.shift += ((yieldTo ? 1.7 : 0) - this.shift) * clamp(dt * 1.5, 0, 1)

    const tgt = this.queue.length > 1 && wp.entry === undefined ? this.queue[1] : wp
    const rightX = -fz
    const rightZ = fx
    const dx = tgt.x + rightX * this.shift - v.x
    const dz = tgt.z + rightZ * this.shift - v.z
    const err = wrapAngle(Math.atan2(dx, dz) - v.heading)
    const steer = clamp(err * 2.2, -1, 1)

    const limit = DISTRICT_SPEED[districtAt(v.x, v.z)]
    let desired = this.cruise * limit * (this.panic > 0 ? 1.35 : 1) * (Math.abs(err) > 0.35 ? 0.55 : 1)
    if (this.queue[0].entry === undefined && this.queue.length < 8) desired = Math.min(desired, 6.5)
    if (yieldTo) desired = Math.min(desired, 4.5)

    // indicators
    const e = this.queue[0].entry
    let signal = 0
    if (e) {
      const dist = Math.hypot(this.queue[0].x - v.x, this.queue[0].z - v.z)
      if (dist < 32) signal = this.queue[0].signal ?? 0
    } else if (this.queue.length > 1 && this.queue.length < 8) signal = this.signalOff
    if (signal !== 0) this.signalOff = signal
    else if (e) this.signalOff = 0
    v.blinker = signal

    let stopForLight = false
    if (e) {
      const st = lightState(e.axis, time, e.i, e.j)
      const dist = Math.hypot(this.queue[0].x - v.x, this.queue[0].z - v.z)
      const stopFor = st === 'red' || (st === 'yellow' && dist > 9)
      if (stopFor && dist < 40) {
        desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 4 * (dist - 5))))
        stopForLight = true
      }
      // don't enter a box blocked by crossing or stopped cars
      if (!stopFor && dist < 20) {
        const cx = rl(e.i)
        const cz = rl(e.j)
        for (const o of ctx.vehicles) {
          if (o === v) continue
          if (Math.abs(o.x - cx) < CITY.R / 2 + 1 && Math.abs(o.z - cz) < CITY.R / 2 + 1) {
            const crossing = Math.abs(o.fx * fx + o.fz * fz) < 0.7
            if ((crossing && o.speed > 1) || o.speed < 0.6) {
              desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 5 * (dist - 6))))
              break
            }
          }
        }
      }
    }

    // obstacles ahead (vehicles, pedestrians, the player on foot)
    let gap = 99
    let gapIsPlayer = false
    for (const o of ctx.vehicles) {
      if (o === v) continue
      const rx = o.x - v.x
      const rz = o.z - v.z
      const along = rx * fx + rz * fz
      if (along < 0 || along > 26) continue
      const lat = Math.abs(rx * fz - rz * fx)
      if (lat < 2.4 && along < gap) {
        gap = along
        gapIsPlayer = o.driver === 'player'
      }
    }
    for (const p of ctx.peds) {
      const rx = p.x - v.x
      const rz = p.z - v.z
      const along = rx * fx + rz * fz
      if (along < 0 || along > 20) continue
      if (Math.abs(rx * fz - rz * fx) < 2.2 && along < gap) {
        gap = along
        gapIsPlayer = false
      }
    }
    if (gap < 26) desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 5 * (gap - 6.5))))

    const vF = v.speedF
    const inp = v.input
    inp.steer = steer
    inp.handbrake = false
    if (vF < desired - 0.3) {
      inp.throttle = clamp((desired - vF) * 0.6, 0, 0.8)
      inp.brake = 0
    } else if (vF > desired + 0.8) {
      inp.throttle = 0
      inp.brake = clamp((vF - desired) * 0.35, 0.1, 1)
    } else {
      inp.throttle = 0.08
      inp.brake = 0
    }
    if (desired < 0.5 && vF < 0.5) inp.brake = 0.3

    // honking: blocked by the player (or anything) for a while at a green light
    if (Math.abs(vF) < 0.5 && gap < 9 && !stopForLight) this.blockedFor += dt
    else this.blockedFor = Math.max(0, this.blockedFor - dt * 2)
    if (this.blockedFor > 3 && gapIsPlayer) {
      v.honk = 0.6
      this.blockedFor = 1.2
    }

    if (Math.abs(vF) < 0.4 && desired > 3) this.stuck += dt
    else this.stuck = Math.max(0, this.stuck - dt)
  }
}
