import { Point2D, ObstacleShape, LayoutObject } from '@/types'
import { DbCatalogItem } from '@/types/db'
import {
  isPointInPolygon,
  getFootprintCorners,
  validateFootprint,
  polygonBoundingBox,
  distanceCm,
} from './geometry'
import { generateChairObjects, getTableChairConfig } from './seating'
import { generateId } from './coordinates'

// Minimum walking-space gap enforced between any two tables (and between a new
// table and anything already in the room) — measured from each unit's outer
// edge (chairs included, not just the tabletop). Fixed for v1, not planner-
// configurable, per the 16 Sep 2026 decision.
export const AUTO_ARRANGE_CLEARANCE_CM = 90

// Grid step for the candidate-point scan. Smaller = more thorough fit-finding
// but slower; 40cm is fine-grained enough for real table sizes (smallest table
// is 120cm) while keeping the scan cheap even on large venues.
const SCAN_STEP_CM = 40

// The one fixed catalog name this file treats specially — see
// findSweetheartTable. Matched by name, same convention getTableChairConfig
// and the isRound heuristic already use elsewhere in this codebase.
const SWEETHEART_TABLE_NAME = 'Sweetheart Table'

export type TableSelection = {
  catalogItem: DbCatalogItem
  quantity: number
}

export type AutoArrangeParams = {
  boundaryPolygonCm: Point2D[] // already-resolved effective boundary (traced polygon, or the caller's untraced-room rectangle fallback)
  obstacles: ObstacleShape[]
  existingObjects: LayoutObject[] // everything already placed in this room — treated as no-go, never moved
  catalogItemsById: Map<string, DbCatalogItem>
  chairCatalogItem: DbCatalogItem
  tableSelections: TableSelection[] // the guest-table mix only — never include the Sweetheart Table itself here, it isn't a quantity the planner picks
  // Informational only: the arrangement no longer has to match the guest list.
  // Every table is placed with its maximum chairs and the planner trims from there.
  guestCount?: number
  // When true: requires a Sweetheart Table already placed in this room, and
  // splits each table type's quantity into matched left/right pairs. An odd
  // quantity's leftover instance goes dead-centre on the aisle line itself,
  // not onto either side. See the 16 Sep 2026 decision — confirmed against
  // two planner-drawn diagrams, not guessed.
  balanceAroundSweetheart?: boolean
}

export type AutoArrangeResult =
  | { success: true; objects: LayoutObject[] }
  | { success: false; reason: string }

/** Total seats across a table mix, using each table's real max-chair capacity — used by the modal to show how the mix compares with the guest list (informational, never blocks). Never include the Sweetheart Table in this — the couple aren't part of the guest list's seat count. */
export function computeMixCapacity(tableSelections: TableSelection[]): number {
  return tableSelections.reduce((sum, sel) => {
    const { maxChairs } = getTableChairConfig(sel.catalogItem.name)
    return sum + maxChairs * sel.quantity
  }, 0)
}

/**
 * Bounding radius of a table + its full ring of chairs (max chairs, all-sides
 * arrangement), centred on the table. For round tables this is exact — it
 * matches calculateChairPositions' own distanceFromCenter math exactly. For
 * rectangular tables it's a conservative approximation (half-diagonal-based,
 * same "approximation, not exact" trade-off validateFootprint already
 * documents) — a real corner-hugging chair could in theory sit fractionally
 * inside this circle without actually overlapping a neighbour, but never the
 * other way round, so it never under-counts the space a table needs.
 */
function getUnitRadiusCm(
  tableWidthCm: number,
  tableDepthCm: number,
  isRound: boolean,
  chairWidthCm: number,
  chairDepthCm: number,
): number {
  const CHAIR_GAP_CM = 5 // matches seating.ts' own default gap between table edge and chair
  if (isRound) {
    return tableWidthCm / 2 + CHAIR_GAP_CM + chairDepthCm
  }
  const halfDiagonal = Math.sqrt((tableWidthCm / 2) ** 2 + (tableDepthCm / 2) ** 2)
  return halfDiagonal + CHAIR_GAP_CM + chairDepthCm + chairWidthCm / 2
}

