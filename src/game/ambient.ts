// Ambient life: fountain spray and flocks of birds circling over the city.
import * as THREE from 'three'

const DROPS = 96
const BIRDS = 16

interface Bird {
  root: THREE.Group
  wingL: THREE.Mesh
  wingR: THREE.Mesh
  radius: number
  speed: number
  phase: number
  height: number
  cx: number
  cz: number
}

export class Ambient {
  readonly group = new THREE.Group()
  private drops: THREE.InstancedMesh
  private birds: Bird[] = []
  private dummy = new THREE.Object3D()
  private fx: number
  private fz: number

  constructor(parent: THREE.Object3D, fx: number, fz: number) {
    this.fx = fx
    this.fz = fz
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.2 })
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), mat, DROPS)
    this.drops.frustumCulled = false
    this.group.add(this.drops)

    const wingGeo = new THREE.BufferGeometry()
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, 1.1, 0, 0.1, 0, 0, -0.3], 3))
    wingGeo.computeVertexNormals()
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9, side: THREE.DoubleSide })
    const bodyGeo = new THREE.ConeGeometry(0.14, 0.7, 5).rotateX(Math.PI / 2)
    for (let k = 0; k < BIRDS; k++) {
      const root = new THREE.Group()
      root.add(new THREE.Mesh(bodyGeo, wingMat))
      const wingL = new THREE.Mesh(wingGeo, wingMat)
      const wingR = new THREE.Mesh(wingGeo, wingMat)
      wingR.scale.x = -1
      root.add(wingL, wingR)
      this.group.add(root)
      const flock = k % 4
      this.birds.push({
        root,
        wingL,
        wingR,
        radius: 70 + flock * 55 + (k % 3) * 6,
        speed: (0.05 + flock * 0.012) * (flock % 2 ? 1 : -1),
        phase: (k / BIRDS) * Math.PI * 2 + flock,
        height: 55 + flock * 22 + (k % 5) * 2,
        cx: (flock - 1.5) * 90,
        cz: ((flock * 37) % 5) * 30 - 60,
      })
    }
    parent.add(this.group)
  }

  update(time: number, night: number): void {
    // fountain: arcing droplets leave a central jet and a ring of nozzles
    for (let k = 0; k < DROPS; k++) {
      const u = (time * 0.85 + k * 0.1731) % 1
      const arc = 4 * u * (1 - u)
      const central = k % 6 === 0
      const a = (k % 16) * ((Math.PI * 2) / 16) + k * 0.05
      const reach = central ? 0.25 * u : (3.2 + (k % 3) * 0.8) * u
      const rise = central ? 5.5 : 1.6 + (k % 4) * 0.45
      this.dummy.position.set(this.fx + Math.cos(a) * reach, 1.3 + arc * rise, this.fz + Math.sin(a) * reach)
      const s = 0.6 + (1 - u) * 0.5
      this.dummy.scale.set(s, s * 1.3, s)
      this.dummy.updateMatrix()
      this.drops.setMatrixAt(k, this.dummy.matrix)
    }
    this.drops.instanceMatrix.needsUpdate = true

    this.group.visible = true
    for (const b of this.birds) {
      b.root.visible = night < 0.7
      if (!b.root.visible) continue
      const ang = b.phase + time * b.speed
      const x = b.cx + Math.cos(ang) * b.radius
      const z = b.cz + Math.sin(ang) * b.radius
      b.root.position.set(x, b.height + Math.sin(time * 0.7 + b.phase) * 3, z)
      const dir = b.speed > 0 ? 1 : -1
      b.root.rotation.y = Math.atan2(-Math.sin(ang) * dir, Math.cos(ang) * dir)
      b.root.rotation.z = -dir * 0.25
      const flap = Math.sin(time * 9 + b.phase * 3) * 0.7
      b.wingL.rotation.z = flap
      b.wingR.rotation.z = -flap
    }
  }
}
