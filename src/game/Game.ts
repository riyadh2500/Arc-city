// ARC CITY game engine: scene, loop, player/vehicle switching, crime, police, missions.
import * as THREE from 'three'
import { GameAudio } from './audio'
import { CameraRig } from './cameraRig'
import { Combat } from './combat'
import { DISTRICT_NAMES, MID, districtAt } from './districts'
import { Fleet, type PlayerState } from './fleet'
import { Particles, SkidMarks } from './fx'
import { Gfx } from './gfx'
import { QUALITY, DEFAULT_SETTINGS, type GameState, type HudState, type Quality, type Settings, type Toast } from './gameTypes'
import { Input } from './input'
import { nearestShop, updateGarages } from './interact'
import { MiniMap } from './minimap'
import { MissionManager } from './missions'
import { PedSystem } from './npc'
import { Pickups } from './pickups'
import { PoliceController } from './policeCtl'
import { Player, PLAYER_LOOK } from './player'
import { SkySystem } from './sky'
import { CITY, bc, lightState, rl } from './util'
import type { Vehicle } from './vehicle'
import { explosionFx, WreckSystem } from './wrecks'
import { WEAPONS } from './weapons'
import { World } from './world'

export { DEFAULT_SETTINGS }
export type { GameState, HudState, Quality, Settings, Toast }

const RESPRAY_COST = 100
const PAINTS = [0xc8321e, 0x1e5fc8, 0xe8e8ea, 0x1a1a1e, 0x2d8f4e, 0xd9a21c, 0x7a3fc4, 0xff7a1a, 0x16c2b2]

export class Game {
  state: GameState = 'menu'
  settings: Settings
  private gfx: Gfx
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private rig: CameraRig
  private input: Input
  private world: World
  private sky: SkySystem
  private fleet: Fleet
  private peds: PedSystem
  private player: Player
  private mission: MissionManager
  private minimap: MiniMap
  private police: PoliceController
  private audio = new GameAudio()
  private fx = new Particles()
  private skids = new SkidMarks()
  private pickups = new Pickups()
  private wrecks = new WreckSystem()
  private combat: Combat
  private explLight = new THREE.PointLight(0xff8a30, 0, 70, 1.5)
  private hurtFlash = 0
  private marker: THREE.Group
  private spot: THREE.SpotLight
  private garageLight: THREE.PointLight
  private raf = 0
  private last = 0
  private hudTimer = 0
  private disposed = false

  private clock = 0
  private hours = 17.2
  private driving: Vehicle | null = null
  private money = 150
  private toast: Toast | null = null
  private toastId = 0
  private toastTimer = 0
  private damageCooldown = 0
  private sinceDamage = 99
  private wastedTimer = 0
  private bustedTimer = 0
  private menuAngle = 0
  private prompt: string | null = null
  private doorTimers: { v: Vehicle; t: number }[] = []
  private lastCell = ''
  private lastStep = 0
  private smokeT = 0
  private skidT = 0
  private bayGarage: ReturnType<typeof updateGarages>['bay'] = null
  private tmpV = new THREE.Vector3()
  private lastDistrict = ''

  constructor(
    private container: HTMLElement,
    minimapCanvas: HTMLCanvasElement,
    settings: Settings,
    private onHud: (s: HudState) => void,
    private onState: (s: GameState) => void,
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    const q = QUALITY[this.settings.quality]
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.3, 3000)
    this.gfx = new Gfx(container, this.settings.quality, this.scene, this.camera)
    this.input = new Input(this.gfx.renderer.domElement)
    this.input.onLockLost = () => {
      if (this.state === 'playing') this.pause()
    }
    this.world = new World()
    this.scene.add(this.world.group)
    this.sky = new SkySystem(this.scene, this.gfx.renderer, q.shadow)
    this.rig = new CameraRig(this.camera, this.world.grid)