/** Bounding radius of an already-placed object, from its own catalog item dims — no chair-ring allowance, since a placed chair is already its own separate object in `existingObjects`. */
function getExistingObjectRadiusCm(widthCm: number, depthCm: number): number {
  return Math.sqrt((widthCm / 2) ** 2 + (depthCm / 2) ** 2)
}

/**
 * Rotates a freshly-generated table + its chairs together as one rigid body
 * around the table's own centre — same math as layoutStore's
 * `rotateObjectWithChairs`, reimplemented here as a pure function since this
 * runs before anything reaches the store. Needed because
 * calculateChairPositions (via generateChairObjects) always computes chair
 * positions in the table's *unrotated* local frame — rotation is applied as a
 * separate rigid transform afterwards, everywhere in this codebase.
 */
function rotateUnitRigid(
  table: LayoutObject,
  chairs: LayoutObject[],
  newRotationDeg: number,
): { table: LayoutObject; chairs: LayoutObject[] } {
  const deltaDeg = newRotationDeg - table.rotationDeg
  const deltaRad = (deltaDeg * Math.PI) / 180
  const tx = table.positionCm.x
  const ty = table.positionCm.y

  const rotatedChairs = chairs.map((c) => {
    const dx = c.positionCm.x - tx
    const dy = c.positionCm.y - ty
    return {
      ...c,
      positionCm: {
        x: tx + dx * Math.cos(deltaRad) - dy * Math.sin(deltaRad),
        y: ty + dx * Math.sin(deltaRad) + dy * Math.cos(deltaRad),
      },
      rotationDeg: c.rotationDeg + deltaDeg,
    }
  })

  return { table: { ...table, rotationDeg: newRotationDeg }, chairs: rotatedChairs }
}

/** Finds the Sweetheart Table already placed in this room, if any. Never placed by this file — only ever checked for. */
function findSweetheartTable(
  existingObjects: LayoutObject[],
  catalogItemsById: Map<string, DbCatalogItem>,
): LayoutObject | null {
  return (
    existingObjects.find((obj) => {
      if (obj.isChairFor) return false
      const item = catalogItemsById.get(obj.catalogItemId)
      return item?.name === SWEETHEART_TABLE_NAME
    }) ?? null
  )
}

/**
 * Direction the couple faces, outward from the table into the room — table
 * centre → chairs, extended, normalised. Prefers the table's actual placed
 * chairs (captures whatever side the planner really put them on, including a
 * manual override via the properties panel's per-side toggles) over the
 * table's rotation, since a planner who nudged the chairs to a different edge
 * clearly meant that as the facing side. Falls back to rotationDeg (using the
 * same default "top" edge the Sweetheart Table's own drop handler forces)
 * only when chairs were skipped entirely.
 */
function getFacingDirection(sweetheart: LayoutObject, existingObjects: LayoutObject[]): Point2D {
  const chairs = existingObjects.filter((o) => o.isChairFor === sweetheart.id)
  if (chairs.length > 0) {
    const avg = chairs.reduce(
      (acc, c) => ({ x: acc.x + c.positionCm.x, y: acc.y + c.positionCm.y }),
      { x: 0, y: 0 },
    )
    avg.x /= chairs.length
    avg.y /= chairs.length
    const dx = avg.x - sweetheart.positionCm.x
    const dy = avg.y - sweetheart.positionCm.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    return { x: dx / len, y: dy / len }
  }
  // Default unrotated facing = (0, -1) ("top"), rotated by the table's own rotationDeg.
  const rad = (sweetheart.rotationDeg * Math.PI) / 180
  return { x: Math.sin(rad), y: -Math.cos(rad) }
}

type Site = { center: Point2D; radius: number }

/**
 * Evenly spreads `radii.length` movable sites over `domain` (the free floor
 * area, as grid points) using Lloyd relaxation: every free point is assigned
 * to its nearest site (distance minus the site's radius, so bigger tables
 * claim bigger cells), each movable site then moves to the centre of its own
 * cell, and that repeats until it settles. The result is the "evenly spread
 * out" look — each table sits in the middle of an equally sized patch of
 * floor — rather than a cluster around the room's centre.
 *
 * `fixed` sites (furniture that's already there) never move but still claim
 * their own cells, so new tables spread around them instead of on top of them.
 * `mirror`, when given, adds a reflected twin of every movable site as an
 * extra fixed-for-this-pass site: used for the Sweetheart-balanced layout,
 * where the domain is one side of the aisle and the twins keep that side's
 * tables from crowding the axis.
 */
