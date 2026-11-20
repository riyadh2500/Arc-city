// Interactive buildings: shop counters and garage doors / respray bays.
import type { ShopSpot } from './blocksCore'
import type { Garage } from './garage'

export interface GarageStatus {
  /** garage whose respray bay the player is parked in (stopped, inside) */
  bay: Garage | null
  /** garage the player is currently inside */
  inside: Garage | null
}

export function nearestShop(shops: ShopSpot[], x: number, z: number, r = 2.6): ShopSpot | null {
  let best: ShopSpot | null = null
  let bd = r
  for (const s of shops) {
    const d = Math.hypot(s.x - x, s.z - z)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best
}

/**
 * Doors open when you approach, close behind you once you are parked in the bay
 * (so police can't see in) and open again as soon as you move.
 */
export function updateGarages(garages: Garage[], dt: number, x: number, z: number, speed: number, intent: boolean): GarageStatus {
  let bay: Garage | null = null
  let inside: Garage | null = null
  for (const g of garages) {
    const inn = g.contains(x, z)
    if (inn) {
      inside = g
      const deep = g.inBay(x, z)
      if (deep && speed < 2.5) bay = g
      g.setOpen(!(deep && speed < 2.5) || intent)
    } else {
      g.setOpen(g.distToDoor(x, z) < 14 && Math.hypot(g.cx - x, g.cz - z) < 30)
    }
    g.update(dt)
  }
  return { bay, inside }
}