    const cx = bc(MID)
    const cz = bc(MID)
    this.fleet = new Fleet(this.world.grid, this.world.carSpawns, q.traffic, 3, { x: cx, z: cz + 28 })
    this.scene.add(this.fleet.group)
    this.peds = new PedSystem(q.peds)
    this.scene.add(this.peds.group)
    this.player = new Player(this.world)
    this.player.setPose(cx + 1.5, cz + 27.5, 0)
    this.scene.add(this.player.mesh)
    this.police = new PoliceController(this.fleet, this.world.grid)
    this.scene.add(this.police.group)
    this.scene.add(this.fx.points, this.skids.mesh)
    this.combat = new Combat(this.camera, this.rig, this.world.grid, this.peds, this.police, this.fleet, this.player, this.audio, this.fx, this.pickups, {
      crime: (p, t) => this.crime(p, t),
      shake: (v) => {
        this.rig.shake = Math.min(1, this.rig.shake + v)
      },
      notify: (t) => this.notify(t, 'info'),
      blast: (x, z) => this.blast(x, z, null, true),
    })
    this.scene.add(this.pickups.group, this.combat.tracers.group, this.combat.nadeGroup, this.combat.light, this.explLight)
    this.mission = new MissionManager({ x: cx + 6, z: rl(MID + 1) - CITY.PARK })
    this.minimap = new MiniMap(minimapCanvas, this.world.blockTypes)

