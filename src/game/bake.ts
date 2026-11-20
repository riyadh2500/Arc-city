// Helpers to bake many coloured primitives into one vertex-coloured geometry.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface BakePart {
  geo: THREE.BufferGeometry
  color: number
}

/** clone + scale + rotate (XYZ euler) + translate */
export function bp(
  base: THREE.BufferGeometry,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): BakePart {
  const g = base.clone()
  g.scale(sx, sy, sz)
  if (rx || ry || rz) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))
    g.applyMatrix4(m)
  }
  g.translate(x, y, z)
  return { geo: g, color }
}

export function bakeParts(parts: BakePart[]): THREE.BufferGeometry {
  const list = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
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
    return g
  })
  return mergeGeometries(list, false)
}

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
