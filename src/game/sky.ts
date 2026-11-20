// Sky, sun/moon lighting, stars, clouds, fog and environment reflections.
import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { clamp, lerp, mulberry32, TAU } from './util'
import { makeCloud } from './textures'

const DAY_FOG = new THREE.Color(0xbcd0e6)
const NIGHT_FOG = new THREE.Color(0x070b16)
const DUSK_FOG = new THREE.Color(0xe39a68)

export class SkySystem {
  readonly sky = new Sky()
  private envSky = new Sky()
  private envScene = new THREE.Scene()
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private envTimer = 99
  readonly sun = new THREE.DirectionalLight(0xffffff, 3)
  readonly hemi = new THREE.HemisphereLight(0xbcd7ff, 0x3a4a30, 0.5)
  private stars: THREE.Points
  private starMat: THREE.PointsMaterial
  private moon: THREE.Mesh
  private clouds: { s: THREE.Sprite; bx: number; bz: number; y: number }[] = []
  private cloudMat: THREE.SpriteMaterial[] = []
  private drift = 0
  night = 0
  elevation = 1
  readonly sunDir = new THREE.Vector3()
  private tmp = new THREE.Color()
  private sunU: THREE.IUniform<THREE.Vector3>
  private envSunU: THREE.IUniform<THREE.Vector3>

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, shadowSize: number) {
    this.sunU = this.sky.material.uniforms['sunPosition'] as THREE.IUniform<THREE.Vector3>
    this.envSunU = this.envSky.material.uniforms['sunPosition'] as THREE.IUniform<THREE.Vector3>
    this.sky.scale.setScalar(2400)
    scene.add(this.sky)
    this.envSky.scale.setScalar(50)
    this.envScene.add(this.envSky)
    this.pmrem = new THREE.PMREMGenerator(renderer)
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms
      u['turbidity'].value = 5
      u['rayleigh'].value = 1.6
      u['mieCoefficient'].value = 0.004
      u['mieDirectionalG'].value = 0.82
    }

    this.sun.castShadow = shadowSize > 0
    this.sun.shadow.mapSize.set(Math.max(shadowSize, 16), Math.max(shadowSize, 16))
    const cam = this.sun.shadow.camera
    cam.left = -80
    cam.right = 80
    cam.top = 80
    cam.bottom = -80
    cam.near = 1
    cam.far = 500
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.06
    scene.add(this.sun, this.sun.target, this.hemi)

    // stars
    const rng = mulberry32(8)
    const pos = new Float32Array(1800 * 3)
    for (let i = 0; i < 1800; i++) {
      const u = rng() * 2 - 1
      const t = rng() * TAU
      const r = Math.sqrt(1 - u * u)
      pos[i * 3] = r * Math.cos(t) * 2200
      pos[i * 3 + 1] = Math.abs(u) * 2200
      pos[i * 3 + 2] = r * Math.sin(t) * 2200
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
    this.stars = new THREE.Points(sg, this.starMat)
    this.stars.frustumCulled = false
    scene.add(this.stars)

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(70, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false, transparent: true }),
    )
    this.moon.frustumCulled = false
    scene.add(this.moon)

    // clouds
    const ct = makeCloud()
    for (let i = 0; i < 26; i++) {
      const m = new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.85 })
      const s = new THREE.Sprite(m)
      const sc = 420 + rng() * 380
      s.scale.set(sc, sc * 0.5, 1)
      s.renderOrder = -1
      this.clouds.push({ s, bx: (rng() - 0.5) * 3000, bz: (rng() - 0.5) * 3000, y: 380 + rng() * 180 })
      this.cloudMat.push(m)
      scene.add(s)
    }
    scene.fog = new THREE.Fog(DAY_FOG.getHex(), 140, 1050)
  }

  setShadowSize(px: number): void {
    this.sun.castShadow = px > 0
    if (px > 0) {
      this.sun.shadow.mapSize.set(px, px)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
  }

  /** hours in [0,24) */
  update(dt: number, hours: number, focus: THREE.Vector3, camPos: THREE.Vector3): void {
    const a = ((hours - 6) / 24) * TAU
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.3).normalize()
    const el = this.sunDir.y
    this.elevation = el
    const n = clamp((0.06 - el) / 0.2, 0, 1)
    this.night = n

    // sky shader follows the camera
    this.sky.position.copy(camPos)
    this.sunU.value.copy(this.sunDir)
    this.envSunU.value.copy(this.sunDir)

    // key light: sun by day, moon at night
    const sunI = 3.4 * clamp(el * 3.5, 0, 1)
    const moonI = 0.45 * n
    const useSun = sunI >= moonI
    const dir = useSun ? this.sunDir : this.tmp2.copy(this.sunDir).negate()
    this.sun.intensity = Math.max(sunI, moonI)
    if (useSun) {
      const warm = clamp(1 - el * 3, 0, 1)
      this.sun.color.setRGB(1, lerp(0.97, 0.62, warm), lerp(0.92, 0.38, warm))
    } else {
      this.sun.color.setRGB(0.55, 0.65, 1)
    }
    const qx = Math.round(focus.x / 2) * 2
    const qz = Math.round(focus.z / 2) * 2
    this.sun.target.position.set(qx, 0, qz)
    this.sun.position.set(qx + dir.x * 200, dir.y * 200, qz + dir.z * 200)
    this.sun.target.updateMatrixWorld()

    this.hemi.intensity = lerp(0.55, 0.22, n)
    this.hemi.color.setRGB(lerp(0.74, 0.25, n), lerp(0.84, 0.32, n), lerp(1, 0.55, n))
    this.scene.environmentIntensity = lerp(0.65, 0.2, n)
    this.renderer.toneMappingExposure = lerp(0.72, 0.9, n)

    // fog colour: day / dusk / night
    const fog = this.scene.fog as THREE.Fog
    this.tmp.copy(DAY_FOG).lerp(NIGHT_FOG, n)
    const dusk = clamp(1 - Math.abs(el) / 0.25, 0, 1) * 0.55
    this.tmp.lerp(DUSK_FOG, dusk)
    fog.color.copy(this.tmp)

    // stars and moon
    this.starMat.opacity = n
    this.stars.visible = n > 0.02
    this.stars.position.copy(camPos)
    this.stars.rotation.y = hours * 0.02
    this.moon.visible = n > 0.05
    this.moon.position.copy(camPos).addScaledVector(this.sunDir, -2000)
    ;(this.moon.material as THREE.MeshBasicMaterial).opacity = clamp(n * 1.2, 0, 1)

    // clouds drift and tint
    this.drift += dt * 7
    const cr = lerp(1, 0.12, n)
    const cg = lerp(1, 0.14, n)
    const cb = lerp(1, 0.22, n)
    const warm = dusk
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i]
      const x = ((((c.bx + this.drift - camPos.x) % 3000) + 4500) % 3000) - 1500
      const z = ((((c.bz - camPos.z) % 3000) + 4500) % 3000) - 1500
      c.s.position.set(camPos.x + x, c.y, camPos.z + z)
      this.cloudMat[i].color.setRGB(cr, lerp(cg, cg * 0.82, warm), lerp(cb, cb * 0.65, warm))
    }

    this.envTimer += dt
    if (this.envTimer > 6) {
      this.envTimer = 0
      this.refreshEnv()
    }
  }

  private tmp2 = new THREE.Vector3()

  private refreshEnv(): void {
    const old = this.envRT
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 100)
    this.scene.environment = this.envRT.texture
    old?.dispose()
  }

  dispose(): void {
    this.envRT?.dispose()
    this.pmrem.dispose()
  }
}
