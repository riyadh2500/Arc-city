// Renderer wrapper: optional HDR bloom (high quality) and dynamic resolution scaling.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { QUALITY, type Quality } from './gameTypes'

export class Gfx {
  readonly renderer: THREE.WebGLRenderer
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private quality: Quality
  private scale = 1
  private w = 1
  private h = 1
  private frames = 0
  private acc = 0
  fps = 60

  constructor(
    private container: HTMLElement,
    quality: Quality,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.quality = quality
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.75
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none'
    this.renderer.domElement.tabIndex = 0
    container.appendChild(this.renderer.domElement)
    this.setQuality(quality)
  }

  get pixelRatio(): number {
    return Math.min(window.devicePixelRatio, QUALITY[this.quality].pr) * this.scale
  }

  setQuality(q: Quality): void {
    this.quality = q
    this.scale = 1
    this.composer?.dispose()
    this.composer = null
    this.bloom = null
    if (QUALITY[q].bloom) {
      const rt = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, samples: 4 })
      this.composer = new EffectComposer(this.renderer, rt)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w / 2, this.h / 2), 0.2, 0.6, 1.0)
      this.composer.addPass(this.bloom)
      this.composer.addPass(new OutputPass())
    }
    this.resize()
  }

  /** bloom strength follows darkness: subtle by day, glowing lights at night */
  setNight(n: number): void {
    if (!this.bloom) return
    this.bloom.strength = 0.1 + n * 0.55
    this.bloom.threshold = 1.0 - n * 0.2
  }

  resize(): void {
    this.w = this.container.clientWidth || 1
    this.h = this.container.clientHeight || 1
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(this.w, this.h, false)
    this.composer?.setPixelRatio(this.pixelRatio)
    this.composer?.setSize(this.w, this.h)
    this.camera.aspect = this.w / this.h
    this.camera.updateProjectionMatrix()
  }

  /** drop resolution when the frame rate sags, restore it when there is headroom */
  private adapt(): void {
    const max = 1
    const min = 0.6
    let next = this.scale
    if (this.fps < 38 && this.scale > min) next = Math.max(min, this.scale - 0.1)
    else if (this.fps > 57 && this.scale < max) next = Math.min(max, this.scale + 0.05)
    if (next !== this.scale) {
      this.scale = next
      this.resize()
    }
  }

  render(dt: number): void {
    this.frames++
    this.acc += dt
    if (this.acc >= 2) {
      this.fps = this.frames / this.acc
      this.frames = 0
      this.acc = 0
      this.adapt()
    }
    if (this.composer) this.composer.render(dt)
    else this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.composer?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
