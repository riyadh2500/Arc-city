// Procedural canvas textures: facades, asphalt, sidewalk, grass, signs, clouds.
import * as THREE from 'three'
import { mulberry32 } from './util'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function tex(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
  }
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const rng = mulberry32(seed)
  const img = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * amount
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

export type FacadeKind = 'office' | 'brick' | 'glass' | 'modern' | 'apartment' | 'stucco' | 'industrial'

export interface FacadeStyle {
  wall: string
  glass: string
  frame: string
  /** window size as fraction of bay (w, h) */
  win: [number, number]
  metal: number
  rough: number
  kind: FacadeKind
}

export const FACADES: FacadeStyle[] = [
  { wall: '#b9afa1', glass: '#2c3d55', frame: '#8c8479', win: [0.55, 0.6], metal: 0.05, rough: 0.85, kind: 'office' },
  { wall: '#a2523f', glass: '#27364a', frame: '#7a3b2c', win: [0.5, 0.58], metal: 0.02, rough: 0.9, kind: 'brick' },
  { wall: '#2f4a68', glass: '#86b4d8', frame: '#1e3047', win: [0.92, 0.82], metal: 0.65, rough: 0.2, kind: 'glass' },
  { wall: '#1d242d', glass: '#4a6f8f', frame: '#10151b', win: [0.9, 0.84], metal: 0.7, rough: 0.18, kind: 'glass' },
  { wall: '#e4e0d8', glass: '#35485f', frame: '#c4bfb4', win: [0.62, 0.66], metal: 0.08, rough: 0.7, kind: 'modern' },
  { wall: '#8d9096', glass: '#33445a', frame: '#6a6d73', win: [0.58, 0.62], metal: 0.1, rough: 0.8, kind: 'apartment' },
  { wall: '#d9c7a1', glass: '#2f3f52', frame: '#b3a07a', win: [0.5, 0.6], metal: 0.02, rough: 0.9, kind: 'stucco' },
  { wall: '#8a949c', glass: '#3a4650', frame: '#6f7880', win: [0.8, 0.16], metal: 0.3, rough: 0.6, kind: 'industrial' },
  { wall: '#8e4a38', glass: '#242f3d', frame: '#d8cdb8', win: [0.42, 0.62], metal: 0.0, rough: 0.95, kind: 'brick' },
  { wall: '#eee9e0', glass: '#41566e', frame: '#ffffff', win: [0.4, 0.5], metal: 0.0, rough: 0.8, kind: 'stucco' },
  { wall: '#cfc6b4', glass: '#2d3b4f', frame: '#9c927f', win: [0.46, 0.7], metal: 0.02, rough: 0.85, kind: 'office' },
]

/** 8x8 bays. World size of the tile is 32m x 28.8m. */
export const FACADE_TILE_W = 32
export const FACADE_TILE_H = 28.8

type Pass = 'color' | 'bump' | 'orm' | 'emit'
type Role = 'wall' | 'frame' | 'glass' | 'trim' | 'dark'

interface BayInfo {
  lit: boolean
  warm: string
  curtain: boolean
}

const LIT = ['#ffd58a', '#ffe7b0', '#ffc46b', '#cfe6ff', '#fff3d6', '#ffb86b']

function tint(hex: string, f: number): string {
  return new THREE.Color(hex).multiplyScalar(f).getStyle()
}

