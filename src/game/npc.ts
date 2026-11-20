// Pedestrians: sidewalk loops, crosswalk signals, idling on phones, fleeing traffic.
import * as THREE from 'three'
import { DISTRICT_PEDS, districtOf } from './districts'
import { animateHumanoid, createHumanoid, setHumanoidShadows, triggerAttack, type Humanoid, type HairStyle, type Outfit } from './humanoid'
import { CITY, bc, clamp, dampAngle, lightState, mulberry32, pick, timeToGreen } from './util'
import type { Vehicle } from './vehicle'

const SHIRTS = [0xd1495b, 0x00798c, 0xedae49, 0x66a182, 0x8d6a9f, 0xe9e9e9, 0x2e4057, 0xf4a259, 0x5b8e7d, 0xb23a48, 0x3d5a80]
const PANTS = [0x2b2d42, 0x3d405b, 0x4a4e69, 0x22223b, 0x5c4d3c, 0x1d3557, 0x6b705c]
const SKINS = [0xf1c9a5, 0xd9a577, 0xb07a52, 0x8a5a3c, 0x5e3b27]
const HAIR = [0x1c1410, 0x4a3020, 0x8a6a3a, 0xc9b27c, 0x777777, 0x2a2a30]
const STYLES: HairStyle[] = ['short', 'short', 'long', 'pony', 'cap', 'buzz', 'bald']

const SIGNS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
const idxOf = (sx: number, sz: number) => (sx < 0 ? (sz < 0 ? 0 : 3) : sz < 0 ? 1 : 2)

interface Node {
  i: number
  j: number
  c: number
}

type PedState = 'walk' | 'wait' | 'down' | 'flee' | 'idle' | 'dead' | 'fight'

export class Ped {
  h: Humanoid
  x = 0
  z = 0
  heading = 0
  node: Node
  target: Node
  tx = 0
  tz = 0
  speed: number
  crossing = false
  crossAxis: 'x' | 'z' = 'x'
  crossI = 0
  crossJ = 0
  waited = 0
  state: PedState = 'walk'
  timer = 0
  lat: number
  dirSign: number
  curSpeed = 0
  shadows = true
  fleeX = 0
  fleeZ = 0
  health = 60
  deadT = 0
  fightT = 0
  atkCd = 0

  constructor(rng: () => number, node: Node) {
    const industrial = districtOf(node.i, node.j) === 'industrial'
    const outfit: Outfit = industrial ? 'vest' : rng() < 0.2 ? 'jacket' : rng() < 0.1 ? 'suit' : 'casual'
    this.h = createHumanoid({
      shirt: pick(rng, SHIRTS),
      pants: pick(rng, PANTS),
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIR),
      hairStyle: pick(rng, STYLES),
      outfit,
      scale: 0.93 + rng() * 0.15,
    })
    this.node = node
    this.target = node
    this.speed = 1.3 + rng() * 1.1
    this.lat = (rng() - 0.5) * 3
    this.dirSign = rng() < 0.5 ? 1 : -1
    const p = this.cornerPos(node)
    this.x = p[0]
    this.z = p[1]
  }

  cornerPos(n: Node): [number, number] {
    const [sx, sz] = SIGNS[n.c]
    const e = CITY.B / 2 - 3 - this.lat * 0.5
    return [bc(n.i) + sx * e, bc(n.j) + sz * e]
  }
}

export interface PedHit {
  x: number
  z: number
  vehicle: Vehicle
}

export class PedSystem {
  peds: Ped[] = []
  hits: PedHit[] = []
  /** damage dealt to the player this frame by pedestrians who fight back */
  attacks: number[] = []
  deaths: { x: number; z: number }[] = []
  private rng = mulberry32(99)
  readonly group = new THREE.Group()

