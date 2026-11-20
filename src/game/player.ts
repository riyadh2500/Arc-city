// Third-person on-foot player controller.
import * as THREE from 'three'
import { animateHumanoid, createHumanoid, type Humanoid, type HumanoidOpts } from './humanoid'
import type { Input } from './input'
import { circleVsBox, clamp, dampAngle, damp, HALF, type Box } from './util'
import type { World } from './world'

export const PLAYER_LOOK: HumanoidOpts = { shirt: 0x1f6feb, pants: 0x23262d, skin: 0xc68b62, hair: 0x1c1410, shoes: 0xf2f2f2, hairStyle: 'short', outfit: 'jacket' }

export class Player {
  readonly h: Humanoid
  x = 0
  y = 0
  z = 0
  vy = 0
  vx = 0
  vz = 0
  heading = 0
  health = 100
  onGround = true
  sprinting = false
  speed = 0
  private boxes: Box[] = []
  private world: World

  constructor(world: World) {
    this.world = world
    this.h = createHumanoid(PLAYER_LOOK)
  }

  get mesh(): THREE.Group {
    return this.h.group
  }

  setPose(x: number, z: number, heading: number): void {
    this.x = x
    this.z = z
    this.y = this.world.groundHeight(x, z)
    this.heading = heading
    this.vx = 0
    this.vz = 0
    this.vy = 0
    this.sync()
  }

  update(dt: number, input: Input, camYaw: number, opts: { aimYaw?: number | null; speedMul?: number } = {}): void {
    const aimed = opts.aimYaw !== undefined && opts.aimYaw !== null
    const fwd = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0)
    const str = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0)
    const fx = Math.sin(camYaw)
    const fz = Math.cos(camYaw)
    // right vector of a heading is (-cos, sin)
    let mx = fx * fwd + -Math.cos(camYaw) * str
    let mz = fz * fwd + Math.sin(camYaw) * str
    const len = Math.hypot(mx, mz)
    if (len > 0) {
      mx /= len
      mz /= len
    }
    this.sprinting = input.down('ShiftLeft', 'ShiftRight') && len > 0 && !aimed
    const walk = input.down('ControlLeft', 'ControlRight')
    const top = (this.sprinting ? 8.4 : walk ? 2 : fwd < 0 ? 3.4 : 4.8) * (opts.speedMul ?? 1)
    const tvx = mx * top
    const tvz = mz * top
    const acc = this.onGround ? 12 : 3
    this.vx = damp(this.vx, tvx, acc, dt)
    this.vz = damp(this.vz, tvz, acc, dt)
    if (aimed) this.heading = dampAngle(this.heading, opts.aimYaw as number, 18, dt)
    else if (len > 0) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 14, dt)

    if (this.onGround && input.pressed('Space')) {
      this.vy = 7.2
      this.onGround = false
    }
    this.vy -= 22 * dt
    this.x += this.vx * dt
    this.z += this.vz * dt
    this.y += this.vy * dt

    // static collisions
    this.world.grid.query(this.x, this.z, 1.2, this.boxes)
    for (const b of this.boxes) {
      if (this.y >= b.h) continue
      const hit = circleVsBox(this.x, this.z, 0.38, b)
      if (!hit) continue
      this.x += hit.nx * hit.depth
      this.z += hit.nz * hit.depth
      const vn = this.vx * hit.nx + this.vz * hit.nz
      if (vn < 0) {
        this.vx -= vn * hit.nx
        this.vz -= vn * hit.nz
      }
    }
    const lim = HALF + 26
    this.x = clamp(this.x, -lim, lim)
    this.z = clamp(this.z, -lim, lim)

    const gh = this.world.groundHeight(this.x, this.z)
    if (this.y <= gh) {
      this.y = damp(this.y, gh, 30, dt)
      if (Math.abs(this.y - gh) < 0.02) this.y = gh
      this.vy = 0
      this.onGround = true
    } else if (this.y > gh + 0.05) {
      this.onGround = false
    }
    this.speed = Math.hypot(this.vx, this.vz)
    animateHumanoid(this.h, dt, this.speed, !this.onGround, this.vy)
    this.sync()
  }

  sync(): void {
    this.h.group.position.set(this.x, this.y, this.z)
    this.h.group.rotation.y = this.heading
  }
}