function spreadSites(
  domain: Point2D[],
  fixed: Site[],
  radii: number[],
  mirror?: (p: Point2D) => Point2D,
): Point2D[] {
  const k = radii.length
  if (k === 0 || domain.length === 0) return []

  const centres: Point2D[] = []
  const currentSites = (): Site[] => {
    const sites: Site[] = [...fixed]
    centres.forEach((c, i) => {
      sites.push({ center: c, radius: radii[i] })
      if (mirror) sites.push({ center: mirror(c), radius: radii[i] })
    })
    return sites
  }

  // Seed with farthest-point sampling so the starting layout is already
  // roughly spread out (and avoids the existing furniture); Lloyd refines it.
  const domainCentroid = domain.reduce(
    (acc, p) => ({ x: acc.x + p.x / domain.length, y: acc.y + p.y / domain.length }),
    { x: 0, y: 0 },
  )
  for (let i = 0; i < k; i++) {
    const sites = currentSites()
    let best = domain[0]
    let bestScore = -Infinity
    for (const p of domain) {
      let score: number
      if (sites.length === 0) {
        score = -distanceCm(p, domainCentroid)
      } else {
        score = Infinity
        for (const site of sites) {
          const d = distanceCm(p, site.center) - site.radius
          if (d < score) score = d
        }
      }
      if (score > bestScore) { bestScore = score; best = p }
    }
    centres.push(best)
  }

  for (let iter = 0; iter < 40; iter++) {
    const sites: Site[] = [...fixed]
    const siteToMover: number[] = fixed.map(() => -1)
    centres.forEach((c, i) => {
      sites.push({ center: c, radius: radii[i] })
      siteToMover.push(i)
      if (mirror) {
        sites.push({ center: mirror(c), radius: radii[i] })
        siteToMover.push(-1)
      }
    })

    const sums = centres.map(() => ({ x: 0, y: 0, n: 0 }))
    for (const p of domain) {
      let bestIdx = 0
      let bestD = Infinity
      for (let j = 0; j < sites.length; j++) {
        const d = distanceCm(p, sites[j].center) - sites[j].radius
        if (d < bestD) { bestD = d; bestIdx = j }
      }
      const mover = siteToMover[bestIdx]
      if (mover >= 0) { sums[mover].x += p.x; sums[mover].y += p.y; sums[mover].n += 1 }
    }

    let maxMove = 0
    centres.forEach((c, i) => {
      if (sums[i].n === 0) return
      const next = { x: sums[i].x / sums[i].n, y: sums[i].y / sums[i].n }
      maxMove = Math.max(maxMove, distanceCm(c, next))
      centres[i] = next
    })
    if (maxMove < 4) break
  }

  return centres
}

/** Shortest distance from a point to the polygon's outline. */
function distanceToPolygonEdge(p: Point2D, polygon: Point2D[]): number {
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const lenSq = abx * abx + aby * aby || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq))
    const d = distanceCm(p, { x: a.x + t * abx, y: a.y + t * aby })
    if (d < best) best = d
  }
  return best
}

/**
 * Adds the requested table mix to the room, evenly spread over the free floor
 * area. All-or-nothing: if any table can't find a valid spot, nothing is placed
 * and the caller gets a reason instead.
 *
 * Without balancing: every table is a site in a Lloyd relaxation over the free
 * floor (see spreadSites), then snapped to the nearest spot where the table and
 * its full ring of chairs really fit (boundary, obstacles, zones, walking
 * clearance, everything already placed).
 *
 * With balancing: the Sweetheart Table's facing direction defines a centre
 * aisle (a line through the table). Each table type's quantity splits into
 * mirrored left/right pairs — the right-hand table is the exact reflection of
 * the left-hand one — spread evenly over the part of the room where both a
 * table and its mirror fit. An odd leftover table sits on the aisle line
 * itself, spaced evenly along it. Everything is still checked against the
 * real footprints, so an asymmetric room (pillars on one side only) just
 * limits where a pair can go.
 *
 * Not a globally optimal packer — a planning aid, in line with the
 * "approximation over exactness where it doesn't matter" trade-offs elsewhere
 * in this file.
 */