  constructor(count: number) {
    const weights: { i: number; j: number; w: number }[] = []
    let total = 0
    for (let i = 0; i < CITY.N; i++) {
      for (let j = 0; j < CITY.N; j++) {
        const w = DISTRICT_PEDS[districtOf(i, j)]
        total += w
        weights.push({ i, j, w })
      }
    }
    for (let k = 0; k < count; k++) {
      let r = this.rng() * total
      let cell = weights[0]
      for (const w of weights) {
        r -= w.w
        if (r <= 0) {
          cell = w
          break
        }
      }
      const node: Node = { i: cell.i, j: cell.j, c: Math.floor(this.rng() * 4) }
      const p = new Ped(this.rng, node)
      this.pickTarget(p)
      const t = this.rng()
      p.x += (p.tx - p.x) * t
      p.z += (p.tz - p.z) * t
      this.peds.push(p)
      this.group.add(p.h.group)
    }
  }

  private pickTarget(p: Ped): void {
    const n = p.node
    const r = this.rng()
    let next: Node | null = null
    let crossing = false
    const [sx, sz] = SIGNS[n.c]
    if (r < 0.3) {
      const xAxis = r < 0.15
      const ci = xAxis ? n.i + sx : n.i
      const cj = xAxis ? n.j : n.j + sz
      if (ci >= 0 && cj >= 0 && ci < CITY.N && cj < CITY.N) {
        next = { i: ci, j: cj, c: xAxis ? idxOf(-sx, sz) : idxOf(sx, -sz) }
        crossing = true
        // the intersection touching this corner, and the axis of cars we cross
        p.crossI = n.i + (sx > 0 ? 1 : 0)
        p.crossJ = n.j + (sz > 0 ? 1 : 0)
        p.crossAxis = xAxis ? 'z' : 'x'
      }
    }
    if (!next) {
      if (this.rng() < 0.12) p.dirSign = -p.dirSign
      next = { i: n.i, j: n.j, c: (n.c + (p.dirSign > 0 ? 1 : 3)) % 4 }
    }
    p.target = next
    p.crossing = crossing
    p.waited = 0
    const pos = p.cornerPos(next)
    p.tx = pos[0]
    p.tz = pos[1]
  }

  hitBy(p: Ped, v: Vehicle): void {
    if (p.state === 'down' || p.state === 'dead') return
    this.hits.push({ x: p.x, z: p.z, vehicle: v })
    p.health -= 20 + v.speed * 4
    if (p.health <= 0) this.kill(p)
    else {
      p.state = 'down'
      p.timer = 7
    }
  }

  /** deaths since the last call (for loot drops) */
  takeDeaths(): { x: number; z: number }[] {
    return this.deaths.splice(0)
  }

  kill(p: Ped): void {
    if (p.state === 'dead') return
    p.state = 'dead'
    p.health = 0
    p.deadT = 40
    p.h.pose = 'normal'
    this.deaths.push({ x: p.x, z: p.z })
  }

  /** returns true when this hit killed the pedestrian */
  damage(p: Ped, amount: number, head: boolean, fromX: number, fromZ: number): boolean {
    if (p.state === 'dead') return false
    p.health -= amount * (head ? 3 : 1)
    if (p.health <= 0) {
      this.kill(p)
      return true
    }
    if (p.state !== 'fight') this.scare(p, fromX, fromZ, 6)
    return false
  }

  private scare(p: Ped, fromX: number, fromZ: number, secs: number): void {
    p.state = 'flee'
    p.timer = secs + this.rng() * 3
    p.h.pose = 'normal'
    const dx = p.x - fromX
    const dz = p.z - fromZ
    const d = Math.hypot(dx, dz) || 1
    p.fleeX = dx / d
    p.fleeZ = dz / d
  }

  /** gunfire or violence nearby: everyone within `r` runs away */
  panic(x: number, z: number, r: number): void {
    for (const p of this.peds) {
      if (p.state === 'dead' || p.state === 'down' || p.state === 'fight') continue
      if (Math.hypot(p.x - x, p.z - z) > r) continue
      if (p.state === 'flee' && p.timer > 3) continue
      this.scare(p, x, z, 5)
    }
  }

