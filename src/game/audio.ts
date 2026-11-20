// Procedural Web Audio: engines, sirens, tyres, wind, ambience, collisions, UI stings.
import type { District } from './districts'
import { clamp } from './util'
import type { Vehicle } from './vehicle'

interface Pos {
  x: number
  y: number
  z: number
}

class EngineVoice {
  private o1: OscillatorNode
  private o2: OscillatorNode
  private f: BiquadFilterNode
  private g: GainNode
  readonly out: AudioNode

  constructor(ctx: AudioContext, dest: AudioNode, spatial: boolean) {
    this.o1 = ctx.createOscillator()
    this.o1.type = 'sawtooth'
    this.o2 = ctx.createOscillator()
    this.o2.type = 'square'
    const mix2 = ctx.createGain()
    mix2.gain.value = 0.45
    this.f = ctx.createBiquadFilter()
    this.f.type = 'lowpass'
    this.f.Q.value = 2
    this.g = ctx.createGain()
    this.g.gain.value = 0
    this.o1.connect(this.f)
    this.o2.connect(mix2).connect(this.f)
    this.f.connect(this.g)
    if (spatial) {
      const p = ctx.createPanner()
      p.panningModel = 'equalpower'
      p.distanceModel = 'inverse'
      p.refDistance = 7
      p.rolloffFactor = 1.5
      p.maxDistance = 220
      this.g.connect(p).connect(dest)
      this.out = p
    } else {
      this.g.connect(dest)
      this.out = this.g
    }
    this.o1.start()
    this.o2.start()
  }

  set(rpm: number, load: number, cyl: number, vol: number, pos?: Pos): void {
    const t = this.g.context.currentTime
    const base = ((rpm / 60) * cyl) / 2
    this.o1.frequency.setTargetAtTime(base * 2, t, 0.05)
    this.o2.frequency.setTargetAtTime(base * 3.01, t, 0.05)
    this.f.frequency.setTargetAtTime(380 + load * 1900 + rpm * 0.12, t, 0.08)
    this.g.gain.setTargetAtTime(vol * (0.5 + load * 0.5), t, 0.08)
    if (pos && this.out instanceof PannerNode) {
      this.out.positionX.setTargetAtTime(pos.x, t, 0.05)
      this.out.positionY.setTargetAtTime(pos.y, t, 0.05)
      this.out.positionZ.setTargetAtTime(pos.z, t, 0.05)
    }
  }

  silence(): void {
    this.g.gain.setTargetAtTime(0, this.g.context.currentTime, 0.1)
  }
}

class SirenVoice {
  private o: OscillatorNode
  private g: GainNode
  private p: PannerNode

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.o = ctx.createOscillator()
    this.o.type = 'square'
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    this.g = ctx.createGain()
    this.g.gain.value = 0
    this.p = ctx.createPanner()
    this.p.panningModel = 'equalpower'
    this.p.distanceModel = 'inverse'
    this.p.refDistance = 12
    this.p.rolloffFactor = 1.1
    this.p.maxDistance = 400
    this.o.connect(lp).connect(this.g).connect(this.p).connect(dest)
    this.o.start()
  }

  set(time: number, pos: Pos | null, yelp: boolean): void {
    const t = this.g.context.currentTime
    if (!pos) {
      this.g.gain.setTargetAtTime(0, t, 0.1)
      return
    }
    const rate = yelp ? 1 / 0.45 : 1 / 3.2
    const ph = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * rate)
    this.o.frequency.setTargetAtTime(650 + ph * 650, t, 0.03)
    this.g.gain.setTargetAtTime(0.09, t, 0.1)
    this.p.positionX.setTargetAtTime(pos.x, t, 0.05)
    this.p.positionY.setTargetAtTime(pos.y, t, 0.05)
    this.p.positionZ.setTargetAtTime(pos.z, t, 0.05)
  }
}

export interface AudioFrame {
  dt: number
  time: number
  cam: Pos
  camYaw: number
  playerVehicle: Vehicle | null
  throttle: number
  horn: boolean
  vehicles: Vehicle[]
  sirens: Vehicle[]
  night: number
  district: District
  wanted: number
}

