// Chooses which builder runs for each block of the city grid.
import type { Ctx } from './blocksCore'
import { buildCondo, buildLake, buildMidrise, buildPark, buildPlaza, buildPolice, buildTower } from './blocks'
import { buildShops, buildSuburb, buildWarehouse, buildYard } from './blocks2'
import { MID, districtOf } from './districts'
import { mulberry32 } from './util'

export type BlockType =
  | 'plaza' | 'tower' | 'midrise' | 'police' | 'shops' | 'garage' | 'old' | 'warehouse'
  | 'yard' | 'suburb' | 'park' | 'lake' | 'condo' | 'autoshop' | 'oldgarage'

export function blockTypeOf(i: number, j: number): BlockType {
  const rng = mulberry32(7000 + i * 131 + j * 17)
  const r = rng()
  if (i === MID && j === MID) return 'plaza'
  if (i === MID - 1 && j === MID) return 'police'
  if (i === MID && j === MID + 1) return 'garage'
  if (i === MID + 2 && j === MID - 1) return 'autoshop'
  if (i === MID - 3 && j === MID - 3) return 'oldgarage'
  switch (districtOf(i, j)) {
    case 'downtown': return r < 0.85 ? 'tower' : 'midrise'
    case 'midtown': return r < 0.2 ? 'tower' : r < 0.6 ? 'midrise' : 'shops'
    case 'oldtown': return r < 0.72 ? 'old' : r < 0.84 ? 'park' : 'shops'
    case 'industrial': return r < 0.5 ? 'warehouse' : 'yard'
    case 'suburbs': return r < 0.86 ? 'suburb' : 'park'
    default: return r < 0.35 ? 'park' : r < 0.55 ? 'lake' : 'condo'
  }
}

const MIDTOWN_NAMES = ['ARC MART', 'BANK', 'ELECTRO', 'PHARMACY', 'PIZZA', 'CAFE 402', 'HOTEL ARC']
const OLD_NAMES = ['CAFE 402', 'DINER', 'BOOKS', 'PIZZA', 'DONUTS', 'HARDWARE', 'ARC MART']

export function buildBlock(c: Ctx, type: BlockType, i: number, j: number, cx: number, cz: number): { x: number; z: number } | null {
  c.rng = mulberry32(1000 + i * 37 + j * 101)
  switch (type) {
    case 'plaza': buildPlaza(c, cx, cz); break
    case 'tower': buildTower(c, cx, cz); break
    case 'midrise': buildMidrise(c, cx, cz); break
    case 'police': return buildPolice(c, cx, cz)
    case 'shops': buildShops(c, cx, cz, { styles: [0, 4, 6, 10, 5], names: MIDTOWN_NAMES, minF: 2, maxF: 5 }); break
    case 'garage': buildShops(c, cx, cz, { styles: [0, 4, 6, 10], names: MIDTOWN_NAMES, minF: 2, maxF: 4, garage: 'ARC GARAGE' }); break
    case 'oldgarage': buildShops(c, cx, cz, { styles: [8, 8, 6], names: OLD_NAMES, minF: 2, maxF: 4, garage: 'ARC GARAGE' }); break
    case 'autoshop': buildShops(c, cx, cz, { styles: [7, 5], names: ['HARDWARE', 'CARGO'], minF: 1, maxF: 2, garage: 'ARC AUTO' }); break
    case 'old': buildShops(c, cx, cz, { styles: [8, 8, 8, 6, 9, 10], names: OLD_NAMES, minF: 3, maxF: 6 }); break
    case 'warehouse': buildWarehouse(c, cx, cz); break
    case 'yard': buildYard(c, cx, cz); break
    case 'suburb': buildSuburb(c, cx, cz); break
    case 'park': buildPark(c, cx, cz); break
    case 'lake': buildLake(c, cx, cz); break
    case 'condo': buildCondo(c, cx, cz); break
  }
  return null
}