function paintFacade(ctx: CanvasRenderingContext2D, pass: Pass, size: number, style: FacadeStyle, bays: BayInfo[], seed: number): void {
  const P = size / 8
  const k = style.kind
  const R = (v: number) => Math.round(v * 255)
  const col = (role: Role, bay?: BayInfo): string | CanvasGradient => {
    if (pass === 'bump') return { wall: '#808080', frame: '#b8b8b8', glass: '#363636', trim: '#d4d4d4', dark: '#6c6c6c' }[role]
    if (pass === 'orm') {
      if (role === 'glass') return `rgb(0,${R(0.06)},${R(Math.max(style.metal, 0.55))})`
      if (role === 'frame') return `rgb(0,${R(0.45)},${R(0.5)})`
      if (role === 'dark') return `rgb(0,${R(0.4)},${R(0.6)})`
      return `rgb(0,${R(style.rough)},${R(style.metal)})`
    }
    if (pass === 'emit') return role === 'glass' && bay?.lit ? (bay.curtain ? tint(bay.warm, 0.55) : bay.warm) : '#000'
    switch (role) {
      case 'wall': return style.wall
      case 'frame': return style.frame
      case 'trim': return tint(style.wall, 1.14)
      case 'dark': return tint(style.frame, 0.55)
      case 'glass': {
        const g = ctx.createLinearGradient(0, 0, P, P)
        g.addColorStop(0, style.glass)
        g.addColorStop(0.5, tint(style.glass, 0.45))
        g.addColorStop(1, tint(style.glass, 1.15))
        return g
      }
    }
  }
  const rect = (role: Role, x: number, y: number, w: number, h: number, bay?: BayInfo) => {
    ctx.save()
    const c = col(role, bay)
    if (role === 'glass' && pass === 'color') {
      ctx.translate(x, y)
      ctx.scale(w / P, h / P)
      ctx.fillStyle = c
      ctx.fillRect(0, 0, P, P)
    } else {
      ctx.fillStyle = c
      ctx.fillRect(x, y, w, h)
    }
    ctx.restore()
  }

  rect('wall', 0, 0, size, size)
  if (pass === 'color' && (k === 'brick' || k === 'stucco')) {
    const rng = mulberry32(seed + 3)
    ctx.strokeStyle = k === 'brick' ? 'rgba(30,18,14,0.22)' : 'rgba(0,0,0,0.05)'
    ctx.lineWidth = 1
    const step = k === 'brick' ? P / 14 : P / 6
    for (let y = 0; y < size; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
      ctx.stroke()
      if (k === 'brick') {
        for (let x = (Math.floor(y / step) % 2) * step * 1.5; x < size; x += step * 3) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x, y + step)
          ctx.stroke()
        }
      }
    }
    for (let n = 0; n < 160; n++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
      ctx.fillRect(rng() * size, rng() * size, P * 0.12, P * 0.08)
    }
  }
  if (k === 'industrial') {
    for (let x = 0; x < size; x += Math.max(3, P / 12)) {
      ctx.fillStyle = pass === 'bump' ? '#9a9a9a' : pass === 'color' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0)'
      ctx.fillRect(x, 0, Math.max(1, P / 36), size)
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const bay = bays[r * 8 + c]
      const bx = c * P
      const by = r * P
      const ww = P * style.win[0]
      const wh = P * style.win[1]
      let wx = bx + (P - ww) / 2
      let wy = by + (P - wh) / 2
      const u = P / 48
      if (k === 'glass') {
        rect('glass', bx + u, by + u, P - 2 * u, P * 0.8, bay)
        rect('dark', bx, by + P * 0.82, P, P * 0.18)
        rect('frame', bx, by, u * 2, P)
        rect('frame', bx + P / 2 - u, by, u * 2, P * 0.82)
        rect('frame', bx, by + P * 0.4, P, u)
        rect('frame', bx, by, P, u * 2)
        continue
      }
      if (k === 'industrial') {
        rect('frame', bx + P * 0.05, by + P * 0.1, P * 0.9, P * 0.2)
        rect('glass', bx + P * 0.07, by + P * 0.12, P * 0.86, P * 0.16, bay)
        continue
      }
      if (k === 'apartment') {
        wy = by + P * 0.1
      }
      if (k === 'modern') rect('trim', bx, by + P * 0.9, P, P * 0.1)
      if (k === 'office') {
        rect('dark', bx, by + P * 0.86, P, P * 0.14)
        rect('trim', bx, by, P, P * 0.04)
      }
      if (k === 'brick') rect('trim', wx - u * 2, wy - P * 0.08, ww + u * 4, P * 0.07)
      if (k === 'stucco') {
        rect('dark', wx - P * 0.11, wy, P * 0.1, wh)
        rect('dark', wx + ww + P * 0.01, wy, P * 0.1, wh)
      }
      const fr = k === 'modern' ? u * 3 : u * 2
      rect('frame', wx - fr, wy - fr, ww + fr * 2, wh + fr * 2)
      rect('glass', wx, wy, ww, wh, bay)
      if (style.win[0] < 0.7) rect('frame', wx + ww / 2 - u / 2, wy, u, wh)
      if (k === 'brick' || k === 'stucco' || k === 'apartment') rect('frame', wx, wy + wh * 0.42, ww, u)
      if (k !== 'modern') rect('trim', wx - u * 2, wy + wh + fr, ww + u * 4, P * 0.05)
      if (k === 'apartment') {
        rect('trim', bx, by + P * 0.94, P, P * 0.06)
        rect('frame', bx + P * 0.1, by + P * 0.74, P * 0.8, u)
        for (let x = bx + P * 0.12; x < bx + P * 0.9; x += P * 0.08) rect('dark', x, by + P * 0.75, u * 0.7, P * 0.19)
      }
    }
  }
  if (pass === 'color') {
    const rng = mulberry32(seed + 9)
    for (let n = 0; n < 50; n++) {
      const x = rng() * size
      const g = ctx.createLinearGradient(0, 0, 0, size * 0.5)
      g.addColorStop(0, 'rgba(0,0,0,0.0)')
      g.addColorStop(1, 'rgba(10,8,6,0.07)')
      ctx.fillStyle = g
      ctx.fillRect(x, rng() * size * 0.5, 1 + rng() * 2, size * 0.5)
    }
  }
}

