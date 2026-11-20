// Third-person orbit camera with collision, auto-centre in cars and screen shake.
import * as THREE from 'three'
import { ColliderGrid, clamp, damp, dampAngle, type Box } from './util'

export interface CamTarget {
  x: number
  y: number
  z: number
  /** car heading when driving, else null */
  heading: number | null
  speed: number
  length: number
  sprint: boolean
  /** 0..1 over-the-shoulder aiming blend */
  aim?: number
  /** field-of-view reduction at full aim, degrees */
  zoom?: number
}

export class CameraRig {
  yaw = 0
  pitch = 0.28
  idle = 99
  shake = 0
  readonly pos = new THREE.Vector3()
  private init = false
  private boxes: Box[] = []

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private grid: ColliderGrid,
  ) {}

  reset(): void {
    this.init = false
  }

  look(dx: number, dy: number, sens: number, invert: boolean): void {
    if (dx !== 0 || dy !== 0) this.idle = 0
    this.yaw -= dx * sens
    this.pitch = clamp(this.pitch + dy * sens * (invert ? -1 : 1), -0.4, 1.2)
  }

  update(dt: number, t: CamTarget, baseFov: number): void {
    const driving = t.heading !== null
    if (!driving) this.idle += dt
    else this.idle += dt
    if (driving && this.idle > 1.2) {
      const sp = clamp(t.speed / 12, 0.25, 1.4)
      this.yaw = dampAngle(this.yaw, t.heading!, 2.2 * sp, dt)
      this.pitch = damp(this.pitch, 0.2, 2, dt)
    }
    const aim = t.aim ?? 0
    const dist = driving ? 7.4 + t.length * 0.35 + clamp(t.speed / 40, 0, 1) * 2.2 : 4.6 - aim * 2.0
    const cosP = Math.cos(this.pitch)
    const sinP = Math.sin(this.pitch)
    const side = driving ? 0 : 0.55 + aim * 0.45
    const sx = Math.sin(this.yaw)
    const sz = Math.cos(this.yaw)
    const tgtX = t.x + -sz * side
    const tgtZ = t.z + sx * side
    const want = new THREE.Vector3(tgtX - sx * cosP * dist, t.y + sinP * dist, tgtZ - sz * cosP * dist)
    this.clip(tgtX, t.y, tgtZ, want)
    if (!this.init) {
      this.pos.copy(want)
      this.init = true
    } else {
      this.pos.lerp(want, 1 - Math.exp(-(driving ? 14 : 18) * dt))
    }
    this.shake = Math.max(0, this.shake - dt * 2.2)
    const cam = this.camera
    cam.position.copy(this.pos)
    if (this.shake > 0.01) {
      const s = this.shake * 0.18
      cam.position.x += (Math.random() - 0.5) * s
      cam.position.y += (Math.random() - 0.5) * s
    }
    cam.position.y = Math.max(cam.position.y, 0.5)
    cam.lookAt(tgtX + sx * 6, t.y + 0.2 - sinP * 2, tgtZ + sz * 6)
    const fov = baseFov + (driving ? clamp(t.speed / 45, 0, 1) * 12 : t.sprint ? 4 : 0) - aim * (t.zoom ?? 14)
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 5, dt)
      cam.updateProjectionMatrix()
    }
  }

  private clip(tx: number, ty: number, tz: number, want: THREE.Vector3): void {
    let best = 1
    for (let t = 0.12; t <= 1.001; t += 0.11) {
      const x = tx + (want.x - tx) * t
      const y = ty + (want.y - ty) * t
      const z = tz + (want.z - tz) * t
      this.grid.query(x, z, 1, this.boxes)
      let hit = false
      for (const b of this.boxes) {
        if (b.active === false) continue
        if (y < b.h && x > b.minX - 0.35 && x < b.maxX + 0.35 && z > b.minZ - 0.35 && z < b.maxZ + 0.35) {
          hit = true
          break
        }
      }
      if (hit) {
        best = Math.max(0.1, t - 0.14)
        break
      }
    }
    want.set(tx + (want.x - tx) * best, ty + (want.y - ty) * best, tz + (want.z - tz) * best)
  }
}
