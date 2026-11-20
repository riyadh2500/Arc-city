// Keyboard + mouse input with pointer lock and a drag-to-look fallback.

export class Input {
  private keys = new Set<string>()
  private pressedSet = new Set<string>()
  private mdx = 0
  private mdy = 0
  locked = false
  private btns = new Set<number>()
  private btnPressed = new Set<number>()
  private wheelY = 0
  private cx = 0.5
  onLockLost: (() => void) | null = null
  private readonly el: HTMLElement

  constructor(el: HTMLElement) {
    this.el = el
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('mousemove', this.onMouseMove)
    el.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('mouseleave', this.onLeave)
    document.addEventListener('pointerlockchange', this.onLockChange)
    el.addEventListener('contextmenu', this.onContext)
    el.addEventListener('wheel', this.onWheel, { passive: true })
  }

  private onContext = (e: Event) => e.preventDefault()

  private onKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault()
    if (!e.repeat) this.pressedSet.add(e.code)
    this.keys.add(e.code)
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }
  private onBlur = () => {
    this.keys.clear()
  }
  private onMouseMove = (e: MouseEvent) => {
    this.cx = e.clientX / Math.max(1, window.innerWidth)
    // pointer lock is not always available (embedded previews): a free cursor still turns the camera
    this.mdx += e.movementX
    this.mdy += e.movementY
  }
  private onMouseDown = (e: MouseEvent) => {
    // buttons always count (fire / aim), with or without pointer lock
    this.btns.add(e.button)
    this.btnPressed.add(e.button)
    if (!this.locked && e.button === 0) this.lock()
  }
  private onMouseUp = (e: MouseEvent) => {
    this.btns.delete(e.button)
  }
  private onLeave = () => {
    this.cx = 0.5
  }
  private onWheel = (e: WheelEvent) => {
    this.wheelY += e.deltaY
  }
  private onLockChange = () => {
    const was = this.locked
    this.locked = document.pointerLockElement === this.el
    if (was && !this.locked) this.onLockLost?.()
  }

  lock(): void {
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined
      if (p && typeof p.catch === 'function') p.catch(() => undefined)
    } catch {
      /* drag-to-look fallback stays active */
    }
  }
  unlock(): void {
    if (document.pointerLockElement === this.el) document.exitPointerLock()
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c))
  }
  pressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressedSet.has(c))
  }
  /** mouse button held (0 left, 2 right); only while the pointer is locked */
  mouse(b: number): boolean {
    return this.btns.has(b)
  }
  mousePressed(b: number): boolean {
    return this.btnPressed.has(b)
  }
  /** -1..1: turn the camera when the cursor sits near a screen edge and pointer lock is unavailable */
  edgeTurn(): number {
    if (this.locked) return 0
    const m = 0.04
    if (this.cx < m) return -(1 - this.cx / m)
    if (this.cx > 1 - m) return (this.cx - (1 - m)) / m
    return 0
  }
  takeWheel(): number {
    const w = this.wheelY
    this.wheelY = 0
    return w
  }
  takeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mdx, dy: this.mdy }
    this.mdx = 0
    this.mdy = 0
    return r
  }
  endFrame(): void {
    this.pressedSet.clear()
    this.btnPressed.clear()
  }
  clearAll(): void {
    this.btns.clear()
    this.btnPressed.clear()
    this.keys.clear()
    this.pressedSet.clear()
    this.mdx = 0
    this.mdy = 0
  }
  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.el.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('mouseleave', this.onLeave)
    this.el.removeEventListener('contextmenu', this.onContext)
    this.el.removeEventListener('wheel', this.onWheel)
    this.unlock()
  }
}