  /** a punched pedestrian may fight back, or run */
  provoke(p: Ped, fromX: number, fromZ: number): void {
    if (p.state === 'dead' || p.state === 'fight') return
    if (this.rng() < 0.5) {
      p.state = 'fight'
      p.fightT = 14
      p.atkCd = 0.5
      p.h.pose = 'normal'
    } else this.scare(p, fromX, fromZ, 6)
  }

  knock(p: Ped, secs: number): void {
    if (p.state === 'dead') return
    p.state = 'down'
    p.timer = secs
  }

  private respawn(p: Ped): void {
    p.node = { i: Math.floor(this.rng() * CITY.N), j: Math.floor(this.rng() * CITY.N), c: Math.floor(this.rng() * 4) }
    const pos = p.cornerPos(p.node)
    p.x = pos[0]
    p.z = pos[1]
    p.health = 60
    p.state = 'walk'
    p.h.group.rotation.x = 0
    this.pickTarget(p)
  }

  update(dt: number, time: number, px: number, pz: number, vehicles: Vehicle[]): void {
    this.hits.length = 0
    this.attacks.length = 0
    for (const p of this.peds) {
      const dxp = p.x - px
      const dzp = p.z - pz
      const d2 = dxp * dxp + dzp * dzp
      const far = d2 > 180 * 180
      p.h.group.visible = !far
      if (far) continue
      const near = d2 < 45 * 45
      if (near !== p.shadows) {
        p.shadows = near
        setHumanoidShadows(p.h, near)
      }

      if (p.state === 'dead') {
        p.deadT -= dt
        p.h.group.rotation.x = dampAngle(p.h.group.rotation.x, -Math.PI / 2, 9, dt)
        p.h.group.position.set(p.x, 0.2, p.z)
        if (p.deadT <= 0) this.respawn(p)
        continue
      }

      if (p.state === 'down') {
        p.timer -= dt
        p.h.group.rotation.x = dampAngle(p.h.group.rotation.x, -Math.PI / 2, 10, dt)
        p.h.group.position.set(p.x, 0.2, p.z)
        if (p.timer <= 0) {
          p.state = 'walk'
          p.h.group.rotation.x = 0
        }
        continue
      }

      if (p.state === 'fight') {
        p.fightT -= dt
        p.atkCd -= dt
        const fx = px - p.x
        const fz = pz - p.z
        const fd = Math.hypot(fx, fz)
        if (p.fightT <= 0 || fd > 45) {
          p.state = 'walk'
          continue
        }
        p.heading = dampAngle(p.heading, Math.atan2(fx, fz), 12, dt)
        let sp = 0
        if (fd > 1.3) {
          sp = 4.8
          p.x += (fx / fd) * sp * dt
          p.z += (fz / fd) * sp * dt
        } else if (p.atkCd <= 0) {
          p.atkCd = 1.0
          triggerAttack(p.h, 'punch')
          this.attacks.push(6)
        }
        p.h.group.position.set(p.x, 0.16, p.z)
        p.h.group.rotation.y = p.heading
        animateHumanoid(p.h, dt, sp, false)
        continue
      }

      // danger: a fast car heading at us
      if (p.state !== 'flee') {
        for (const v of vehicles) {
          const sp = v.speed
          if (sp < 7) continue
          const rx = p.x - v.x
          const rz = p.z - v.z
          if (Math.abs(rx) > 9 || Math.abs(rz) > 9) continue
          const along = rx * v.fx + rz * v.fz
          const lat = rx * v.fz - rz * v.fx
          if (along > 0 && along < 9 && Math.abs(lat) < 3.2) {
            p.state = 'flee'
            p.timer = 2.2
            const s = lat >= 0 ? 1 : -1
            p.fleeX = v.fz * s
            p.fleeZ = -v.fx * s
            break
          }
        }
      }

      if (p.state === 'flee') {
        p.timer -= dt
        p.x += p.fleeX * 5.4 * dt
        p.z += p.fleeZ * 5.4 * dt
        p.heading = dampAngle(p.heading, Math.atan2(p.fleeX, p.fleeZ), 12, dt)
        p.h.group.position.set(p.x, 0.16, p.z)
        p.h.group.rotation.y = p.heading
        animateHumanoid(p.h, dt, 5.4, false)
        if (p.timer <= 0) p.state = 'walk'
        continue
      }

      if (p.state === 'idle') {
        p.timer -= dt
        p.h.group.position.set(p.x, 0.16, p.z)
        animateHumanoid(p.h, dt, 0, false)
        if (p.timer <= 0) {
          p.state = 'walk'
          p.h.pose = 'normal'
        }
        continue
      }

      if (p.state === 'wait') {
        p.timer -= dt
        p.waited += dt
        animateHumanoid(p.h, dt, 0, false)
        if (p.timer <= 0) p.state = 'walk'
        continue
      }

      let dx = p.tx - p.x
      let dz = p.tz - p.z
      let d = Math.hypot(dx, dz)
      if (d < 0.8) {
        p.node = p.target
        this.pickTarget(p)
        dx = p.tx - p.x
        dz = p.tz - p.z
        d = Math.hypot(dx, dz)
        if (!p.crossing && this.rng() < 0.1) {
          p.state = 'idle'
          p.timer = 4 + this.rng() * 6
          {
            const q = this.rng()
            p.h.pose = q < 0.45 ? 'phone' : q < 0.75 ? 'talk' : 'normal'
          }
          continue
        }
      }
      // wait for the walk signal (cars on the road we cross are red) before stepping off the kerb
      if (p.crossing && p.state === 'walk') {
        const cornerPos = p.cornerPos(p.node)
        const atCorner = Math.hypot(p.x - cornerPos[0], p.z - cornerPos[1]) < 1.5
        if (atCorner) {
          const st = lightState(p.crossAxis, time, p.crossI, p.crossJ)
          const ok = st === 'red' && timeToGreen(p.crossAxis, time, p.crossI, p.crossJ) >= 9
          if (!ok && p.waited < 30) {
            p.state = 'wait'
            p.timer = 0.6
            continue
          }
        }
      }
      let sp = p.crossing ? p.speed * 1.35 : p.speed
      if (p.crossing && vehicles.some((v) => v.speed > 4 && Math.hypot(v.x - p.x, v.z - p.z) < 10)) sp *= 1.6
      p.curSpeed = clamp(sp, 0, 3.4)
      if (d > 0.001) {
        p.x += (dx / d) * p.curSpeed * dt
        p.z += (dz / d) * p.curSpeed * dt
        p.heading = dampAngle(p.heading, Math.atan2(dx, dz), 8, dt)
      }
      p.h.group.position.set(p.x, 0.16, p.z)
      p.h.group.rotation.y = p.heading
      animateHumanoid(p.h, dt, p.curSpeed, false)
    }
    // run-over detection
    for (const v of vehicles) {
      if (v.speed < 3.5) continue
      const fx = v.fx
      const fz = v.fz
      for (const p of this.peds) {
        if (p.state === 'down' || p.state === 'dead') continue
        const rx = p.x - v.x
        const rz = p.z - v.z
        if (Math.abs(rx) > 6 || Math.abs(rz) > 6) continue
        const along = rx * fx + rz * fz
        const lat = rx * fz - rz * fx
        if (Math.abs(along) < v.spec.length / 2 + 0.3 && Math.abs(lat) < v.spec.width / 2 + 0.3) {
          this.hitBy(p, v)
          p.x += v.vx * 0.05
          p.z += v.vz * 0.05
        }
      }
    }
  }
}
