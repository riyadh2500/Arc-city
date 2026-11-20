// Particle effects (tyre smoke, engine smoke, sparks) and persistent skid marks.
import * as THREE from 'three'

const MAX = 480

export class Particles {
  readonly points: THREE.Points
  private pos = new Float32Array(MAX * 3)
  private vel = new Float32Array(MAX * 3)
  private life = new Float32Array(MAX)
  private maxLife = new Float32Array(MAX)
  private size0 = new Float32Array(MAX)
  private size1 = new Float32Array(MAX)
  private col = new Float32Array(MAX * 3)
  private a0 = new Float32Array(MAX)
  private sizeA = new Float32Array(MAX)
  private alphaA = new Float32Array(MAX)
  private next = 0
  private geo = new THREE.BufferGeometry()
  readonly mat: THREE.ShaderMaterial

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.sizeA, 1))
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaA, 1))
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3))
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 pcolor;
        varying float vA; varying vec3 vC; uniform float uScale;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * uScale / max(0.1, -mv.z);
          vA = alpha; vC = pcolor;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    s0: number,
    s1: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
  ): void {
    const i = this.next
    this.next = (this.next + 1) % MAX
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    this.life[i] = life
    this.maxLife[i] = life
    this.size0[i] = s0
    this.size1[i] = s1
    this.col[i * 3] = r
    this.col[i * 3 + 1] = g
    this.col[i * 3 + 2] = b
    this.a0[i] = alpha
  }

  smoke(x: number, y: number, z: number, vx: number, vz: number, dark = false): void {
    const c = dark ? 0.12 : 0.78
    this.emit(x, y, z, vx * 0.3 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, vz * 0.3 + (Math.random() - 0.5) * 0.6, 1.1 + Math.random() * 0.8, 0.8, 3.4, c, c, c, dark ? 0.55 : 0.4)
  }

  sparks(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n; k++) {
      this.emit(x, y, z, (Math.random() - 0.5) * 7, Math.random() * 4, (Math.random() - 0.5) * 7, 0.3 + Math.random() * 0.3, 0.14, 0.05, 1, 0.75, 0.3, 1)
    }
  }

  update(dt: number, scale: number): void {
    this.mat.uniforms.uScale.value = scale
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alphaA[i] = 0
        continue
      }
      this.life[i] -= dt
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i]
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      this.vel[i * 3 + 1] -= dt * 0.05
      this.sizeA[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t
      this.alphaA[i] = this.a0[i] * (1 - t) * (t < 0.1 ? t * 10 : 1)
    }
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true
  }
}

const MARKS = 600

export class SkidMarks {
  readonly mesh: THREE.InstancedMesh
  private i = 0
  private dirty = false
  private d = new THREE.Object3D()

  constructor() {
    const geo = new THREE.PlaneGeometry(0.24, 0.8).rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
    this.mesh = new THREE.InstancedMesh(geo, mat, MARKS)
    this.mesh.frustumCulled = false
    this.d.position.set(0, -50, 0)
    this.d.updateMatrix()
    for (let k = 0; k < MARKS; k++) this.mesh.setMatrixAt(k, this.d.matrix)
  }

  add(x: number, z: number, heading: number): void {
    this.d.position.set(x, 0.045, z)
    this.d.rotation.set(0, heading, 0)
    this.d.updateMatrix()
    this.mesh.setMatrixAt(this.i, this.d.matrix)
    this.i = (this.i + 1) % MARKS
    this.dirty = true
  }

  flush(): void {
    if (this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true
      this.dirty = false
    }
  }
}