export function makeFacadeMaterial(style: FacadeStyle, seed: number): THREE.MeshStandardMaterial {
  const rng = mulberry32(seed)
  const bays: BayInfo[] = []
  for (let i = 0; i < 64; i++) bays.push({ lit: rng() < 0.38, warm: LIT[Math.floor(rng() * LIT.length)], curtain: rng() < 0.3 })
  const make = (pass: Pass, size: number, srgb: boolean): THREE.CanvasTexture => {
    const [c, ctx] = canvas(size, size)
    paintFacade(ctx, pass, size, style, bays, seed)
    if (pass === 'color') noise(ctx, size, size, 12, seed + 7)
    const t = tex(c, true, srgb)
    t.anisotropy = 8
    return t
  }
  const orm = make('orm', 384, false)
  return new THREE.MeshStandardMaterial({
    map: make('color', 768, true),
    emissiveMap: make('emit', 384, true),
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    bumpMap: make('bump', 384, false),
    bumpScale: 2,
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 0.9,
  })
}

export function makeAsphalt(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256)
  ctx.fillStyle = '#34363a'
  ctx.fillRect(0, 0, 256, 256)
  noise(ctx, 256, 256, 26, 11)
  const rng = mulberry32(5)
  ctx.strokeStyle = 'rgba(15,15,18,0.4)'
  for (let i = 0; i < 14; i++) {
    ctx.beginPath()
    ctx.moveTo(rng() * 256, rng() * 256)
    ctx.lineTo(rng() * 256, rng() * 256)
    ctx.stroke()
  }
  return tex(c)
}

export function makeSidewalk(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128)
  ctx.fillStyle = '#a9a69f'
  ctx.fillRect(0, 0, 128, 128)
  noise(ctx, 128, 128, 14, 21)
  ctx.strokeStyle = 'rgba(70,68,64,0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 126, 126)
  return tex(c)
}

export function makeGrass(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256)
  ctx.fillStyle = '#4c7a3a'
  ctx.fillRect(0, 0, 256, 256)
  noise(ctx, 256, 256, 40, 3)
  const rng = mulberry32(9)
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(90,140,60,0.4)' : 'rgba(40,80,35,0.4)'
    ctx.fillRect(rng() * 256, rng() * 256, 2, 4)
  }
  return tex(c)
}

