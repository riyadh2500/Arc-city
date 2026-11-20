import type { MissionView } from './missions'

export type Quality = 'low' | 'medium' | 'high'
export type GameState = 'menu' | 'playing' | 'paused'

export interface Settings {
  quality: Quality
  sensitivity: number
  fov: number
  invertY: boolean
  dayMinutes: number
  volume: number
  showFps: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  sensitivity: 1,
  fov: 70,
  invertY: false,
  dayMinutes: 12,
  volume: 0.7,
  showFps: false,
}

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'reward' | 'warn'
}

export interface HudState {
  health: number
  money: number
  speedKmh: number
  inVehicle: boolean
  vehicleName: string
  vehicleHealth: number
  gear: number
  hour: number
  prompt: string | null
  mission: MissionView
  distance: number | null
  toast: Toast | null
  wasted: boolean
  busted: boolean
  locked: boolean
  wantedLevel: number
  searching: boolean
  bust: number
  district: string
  fps: number
  showFps: boolean
  weapon: string
  ammo: number
  reserve: number
  melee: boolean
  reloading: boolean
  reloadFrac: number
  aiming: boolean
  hitmark: number
  killmark: number
  hurtFlash: number
  scope: boolean
  slots: { key: number; name: string; active: boolean; mag: number; reserve: number; melee: boolean }[]
}

export const QUALITY = {
  low: { pr: 1, shadow: 0, peds: 22, traffic: 12, bloom: false },
  medium: { pr: 1.25, shadow: 1536, peds: 40, traffic: 20, bloom: false },
  high: { pr: 1.75, shadow: 2048, peds: 60, traffic: 28, bloom: true },
} as const
