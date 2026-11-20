// Static geometry merging: many boxes/planes become a few draw calls per chunk.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface MatSpec {
  mat: THREE.Material
  cast: boolean
  receive: boolean
}

const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const one = new THREE.Vector3(1, 1, 1)

export class Merger {
  private lists = new Map<string, THREE.BufferGeometry[]>()

  /** add geometry (cloned) with translation + y rotation */
  add(key: string, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rotY = 0, color?: number): void {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    e.set(0, rotY, 0)
    q.setFromEuler(e)
    m4.compose(new THREE.Vector3(x, y, z), q, one)
    g.applyMatrix4(m4)
    if (color !== undefined) {
      g.deleteAttribute('uv')
      const n = g.attributes.position.count
      const c = new THREE.Color(color)
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r
        arr[i * 3 + 1] = c.g
        arr[i * 3 + 2] = c.b
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    }
    g = g.index ? g.toNonIndexed() : g
    const list = this.lists.get(key)
    if (list) list.push(g)
    else this.lists.set(key, [g])
  }

  build(parent: THREE.Object3D, specs: Record<string, MatSpec>): void {
    for (const [key, list] of this.lists) {
      const spec = specs[key]
      if (!spec || list.length === 0) continue
      const geo = mergeGeometries(list, false)
      geo.computeBoundingSphere()
      const mesh = new THREE.Mesh(geo, spec.mat)
      mesh.castShadow = spec.cast
      mesh.receiveShadow = spec.receive
      parent.add(mesh)
    }
    this.lists.clear()
  }
}

/**
 * Box split into facade sides and a roof, UVs scaled to the 32m x 28.8m facade tile.
 */
export function boxParts(w: number, h: number, d: number, rng: () => number): { side: THREE.BufferGeometry; top: THREE.BufferGeometry } {
  const src = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  const pos = src.attributes.position.array as Float32Array
  const nor = src.attributes.normal.array as Float32Array
  const uv = src.attributes.uv.array as Float32Array
  const ou = Math.floor(rng() * 8) / 8
  const ov = Math.floor(rng() * 8) / 8
  const take = (faces: number[], scaleUV: boolean) => {
    const P: number[] = []
    const N: number[] = []
    const U: number[] = []
    for (const f of faces) {
      const su = f < 2 ? d / 32 : w / 32
      const sv = h / 28.8
      for (let v = f * 6; v < f * 6 + 6; v++) {
        P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
        N.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2])
        if (scaleUV) U.push(uv[v * 2] * su + ou, uv[v * 2 + 1] * sv + ov)
        else U.push(0, 0)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    return g
  }
  return { side: take([0, 1, 4, 5], true), top: take([2], false) }
}

/** Horizontal plane with tiled uvs (repeat per metre = 1/tile). */
export function tiledPlane(w: number, d: number, tile: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile)
  return g
}
