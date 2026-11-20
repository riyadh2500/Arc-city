// Neighbourhood layout for the city grid.
import { CITY, blockIndex } from './util'

export type District = 'downtown' | 'midtown' | 'oldtown' | 'industrial' | 'suburbs' | 'parkside'

export const DISTRICT_NAMES: Record<District, string> = {
  downtown: 'Downtown',
  midtown: 'Midtown',
  oldtown: 'Old Town',
  industrial: 'Port Industrial',
  suburbs: 'Willow Heights',
  parkside: 'Parkside',
}

/** Pedestrian density and traffic cruise-speed factors per district. */
export const DISTRICT_PEDS: Record<District, number> = {
  downtown: 1.6,
  midtown: 1.2,
  oldtown: 1.4,
  industrial: 0.25,
  suburbs: 0.6,
  parkside: 1.0,
}
export const DISTRICT_SPEED: Record<District, number> = {
  downtown: 0.8,
  midtown: 0.95,
  oldtown: 0.85,
  industrial: 1.15,
  suburbs: 0.9,
  parkside: 1.0,
}

export const MID = Math.floor(CITY.N / 2)

export function districtOf(i: number, j: number): District {
  const dx = i - MID
  const dz = j - MID
  const d = Math.max(Math.abs(dx), Math.abs(dz))
  if (d <= 1) return 'downtown'
  if (d === 2) return 'midtown'
  if (dx <= 0 && dz < 0) return 'oldtown'
  if (dx > 0 && dz <= 0) return 'industrial'
  if (dx >= 0 && dz > 0) return 'suburbs'
  return 'parkside'
}

export function districtAt(x: number, z: number): District {
  const [i, j] = blockIndex(x, z)
  return districtOf(i, j)
}
