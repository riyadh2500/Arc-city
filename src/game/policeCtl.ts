// Police controller: sight, dispatch, pursuit management, officers on foot, busting.
import * as THREE from 'three'
import type { Fleet, PlayerState } from './fleet'
import { fireFlash } from './humanoid'
import { CopFoot, WantedSystem, lineOfSight, setCopShadows } from './police'
import type { ColliderGrid } from './util'

const TARGET_CARS = [0, 2, 3, 4, 5, 6]
const PATROLS = 3

export interface CopShot {
  x: number
  z: number
  tx: number
  tz: number
  hit: boolean
}

export interface PoliceResult {
  shots: CopShot[]
  busted: boolean
  cleared: boolean
  escalated: boolean
}

export class PoliceController {
  wanted = new WantedSystem()
  foot: CopFoot[] = []
  private bust = 0
  private spawnT = 3
  private sightT = 0
  private seen = false
  private patrolT = 6
  readonly group = new THREE.Group()

  constructor(
    private fleet: Fleet,
    private grid: ColliderGrid,
  ) {}

  crime(points: number): boolean {
    return this.wanted.addCrime(points)
  }

  reset(): void {
    this.wanted.clear()
    for (const c of this.foot) c.dispose()
    this.foot = []
    this.bust = 0
    for (const p of [...this.fleet.pursuits]) p.leaving = true
  }

  /** nearest cop distance (for HUD / audio) */
  get copCount(): number {
    return this.fleet.pursuits.length + this.foot.length
  }

  update(dt: number, p: PlayerState, hidden: boolean, night: number): PoliceResult {
    const res: PoliceResult = { shots: [], busted: false, cleared: false, escalated: false }
    const w = this.wanted
    const range = 60 - night * 12

    // --- sight (cheap, 4x per second) ---
    this.sightT -= dt
    if (this.sightT <= 0) {
      this.sightT = 0.25
      let seen = false
      if (!hidden) {
        for (const v of this.fleet.vehicles) {
          if (v.role !== 'police' || v.driver === 'player') continue
          if (v.driver === 'none' && !v.siren) continue
          const dist = Math.hypot(v.x - p.x, v.z - p.z)
          if (dist < 28 || (dist < range && lineOfSight(this.grid, v.x, v.z, p.x, p.z))) {
            seen = true
            break
          }
        }
        if (!seen) {
          for (const c of this.foot) {
            const d = Math.hypot(c.x - p.x, c.z - p.z)
            if (d < 28 || (d < 45 && lineOfSight(this.grid, c.x, c.z, p.x, p.z))) {
              seen = true
              break
            }
          }
        }
      }
      this.seen = seen
    }
    if (w.update(dt, this.seen)) {
      res.cleared = true
      this.reset()
      return res
    }

    // --- dispatch ---
    if (w.level > 0) {
      const want = TARGET_CARS[w.level]
      // recruit patrol cars first
      if (this.fleet.pursuits.length < want) {
        for (const v of this.fleet.vehicles) {
          if (this.fleet.pursuits.length >= want) break
          if (v.role === 'police' && v.driver === 'ai' && !v.siren && Math.hypot(v.x - p.x, v.z - p.z) < 320) {
            this.fleet.startPursuit(v)
          }
        }
      }
      this.spawnT -= dt
      if (this.fleet.pursuits.length < want && this.spawnT <= 0) {
        this.spawnT = 2.5
        const v = this.fleet.spawnTraffic(p, 80, undefined, 'police', 170)
        if (v) this.fleet.startPursuit(v)
      }
      for (const pu of this.fleet.pursuits) pu.leaving = false
    } else {
      // calm: pursuit cars drive off and vanish once far away
      for (const pu of [...this.fleet.pursuits]) {
        pu.leaving = true
        pu.v.siren = false
        if (Math.hypot(pu.v.x - p.x, pu.v.z - p.z) > 170) this.fleet.remove(pu.v)
      }
      this.patrolT -= dt
      if (this.patrolT <= 0) {
        this.patrolT = 6
        const patrols = this.fleet.drivers.filter((d) => d.v.role === 'police').length
        if (patrols < PATROLS) this.fleet.spawnTraffic(p, 140, undefined, 'police')
      }
    }

    // --- officers get out when the chase catches up ---
    if (w.level > 0) {
      const slow = p.vehicle ? p.vehicle.speed < 3 : true
      for (const pu of [...this.fleet.pursuits]) {
        const d = Math.hypot(pu.v.x - p.x, pu.v.z - p.z)
        if (d < 18 && slow && this.foot.length < 4 + w.level) {
          const v = pu.v
          const lx = Math.cos(v.heading)
          const lz = -Math.sin(v.heading)
          this.fleet.park(v)
          const c = new CopFoot(v.x + lx * 2, v.z + lz * 2)
          this.foot.push(c)
          this.group.add(c.h.group)
        }
      }
    }

    // --- foot officers + busting ---
    let touching = false
    for (const c of [...this.foot]) {
      const d = c.update(dt, p.x, p.z, this.grid, w.level >= 3)
      if (c.dead) {
        if (c.deadT > 10) {
          c.dispose()
          this.foot = this.foot.filter((o) => o !== c)
        }
        continue
      }
      setCopShadows(c, d < 40)
      c.losT -= dt
      if (c.losT <= 0) {
        c.losT = 0.3
        c.los = d < 40 && lineOfSight(this.grid, c.x, c.z, p.x, p.z)
      }
      c.aiming = false
      if (w.level >= 2 && d > 3 && d < 38 && c.los) {
        c.aiming = true
        c.fireCd -= dt
        if (c.fireCd <= 0) {
          c.fireCd = 0.9 + Math.random() * 0.7
          res.shots.push({ x: c.x, z: c.z, tx: p.x, tz: p.z, hit: Math.random() < (w.level >= 4 ? 0.4 : 0.28) })
          fireFlash(c.h)
        }
      }
      const reach = p.vehicle ? 3.4 : 1.5
      if (d < reach) touching = true
      if (w.level === 0 || d > 140) {
        c.dispose()
        this.foot = this.foot.filter((o) => o !== c)
      }
    }
    if (w.level > 0) {
      let boxed = false
      if (p.vehicle) {
        const sp = p.vehicle.speed
        const copsClose = this.fleet.vehicles.filter((v) => v.role === 'police' && v.driver !== 'player' && Math.hypot(v.x - p.x, v.z - p.z) < 7.5).length
        boxed = sp < 3.5 && copsClose >= 1 && (touching || copsClose >= 2)
      }
      if (touching && (!p.vehicle || p.vehicle.speed < 3.5)) boxed = true
      if (boxed) this.bust += dt
      else this.bust = Math.max(0, this.bust - dt * 1.5)
      if (this.bust > (p.vehicle ? 2.2 : 1.3)) {
        res.busted = true
        this.bust = 0
      }
    } else this.bust = 0
    return res
  }

  /** returns true when the officer was killed by this hit */
  damageCop(c: CopFoot, amount: number, head: boolean): boolean {
    if (c.dead) return false
    c.health -= amount * (head ? 3 : 1)
    if (c.health <= 0) {
      c.dead = true
      c.deadT = 0
      c.aiming = false
      c.h.aimOn = false
      return true
    }
    return false
  }

  get bustProgress(): number {
    return Math.min(1, this.bust / 2)
  }
}

