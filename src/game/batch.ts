// Small helper for building InstancedMesh batches from many `add` calls.
import * as THREE from 'three'

const dummy = new THREE.Object3D()

export class InstBatch {
  private items: { m: THREE.Matrix4; c?: THREE.Color }[] = []
  mesh: THREE.InstancedMesh | null = null

  constructor(
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private cast = true,
    private receive = true,
  ) {}

  add(
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotY = 0,
    color?: THREE.ColorRepresentation,
  ): number {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, rotY, 0)
    dummy.scale.set(sx, sy, sz)
    dummy.updateMatrix()
    this.items.push({ m: dummy.matrix.clone(), c: color !== undefined ? new THREE.Color(color) : undefined })
    return this.items.length - 1
  }

  get count(): number {
    return this.items.length
  }

  build(parent: THREE.Object3D): THREE.InstancedMesh | null {
    if (this.items.length === 0) return null
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.items.length)
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m)
      if (it.c) mesh.setColorAt(i, it.c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.castShadow = this.cast
    mesh.receiveShadow = this.receive
    mesh.computeBoundingSphere()
    parent.add(mesh)
    this.mesh = mesh
    return mesh
  }
}
