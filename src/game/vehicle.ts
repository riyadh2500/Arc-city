// Drivable cars: arcade-realistic physics on top of the detailed car rig.
import * as THREE from 'three'
import { buildCar, CAR_SPECS, type CarRig, type CarSpec, type CarType } from './carModels'
import { createHumanoid, seatHumanoid, setHumanoidShadows, type Humanoid, type HumanoidOpts } from './humanoid'
import { ColliderGrid, type Box, circleVsBox, clamp, lerp } from './util'

const SCORCH = new THREE.Color(0x1a1613)
const DRIVER_SHIRTS = [0x2e4057, 0x8d3b3b, 0x4a6d5a, 0x555555, 0xb08a3a, 0x3d5a80]
const DRIVER_SKINS = [0xe0b08a, 0xb98660, 0x8a5a3c, 0xf1c9a5, 0x5e3b27]

export interface VehicleInput {
  throttle: number
  brake: number
  steer: number // +1 = left
  handbrake: boolean
}

export class Vehicle {
  readonly mesh: THREE.Group
  readonly rig: CarRig
  readonly spec: CarSpec
  readonly type: CarType
  readonly paint: THREE.MeshStandardMaterial

  x = 0
  z = 0
  heading = 0
  vx = 0
  vz = 0
  yawRate = 0
  steerAngle = 0
  health = 100
  input: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false }
  driver: 'none' | 'player' | 'ai' = 'none'
  role: 'civilian' | 'police' = 'civilian'
  siren = false
  /** -1 right, +1 left, 0 off */
  blinker = 0
  hazard = false
  honk = 0
  /** forward speed (m/s), updated each step */
  speedF = 0
  slip = 0
  rpm = 900
  gear = 1
  private accelSmooth = 0
  private wheelAngle = 0
  private prevVF = 0
  private doorOpen = 0
  private doorTarget = 0
  private bob = 0
  hit = 0
  private lightPhase = Math.random() * 10
  burning = false
  burnT = 0
  burnt = false
  /** car alarm countdown (seconds); hazards flash while it runs */
  alarmT = 0
  private baseCol = new THREE.Color()
  private lastHealth = 100
  private pitch = 0
  private pitchV = 0
  private roll = 0
  private rollV = 0
  private heave = 0
  private heaveV = 0
  private driverHum: Humanoid | null = null
  private driverOpts: HumanoidOpts | null = null

  constructor(type: string, color: number) {
    this.type = (type in CAR_SPECS ? type : 'sedan') as CarType
    this.spec = CAR_SPECS[this.type]
    this.rig = buildCar(this.type, color)
    this.mesh = this.rig.root
    this.paint = this.rig.paint
    if (this.type === 'police') this.role = 'police'
    this.baseCol.copy(this.paint.color)
  }

  get fx(): number {
    return Math.sin(this.heading)
  }
  get fz(): number {
    return Math.cos(this.heading)
  }
  get speed(): number {
    return Math.hypot(this.vx, this.vz)
  }
  get maxSpeed(): number {
    if (this.burnt) return 0
    return this.spec.maxSpeed * (this.health <= 0 ? 0.4 : this.health < 25 ? 0.75 : 1)
  }

  setPose(x: number, z: number, heading: number): void {
    this.x = x
    this.z = z
    this.heading = heading
    this.vx = 0
    this.vz = 0
    this.yawRate = 0
    this.syncMesh()
  }

  setColor(c: number): void {
    if (this.role !== 'police') {
      this.paint.color.setHex(c)
      this.baseCol.setHex(c)
      this.lastHealth = -1
    }
  }

  openDoor(open: boolean): void {
    this.doorTarget = open ? 1 : 0
  }

  /** Parked cars get a dull, dusty finish. a in [0,1]. */
  weather(a: number): void {
    this.paint.roughness = 0.3 + a * 0.3
    const p = this.paint as THREE.MeshPhysicalMaterial
    if ('clearcoat' in p) p.clearcoat = 1 - a * 0.7
  }

  /** Burnt-out wreck: black, dull, undrivable. */
  wreck(): void {
    this.burnt = true
    this.burning = false
    this.health = 0
    this.paint.color.setHex(0x141414)
    this.paint.roughness = 0.95
    this.paint.metalness = 0.2
    const p = this.paint as THREE.MeshPhysicalMaterial
    if ('clearcoat' in p) p.clearcoat = 0
    this.alarmT = 0
    this.hazard = false
    this.lastHealth = 0
  }

  damage(amount: number): void {
    this.health = Math.max(0, this.health - amount)
  }

  update(dt: number): void {
    const s = this.spec
    const inp = this.input
    const max = this.maxSpeed
    this.heading += this.yawRate * dt
    const fx = Math.sin(this.heading)
    const fz = Math.cos(this.heading)
    const lx = Math.cos(this.heading)
    const lz = -Math.sin(this.heading)
    let vF = this.vx * fx + this.vz * fz
    let vL = this.vx * lx + this.vz * lz

    let a = 0
    if (inp.throttle > 0) {
      if (vF >= -0.5) a += s.accel * inp.throttle * (1 - Math.pow(clamp(vF / max, 0, 1), 2))
      else a += s.brake * inp.throttle
    }
    if (inp.brake > 0) {
      if (vF > 0.8) a -= s.brake * inp.brake
      else a -= s.accel * 0.55 * inp.brake * (1 - clamp(-vF / (max * 0.25), 0, 1))
    }
    const idle = inp.throttle === 0 && inp.brake === 0
    if (inp.handbrake && Math.abs(vF) > 0.3) a -= Math.sign(vF) * s.brake * 0.55
    a -= vF * 0.1 + Math.sign(vF) * vF * vF * 0.0011
    if (idle && Math.abs(vF) < 0.6) vF = lerp(vF, 0, clamp(dt * 6, 0, 1))
    else vF += a * dt

    const grip = inp.handbrake ? s.grip * 0.1 : s.grip
    vL *= Math.exp(-grip * dt)

    const lock = lerp(0.62, 0.1, clamp(Math.abs(vF) / (max * 0.7), 0, 1))
    const target = inp.steer * lock
    this.steerAngle += (target - this.steerAngle) * clamp(dt * 9, 0, 1)
    let targetYaw = (vF / s.wheelBase) * Math.tan(this.steerAngle)
    if (inp.handbrake) targetYaw *= 1.45
    targetYaw = clamp(targetYaw, -2.2, 2.2)
    this.yawRate += (targetYaw - this.yawRate) * clamp(dt * 7, 0, 1)

    this.vx = fx * vF + lx * vL
    this.vz = fz * vF + lz * vL
    this.x += this.vx * dt
    this.z += this.vz * dt
    this.speedF = vF
    this.slip = Math.abs(vL)

    // engine model for audio: pick a gear from speed, derive rpm
    const sp = Math.abs(vF)
    const gearTop = [0, 9, 17, 26, 36, 60]
    let g = 1
    while (g < 5 && sp > gearTop[g] * (max / 40)) g++
    this.gear = g
    const lo = (gearTop[g - 1] * max) / 40
    const hi = (gearTop[g] * max) / 40
    const targetRpm = 1000 + clamp((sp - lo) / Math.max(1, hi - lo), 0, 1) * 5200 + inp.throttle * 400
    this.rpm += (targetRpm - this.rpm) * clamp(dt * 8, 0, 1)

    this.accelSmooth = lerp(this.accelSmooth, (vF - this.prevVF) / Math.max(dt, 1e-4), clamp(dt * 6, 0, 1))
    this.prevVF = vF
    // spring-damper chassis: pitch under accel/brake, roll in corners, heave on impacts
    const pT = clamp(-this.accelSmooth * 0.0045, -0.07, 0.07)
    const rT = clamp(this.yawRate * vF * 0.0075, -0.1, 0.1)
    this.pitchV += ((pT - this.pitch) * 90 - this.pitchV * 9) * dt
    this.pitch += this.pitchV * dt
    this.rollV += ((rT - this.roll) * 90 - this.rollV * 9) * dt
    this.roll += this.rollV * dt
    this.heaveV += (-this.heave * 120 - this.heaveV * 10) * dt
    this.heave += this.heaveV * dt
    this.wheelAngle += (vF / s.wheelR) * dt
    this.hit = Math.max(0, this.hit - dt * 4)
  }

  circles(out: { x: number; z: number; r: number }[]): number {
    const fx = Math.sin(this.heading)
    const fz = Math.cos(this.heading)
    const off = this.spec.length / 2 - this.spec.width / 2
    const r = this.spec.width / 2 + 0.05
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * off
      const c = out[i] ?? (out[i] = { x: 0, z: 0, r })
      c.x = this.x + fx * o
      c.z = this.z + fz * o
      c.r = r
    }
    return 3
  }

  private tmpCircles: { x: number; z: number; r: number }[] = []
  private tmpBoxes: Box[] = []

  /** Resolve against static colliders; returns impact speed. */
  collideStatic(grid: ColliderGrid): number {
    this.circles(this.tmpCircles)
    let impact = 0
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.tmpCircles) {
        grid.query(c.x, c.z, c.r + 1, this.tmpBoxes)
        for (const b of this.tmpBoxes) {
          const hit = circleVsBox(c.x, c.z, c.r, b)
          if (!hit) continue
          this.x += hit.nx * hit.depth
          this.z += hit.nz * hit.depth
          c.x += hit.nx * hit.depth
          c.z += hit.nz * hit.depth
          const vn = this.vx * hit.nx + this.vz * hit.nz
          if (vn < 0) {
            impact = Math.max(impact, -vn)
            this.vx -= vn * hit.nx * 1.35
            this.vz -= vn * hit.nz * 1.35
            this.vx *= 0.92
            this.vz *= 0.92
            const fx = Math.sin(this.heading)
            const fz = Math.cos(this.heading)
            const side = (c.x - this.x) * fz - (c.z - this.z) * fx
            this.yawRate += clamp(side * vn * 0.05, -0.8, 0.8)
          }
        }
      }
    }
    if (impact > 0.5) {
      this.hit = Math.max(this.hit, impact)
      this.heaveV -= Math.min(impact * 0.05, 0.5)
      this.rollV += (Math.random() - 0.5) * impact * 0.12
      this.pitchV += (Math.random() - 0.5) * impact * 0.08
    }
    if (impact > 4) this.damage(impact * 1.6)
    return impact
  }

  /** world position of a point in the car's local frame */
  worldPoint(lx: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    const fx = Math.sin(this.heading)
    const fz = Math.cos(this.heading)
    return out.set(this.x + fx * lz + Math.cos(this.heading) * lx, 0, this.z + fz * lz - Math.sin(this.heading) * lx)
  }

  syncMesh(): void {
    this.mesh.position.set(this.x, 0, this.z)
    this.mesh.rotation.y = this.heading
    const r = this.rig
    r.body.rotation.x = this.pitch
    r.body.rotation.z = this.roll
    r.body.position.y = this.bob + this.heave
    for (const p of r.front) p.rotation.y = this.steerAngle
    for (const w of r.spins) w.rotation.x = this.wheelAngle
    r.steering.rotation.z = this.steerAngle * 3.2
  }

  /** per-frame visual state: lights, siren, door, driver. Cheap; call for nearby cars. */
  visuals(dt: number, time: number, night: number): void {
    const r = this.rig
    const braking = this.input.brake > 0.3 && this.speedF > 0.5
    const reversing = this.speedF < -0.5
    const engineOn = (this.driver !== 'none' || this.siren) && !this.burnt
    const on = night > 0.35 && engineOn
    r.head.emissiveIntensity = on ? 2.4 : 0.1
    r.tail.emissiveIntensity = engineOn && (braking || this.input.handbrake) ? 2.8 : on ? 1.0 : 0.15
    if (!this.burnt && Math.abs(this.lastHealth - this.health) > 0.5) {
      this.lastHealth = this.health
      this.paint.color.copy(this.baseCol).lerp(SCORCH, (1 - clamp(this.health / 100, 0, 1)) * 0.55)
    }
    r.reverse.emissiveIntensity = reversing ? 2.2 : 0
    const blink = Math.floor(time * 2.6 + this.lightPhase) % 2 === 0
    const bl = (this.blinker > 0 || this.hazard) && blink
    const br = (this.blinker < 0 || this.hazard) && blink
    r.blinkL.emissiveIntensity = bl ? 3 : 0.05
    r.blinkR.emissiveIntensity = br ? 3 : 0.05
    if (r.barA && r.barB) {
      const flash = this.siren ? Math.floor(time * 7 + this.lightPhase) % 2 : -1
      r.barA.emissiveIntensity = flash === 0 ? 5 : 0.15
      r.barB.emissiveIntensity = flash === 1 ? 5 : 0.15
    }
    r.glows[0].visible = r.glows[2].visible = on
    r.glows[1].visible = r.glows[3].visible = on && (braking || night > 0.6)
    const occupied = this.driver !== 'none'
    if (occupied && !this.driverHum) this.makeDriver()
    r.driver.visible = occupied
    if (occupied && this.driverHum) seatHumanoid(this.driverHum, clamp(this.steerAngle / 0.5, -1, 1), dt)
    this.doorOpen += (this.doorTarget - this.doorOpen) * clamp(dt * 9, 0, 1)
    r.door.rotation.y = -this.doorOpen * 1.0
    // chassis bob from road/engine vibration + speed
    const sp = clamp(this.speed / 30, 0, 1)
    this.bob = Math.sin(time * 38 + this.lightPhase) * 0.004 * (0.3 + sp) + (this.health < 30 ? Math.sin(time * 55) * 0.004 : 0)
  }

  /** Make the seated driver look like this character (called when the player takes the wheel). */
  setDriverLook(o: HumanoidOpts | null): void {
    this.driverOpts = o
    if (this.driverHum) {
      this.driverHum.group.removeFromParent()
      this.driverHum = null
    }
  }

  private makeDriver(): void {
    const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
    const o: HumanoidOpts = this.driverOpts ?? {
      shirt: pick(DRIVER_SHIRTS),
      pants: 0x2b2d42,
      skin: pick(DRIVER_SKINS),
      hair: pick([0x1c1410, 0x4a3020, 0x8a6a3a, 0x777777]),
      hairStyle: pick(['short', 'short', 'buzz', 'long', 'cap'] as const),
      outfit: this.role === 'police' ? 'police' : 'casual',
    }
    const h = createHumanoid(o)
    h.group.position.set(0, -0.92, 0)
    setHumanoidShadows(h, false)
    this.rig.driver.add(h.group)
    this.driverHum = h
  }

  dispose(): void {
    this.mesh.removeFromParent()
  }
}
