// Player combat: weapon handling, hitscan shooting, melee, tracers and loot drops.
import * as THREE from 'three'
import type { GameAudio } from './audio'
import type { CameraRig } from './cameraRig'
import type { Fleet } from './fleet'
import type { Particles } from './fx'
import { fireFlash, muzzleWorld, setHumanoidWeapon, triggerAttack } from './humanoid'
import type { Input } from './input'
import type { PedSystem, Ped } from './npc'
import type { Pickups } from './pickups'
import type { Player } from './player'
import type { CopFoot } from './police'
import type { PoliceController } from './policeCtl'
import { WEAPONS, WEAPON_ORDER, type WeaponId } from './weapons'
import { ColliderGrid, clamp, damp, type Box } from './util'
import type { Vehicle } from './vehicle'

export interface CombatHooks {
  crime(points: number, text: string): void
  shake(v: number): void
  notify(text: string): void
  /** a grenade went off */
  blast(x: number, z: number): void
}

interface Nade {
  mesh: THREE.Mesh
  v: THREE.Vector3
  fuse: number
}

const nadeGeo = new THREE.SphereGeometry(0.09, 8, 6)
const nadeMat = new THREE.MeshStandardMaterial({ color: 0x3a4a32, roughness: 0.6, metalness: 0.4 })

interface Hit {
  t: number
  kind: 'none' | 'ped' | 'cop' | 'car' | 'wall' | 'ground'
  ped?: Ped
  cop?: CopFoot
  car?: Vehicle
  head?: boolean
}

/** Short-lived glowing bullet trails. */
export class Tracers {
  readonly group = new THREE.Group()
  private pool: { m: THREE.Mesh; life: number }[] = []
  private next = 0
  private geo = new THREE.BoxGeometry(1, 1, 1)
  private mat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })

  constructor() {
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(this.geo, this.mat)
      m.visible = false
      m.frustumCulled = false
      this.group.add(m)
      this.pool.push({ m, life: 0 })
    }
  }

  add(a: THREE.Vector3, b: THREE.Vector3): void {
    const t = this.pool[this.next]
    this.next = (this.next + 1) % this.pool.length
    const len = a.distanceTo(b)
    t.m.position.copy(a).lerp(b, 0.5)
    t.m.lookAt(b)
    t.m.scale.set(0.03, 0.03, Math.max(0.1, len))
    t.m.visible = true
    t.life = 0.07
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (!t.m.visible) continue
      t.life -= dt
      if (t.life <= 0) t.m.visible = false
    }
  }
}

function rayCyl(o: THREE.Vector3, d: THREE.Vector3, cx: number, cz: number, r: number, y0: number, y1: number): number {
  const ox = o.x - cx
  const oz = o.z - cz
  const a = d.x * d.x + d.z * d.z
  if (a < 1e-8) return -1
  const b = 2 * (ox * d.x + oz * d.z)
  const c = ox * ox + oz * oz - r * r
  const disc = b * b - 4 * a * c
  if (disc < 0) return -1
  const sq = Math.sqrt(disc)
  let t = (-b - sq) / (2 * a)
  if (t < 0) t = (-b + sq) / (2 * a)
  if (t < 0) return -1
  const y = o.y + d.y * t
  return y < y0 || y > y1 ? -1 : t
}

function rayCar(o: THREE.Vector3, d: THREE.Vector3, v: Vehicle): number {
  const fx = v.fx
  const fz = v.fz
  const lx = fz
  const lz = -fx
  const rx = o.x - v.x
  const rz = o.z - v.z
  const po = [rx * lx + rz * lz, o.y, rx * fx + rz * fz]
  const pd = [d.x * lx + d.z * lz, d.y, d.x * fx + d.z * fz]
  const lo = [-v.spec.width / 2, 0.2, -v.spec.length / 2]
  const hi = [v.spec.width / 2, 1.65, v.spec.length / 2]
  let t0 = 0
  let t1 = 1e9
  for (let i = 0; i < 3; i++) {
    if (Math.abs(pd[i]) < 1e-8) {
      if (po[i] < lo[i] || po[i] > hi[i]) return -1
    } else {
      let a = (lo[i] - po[i]) / pd[i]
      let b = (hi[i] - po[i]) / pd[i]
      if (a > b) [a, b] = [b, a]
      t0 = Math.max(t0, a)
      t1 = Math.min(t1, b)
      if (t0 > t1) return -1
    }
  }
  return t0 > 0 ? t0 : -1
}