    this.marker = new THREE.Group()
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 140, 20, 1, true), beamMat)
    beam.position.y = 70
    const ring = new THREE.Mesh(new THREE.RingGeometry(7, 9, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false }))
    ring.position.y = 0.2
    this.marker.add(beam, ring)
    this.scene.add(this.marker)

    this.spot = new THREE.SpotLight(0xfff0cc, 0, 80, 0.6, 0.55, 1.2)
    this.garageLight = new THREE.PointLight(0xfff1d6, 0, 24, 1.6)
    this.scene.add(this.spot, this.spot.target, this.garageLight)

    window.addEventListener('resize', this.onResize)
    this.audio.setVolume(this.settings.volume)
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private onResize = () => this.gfx.resize()

  // ---------- public API ----------
  start(): void {
    this.hours = 9.5
    this.audio.init()
    this.audio.setVolume(this.settings.volume)
    this.audio.setPaused(false)
    this.setState('playing')
    this.input.clearAll()
    this.input.lock()
    this.rig.reset()
    this.gfx.renderer.domElement.focus()
  }

  /** pick a weapon by its slot number (1-9, 0), e.g. from the on-screen list */
  selectWeapon(key: number): void {
    const id = (Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]).find((k) => WEAPONS[k].key === key)
    if (id) this.combat.equip(id)
    this.pushHud()
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.input.unlock()
    this.input.clearAll()
    this.audio.setPaused(true)
    this.setState('paused')
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.audio.init()
    this.audio.setPaused(false)
    this.setState('playing')
    this.input.clearAll()
    this.input.lock()
    this.gfx.renderer.domElement.focus()
  }

  quitToMenu(): void {
    this.input.unlock()
    this.audio.setPaused(true)
    if (this.driving) this.exitVehicle()
    this.setState('menu')
  }

  applySettings(s: Settings): void {
    const changedQ = s.quality !== this.settings.quality
    this.settings = { ...s }
    if (changedQ) this.gfx.setQuality(s.quality)
    this.sky.setShadowSize(QUALITY[s.quality].shadow)
    this.audio.setVolume(s.volume)
    this.camera.fov = s.fov
    this.camera.updateProjectionMatrix()
    this.gfx.resize()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    this.input.dispose()
    this.sky.dispose()
    this.gfx.dispose()
  }

  private setState(s: GameState): void {
    this.state = s
    this.gfx.renderer.domElement.style.cursor = s === 'playing' ? 'none' : 'default'
    this.onState(s)
  }

  private notify(text: string, kind: Toast['kind']): void {
    this.toast = { id: ++this.toastId, text, kind }
    this.toastTimer = 3.6
    this.pushHud()
  }

  // ---------- loop ----------
  private frame = (now: number): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const raw = (now - this.last) / 1000
    const dt = Math.min(0.05, raw)
    this.last = now
    if (this.state === 'playing') this.stepPlaying(dt)
    else this.stepIdle(dt)
    this.input.endFrame()
    this.gfx.setNight(this.sky.night)
    this.gfx.render(raw)
  }

  private stepIdle(dt: number): void {
    this.clock += dt
    this.menuAngle += dt * 0.06
    if (this.state === 'menu') this.hours = (this.hours + dt * 0.08) % 24
    const cx = bc(MID)
    const cz = bc(MID)
    const r = 95
    this.camera.position.set(cx + Math.cos(this.menuAngle) * r, 30 + Math.sin(this.menuAngle * 2) * 5, cz + Math.sin(this.menuAngle) * r)
    this.camera.lookAt(cx, 12, cz)
    this.camera.fov = 62
    this.camera.updateProjectionMatrix()
    this.rig.reset()
    if (this.state === 'menu') {
      const ps: PlayerState = { x: cx, z: cz, vx: 0, vz: 0, vehicle: null }
      this.fleet.update(dt, this.clock, [], ps, 0)
      this.peds.update(dt, this.clock, cx, cz, this.fleet.vehicles)
      this.updateVehicleVisuals(dt, cx, cz)
    }
    this.world.update(this.clock)
    this.sky.update(dt, this.hours, this.tmpV.set(cx, 0, cz), this.camera.position)
    this.world.setNight(this.sky.night)
    this.fx.update(dt, this.gfx.renderer.domElement.height * 0.5 * this.gfx.pixelRatio * 0.9)
    this.marker.visible = false
    this.spot.intensity = 0
    this.garageLight.intensity = 0
    this.paintMinimap()
  }

  private playerState(): PlayerState {
    const v = this.driving
    if (v) return { x: v.x, z: v.z, vx: v.vx, vz: v.vz, vehicle: v }
    return { x: this.player.x, z: this.player.z, vx: this.player.vx, vz: this.player.vz, vehicle: null }
  }

  private stepPlaying(dt: number): void {
    const inp = this.input
    this.clock += dt
    this.hours = (this.hours + (dt * 24) / (this.settings.dayMinutes * 60)) % 24
    const down = this.wastedTimer > 0 || this.bustedTimer > 0
    this.sinceDamage += dt
    this.damageCooldown = Math.max(0, this.damageCooldown - dt)

    const m = inp.takeMouse()
    this.rig.look(m.dx, m.dy, 0.0022 * this.settings.sensitivity, this.settings.invertY)
    const edge = inp.edgeTurn()
    if (edge !== 0) this.rig.look(edge * 1000 * dt, 0, 0.0022 * this.settings.sensitivity, this.settings.invertY)
    if (inp.pressed('Escape', 'KeyP')) {
      this.pause()
      return
    }
    if (!down && inp.pressed('KeyE')) this.interact()
    if (!down && inp.pressed('KeyR')) this.respray()

    const v = this.driving
    if (v && !down) {
      const i = v.input
      i.throttle = inp.down('KeyW', 'ArrowUp') ? 1 : 0
      i.brake = inp.down('KeyS', 'ArrowDown') ? 1 : 0
      i.steer = (inp.down('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.down('KeyD', 'ArrowRight') ? 1 : 0)
      i.handbrake = inp.down('Space')
    } else if (v) {
      v.input.throttle = 0
      v.input.brake = 0.5
      v.input.steer = 0
    } else if (!down) {
      this.player.update(dt, inp, this.rig.yaw, {
        aimYaw: this.combat.facing ? this.rig.yaw : null,
        speedMul: this.combat.aiming ? 0.55 : 1,
      })
    }
    this.combat.update(dt, inp, !v && !down)

    // world simulation
    const ps = this.playerState()
    const pedPos = this.peds.peds.filter((p) => p.state !== 'down' && p.state !== 'dead' && p.h.group.visible)
    const impact = this.fleet.update(dt, this.clock, pedPos, ps, this.police.wanted.level)
    this.peds.update(dt, this.clock, ps.x, ps.z, this.fleet.vehicles)
    if (v && impact > 6) {
      this.hurt((impact - 6) * 3.2)
      this.rig.shake = Math.min(1, this.rig.shake + impact * 0.04)
    } else if (v && impact > 2) this.rig.shake = Math.min(1, this.rig.shake + impact * 0.02)
    if (v && impact > 3) this.audio.crash(impact, v.x, v.z)
    if (!v) this.footVsVehicles()
    this.handleEvents()
    for (const dmg of this.peds.attacks) {
      this.hurt(dmg)
      this.audio.thud(ps.x, ps.z)
    }
    this.pickups.update(dt, ps.x, ps.z, {
      cash: (n) => {
        this.money += n
        this.audio.cash()
      },
      ammo: (w, n) => {
        this.combat.addAmmo(w, n)
        this.audio.buy()
        this.notify(`+${n} ${WEAPONS[w].name} ammo`, 'info')
      },
    })
    this.wrecks.update(dt, this.fleet.vehicles, this.fx, this.audio, ps.x, ps.z, {
      explode: (car) => this.onExplode(car),
      removed: (car) => {
        this.fleet.remove(car)
        if (car.role !== 'police') this.fleet.spawnTraffic(ps, 90)
      },
    })
    this.explLight.intensity *= Math.exp(-dt * 3.2)
    if (v) this.watchRedLight(v)

    // police
    const status = updateGarages(
      this.world.garages,
      dt,
      ps.x,
      ps.z,
      v ? v.speed : this.player.speed,
      v ? inp.down('KeyW', 'KeyS', 'ArrowUp', 'ArrowDown') : this.player.speed > 0.5,
    )
    this.bayGarage = status.bay
    const res = this.police.update(dt, ps, !!status.inside && !status.inside.open, this.sky.night)
    if (res.cleared) {
      this.notify('Wanted level cleared', 'info')
      this.audio.sting('clear')
    }
    for (const s of res.shots) {
      this.audio.shot('pistol', s.x, s.z)
      const a = this.tmpV.set(s.x, 1.3, s.z)
      const b = new THREE.Vector3(s.tx + (s.hit ? 0 : (Math.random() - 0.5) * 3), 1.1, s.tz + (s.hit ? 0 : (Math.random() - 0.5) * 3))
      this.combat.tracers.add(a, b)
      if (s.hit) {
        this.hurt(7)
        this.audio.thud(s.tx, s.tz)
      }
    }
    if (res.busted && this.bustedTimer <= 0 && this.wastedTimer <= 0) this.busted()

    // health regen, death
    if (this.sinceDamage > 7 && this.player.health < 100 && !down) this.player.health = Math.min(100, this.player.health + dt * 3)
    if (this.player.health <= 0 && this.wastedTimer <= 0 && this.bustedTimer <= 0) this.wasted()
    if (this.wastedTimer > 0) {
      this.wastedTimer -= dt
      if (this.wastedTimer <= 0) this.respawn(false)
    }
    if (this.bustedTimer > 0) {
      this.bustedTimer -= dt
      if (this.bustedTimer <= 0) this.respawn(true)
    }

    // missions
    if (!down) {
      const ev = this.mission.update(dt, ps.x, ps.z, !!v)
      if (ev) {
        if (ev.kind === 'reward') {
          this.money += ev.amount
          this.audio.cash()
          this.notify(ev.text, 'reward')
        } else this.notify(ev.text, ev.kind === 'failed' ? 'warn' : 'info')
      }
    }
    const mv = this.mission.view()
    this.marker.visible = !!mv.target
    if (mv.target) this.marker.position.set(mv.target.x, 0, mv.target.z)

    // lights, effects, doors
    this.updateVehicleVisuals(dt, ps.x, ps.z)
    this.vehicleEffects(dt, ps.x, ps.z)
    for (const d of this.doorTimers) {
      d.t -= dt
      if (d.t <= 0) d.v.openDoor(false)
    }
    this.doorTimers = this.doorTimers.filter((d) => d.t > 0)
    this.updateLights(ps)

    // prompt
    this.prompt = null
    if (!down) {
      if (!v) {
        const shop = nearestShop(this.world.shops, this.player.x, this.player.z)
        const near = this.fleet.nearest(this.player.x, this.player.z, 4.6)
        if (shop) this.prompt = `Press E: buy ${shop.item} ($${shop.price}, +${shop.heal} HP)`
        else if (near && !near.burnt) this.prompt = `Press E to enter ${near.spec.name}`
      } else if (this.bayGarage) {
        this.prompt = `Press R: respray & repair ($${RESPRAY_COST})${this.police.wanted.level > 0 ? ' and lose the cops' : ''}`
      } else if (v.speed < 6) this.prompt = 'Press E to exit'
    }

    // camera, sky, audio
    this.rig.update(dt, {
      x: v ? v.x : this.player.x,
      y: v ? 1.5 : this.player.y + 1.55,
      z: v ? v.z : this.player.z,
      heading: v ? v.heading : null,
      speed: v ? v.speed : 0,
      length: v ? v.spec.length : 0,
      sprint: this.player.sprinting,
      aim: v ? 0 : this.combat.aim,
      zoom: this.combat.zoom,
    }, this.settings.fov)
    this.world.update(this.clock)
    this.sky.update(dt, this.hours, this.tmpV.set(ps.x, 0, ps.z), this.camera.position)
    this.world.setNight(this.sky.night)
    this.fx.update(dt, this.gfx.renderer.domElement.height * 0.5 * this.gfx.pixelRatio * 0.9)
    this.skids.flush()
    this.audioFrame(dt, ps)
    this.paintMinimap()

    this.toastTimer -= dt
    if (this.toast && this.toastTimer <= 0) {
      this.toast = null
      this.pushHud()
    }
    this.hudTimer -= dt
    if (this.hudTimer <= 0) this.pushHud()
  }

  // ---------- gameplay ----------
  private crime(points: number, text: string): void {
    const up = this.police.crime(points)
    if (up) {
      this.audio.sting('wanted')
      this.notify(`${text}  Wanted ${'★'.repeat(this.police.wanted.level)}`, 'warn')
    }
  }

  private hurt(amount: number): void {
    if (this.wastedTimer > 0 || this.bustedTimer > 0 || amount <= 0) return
    this.player.health = Math.max(0, this.player.health - amount)
    this.hurtFlash++
    this.sinceDamage = 0
    this.rig.shake = Math.min(1, this.rig.shake + 0.4)
  }

  private wasted(): void {
    this.wastedTimer = 4
    this.player.health = 0
    this.audio.sting('wasted')
    this.notify('WASTED', 'warn')
  }

  private busted(): void {
    this.bustedTimer = 4
    this.audio.sting('busted')
    this.notify('BUSTED', 'warn')
  }

  private respawn(fromCops: boolean): void {
    if (this.driving) this.exitVehicle()
    const spot = fromCops ? this.world.policeSpot : { x: bc(MID) + 1.5, z: bc(MID) + 27.5 }
    this.player.setPose(spot.x, spot.z, fromCops ? Math.PI / 2 : 0)
    this.player.mesh.visible = true
    this.player.health = 100
    this.police.reset()
    if (fromCops) {
      const fine = Math.min(this.money, 250)
      this.money -= fine
      this.notify(`Released from custody. Fine -$${fine}`, 'info')
    } else {
      const fee = Math.min(this.money, 100)
      this.money -= fee
      this.notify(`Treated at Arc General. -$${fee}`, 'info')
    }
    this.rig.yaw = fromCops ? Math.PI / 2 : 0
    this.rig.reset()
  }

  private handleEvents(): void {
    let loudest = 0
    for (const ev of this.fleet.collisions) {
      loudest = Math.max(loudest, ev.impact)
      for (const c of [ev.a, ev.b]) if (c.driver === 'none' && ev.impact > 3 && !c.burnt) c.alarmT = Math.max(c.alarmT, 12)
      this.fx.sparks(ev.x, 0.8, ev.z, Math.min(14, Math.floor(ev.impact * 1.4)))
      const pa = ev.a.driver === 'player'
      const pb = ev.b.driver === 'player'
      if (pa || pb) {
        const other = pa ? ev.b : ev.a
        if (other.role === 'police' && ev.impact > 4) this.crime(2.5, 'Hit a police car.')
        else if (other.role !== 'police' && ev.impact > 7) this.crime(0.8, 'Hit and run.')
        if (ev.impact > 6) this.hurt((ev.impact - 6) * 2)
      }
      if (ev.a.driver !== 'player' && ev.b.driver !== 'player' && ev.impact > 5 && ev.impact > loudest * 0.99) {
        this.audio.crash(ev.impact, ev.x, ev.z)
      }
    }
    for (const h of this.peds.hits) {
      this.audio.thud(h.x, h.z)
      if (h.vehicle.driver === 'player') this.crime(1.2, 'Hit a pedestrian.')
    }
    for (const car of this.fleet.vehicles) {
      if (car.honk > 0) {
        this.audio.honk(car.x, car.z)
        car.honk = 0
      }
    }
  }

  private watchRedLight(v: Vehicle): void {
    const [i, j] = [Math.round(v.x / CITY.P + CITY.N / 2), Math.round(v.z / CITY.P + CITY.N / 2)]
    const inside = Math.abs(v.x - rl(i)) < CITY.R / 2 - 1 && Math.abs(v.z - rl(j)) < CITY.R / 2 - 1
    const key = inside ? `${i},${j}` : ''
    if (key && key !== this.lastCell && v.speed > 6) {
      const axis = Math.abs(v.fx) > Math.abs(v.fz) ? 'x' : 'z'
      const copNear = this.fleet.vehicles.some((o) => o.role === 'police' && o.driver !== 'player' && Math.hypot(o.x - v.x, o.z - v.z) < 60)
      if (lightState(axis, this.clock, i, j) === 'red' && copNear) this.crime(1, 'Ran a red light.')
    }
    this.lastCell = key
  }

  private footVsVehicles(): void {
    const p = this.player
    for (const v of this.fleet.vehicles) {
      const dx = p.x - v.x
      const dz = p.z - v.z
      if (dx * dx + dz * dz > 25) continue
      const fx = v.fx
      const fz = v.fz
      const along = dx * fx + dz * fz
      const lat = dx * fz - dz * fx
      const hl = v.spec.length / 2 + 0.38
      const hw = v.spec.width / 2 + 0.38
      if (Math.abs(along) < hl && Math.abs(lat) < hw && p.y < 1.4) {
        if (v.speed > 4 && this.damageCooldown <= 0) {
          this.hurt(v.speed * 2.4)
          this.damageCooldown = 0.7
          p.vx += v.vx * 0.5
          p.vz += v.vz * 0.5
          this.audio.thud(p.x, p.z)
        }
        const penA = hl - Math.abs(along)
        const penL = hw - Math.abs(lat)
        if (penA < penL) {
          const s = Math.sign(along) || 1
          p.x += fx * s * penA
          p.z += fz * s * penA
        } else {
          const s = Math.sign(lat) || 1
          p.x += fz * s * penL
          p.z += -fx * s * penL
        }
      }
    }
  }

  private interact(): void {
    if (this.driving) {
      if (this.driving.speed > 6) {
        this.notify('Slow down to exit', 'warn')
        return
      }
      this.exitVehicle()
      return
    }
    const shop = nearestShop(this.world.shops, this.player.x, this.player.z)
    if (shop) {
      if (this.player.health >= 100) this.notify('You are already at full health', 'info')
      else if (this.money < shop.price) this.notify('Not enough cash', 'warn')
      else {
        this.money -= shop.price
        this.player.health = Math.min(100, this.player.health + shop.heal)
        this.audio.buy()
        this.notify(`${shop.item} bought. +${shop.heal} HP`, 'reward')
      }
      return
    }
    const near = this.fleet.nearest(this.player.x, this.player.z, 4.6)
    if (!near) return
    if (near.burnt || near.burning) {
      this.notify('That car is on fire', 'warn')
      return
    }
    if (near.driver === 'ai') {
      if (near.role === 'police') this.crime(3, 'Stole a police car.')
      else this.crime(1.5, 'Carjacking!')
      this.fleet.release(near, this.player)
    } else if (near.role === 'police') this.crime(2, 'Stole a police car.')
    near.setDriverLook(PLAYER_LOOK)
    near.driver = 'player'
    near.input.handbrake = false
    near.siren = false
    near.openDoor(true)
    this.doorTimers.push({ v: near, t: 0.7 })
    this.audio.door()
    this.driving = near
    this.player.mesh.visible = false
    this.rig.idle = 99
  }

  private exitVehicle(): void {
    const v = this.driving
    if (!v) return
    v.driver = 'none'
    v.setDriverLook(null)
    v.input.throttle = 0
    v.input.brake = 0
    v.input.steer = 0
    v.input.handbrake = true
    v.openDoor(true)
    this.doorTimers.push({ v, t: 0.9 })
    this.audio.door()
    const lx = Math.cos(v.heading)
    const lz = -Math.sin(v.heading)
    const off = v.spec.width / 2 + 0.9
    const blocked = (x: number, z: number) => this.world.grid.query(x, z, 0.5, []).some((b) => b.active !== false && x > b.minX - 0.45 && x < b.maxX + 0.45 && z > b.minZ - 0.45 && z < b.maxZ + 0.45)
    const side = blocked(v.x + lx * off, v.z + lz * off) ? -1 : 1
    this.player.setPose(v.x + lx * off * side, v.z + lz * off * side, v.heading)
    this.player.mesh.visible = true
    this.driving = null
    this.rig.yaw = v.heading
  }

  /** a car blew up: damage and scare everything nearby */
  private onExplode(v: Vehicle): void {
    if (this.driving !== v) this.fleet.abandon(v)
    this.blast(v.x, v.z, v, false)
  }

  /** an explosion at (x, z): fire, damage and panic. `source` is the car that blew up, if any. */
  private blast(x: number, z: number, source: Vehicle | null, byPlayer: boolean): void {
    explosionFx(this.fx, x, z)
    this.audio.explosion(x, z)
    this.explLight.position.set(x, 3, z)
    this.explLight.intensity = 500
    const ps = this.playerState()
    const dp = Math.hypot(ps.x - x, ps.z - z)
    this.rig.shake = Math.min(1, this.rig.shake + 1.2 / (1 + dp * 0.08))
    this.peds.panic(x, z, 45)
    if (byPlayer) this.crime(2.5, 'Explosion.')
    for (const p of this.peds.peds) {
      const d = Math.hypot(p.x - x, p.z - z)
      if (d < 7 && p.state !== 'dead' && !this.peds.damage(p, 90 - d * 8, false, x, z)) this.peds.knock(p, 2.5)
    }
    for (const c of this.police.foot) {
      if (Math.hypot(c.x - x, c.z - z) < 7 && this.police.damageCop(c, 70, false)) {
        this.pickups.spawnAmmo(c.x, c.z, 'pistol', 24)
        this.pickups.spawnCash(c.x, c.z, 60)
      }
    }
    for (const o of this.fleet.vehicles) {
      if (o === source || o.burnt) continue
      const dx = o.x - x
      const dz = o.z - z
      const d = Math.hypot(dx, dz) || 1
      if (d > 10) continue
      o.damage((10 - d) * 9)
      o.vx += (dx / d) * (10 - d) * 0.9
      o.vz += (dz / d) * (10 - d) * 0.9
      if (o.driver === 'none') o.alarmT = 12
    }
    if (source && this.driving === source) {
      this.exitVehicle()
      this.hurt(55)
    } else if (dp < 10) this.hurt((10 - dp) * 7)
  }

  private respray(): void {
    const v = this.driving
    if (!v || !this.bayGarage) return
    if (this.money < RESPRAY_COST) {
      this.notify('Not enough cash for a respray', 'warn')
      return
    }
    this.money -= RESPRAY_COST
    v.setColor(PAINTS[Math.floor(Math.random() * PAINTS.length)])
    v.health = 100
    this.audio.cash()
    if (this.police.wanted.level > 0) {
      this.police.reset()
      this.audio.sting('clear')
      this.notify('Fresh paint, new look. Wanted level cleared.', 'reward')
    } else this.notify('Respray and repairs complete', 'reward')
  }

  // ---------- visuals ----------
  private updateVehicleVisuals(dt: number, px: number, pz: number): void {
    const night = this.sky.night
    for (const car of this.fleet.vehicles) {
      const d = Math.hypot(car.x - px, car.z - pz)
      car.mesh.visible = d < 450
      if (d < 160 || car.driver === 'player') car.visuals(dt, this.clock, night)
    }
  }

  private vehicleEffects(dt: number, px: number, pz: number): void {
    this.smokeT -= dt
    this.skidT -= dt
    const doSmoke = this.smokeT <= 0
    const doSkid = this.skidT <= 0
    if (doSmoke) this.smokeT = 0.04
    if (doSkid) this.skidT = 0.05
    for (const car of this.fleet.vehicles) {
      if (Math.abs(car.x - px) > 90 || Math.abs(car.z - pz) > 90) continue
      const drift = (car.slip > 4 && car.speed > 5) || (car.input.handbrake && car.speed > 7)
      const s = car.spec
      if (drift && (doSmoke || doSkid)) {
        for (const side of [-1, 1]) {
          car.worldPoint(side * (s.width / 2 - 0.2), -s.wheelBase / 2, this.tmpV)
          if (doSmoke) this.fx.smoke(this.tmpV.x, 0.2, this.tmpV.z, car.vx, car.vz)
          if (doSkid) this.skids.add(this.tmpV.x, this.tmpV.z, car.heading)
        }
      }
      if (car.health < 45 && doSmoke) {
        car.worldPoint(0, s.length / 2 - 0.7, this.tmpV)
        this.fx.smoke(this.tmpV.x, 1.1, this.tmpV.z, car.vx * 0.5, car.vz * 0.5, car.health < 20)
      }
    }
  }

  private updateLights(ps: PlayerState): void {
    const v = this.driving
    const night = this.sky.night
    if (v) {
      this.spot.intensity = night > 0.35 ? 140 : 0
      this.spot.position.set(v.x + v.fx * 2, 1, v.z + v.fz * 2)
      this.spot.target.position.set(v.x + v.fx * 18, 0.2, v.z + v.fz * 18)
    } else this.spot.intensity = 0
    let best: (typeof this.world.garages)[number] | null = null
    let bd = 34
    for (const g of this.world.garages) {
      const d = Math.hypot(g.cx - ps.x, g.cz - ps.z)
      if (d < bd) {
        bd = d
        best = g
      }
    }
    if (best) {
      this.garageLight.position.set(best.cx, 4.6, best.cz)
      this.garageLight.intensity = 38
    } else this.garageLight.intensity = 0
  }

  private audioFrame(dt: number, ps: PlayerState): void {
    const v = this.driving
    if (!v && this.player.onGround && this.player.speed > 1.2) {
      const idx = Math.floor(this.player.h.phase / Math.PI)
      if (idx !== this.lastStep) {
        this.lastStep = idx
        this.audio.step(this.player.sprinting ? 0.16 : 0.1)
      }
    }
    this.audio.frame({
      dt,
      time: this.clock,
      cam: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      camYaw: this.rig.yaw,
      playerVehicle: v,
      throttle: v ? v.input.throttle : 0,
      horn: this.input.down('KeyH'),
      vehicles: this.fleet.vehicles,
      sirens: this.fleet.sirenCars(),
      night: this.sky.night,
      district: districtAt(ps.x, ps.z),
      wanted: this.police.wanted.level,
    })
  }

  private paintMinimap(): void {
    const v = this.driving
    const px = v ? v.x : this.player.x
    const pz = v ? v.z : this.player.z
    const mv = this.mission.view()
    const yaw = this.state === 'playing' ? this.rig.yaw : this.menuAngle
    this.minimap.draw(px, pz, yaw, v ? v.heading : this.player.heading, this.fleet.vehicles, mv.target)
  }

  private combatHud(): Pick<HudState, 'weapon' | 'ammo' | 'reserve' | 'melee' | 'reloading' | 'reloadFrac' | 'aiming' | 'hitmark' | 'killmark' | 'hurtFlash' | 'slots' | 'scope'> {
    const i = this.combat.info()
    return {
      weapon: i.name,
      ammo: i.mag,
      reserve: i.reserve,
      melee: i.melee,
      reloading: i.reloading,
      reloadFrac: i.reloadFrac,
      aiming: this.combat.aiming,
      hitmark: this.combat.hitmark,
      killmark: this.combat.killmark,
      hurtFlash: this.hurtFlash,
      scope: this.combat.scoped,
      slots: this.combat.slotInfo(),
    }
  }

  private pushHud(): void {
    this.hudTimer = 0.1
    const v = this.driving
    const mv = this.mission.view()
    const px = v ? v.x : this.player.x
    const pz = v ? v.z : this.player.z
    const district = DISTRICT_NAMES[districtAt(px, pz)]
    this.lastDistrict = district
    this.onHud({
      health: Math.round(this.player.health),
      money: this.money,
      speedKmh: v ? Math.round(Math.abs(v.speedF) * 3.6) : 0,
      inVehicle: !!v,
      vehicleName: v ? v.spec.name : '',
      vehicleHealth: v ? Math.round(v.health) : 100,
      gear: v ? (v.speedF < -0.5 ? -1 : v.speed < 0.5 ? 0 : v.gear) : 0,
      hour: this.hours,
      prompt: this.prompt,
      mission: mv,
      distance: mv.target ? Math.round(Math.hypot(mv.target.x - px, mv.target.z - pz)) : null,
      toast: this.toast,
      wasted: this.wastedTimer > 0,
      busted: this.bustedTimer > 0,
      locked: this.input.locked,
      wantedLevel: this.police.wanted.level,
      searching: this.police.wanted.searching,
      bust: this.police.bustProgress,
      district: this.lastDistrict,
      fps: Math.round(this.gfx.fps),
      showFps: this.settings.showFps,
      ...this.combatHud(),
    })
  }
}

// A stale engine instance cannot take new code, so reload the page when engine files change.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())
