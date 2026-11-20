// A short chain of courier missions that loops forever with new locations.
import { CITY, rl } from './util'

export interface MissionView {
  title: string
  objective: string
  target: { x: number; z: number } | null
  timeLeft: number | null
  reward: number
  index: number
}

export type MissionEvent = { kind: 'reward'; amount: number; text: string } | { kind: 'failed'; text: string } | { kind: 'info'; text: string }

export class MissionManager {
  private step = 0
  private rounds = 0
  private a = { x: 0, z: 0 }
  private b = { x: 0, z: 0 }
  private timeLeft: number | null = null
  private starter: { x: number; z: number }
  private hasPackage = false

  constructor(starter: { x: number; z: number }) {
    this.starter = starter
    this.rollLocations()
  }

  private rollLocations(): void {
    const pickPoint = () => ({
      x: rl(1 + Math.floor(Math.random() * (CITY.N - 1))),
      z: rl(1 + Math.floor(Math.random() * (CITY.N - 1))),
    })
    this.a = pickPoint()
    do {
      this.b = pickPoint()
    } while (Math.hypot(this.a.x - this.b.x, this.a.z - this.b.z) < 200)
  }

  get reward(): number {
    return 400 + this.rounds * 150
  }

  view(): MissionView {
    if (this.step === 0) {
      return { title: 'Welcome to Arc City', objective: 'Get in a car', target: this.starter, timeLeft: null, reward: 0, index: 0 }
    }
    if (this.step === 1) {
      return { title: 'Courier Run', objective: 'Pick up the package', target: this.a, timeLeft: null, reward: this.reward, index: 1 }
    }
    return { title: 'Courier Run', objective: 'Deliver the package', target: this.b, timeLeft: this.timeLeft, reward: this.reward, index: 2 }
  }

  update(dt: number, px: number, pz: number, inVehicle: boolean): MissionEvent | null {
    if (this.step === 0) {
      if (inVehicle) {
        this.step = 1
        return { kind: 'info', text: 'Nice ride. Pick up the package.' }
      }
      return null
    }
    if (this.step === 1) {
      if (Math.hypot(px - this.a.x, pz - this.a.z) < 9) {
        this.step = 2
        this.hasPackage = true
        this.timeLeft = 110 + Math.min(this.rounds, 4) * 5
        return { kind: 'info', text: 'Package secured. Deliver it before time runs out.' }
      }
      return null
    }
    if (this.timeLeft !== null) this.timeLeft -= dt
    if (Math.hypot(px - this.b.x, pz - this.b.z) < 9) {
      const amount = this.reward
      this.rounds++
      this.step = 1
      this.timeLeft = null
      this.hasPackage = false
      this.rollLocations()
      return { kind: 'reward', amount, text: `Delivery complete. +$${amount}` }
    }
    if (this.timeLeft !== null && this.timeLeft <= 0) {
      this.step = 1
      this.timeLeft = null
      this.hasPackage = false
      this.rollLocations()
      return { kind: 'failed', text: 'Delivery failed. Time ran out.' }
    }
    return null
  }

  get carrying(): boolean {
    return this.hasPackage
  }
}