export class Combat {
  current: WeaponId = 'pistol'
  ammo = Object.fromEntries(WEAPON_ORDER.map((id) => [id, { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserveStart }])) as Record<WeaponId, { mag: number; reserve: number }>
  readonly nadeGroup = new THREE.Group()
  private nades: Nade[] = []
  private last: WeaponId = 'pistol'
  aim = 0
  aiming = false
  reloading = false
  hitmark = 0
  killmark = 0
  readonly tracers = new Tracers()
  readonly light = new THREE.PointLight(0xffc070, 0, 16, 2)
  private reloadT = 0
  private cd = 0
  private sinceShot = 99
  private bloom = 0
  private comboT = 0
  private combo = 0
  private pending: { t: number; kick: boolean } | null = null
  private boxes: Box[] = []
  private o = new THREE.Vector3()
  private d = new THREE.Vector3()
  private end = new THREE.Vector3()
  private mz = new THREE.Vector3()
  private right = new THREE.Vector3()
  private up = new THREE.Vector3()

  constructor(
    private camera: THREE.PerspectiveCamera,
    private rig: CameraRig,
    private grid: ColliderGrid,
    private peds: PedSystem,
    private police: PoliceController,
    private fleet: Fleet,
    private player: Player,
    private audio: GameAudio,
    private fx: Particles,
    private pickups: Pickups,
    private hooks: CombatHooks,
  ) {
    setHumanoidWeapon(this.player.h, this.current)
  }

  /** the character should face the camera direction (aiming, firing, fighting) */
  get facing(): boolean {
    return this.aiming || this.sinceShot < 0.8 || this.player.h.attackT > 0.03
  }

  get def() {
    return WEAPONS[this.current]
  }

  equip(id: WeaponId): void {
    if (id === this.current) return
    if (this.current !== 'fists') this.last = this.current
    this.current = id
    this.reloading = false
    this.pending = null
    this.cd = Math.min(this.cd, 0.25)
    setHumanoidWeapon(this.player.h, id === 'fists' ? null : id)
    this.hooks.notify(id === 'fists' ? 'Weapon holstered' : WEAPONS[id].name)
  }

  slotInfo(): { key: number; name: string; active: boolean; mag: number; reserve: number; melee: boolean }[] {
    return WEAPON_ORDER.map((id) => ({ key: WEAPONS[id].key, name: WEAPONS[id].name, active: id === this.current, mag: this.ammo[id].mag, reserve: this.ammo[id].reserve, melee: WEAPONS[id].kind === 'melee' }))
  }

  addAmmo(id: WeaponId, n: number): void {
    const def = WEAPONS[id]
    const a = this.ammo[id]
    a.reserve = Math.min(def.reserveMax, a.reserve + n)
  }