export class GameAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private noise!: AudioBuffer
  private player!: EngineVoice
  private traffic: EngineVoice[] = []
  private sirens: SirenVoice[] = []
  private skid!: GainNode
  private wind!: GainNode
  private windF!: BiquadFilterNode
  private bed!: GainNode
  private hum!: GainNode
  private cricket!: GainNode
  private hornG!: GainNode
  private volume = 0.7
  private birdT = 2
  private pickT = 0
  private assign: Vehicle[] = []

  get ready(): boolean {
    return this.ctx !== null
  }

  /** Must be called from a user gesture (Play / Resume click). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.volume
    const comp = ctx.createDynamicsCompressor()
    this.master.connect(comp).connect(ctx.destination)

    const len = ctx.sampleRate * 2
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5 * 0.5 + w * 0.5
    }
    this.player = new EngineVoice(ctx, this.master, false)
    for (let i = 0; i < 4; i++) this.traffic.push(new EngineVoice(ctx, this.master, true))
    for (let i = 0; i < 2; i++) this.sirens.push(new SirenVoice(ctx, this.master))

    const loop = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const s = ctx.createBufferSource()
      s.buffer = this.noise
      s.loop = true
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.value = 0
      s.connect(f).connect(g).connect(this.master)
      s.start()
      return { g, f }
    }
    this.skid = loop('bandpass', 1700, 1.4).g
    const w = loop('lowpass', 600)
    this.wind = w.g
    this.windF = w.f
    this.bed = loop('lowpass', 420).g

    const hum = ctx.createOscillator()
    hum.type = 'sawtooth'
    hum.frequency.value = 55
    const hlp = ctx.createBiquadFilter()
    hlp.type = 'lowpass'
    hlp.frequency.value = 160
    this.hum = ctx.createGain()
    this.hum.gain.value = 0
    hum.connect(hlp).connect(this.hum).connect(this.master)
    hum.start()

    const cr = ctx.createOscillator()
    cr.frequency.value = 4300
    const crg = ctx.createGain()
    crg.gain.value = 0
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 26
    const lfoG = ctx.createGain()
    lfoG.gain.value = 0.5
    lfo.connect(lfoG).connect(crg.gain)
    this.cricket = ctx.createGain()
    this.cricket.gain.value = 0
    cr.connect(crg).connect(this.cricket).connect(this.master)
    cr.start()
    lfo.start()

    const h1 = ctx.createOscillator()
    h1.type = 'square'
    h1.frequency.value = 392
    const h2 = ctx.createOscillator()
    h2.type = 'square'
    h2.frequency.value = 466
    const hlp2 = ctx.createBiquadFilter()
    hlp2.type = 'lowpass'
    hlp2.frequency.value = 1400
    this.hornG = ctx.createGain()
    this.hornG.gain.value = 0
    h1.connect(hlp2)
    h2.connect(hlp2)
    hlp2.connect(this.hornG).connect(this.master)
    h1.start()
    h2.start()
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  setPaused(p: boolean): void {
    if (!this.ctx) return
    if (p) void this.ctx.suspend()
    else void this.ctx.resume()
  }

  frame(f: AudioFrame): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const L = ctx.listener
    const fx = Math.sin(f.camYaw)
    const fz = Math.cos(f.camYaw)
    if (L.positionX) {
      L.positionX.setValueAtTime(f.cam.x, t)
      L.positionY.setValueAtTime(f.cam.y, t)
      L.positionZ.setValueAtTime(f.cam.z, t)
      L.forwardX.setValueAtTime(fx, t)
      L.forwardY.setValueAtTime(0, t)
      L.forwardZ.setValueAtTime(fz, t)
      L.upX.setValueAtTime(0, t)
      L.upY.setValueAtTime(1, t)
      L.upZ.setValueAtTime(0, t)
    }

    // player engine, tyres and wind
    const pv = f.playerVehicle
    if (pv) {
      this.player.set(pv.rpm, f.throttle, pv.spec.cyl, 0.2)
      const slip = clamp((pv.slip - 2.2) / 7, 0, 1) * (pv.speed > 3 ? 1 : 0)
      const burn = pv.input.handbrake && pv.speed > 6 ? 0.6 : 0
      this.skid.gain.setTargetAtTime(Math.max(slip, burn) * 0.2, t, 0.05)
      this.windF.frequency.setTargetAtTime(350 + pv.speed * 40, t, 0.2)
      this.wind.gain.setTargetAtTime(clamp(pv.speed / 55, 0, 1) * 0.28, t, 0.2)
    } else {
      this.player.silence()
      this.skid.gain.setTargetAtTime(0, t, 0.1)
      this.wind.gain.setTargetAtTime(0.015, t, 0.3)
    }
    this.hornG.gain.setTargetAtTime(f.horn && pv ? 0.1 : 0, t, 0.02)

    // traffic engines: nearest few moving cars
    this.pickT -= f.dt
    if (this.pickT <= 0) {
      this.pickT = 0.25
      const near = f.vehicles
        .filter((v) => v !== pv && (v.driver !== 'none' || v.speed > 1))
        .map((v) => ({ v, d: Math.hypot(v.x - f.cam.x, v.z - f.cam.z) }))
        .filter((e) => e.d < 90)
        .sort((a, b) => a.d - b.d)
        .slice(0, this.traffic.length)
      this.assign = near.map((e) => e.v)
    }
    this.traffic.forEach((voice, i) => {
      const v = this.assign[i]
      if (!v) {
        voice.silence()
        return
      }
      voice.set(v.rpm, clamp(v.input.throttle, 0, 1), v.spec.cyl, 0.07, { x: v.x, y: 0.8, z: v.z })
    })

    // sirens
    const sorted = [...f.sirens].sort((a, b) => Math.hypot(a.x - f.cam.x, a.z - f.cam.z) - Math.hypot(b.x - f.cam.x, b.z - f.cam.z))
    this.sirens.forEach((s, i) => {
      const v = sorted[i]
      if (v && Math.hypot(v.x - f.cam.x, v.z - f.cam.z) < 300) s.set(f.time + i * 0.7, { x: v.x, y: 1.5, z: v.z }, f.wanted >= 3 && i === 0)
      else s.set(f.time, null, false)
    })

    // ambience
    const dens = { downtown: 1, midtown: 0.85, oldtown: 0.75, industrial: 0.6, suburbs: 0.3, parkside: 0.4 }[f.district]
    this.bed.gain.setTargetAtTime(0.05 + dens * 0.1 - f.night * 0.02, t, 0.8)
    this.hum.gain.setTargetAtTime(f.district === 'industrial' ? 0.03 : f.district === 'downtown' ? 0.012 : 0, t, 1)
    const green = f.district === 'parkside' || f.district === 'suburbs' || f.district === 'oldtown'
    this.cricket.gain.setTargetAtTime(green ? clamp(f.night * 2 - 0.6, 0, 1) * 0.02 : 0, t, 1)
    this.birdT -= f.dt
    if (this.birdT <= 0) {
      this.birdT = 1 + Math.random() * 3
      if (green && f.night < 0.3) this.chirp()
    }
  }

  private chirp(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const base = 2300 + Math.random() * 1500
    for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const t0 = t + k * 0.14
      o.frequency.setValueAtTime(base, t0)
      o.frequency.exponentialRampToValueAtTime(base * 1.5, t0 + 0.09)
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.025, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11)
      o.connect(g).connect(this.master)
      o.start(t0)
      o.stop(t0 + 0.14)
    }
  }

  private burst(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass', pos?: Pos): void {
    const ctx = this.ctx
    if (!ctx) return
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    s.connect(f).connect(g)
    this.route(g, pos)
    s.start(ctx.currentTime, Math.random())
    s.stop(ctx.currentTime + dur + 0.05)
  }

  private route(node: AudioNode, pos?: Pos): void {
    const ctx = this.ctx
    if (!ctx) return
    if (pos) {
      const p = ctx.createPanner()
      p.panningModel = 'equalpower'
      p.distanceModel = 'inverse'
      p.refDistance = 8
      p.rolloffFactor = 1.3
      p.positionX.value = pos.x
      p.positionY.value = pos.y
      p.positionZ.value = pos.z
      node.connect(p).connect(this.master)
    } else node.connect(this.master)
  }

  private tone(freq: number, to: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, pos?: Pos): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    this.route(g, pos)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  crash(strength: number, x: number, z: number): void {
    const v = clamp(strength / 14, 0.15, 1)
    const pos = { x, y: 1, z }
    this.burst(0.35 + v * 0.3, 900 + v * 1500, 0.8, 0.5 * v, 'lowpass', pos)
    this.tone(120, 40, 0.3, 0.4 * v, 'sine', 0, pos)
  }
  thud(x: number, z: number): void {
    this.burst(0.18, 500, 1, 0.45, 'lowpass', { x, y: 1, z })
    this.tone(90, 45, 0.2, 0.35, 'sine', 0, { x, y: 1, z })
  }
  shot(kind: string, x: number, z: number): void {
    const pos = { x, y: 1.4, z }
    const heavy = kind === 'shotgun' ? 1 : kind === 'rifle' ? 0.8 : kind === 'smg' ? 0.5 : 0.6
    this.burst(0.09 + heavy * 0.12, kind === 'smg' ? 3200 : 2200 + heavy * 800, 0.9, 0.5 + heavy * 0.25, 'lowpass', pos)
    this.burst(0.05, 5200, 1.2, 0.22, 'highpass', pos)
    this.tone(kind === 'shotgun' ? 90 : 150, 45, 0.16 + heavy * 0.08, 0.35, 'sine', 0, pos)
  }
  reload(): void {
    this.tone(1500, 900, 0.04, 0.1, 'square')
    this.tone(700, 500, 0.06, 0.1, 'square', 0.45)
    this.tone(1800, 1200, 0.04, 0.1, 'square', 0.8)
  }
  dryFire(): void {
    this.tone(1300, 900, 0.03, 0.08, 'square')
  }
  punch(x: number, z: number, hit: boolean): void {
    const pos = { x, y: 1.2, z }
    if (hit) {
      this.burst(0.1, 600, 1, 0.45, 'lowpass', pos)
      this.tone(110, 50, 0.12, 0.3, 'sine', 0, pos)
    } else this.burst(0.07, 1800, 0.8, 0.12, 'bandpass', pos)
  }
  hitMarker(): void {
    this.tone(1900, 1500, 0.04, 0.07, 'triangle')
  }
  explosion(x: number, z: number): void {
    const pos = { x, y: 1.5, z }
    this.burst(1.1, 700, 0.8, 1.0, 'lowpass', pos)
    this.burst(0.5, 2400, 0.9, 0.5, 'lowpass', pos)
    this.tone(70, 25, 0.9, 0.7, 'sine', 0, pos)
  }
  alarm(x: number, z: number, phase: number): void {
    const pos = { x, y: 1, z }
    const f = phase % 2 === 0 ? 1180 : 840
    this.tone(f, f, 0.2, 0.06, 'square', 0, pos)
  }
  honk(x: number, z: number): void {
    const pos = { x, y: 1, z }
    this.tone(420, 415, 0.32, 0.07, 'square', 0, pos)
    this.tone(335, 330, 0.32, 0.07, 'square', 0, pos)
  }
  step(vol: number): void {
    this.burst(0.07, 800, 1.2, vol, 'bandpass')
  }
  cash(): void {
    this.tone(1318, 1320, 0.1, 0.12, 'triangle')
    this.tone(1760, 1762, 0.28, 0.12, 'triangle', 0.09)
  }
  buy(): void {
    this.tone(880, 880, 0.08, 0.1, 'triangle')
    this.tone(1175, 1175, 0.16, 0.1, 'triangle', 0.08)
  }
  door(): void {
    this.burst(0.14, 300, 1, 0.3)
    this.tone(95, 55, 0.18, 0.3)
  }
  sting(kind: 'wanted' | 'busted' | 'wasted' | 'clear'): void {
    if (kind === 'wanted') {
      this.tone(520, 520, 0.12, 0.12, 'square')
      this.tone(520, 520, 0.12, 0.12, 'square', 0.18)
      this.tone(390, 390, 0.3, 0.12, 'square', 0.36)
    } else if (kind === 'clear') {
      this.tone(520, 780, 0.2, 0.1, 'triangle')
      this.tone(780, 1040, 0.35, 0.1, 'triangle', 0.18)
    } else this.tone(260, 50, 0.9, 0.25, 'sawtooth')
  }
}
