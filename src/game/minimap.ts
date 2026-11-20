// Rotating circular mini-map drawn on a 2D canvas from a pre-rendered city image.
import { CITY, HALF, bc, rl } from './util'
import type { BlockType } from './blocksIndex'

const SCALE = 1.6 // pixels per metre in the offscreen image

export class MiniMap {
  private base: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private off: number

  constructor(private canvas: HTMLCanvasElement, blocks: BlockType[][]) {
    this.ctx = canvas.getContext('2d')!
    const ext = HALF + 90
    this.off = ext
    this.base = document.createElement('canvas')
    this.base.width = this.base.height = Math.ceil(ext * 2 * SCALE)
    const g = this.base.getContext('2d')!
    g.fillStyle = '#26402a'
    g.fillRect(0, 0, this.base.width, this.base.height)
    const T = (v: number) => (v + ext) * SCALE
    // roads
    g.fillStyle = '#3b4250'
    const len = CITY.N * CITY.P + CITY.R
    for (let k = 0; k <= CITY.N; k++) {
      g.fillRect(T(-len / 2), T(rl(k) - CITY.R / 2), len * SCALE, CITY.R * SCALE)
      g.fillRect(T(rl(k) - CITY.R / 2), T(-len / 2), CITY.R * SCALE, len * SCALE)
    }
    g.strokeStyle = '#e8c547'
    g.lineWidth = 1
    g.globalAlpha = 0.5
    for (let k = 0; k <= CITY.N; k++) {
      g.beginPath()
      g.moveTo(T(-len / 2), T(rl(k)))
      g.lineTo(T(len / 2), T(rl(k)))
      g.moveTo(T(rl(k)), T(-len / 2))
      g.lineTo(T(rl(k)), T(len / 2))
      g.stroke()
    }
    g.globalAlpha = 1
    const color: Record<BlockType, string> = {
      plaza: '#4f8a5a', tower: '#7d8696', midrise: '#8a93a3', police: '#4a6fb0', shops: '#a79a86', garage: '#b59a6a', old: '#9a7a66',
      warehouse: '#6e757d', yard: '#7c726a', suburb: '#7f9a6a', park: '#3f7a46', lake: '#2f6f8f', condo: '#9aa0ac', autoshop: '#b59a6a', oldgarage: '#b59a6a',
    }
    for (let i = 0; i < CITY.N; i++) {
      for (let j = 0; j < CITY.N; j++) {
        g.fillStyle = color[blocks[i][j]]
        g.fillRect(T(bc(i) - 28), T(bc(j) - 28), 56 * SCALE, 56 * SCALE)
      }
    }
  }

  draw(
    px: number,
    pz: number,
    camYaw: number,
    playerHeading: number,
    cars: { x: number; z: number; role?: string; siren?: boolean }[],
    marker: { x: number; z: number } | null,
  ): void {
    const c = this.ctx
    const W = this.canvas.width
    const r = W / 2
    const zoom = 0.85
    c.clearRect(0, 0, W, W)
    c.save()
    c.beginPath()
    c.arc(r, r, r - 2, 0, Math.PI * 2)
    c.clip()
    c.fillStyle = '#1c2a20'
    c.fillRect(0, 0, W, W)
    c.translate(r, r)
    const alpha = camYaw - Math.PI
    c.rotate(alpha)
    c.scale(zoom, zoom)
    c.drawImage(this.base, -(px + this.off) * SCALE, -(pz + this.off) * SCALE)
    // vehicles
    const flash = Math.floor(performance.now() / 250) % 2 === 0
    for (const v of cars) {
      const x = (v.x - px) * SCALE
      const z = (v.z - pz) * SCALE
      if (Math.abs(x) > r / zoom + 4 || Math.abs(z) > r / zoom + 4) continue
      if (v.siren) {
        c.fillStyle = flash ? '#ff4d4d' : '#4d7bff'
        c.fillRect(x - 4, z - 4, 8, 8)
      } else {
        c.fillStyle = v.role === 'police' ? '#6f8fd8' : '#9fb7d8'
        c.fillRect(x - 2, z - 2, 4, 4)
      }
    }
    c.restore()

    // mission marker, clamped to the ring
    if (marker) {
      const dx = (marker.x - px) * SCALE * zoom
      const dz = (marker.z - pz) * SCALE * zoom
      const ca = Math.cos(alpha)
      const sa = Math.sin(alpha)
      let sx = dx * ca - dz * sa
      let sy = dx * sa + dz * ca
      const d = Math.hypot(sx, sy)
      const lim = r - 12
      if (d > lim) {
        sx = (sx / d) * lim
        sy = (sy / d) * lim
      }
      c.beginPath()
      c.arc(r + sx, r + sy, 6, 0, Math.PI * 2)
      c.fillStyle = '#ffd23f'
      c.fill()
      c.lineWidth = 2
      c.strokeStyle = '#1b2438'
      c.stroke()
    }

    // player arrow
    const a = camYaw - Math.PI
    const hx = Math.sin(playerHeading - a)
    const hy = Math.cos(playerHeading - a)
    c.save()
    c.translate(r, r)
    c.fillStyle = '#ffffff'
    c.strokeStyle = '#1b2438'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(hx * 9, hy * 9)
    c.lineTo(-hy * 5.5 - hx * 6, hx * 5.5 - hy * 6)
    c.lineTo(hy * 5.5 - hx * 6, -hx * 5.5 - hy * 6)
    c.closePath()
    c.fill()
    c.stroke()
    c.restore()

    c.beginPath()
    c.arc(r, r, r - 2, 0, Math.PI * 2)
    c.lineWidth = 3
    c.strokeStyle = 'rgba(255,255,255,0.85)'
    c.stroke()
  }
}