export function makeSign(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 64)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 256, 64)
  ctx.strokeStyle = fg
  ctx.lineWidth = 3
  ctx.strokeRect(4, 4, 248, 56)
  ctx.fillStyle = fg
  ctx.font = '700 34px "Space Grotesk", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 34)
  return tex(c, false)
}

export function makeCloud(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128)
  const rng = mulberry32(77)
  for (let i = 0; i < 22; i++) {
    const x = 40 + rng() * 176
    const y = 50 + rng() * 40 - Math.abs(x - 128) * 0.15
    const r = 20 + rng() * 26
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return tex(c, false)
}

export function makeGlow(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,220,150,0.9)')
  g.addColorStop(0.4, 'rgba(255,200,120,0.3)')
  g.addColorStop(1, 'rgba(255,200,120,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return tex(c, false)
}

export const SIGN_NAMES = [
  'ARC MART', 'CAFE 402', 'PIZZA', 'BANK', 'ELECTRO', 'BOOKS', 'PHARMACY', 'DINER',
  'ARC GARAGE', 'POLICE DEPT', 'HOTEL ARC', 'HARDWARE', 'DONUTS', 'PORT CO.', 'CARGO', 'ARC AUTO',
] as const
const SIGN_STYLE: Record<string, [string, string]> = {
  'ARC MART': ['#0f3d91', '#ffffff'], 'CAFE 402': ['#4b2a18', '#ffd9a0'], PIZZA: ['#a3201c', '#fff1cf'],
  BANK: ['#10343a', '#9ff2e0'], ELECTRO: ['#1a1a2e', '#6ce0ff'], BOOKS: ['#3a2a52', '#f0e0ff'],
  PHARMACY: ['#0d5c3a', '#eafff3'], DINER: ['#a03b11', '#fff0c0'], 'ARC GARAGE': ['#222831', '#ffb02e'],
  'POLICE DEPT': ['#0b1a3a', '#9ec3ff'], 'HOTEL ARC': ['#2b1b3d', '#ffd6f2'], HARDWARE: ['#7a4a10', '#fff1c4'],
  DONUTS: ['#7a1f55', '#ffd1ec'], 'PORT CO.': ['#1d3a52', '#cfe9ff'], CARGO: ['#3c3c3c', '#ffd23f'], 'ARC AUTO': ['#13233a', '#ffb02e'],
}

/** One atlas holding every shop sign; returns v-range per name. */
export function makeSignAtlas(): { texture: THREE.CanvasTexture; range: (name: string) => [number, number] } {
  const n = SIGN_NAMES.length
  const [c, ctx] = canvas(256, 64 * n)
  SIGN_NAMES.forEach((name, k) => {
    const [bg, fg] = SIGN_STYLE[name]
    ctx.save()
    ctx.translate(0, k * 64)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 256, 64)
    ctx.strokeStyle = fg
    ctx.lineWidth = 3
    ctx.strokeRect(4, 4, 248, 56)
    ctx.fillStyle = fg
    ctx.font = '700 32px "Space Grotesk", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 128, 34)
    ctx.restore()
  })
  const texture = tex(c, false)
  return {
    texture,
    range: (name: string) => {
      const k = Math.max(0, SIGN_NAMES.indexOf(name as (typeof SIGN_NAMES)[number]))
      return [1 - (k + 1) / n, 1 - k / n]
    },
  }
}

/** Grey-scale asphalt shingles; tint with material colour. */
export function makeShingle(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256)
  ctx.fillStyle = '#9a9a9a'
  ctx.fillRect(0, 0, 256, 256)
  const rng = mulberry32(31)
  const rows = 12
  const rh = 256 / rows
  for (let r = 0; r < rows; r++) {
    const cols = 8
    const cw = 256 / cols
    for (let k = -1; k < cols; k++) {
      const x = k * cw + (r % 2) * (cw / 2)
      const v = 150 + rng() * 70
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(x + 1, r * rh + 1, cw - 2, rh - 1)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(x + 1, r * rh + rh - 3, cw - 2, 3)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, r * rh, 256, 1.5)
  }
  noise(ctx, 256, 256, 22, 17)
  return tex(c)
}