export function autoArrangeRoom(params: AutoArrangeParams): AutoArrangeResult {
  const {
    boundaryPolygonCm,
    obstacles,
    existingObjects,
    catalogItemsById,
    chairCatalogItem,
    tableSelections,
    balanceAroundSweetheart,
  } = params

  if (tableSelections.length === 0) {
    return { success: false, reason: 'Select at least one table to arrange.' }
  }

  // Sweetheart-balance setup — resolved once, before any placement work.
  let sweetheartOrigin: Point2D | null = null
  let facing: Point2D | null = null
  if (balanceAroundSweetheart) {
    const sweetheart = findSweetheartTable(existingObjects, catalogItemsById)
    if (!sweetheart) {
      return {
        success: false,
        reason:
          'Balance Around Sweetheart Table is on, but no Sweetheart Table is placed in this room yet. Add one at your desired position first, then run Auto-Arrange again.',
      }
    }
    sweetheartOrigin = sweetheart.positionCm
    facing = getFacingDirection(sweetheart, existingObjects)
  }

  // ── Table units to place ────────────────────────────────────────────────────
  type Unit = {
    catalogItem: DbCatalogItem
    isRound: boolean
    unitRadius: number
    maxChairs: number
  }
  const makeUnit = (catalogItem: DbCatalogItem): Unit => {
    const isRound = catalogItem.name.toLowerCase().includes('round')
    return {
      catalogItem,
      isRound,
      unitRadius: getUnitRadiusCm(
        catalogItem.width_cm,
        catalogItem.depth_cm,
        isRound,
        chairCatalogItem.width_cm,
        chairCatalogItem.depth_cm,
      ),
      maxChairs: getTableChairConfig(catalogItem.name).maxChairs,
    }
  }
  // Biggest first: large tables claim their space while the room is empty and
  // smaller ones fit into what's left.
  const byRadiusDesc = (a: Unit, b: Unit) => b.unitRadius - a.unitRadius

  const plainUnits: Unit[] = []   // not balancing
  const pairUnits: Unit[] = []    // one entry per left/right PAIR
  const centreUnits: Unit[] = []  // odd leftovers, on the aisle line
  for (const sel of tableSelections) {
    const unit = makeUnit(sel.catalogItem)
    if (balanceAroundSweetheart) {
      for (let i = 0; i < Math.floor(sel.quantity / 2); i++) pairUnits.push(unit)
      if (sel.quantity % 2 === 1) centreUnits.push(unit)
    } else {
      for (let i = 0; i < sel.quantity; i++) plainUnits.push(unit)
    }
  }
  plainUnits.sort(byRadiusDesc)
  pairUnits.sort(byRadiusDesc)
  centreUnits.sort(byRadiusDesc)

  // Seed the occupied-space list with everything already in the room —
  // treated as fixed no-go zones; auto-arrange only ever adds, never moves.
  // This includes the Sweetheart Table itself and its chairs when balancing,
  // so guest tables never overlap it.
  const occupied: Site[] = existingObjects.map((obj) => {
    const item = catalogItemsById.get(obj.catalogItemId)
    return {
      center: obj.positionCm,
      radius: getExistingObjectRadiusCm(item?.width_cm ?? 50, item?.depth_cm ?? 50),
    }
  })
  const existingSites = occupied.map((o) => ({ ...o }))

  // ── Free floor area ─────────────────────────────────────────────────────────
  const bbox = polygonBoundingBox(boundaryPolygonCm)
  const allPoints: Point2D[] = []
  for (let x = bbox.minX; x <= bbox.minX + bbox.widthCm; x += SCAN_STEP_CM) {
    for (let y = bbox.minY; y <= bbox.minY + bbox.depthCm; y += SCAN_STEP_CM) {
      const p = { x, y }
      if (isPointInPolygon(p, boundaryPolygonCm)) allPoints.push(p)
    }
  }
  const boundsCenter: Point2D = { x: bbox.minX + bbox.widthCm / 2, y: bbox.minY + bbox.depthCm / 2 }
  // A grid point counts as free floor if a small marker square there is inside
  // the boundary, clear of obstacles/zones, and not on top of existing furniture.
  const isFreePoint = (p: Point2D) =>
    validateFootprint(getFootprintCorners(p, 20, 20, 0), boundaryPolygonCm, obstacles).valid &&
    existingSites.every((u) => distanceCm(p, u.center) >= u.radius)
  const freePoints = allPoints.filter(isFreePoint)

  // ── Placement helpers ───────────────────────────────────────────────────────
  const farEnough = (point: Point2D, unitRadius: number) =>
    occupied.every((u) => distanceCm(point, u.center) >= u.radius + unitRadius + AUTO_ARRANGE_CLEARANCE_CM)

  /** Builds a table + max chairs at `point`/`rotation`, or null if any part falls outside the boundary or inside an obstacle. */
  const tryUnit = (unit: Unit, point: Point2D, rotation: number): { table: LayoutObject; chairs: LayoutObject[] } | null => {
    const { catalogItem, isRound, maxChairs } = unit
    const draftTable: LayoutObject = {
      id: generateId(),
      catalogItemId: catalogItem.id,
      positionCm: point,
      rotationDeg: 0,
      quantity: 1,
    }
    let chairs = generateChairObjects(
      draftTable,
      catalogItem.width_cm,
      catalogItem.depth_cm,
      isRound,
      maxChairs,
      chairCatalogItem.id,
      chairCatalogItem.width_cm,
      chairCatalogItem.depth_cm,
    )
    let table = draftTable
    if (rotation !== 0) {
      const rotated = rotateUnitRigid(draftTable, chairs, rotation)
      table = rotated.table
      chairs = rotated.chairs
    }
    const tableValid = validateFootprint(
      getFootprintCorners(table.positionCm, catalogItem.width_cm, catalogItem.depth_cm, table.rotationDeg),
      boundaryPolygonCm,
      obstacles,
    ).valid
    if (!tableValid) return null
    const chairsValid = chairs.every(
      (c) =>
        validateFootprint(
          getFootprintCorners(c.positionCm, chairCatalogItem.width_cm, chairCatalogItem.depth_cm, c.rotationDeg),
          boundaryPolygonCm,
          obstacles,
        ).valid,
    )
    if (!chairsValid) return null
    return {
      table: { ...table, chairCount: maxChairs, chairCatalogItemId: chairCatalogItem.id, chairIds: chairs.map((c) => c.id) },
      chairs,
    }
  }

  const placedObjects: LayoutObject[] = []
  const commit = (unit: Unit, built: { table: LayoutObject; chairs: LayoutObject[] }) => {
    placedObjects.push(built.table, ...built.chairs)
    occupied.push({ center: built.table.positionCm, radius: unit.unitRadius })
  }
  const nearestFirst = (points: Point2D[], target: Point2D) =>
    [...points].sort((a, b) => distanceCm(a, target) - distanceCm(b, target))
  const failure = (unit: Unit, where = ''): AutoArrangeResult => ({
    success: false,
    reason: `Couldn't find room for a "${unit.catalogItem.name}"${where} — the venue's boundary/obstacles/existing furniture don't leave enough space for this mix. Try fewer tables, a smaller mix, or a different Sweetheart Table position.`,
  })

  /** Snaps a single table to the nearest valid spot around `target`. */
  const placeNear = (unit: Unit, target: Point2D, candidates: Point2D[]): boolean => {
    const rotationsToTry = unit.isRound ? [0] : [0, 90]
    for (const point of nearestFirst(candidates, target)) {
      if (!farEnough(point, unit.unitRadius)) continue
      for (const rotation of rotationsToTry) {
        const built = tryUnit(unit, point, rotation)
        if (built) { commit(unit, built); return true }
      }
    }
    return false
  }

  // ── Plain layout: spread tables evenly over the free floor ──────────────────
  if (!balanceAroundSweetheart || !sweetheartOrigin || !facing) {
    const targets = spreadSites(freePoints, existingSites, plainUnits.map((u) => u.unitRadius))
    for (let i = 0; i < plainUnits.length; i++) {
      if (!placeNear(plainUnits[i], targets[i] ?? boundsCenter, allPoints)) {
        return failure(plainUnits[i])
      }
    }
    return { success: true, objects: placedObjects }
  }

  // ── Balanced layout around the Sweetheart Table ─────────────────────────────
  const origin = sweetheartOrigin
  const dir = facing
  const normal: Point2D = { x: -dir.y, y: dir.x }
  const signedSide = (p: Point2D) => (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y
  const mirrorPoint = (p: Point2D): Point2D => {
    const s = signedSide(p)
    return { x: p.x - 2 * s * normal.x, y: p.y - 2 * s * normal.y }
  }
  const axisDeg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI
  const mirrorRotation = (rotationDeg: number) => (((2 * axisDeg - rotationDeg) % 360) + 360) % 360

  // 1) Odd leftovers go on the aisle line itself, spaced evenly along it: each
  //    takes the axis point that is farthest from everything already placed
  //    (a wall counts as a neighbour at twice its distance, so tables don't
  //    end up jammed against the far wall).
  const diag = Math.hypot(bbox.widthCm, bbox.depthCm)
  const axisPoints: Point2D[] = []
  for (let t = -diag; t <= diag; t += SCAN_STEP_CM) {
    const p = { x: origin.x + dir.x * t, y: origin.y + dir.y * t }
    if (isPointInPolygon(p, boundaryPolygonCm)) axisPoints.push(p)
  }
  for (const unit of centreUnits) {
    const scored = axisPoints
      .filter((p) => farEnough(p, unit.unitRadius))
      .map((p) => {
        let clearance = 2 * distanceToPolygonEdge(p, boundaryPolygonCm) - unit.unitRadius
        for (const u of occupied) clearance = Math.min(clearance, distanceCm(p, u.center) - u.radius - unit.unitRadius)
        return { p, clearance }
      })
      .sort((a, b) => b.clearance - a.clearance)
    let placed = false
    for (const { p } of scored) {
      for (const rotation of unit.isRound ? [0] : [0, 90]) {
        const built = tryUnit(unit, p, rotation)
        if (built) { commit(unit, built); placed = true; break }
      }
      if (placed) break
    }
    if (!placed) return failure(unit, ' on the centre line of the Sweetheart Table')
  }

  // 2) Mirrored pairs: spread over the left half wherever the mirror point is
  //    free floor too, then snap each pair to the nearest spot where BOTH
  //    tables fit. The right-hand table is the exact reflection.
  const leftFree = freePoints.filter((p) => signedSide(p) > 0 && isFreePoint(mirrorPoint(p)))
  const leftAll = allPoints.filter((p) => signedSide(p) > 0)
  const fixedForPairs: Site[] = [...existingSites, ...occupied.slice(existingSites.length)]
  const targets = spreadSites(leftFree, fixedForPairs, pairUnits.map((u) => u.unitRadius), mirrorPoint)

  for (let i = 0; i < pairUnits.length; i++) {
    const unit = pairUnits[i]
    const target = targets[i] ?? leftFree[0] ?? leftAll[0]
    if (!target) return failure(unit, ' pair')
    let placed = false
    for (const point of nearestFirst(leftAll, target)) {
      const twin = mirrorPoint(point)
      if (!farEnough(point, unit.unitRadius) || !farEnough(twin, unit.unitRadius)) continue
      // the two tables of a pair must also keep the walking gap between each other
      if (distanceCm(point, twin) < 2 * unit.unitRadius + AUTO_ARRANGE_CLEARANCE_CM) continue
      for (const rotation of unit.isRound ? [0] : [0, 90]) {
        const left = tryUnit(unit, point, rotation)
        if (!left) continue
        const right = tryUnit(unit, twin, unit.isRound ? 0 : mirrorRotation(rotation))
        if (!right) continue
        commit(unit, left)
        commit(unit, right)
        placed = true
        break
      }
      if (placed) break
    }
    if (!placed) return failure(unit, ' pair')
  }

  return { success: true, objects: placedObjects }
}
