// Car alarms, burning cars, explosions and wreck clean-up.
import type { GameAudio } from './audio'
import type { Particles } from './fx'
import type { Vehicle } from './vehicle'

export interface WreckHooks {
  /** a car has just exploded */
  explode(v: Vehicle): void
  /** a wreck was cleared away */
  removed(v: Vehicle): void
}

/** Big fireball, smoke column and sparks. */
export function explosionFx(fx: Particles, x: number, z: number): void {
  for (let k = 0; k < 44; k++) {
    const a = Math.random() * Math.PI * 2
    const s = 2 + Math.random() * 7
    fx.emit(x, 0.8 + Math.random() * 1.2, z, Math.cos(a) * s, 1 + Math.random() * 5, Math.sin(a) * s, 0.5 + Math.random() * 0.7, 1.2, 5 + Math.random() * 3, 1, 0.45 + Math.random() * 0.3, 0.08, 0.9)
  }
  for (let k = 0; k < 34; k++) {
    const a = Math.random() * Math.PI * 2
    const s = 0.5 + Math.random() * 3
    fx.emit(x, 1.5, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 2.2 + Math.random() * 1.8, 2, 7, 0.1, 0.1, 0.1, 0.6)
  }
  fx.sparks(x, 1.2, z, 28)
}

export class WreckSystem {
  private flameT = 0
  private beepT = 0
  private beepN = 0
  private wrecks: { v: Vehicle; t: number }[] = []

  update(dt: number, vehicles: Vehicle[], fx: Particles, audio: GameAudio, px: number, pz: number, hooks: WreckHooks): void {
    this.flameT -= dt
    this.beepT -= dt
    const flame = this.flameT <= 0
    if (flame) this.flameT = 0.05
    const beep = this.beepT <= 0
    if (beep) {
      this.beepT = 0.3
      this.beepN++
    }
    for (const v of vehicles) {
      if (!v.burnt && !v.burning && v.health <= 0) {
        v.burning = true
        v.burnT = 3 + Math.random() * 2
        v.alarmT = 0
      }
      if (v.burning) {
        v.burnT -= dt
        const near = Math.hypot(v.x - px, v.z - pz) < 90
        if (flame && near) {
          const s = v.spec
          for (let k = 0; k < 2; k++) {
            fx.emit(
              v.x + v.fx * (s.length * 0.25) + (Math.random() - 0.5) * 1.2,
              0.9,
              v.z + v.fz * (s.length * 0.25) + (Math.random() - 0.5) * 1.2,
              (Math.random() - 0.5) * 0.8,
              1.6 + Math.random() * 1.4,
              (Math.random() - 0.5) * 0.8,
              0.5 + Math.random() * 0.4,
              0.5,
              1.5,
              1,
              0.4 + Math.random() * 0.25,
              0.08,
              0.85,
            )
          }
          fx.smoke(v.x, 1.4, v.z, v.vx * 0.3, v.vz * 0.3, true)
        }
        if (v.burnT <= 0) {
          v.wreck()
          this.wrecks.push({ v, t: 0 })
          hooks.explode(v)
        }
      }
      if (v.alarmT > 0) {
        v.alarmT -= dt
        v.hazard = v.alarmT > 0
        if (beep && Math.hypot(v.x - px, v.z - pz) < 70) audio.alarm(v.x, v.z, this.beepN)
      }
    }
    for (const w of [...this.wrecks]) {
      w.t += dt
      if (w.t > 35 && Math.hypot(w.v.x - px, w.v.z - pz) > 45) {
        this.wrecks = this.wrecks.filter((o) => o !== w)
        hooks.removed(w.v)
      } else if (w.t < 40 && flame && Math.hypot(w.v.x - px, w.v.z - pz) < 70 && w.t < 14) {
        fx.smoke(w.v.x, 1.2, w.v.z, 0, 0, true)
      }
    }
  }
}
