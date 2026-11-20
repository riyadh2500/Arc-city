// Loot dropped by defeated pedestrians and officers: cash bundles and ammo boxes.
import * as THREE from 'three'
import type { WeaponId } from './weapons'

interface Item {
  mesh: THREE.Mesh
  x: number
  z: number
  type: 'cash' | 'ammo'
  value: number
  weapon: WeaponId
  age: number
}

export interface PickupHooks {
  cash(n: number): void
  ammo(w: WeaponId, n: number): void
}

const cashGeo = new THREE.BoxGeometry(0.34, 0.07, 0.2)
const ammoGeo = new THREE.BoxGeometry(0.3, 0.18, 0.2)
const cashMat = new THREE.MeshStandardMaterial({ color: 0x4caf6a, emissive: new THREE.Color(0x1d6a38), emissiveIntensity: 0.8, roughness: 0.6 })
const ammoMat = new THREE.MeshStandardMaterial({ color: 0x8a7a3a, emissive: new THREE.Color(0x6a4a10), emissiveIntensity: 0.7, roughness: 0.6, metalness: 0.3 })

export class Pickups {
  readonly group = new THREE.Group()
  private items: Item[] = []

  spawnCash(x: number, z: number, amount: number): void {
    this.add('cash', x, z, amount, 'pistol')
  }

  spawnAmmo(x: number, z: number, weapon: WeaponId, amount: number): void {
    this.add('ammo', x, z, amount, weapon)
  }

  private add(type: Item['type'], x: number, z: number, value: number, weapon: WeaponId): void {
    const mesh = new THREE.Mesh(type === 'cash' ? cashGeo : ammoGeo, type === 'cash' ? cashMat : ammoMat)
    const ox = x + (Math.random() - 0.5) * 1.6
    const oz = z + (Math.random() - 0.5) * 1.6
    mesh.position.set(ox, 0.5, oz)
    mesh.castShadow = false
    this.group.add(mesh)
    this.items.push({ mesh, x: ox, z: oz, type, value, weapon, age: 0 })
  }

  update(dt: number, px: number, pz: number, hooks: PickupHooks): void {
    for (const it of [...this.items]) {
      it.age += dt
      it.mesh.rotation.y += dt * 2.2
      it.mesh.position.y = 0.45 + Math.sin(it.age * 3) * 0.08
      const d = Math.hypot(it.x - px, it.z - pz)
      if (d < 1.6) {
        if (it.type === 'cash') hooks.cash(it.value)
        else hooks.ammo(it.weapon, it.value)
        this.remove(it)
      } else if (it.age > 90) this.remove(it)
    }
  }

  private remove(it: Item): void {
    it.mesh.removeFromParent()
    this.items = this.items.filter((o) => o !== it)
  }
}
