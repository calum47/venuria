import { Point2D, ObstacleShape } from '@/types'

// ─── Point-in-shape tests ───────────────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test. A point exactly on an edge is treated as
 * OUTSIDE — furniture can't be "on the wall" either, per the walls-act-as-real-
 * walls requirement.
 */
export function isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function isPointInCircle(point: Point2D, center: Point2D, radiusCm: number): boolean {
  const dx = point.x - center.x
  const dy = point.y - center.y
  return dx * dx + dy * dy <= radiusCm * radiusCm
}

/** Corners of a rotated rectangle, centred on `center`. Shared by rect obstacles and furniture footprints. */
export function getRectCorners(
  center: Point2D,
  widthCm: number,
  depthCm: number,
  rotationDeg: number,
): Point2D[] {
  const halfW = widthCm / 2
  const halfD = depthCm / 2
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const local = [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ]
  return local.map((p) => ({
    x: center.x + p.x * cos - p.y * sin,
    y: center.y + p.x * sin + p.y * cos,
  }))
}

export function isPointInObstacle(point: Point2D, obstacle: ObstacleShape): boolean {
  switch (obstacle.type) {
    case 'circle':
      return isPointInCircle(point, obstacle.center, obstacle.radiusCm)
    case 'rect':
      return isPointInPolygon(
        point,
        getRectCorners(obstacle.center, obstacle.widthCm, obstacle.depthCm, obstacle.rotationDeg),
      )
    case 'polygon':
      return isPointInPolygon(point, obstacle.points)
  }
}

// ─── Furniture footprint validation ─────────────────────────────────────────

/** Oriented footprint corners for a placed catalog item (table, chair, etc). */
export function getFootprintCorners(
  positionCm: Point2D,
  widthCm: number,
  depthCm: number,
  rotationDeg: number,
): Point2D[] {
  return getRectCorners(positionCm, widthCm, depthCm, rotationDeg)
}

function footprintCenter(footprint: Point2D[]): Point2D {
  const sum = footprint.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / footprint.length, y: sum.y / footprint.length }
}

/**
 * Validates a furniture footprint against the room's traced boundary and obstacles.
 *
 * IMPORTANT — this is an approximation, not exact polygon-vs-polygon collision: it
 * checks the 4 footprint corners plus the centre. That catches the overwhelming
 * majority of real placements, but in theory could miss a case where an obstacle
 * edge cuts through the middle of a footprint edge without any corner crossing it
 * (only possible when the obstacle is smaller than the furniture piece — e.g. a
 * thin decorative rail through a large banquet table). Fine for catalog furniture
 * vs. pillars/columns; revisit with full SAT (separating axis theorem) if that
 * ever becomes a real bug with thinner obstacle shapes.
 *
 * If `boundaryPolygon` has fewer than 3 points (not yet traced by the venue
 * manager), boundary checking is skipped — the caller should fall back to the
 * legacy rectangle clamp against bounding_box_width_cm/depth_cm.
 */
export function validateFootprint(
  footprint: Point2D[],
  boundaryPolygon: Point2D[],
  obstacles: ObstacleShape[],
): { valid: boolean; reason?: 'outside_boundary' | 'inside_obstacle' } {
  const center = footprintCenter(footprint)
  const checkPoints = [...footprint, center]

  if (boundaryPolygon.length >= 3) {
    for (const point of checkPoints) {
      if (!isPointInPolygon(point, boundaryPolygon)) {
        return { valid: false, reason: 'outside_boundary' }
      }
    }
  }

  for (const obstacle of obstacles) {
    for (const point of checkPoints) {
      if (isPointInObstacle(point, obstacle)) {
        return { valid: false, reason: 'inside_obstacle' }
      }
    }
  }

  return { valid: true }
}

/** Axis-aligned bounding box of a polygon — used to derive the cached bounding_box_width/depth_cm fallback columns whenever a boundary is saved. */
export function polygonBoundingBox(polygon: Point2D[]): {
  widthCm: number
  depthCm: number
  minX: number
  minY: number
} {
  if (polygon.length === 0) return { widthCm: 0, depthCm: 0, minX: 0, minY: 0 }
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { widthCm: maxX - minX, depthCm: maxY - minY, minX, minY }
}

/** Euclidean distance in cm — used by the calibration tool to turn a drawn reference line into a cm-per-px ratio. */
export function distanceCm(a: Point2D, b: Point2D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

/**
 * When `toCm` (the footprint centre a drag/mirror/reassign computation wants
 * to move to) would be invalid, binary-searches the straight line from
 * `fromCm` (assumed valid — the object's position before this write) to
 * `toCm` for the furthest point that's still valid. This slides the object up
 * to the wall/obstacle edge along its direction of travel, rather than either
 * snapping straight back to `fromCm` or ignoring the collision.
 *
 * Approximation, not a true nearest-point solve: the actual closest valid
 * point to `toCm` isn't necessarily on the `fromCm`→`toCm` line (e.g. dragging
 * diagonally into a corner, the nearest escape might be sideways rather than
 * backtracking). Good enough for continuous mouse drags, where `fromCm` is
 * usually only a few cm away from `toCm` and the two are rarely far apart
 * enough for that gap to matter. If `fromCm` itself is already invalid (e.g.
 * an obstacle was added after the object was placed), returns `fromCm`
 * unchanged rather than searching from a bad starting point.
 */
export function findNearestValidAlongPath(
  fromCm: Point2D,
  toCm: Point2D,
  widthCm: number,
  depthCm: number,
  rotationDeg: number,
  boundaryPolygon: Point2D[],
  obstacles: ObstacleShape[],
  iterations = 14,
): Point2D {
  const isValidAt = (t: number) => {
    const p = { x: fromCm.x + (toCm.x - fromCm.x) * t, y: fromCm.y + (toCm.y - fromCm.y) * t }
    return validateFootprint(getRectCorners(p, widthCm, depthCm, rotationDeg), boundaryPolygon, obstacles).valid
  }
  if (!isValidAt(0)) return fromCm
  if (isValidAt(1)) return toCm
  let validT = 0
  let invalidT = 1
  for (let i = 0; i < iterations; i++) {
    const midT = (validT + invalidT) / 2
    if (isValidAt(midT)) validT = midT
    else invalidT = midT
  }
  return { x: fromCm.x + (toCm.x - fromCm.x) * validT, y: fromCm.y + (toCm.y - fromCm.y) * validT }
}
