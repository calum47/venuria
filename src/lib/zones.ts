import type { ProjectZone, ObstacleShape, Point2D } from '@/types'
import type { DbProjectZone } from '@/types/db'
import { obstacleAreaCm2 } from '@/lib/utils/geometry'

/**
 * Fixed palette rather than a colour picker: overlays stay legible on top of
 * a floor plan, and the same colour means the same thing across a planner's
 * projects. Eight is enough for any realistic room.
 */
export const ZONE_PALETTE = [
  '#ec4899', // pink
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#6366f1', // indigo
] as const

export type ZonePreset = { name: string; color: string }

export const ZONE_PRESETS: ZonePreset[] = [
  { name: 'Dance Floor', color: '#ec4899' },
  { name: 'Bar',         color: '#f59e0b' },
  { name: 'Ceremony',    color: '#8b5cf6' },
  { name: 'Buffet',      color: '#10b981' },
  { name: 'Photo Booth', color: '#3b82f6' },
  { name: 'Stage / DJ',  color: '#ef4444' },
  { name: 'Lounge',      color: '#14b8a6' },
]

export type ZoneTool = 'select' | 'rect' | 'polygon'

export function mapDbZone(row: DbProjectZone): ProjectZone {
  return {
    id: row.id,
    projectId: row.project_id,
    roomId: row.room_id,
    name: row.name,
    color: row.color,
    shape: row.shape as unknown as ObstacleShape,
    sortOrder: row.sort_order,
  }
}

export function zoneAreaM2(zone: ProjectZone): number {
  return obstacleAreaCm2(zone.shape) / 10_000
}

/** Where to put the label. Rect/circle: centre. Polygon: vertex average — fine for the convex-ish shapes people actually draw. */
export function zoneLabelAnchor(shape: ObstacleShape): Point2D {
  if (shape.type !== 'polygon') return shape.center
  const n = shape.points.length || 1
  return {
    x: shape.points.reduce((s, p) => s + p.x, 0) / n,
    y: shape.points.reduce((s, p) => s + p.y, 0) / n,
  }
}

/** '#rrggbb' + alpha → 'rgba(...)'. Konva wants rgba strings for translucent fills. */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return `rgba(99,102,241,${alpha})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}