  private cycle(dir: number): void {
    const i = WEAPON_ORDER.indexOf(this.current)
    this.equip(WEAPON_ORDER[(i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length])
  }

  private startReload(): void {
    const def = this.def
    const a = this.ammo[this.current]
    if (this.reloading || def.mag === 0 || a.mag >= def.mag || a.reserve <= 0) return
    this.reloading = true
    this.reloadT = def.reload
    this.audio.reload()
  }

  /** Called every frame. `active` = on foot and alive. */
  update(dt: number, inp: Input, active: boolean): void {
    this.cd = Math.max(0, this.cd - dt)
    this.sinceShot += dt
    this.comboT = Math.max(0, this.comboT - dt)
    this.bloom = Math.max(0, this.bloom - dt * 0.06)
    this.tracers.update(dt)
    this.light.intensity *= Math.exp(-dt * 28)
    this.updateNades(dt)
    this.pickupDrops()
    const h = this.player.h
    if (!active) {
      this.aiming = false
      this.aim = damp(this.aim, 0, 12, dt)
      h.aimOn = false
      return
    }
    for (const id of WEAPON_ORDER) if (inp.pressed(`Digit${WEAPONS[id].key}`, `Numpad${WEAPONS[id].key}`)) this.equip(id)
    if (inp.pressed('KeyQ')) this.cycle(1)
    if (inp.pressed('KeyX')) this.equip(this.current === 'fists' ? this.last : 'fists')
    const wheel = inp.takeWheel()
    if (wheel !== 0) this.cycle(wheel > 0 ? 1 : -1)

    const def = this.def
    const kind = def.kind
    this.aiming = kind !== 'melee' && (inp.mouse(2) || inp.down('KeyG'))
    this.aim = damp(this.aim, this.aiming ? 1 : 0, 12, dt)
    h.aimOn = kind === 'gun' && (this.aiming || this.sinceShot < 1.1)
    this.camera.getWorldDirection(this.d)
    h.aimPitch = clamp(Math.asin(clamp(this.d.y, -1, 1)), -0.6, 0.9)

    if (this.reloading) {
      this.reloadT -= dt
      if (this.reloadT <= 0) {
        this.reloading = false
        const a = this.ammo[this.current]
        const take = Math.min(def.mag - a.mag, a.reserve)
        a.mag += take
        a.reserve -= take
      }
    }
    if (kind === 'gun' && inp.pressed('KeyR')) this.startReload()

    const press = inp.mousePressed(0) || inp.pressed('KeyF')
    const hold = inp.mouse(0) || inp.down('KeyF')
    if (kind === 'melee') {
      if (press && this.cd <= 0) this.startMelee()
      if (this.pending) {
        this.pending.t -= dt
        if (this.pending.t <= 0) {
          this.resolveMelee(this.pending.kick)
          this.pending = null
        }
      }
    } else if (kind === 'throw') {
      if (press && this.cd <= 0 && !this.reloading) this.throwGrenade()
    } else if ((def.auto ? hold : press) && this.cd <= 0 && !this.reloading) this.fire()
  }

  // ----- shooting -----
  private fire(): void {
    const def = this.def
    const a = this.ammo[this.current]
    if (a.mag <= 0) {
      this.audio.dryFire()
      this.cd = 0.3
      if (a.reserve > 0) this.startReload()
      return
    }
    a.mag--
    this.cd = 1 / def.rate
    this.sinceShot = 0
    const p = this.player
    this.o.copy(this.camera.position)
    this.camera.getWorldDirection(this.d)
    this.right.set(this.d.z, 0, -this.d.x).normalize()
    this.up.crossVectors(this.right, this.d).normalize()
    muzzleWorld(p.h, this.mz)
    const aimMul = this.current === 'sniper' ? (this.aiming ? 0.08 : 4) : this.aiming ? 0.55 : 1.2
    const spread = def.spread * aimMul + this.bloom + p.speed * 0.004
    // distance along the camera ray where the player stands: ignore everything behind it
    const tMin = Math.max(0, (p.x - this.o.x) * this.d.x + (p.z - this.o.z) * this.d.z) + 0.4
    const base = this.d.clone()
    for (let k = 0; k < def.pellets; k++) {
      const r = spread * Math.sqrt(Math.random())
      const ang = Math.random() * Math.PI * 2
      this.d.copy(base).addScaledVector(this.right, Math.cos(ang) * r).addScaledVector(this.up, Math.sin(ang) * r).normalize()
      const hit = this.cast(this.o, this.d, def.range, tMin)
      this.end.copy(this.o).addScaledVector(this.d, hit.t)
      this.tracers.add(this.mz, this.end)
      this.applyHit(hit, def.damage)
    }
    fireFlash(p.h)
    this.light.position.copy(this.mz)
    this.light.intensity = 30
    this.audio.shot(this.current, this.mz.x, this.mz.z)
    this.bloom = Math.min(0.05, this.bloom + def.recoil * 0.5)
    this.rig.pitch -= def.recoil * (0.7 + Math.random() * 0.6)
    this.rig.yaw += (Math.random() - 0.5) * def.recoil * 0.5
    this.hooks.shake(def.recoil * 2.2)
    this.peds.panic(this.mz.x, this.mz.z, def.loud * 0.4)
    const cops =
      this.police.foot.some((c) => !c.dead && Math.hypot(c.x - p.x, c.z - p.z) < def.loud * 0.7) ||
      this.fleet.vehicles.some((v) => v.role === 'police' && v.driver !== 'none' && Math.hypot(v.x - p.x, v.z - p.z) < def.loud * 0.7)
    if (cops) this.hooks.crime(0.14, 'Shots fired near the police.')
  }

  private cast(o: THREE.Vector3, d: THREE.Vector3, range: number, tMin: number): Hit {
    let best: Hit = { t: range, kind: 'none' }
    for (const p of this.peds.peds) {
      if (p.state === 'dead' || !p.h.group.visible) continue
      const t = rayCyl(o, d, p.x, p.z, 0.45, 0.12, 1.85)
      if (t > tMin && t < best.t) best = { t, kind: 'ped', ped: p, head: o.y + d.y * t > 1.55 }
    }
    for (const c of this.police.foot) {
      if (c.dead) continue
      const t = rayCyl(o, d, c.x, c.z, 0.45, 0.12, 1.85)
      if (t > tMin && t < best.t) best = { t, kind: 'cop', cop: c, head: o.y + d.y * t > 1.55 }
    }
    for (const v of this.fleet.vehicles) {
      if (v.driver === 'player' || Math.abs(v.x - o.x) > range + 6 || Math.abs(v.z - o.z) > range + 6) continue
      const t = rayCar(o, d, v)
      if (t > tMin && t < best.t) best = { t, kind: 'car', car: v }
    }
    const limit = Math.min(best.t, range)
    for (let t = tMin; t < limit; t += 0.8) {
      const x = o.x + d.x * t
      const y = o.y + d.y * t
      const z = o.z + d.z * t
      if (y < 0) break
      this.grid.query(x, z, 0.3, this.boxes)
      let hit = false
      for (const b of this.boxes) {
        if (b.active === false) continue
        if (y < b.h && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) {
          hit = true
          break
        }
      }
      if (hit) {
        best = { t: Math.max(tMin, t - 0.3), kind: 'wall' }
        break
      }
    }
    if (d.y < -1e-4) {
      const t = -o.y / d.y
      if (t > tMin && t < best.t) best = { t, kind: 'ground' }
    }
    return best
  }

  private applyHit(hit: Hit, damage: number): void {
    const p = this.player
    const x = this.o.x + this.d.x * hit.t
    const y = this.o.y + this.d.y * hit.t
    const z = this.o.z + this.d.z * hit.t
    if (hit.kind === 'ped' && hit.ped) {
      const killed = this.peds.damage(hit.ped, damage, !!hit.head, p.x, p.z)
      this.mark(killed)
      this.hooks.crime(killed ? 1.5 : 0.5, killed ? 'Murder.' : 'Armed assault.')
      this.fx.smoke(x, y, z, 0, 0)
    } else if (hit.kind === 'cop' && hit.cop) {
      const killed = this.police.damageCop(hit.cop, damage, !!hit.head)
      this.mark(killed)
      this.hooks.crime(killed ? 4 : 2.5, killed ? 'Killed a police officer.' : 'Shot at the police.')
      if (killed) {
        this.pickups.spawnAmmo(hit.cop.x, hit.cop.z, 'pistol', 24)
        this.pickups.spawnCash(hit.cop.x, hit.cop.z, 60 + Math.floor(Math.random() * 90))
      }
      this.fx.smoke(x, y, z, 0, 0)
    } else if (hit.kind === 'car' && hit.car) {
      const v = hit.car
      v.damage(damage * 0.55)
      if (v.driver === 'none') v.alarmT = 14
      else if (v.role === 'police') this.hooks.crime(1.5, 'Shot at a police car.')
      else this.hooks.crime(0.4, 'Shot at a vehicle.')
      this.fx.sparks(x, y, z, 5)
      this.audio.hitMarker()
      this.hitmark++
    } else if (hit.kind === 'wall') {
      this.fx.sparks(x, y, z, 4)
      this.fx.smoke(x, y, z, 0, 0)
    } else if (hit.kind === 'ground') {
      this.fx.smoke(x, 0.2, z, 0, 0)
    }
  }

  private mark(kill: boolean): void {
    this.hitmark++
    if (kill) this.killmark++
    this.audio.hitMarker()
  }

  // ----- melee -----
  private startMelee(): void {
    const fists = this.current === 'fists'
    const kick = fists && this.comboT > 0 && this.combo >= 2
    this.combo = this.comboT > 0 ? this.combo + 1 : 1
    if (kick) this.combo = 0
    this.comboT = 0.9
    triggerAttack(this.player.h, kick ? 'kick' : 'punch')
    this.cd = kick ? 0.62 : 1 / this.def.rate
    this.pending = { t: kick ? 0.2 : 0.12, kick }
  }

  private resolveMelee(kick: boolean): void {
    const p = this.player
    const def = this.def
    const dmg = kick ? 30 : def.damage
    const reach = def.range + 0.3
    const fx = Math.sin(p.heading)
    const fz = Math.cos(p.heading)
    let bestD = reach
    let ped: Ped | null = null
    let cop: CopFoot | null = null
    const test = (x: number, z: number): number => {
      const dx = x - p.x
      const dz = z - p.z
      const d = Math.hypot(dx, dz)
      if (d > reach || d < 0.01) return 99
      return (dx * fx + dz * fz) / d > 0.35 ? d : 99
    }
    for (const q of this.peds.peds) {
      if (q.state === 'dead' || !q.h.group.visible) continue
      const d = test(q.x, q.z)
      if (d < bestD) {
        bestD = d
        ped = q
        cop = null
      }
    }
    for (const c of this.police.foot) {
      if (c.dead) continue
      const d = test(c.x, c.z)
      if (d < bestD) {
        bestD = d
        cop = c
        ped = null
      }
    }
    this.audio.punch(p.x + fx, p.z + fz, !!(ped || cop))
    if (ped) {
      const killed = this.peds.damage(ped, dmg, false, p.x, p.z)
      if (!killed) {
        this.peds.provoke(ped, p.x, p.z)
        if (kick || this.current === 'bat') this.peds.knock(ped, 1.6)
      }
      this.mark(killed)
      this.hooks.crime(killed ? 1.5 : 0.25, killed ? 'Murder.' : 'Assault.')
      this.hooks.shake(0.1)
    } else if (cop) {
      const killed = this.police.damageCop(cop, dmg, false)
      this.mark(killed)
      this.hooks.crime(killed ? 4 : 2, killed ? 'Killed a police officer.' : 'Assaulted an officer.')
      if (killed) {
        this.pickups.spawnAmmo(cop.x, cop.z, 'pistol', 24)
        this.pickups.spawnCash(cop.x, cop.z, 60 + Math.floor(Math.random() * 90))
      }
    }
  }

  private pickupDrops(): void {
    for (const d of this.peds.takeDeaths()) this.pickups.spawnCash(d.x, d.z, 15 + Math.floor(Math.random() * 80))
  }

  // ----- grenades -----
  private throwGrenade(): void {
    const a = this.ammo.grenade
    if (a.mag <= 0) {
      this.audio.dryFire()
      this.cd = 0.3
      if (a.reserve > 0) this.startReload()
      return
    }
    a.mag--
    this.cd = 1 / this.def.rate
    this.sinceShot = 0
    const p = this.player
    triggerAttack(p.h, 'punch')
    p.h.attackSide = 1
    muzzleWorld(p.h, this.mz)
    this.camera.getWorldDirection(this.d)
    const mesh = new THREE.Mesh(nadeGeo, nadeMat)
    mesh.position.copy(this.mz)
    mesh.castShadow = true
    this.nadeGroup.add(mesh)
    const speed = this.aiming ? 18 : 14
    this.nades.push({ mesh, v: new THREE.Vector3(this.d.x * speed, this.d.y * speed + 4.5, this.d.z * speed), fuse: 2.6 })
    this.audio.dryFire()
    this.peds.panic(p.x, p.z, 14)
    if (a.mag <= 0 && a.reserve > 0) this.startReload()
  }

  private updateNades(dt: number): void {
    for (const n of [...this.nades]) {
      const m = n.mesh.position
      n.v.y -= 18 * dt
      m.x += n.v.x * dt
      m.y += n.v.y * dt
      m.z += n.v.z * dt
      n.mesh.rotation.x += dt * 9
      if (m.y < 0.12) {
        m.y = 0.12
        n.v.y = Math.abs(n.v.y) > 1.5 ? -n.v.y * 0.35 : 0
        n.v.x *= 0.72
        n.v.z *= 0.72
      }
      this.grid.query(m.x, m.z, 0.3, this.boxes)
      for (const b of this.boxes) {
        if (b.active === false) continue
        if (m.y < b.h && m.x > b.minX && m.x < b.maxX && m.z > b.minZ && m.z < b.maxZ) {
          m.x -= n.v.x * dt
          m.z -= n.v.z * dt
          n.v.x *= -0.4
          n.v.z *= -0.4
          break
        }
      }
      n.fuse -= dt
      if (n.fuse <= 0) {
        n.mesh.removeFromParent()
        this.nades = this.nades.filter((o) => o !== n)
        this.hooks.blast(m.x, m.z)
      }
    }
  }

  get zoom(): number {
    return this.def.zoom
  }

  /** looking through the sniper scope */
  get scoped(): boolean {
    return this.current === 'sniper' && this.aim > 0.75
  }

  /** a ped / cop shot or punched by someone else is handled by their own systems */
  info(): {
    name: string
    mag: number
    reserve: number
    melee: boolean
    reloading: boolean
    reloadFrac: number
  } {
    const def = this.def
    const a = this.ammo[this.current]
    return {
      name: def.name,
      mag: a.mag,
      reserve: a.reserve,
      melee: this.def.kind === 'melee',
      reloading: this.reloading,
      reloadFrac: this.reloading ? 1 - this.reloadT / def.reload : 0,
    }
  }
}
