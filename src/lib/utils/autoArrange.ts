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
  guestCount: number
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

/** Total seats across a table mix, using each table's real max-chair capacity — the same figure the guest-count block check compares against. Never include the Sweetheart Table in this — the couple aren't part of the guest list's seat count. */
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

/** Which side of the couple's facing-direction aisle a point falls on — a 2D cross-product half-plane test through the sweetheart table's centre. Arbitrary which sign is "left" vs "right"; only consistency matters. */
function classifySide(point: Point2D, origin: Point2D, facing: Point2D): 'left' | 'right' {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const cross = facing.x * dy - facing.y * dx
  return cross >= 0 ? 'left' : 'right'
}

/**
 * Packs the requested table mix into the room. All-or-nothing: if any table
 * in the mix can't find a valid spot, nothing is placed and the caller gets a
 * reason instead. Greedy largest-first, first-fit nearest-to-room-centre —
 * not globally optimal packing, but this is a planning aid, not a bin-packing
 * solver, and it's consistent with the "approximation over exactness where it
 * doesn't matter" trade-offs already made elsewhere in this file.
 */
export function autoArrangeRoom(params: AutoArrangeParams): AutoArrangeResult {
  const {
    boundaryPolygonCm,
    obstacles,
    existingObjects,
    catalogItemsById,
    chairCatalogItem,
    tableSelections,
    guestCount,
    balanceAroundSweetheart,
  } = params

  if (tableSelections.length === 0) {
    return { success: false, reason: 'Select at least one table to arrange.' }
  }

  const capacity = computeMixCapacity(tableSelections)
  if (capacity !== guestCount) {
    const delta = guestCount - capacity
    return {
      success: false,
      reason:
        delta > 0
          ? `The selected tables seat ${capacity}, but there are ${guestCount} guests — ${delta} short. Add more seats or another table before arranging.`
          : `The selected tables seat ${capacity}, but there are ${guestCount} guests — ${-delta} too many. Remove a table or reduce the mix before arranging.`,
    }
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

  // Expand quantities into individual table instances. When balancing, each
  // table TYPE's quantity splits into matched pairs (one left, one right) —
  // confirmed against a planner-drawn layout showing identical round+rect
  // groupings mirrored either side of the aisle, not an arbitrary split of
  // the total. An even quantity is all pairs. An odd quantity is floor(q/2)
  // pairs plus exactly one leftover instance, which goes dead-centre on the
  // aisle line itself rather than being pushed onto either side — confirmed
  // against a second planner-drawn diagram showing the odd-one-out sitting
  // on the centre line, not tacked onto one side's count.
  // Sorted biggest-unit-radius-first overall (across left/right/centre) —
  // placing large tables while the room is empty and packing smaller ones
  // into what's left works far better than the reverse.
  type Instance = {
    catalogItem: DbCatalogItem
    isRound: boolean
    unitRadius: number
    side: 'left' | 'right' | 'centre' | null
  }
  const instances: Instance[] = []
  for (const sel of tableSelections) {
    const isRound = sel.catalogItem.name.toLowerCase().includes('round')
    const unitRadius = getUnitRadiusCm(
      sel.catalogItem.width_cm,
      sel.catalogItem.depth_cm,
      isRound,
      chairCatalogItem.width_cm,
      chairCatalogItem.depth_cm,
    )
    if (balanceAroundSweetheart) {
      const pairs = Math.floor(sel.quantity / 2)
      const hasOddOneOut = sel.quantity % 2 === 1
      for (let i = 0; i < pairs; i++) {
        instances.push({ catalogItem: sel.catalogItem, isRound, unitRadius, side: 'left' })
        instances.push({ catalogItem: sel.catalogItem, isRound, unitRadius, side: 'right' })
      }
      if (hasOddOneOut) {
        instances.push({ catalogItem: sel.catalogItem, isRound, unitRadius, side: 'centre' })
      }
    } else {
      for (let i = 0; i < sel.quantity; i++) {
        instances.push({ catalogItem: sel.catalogItem, isRound, unitRadius, side: null })
      }
    }
  }
  instances.sort((a, b) => b.unitRadius - a.unitRadius)

  // Seed the occupied-space list with everything already in the room —
  // treated as fixed no-go zones; auto-arrange only ever adds, never moves.
  // This includes the Sweetheart Table itself and its chairs when balancing,
  // so guest tables never overlap it.
  const occupied: { center: Point2D; radius: number }[] = existingObjects.map((obj) => {
    const item = catalogItemsById.get(obj.catalogItemId)
    return {
      center: obj.positionCm,
      radius: getExistingObjectRadiusCm(item?.width_cm ?? 50, item?.depth_cm ?? 50),
    }
  })

  // Candidate points: every grid point inside the boundary. Without
  // balancing, scanned outward from the room's centre so tables cluster
  // naturally rather than piling into a corner. With balancing: left/right
  // lists by the aisle test, each scanned outward from the Sweetheart
  // Table's own position; a third centre-line list, sorted by how close a
  // point sits to the aisle line itself (not a fixed on/off band — the
  // search just prefers the most-on-axis point available and degrades
  // gracefully outward from there if that exact spot doesn't fit).
  const bbox = polygonBoundingBox(boundaryPolygonCm)
  const boundsCenter: Point2D = { x: bbox.minX + bbox.widthCm / 2, y: bbox.minY + bbox.depthCm / 2 }
  const allPoints: Point2D[] = []
  for (let x = bbox.minX; x <= bbox.minX + bbox.widthCm; x += SCAN_STEP_CM) {
    for (let y = bbox.minY; y <= bbox.minY + bbox.depthCm; y += SCAN_STEP_CM) {
      const p = { x, y }
      if (isPointInPolygon(p, boundaryPolygonCm)) allPoints.push(p)
    }
  }

  let candidatePoints: Point2D[] = []
  let leftCandidates: Point2D[] = []
  let rightCandidates: Point2D[] = []
  let centreCandidates: Point2D[] = []

  if (balanceAroundSweetheart && sweetheartOrigin && facing) {
    const origin = sweetheartOrigin
    const dir = facing
    leftCandidates = allPoints
      .filter((p) => classifySide(p, origin, dir) === 'left')
      .sort((a, b) => distanceCm(a, origin) - distanceCm(b, origin))
    rightCandidates = allPoints
      .filter((p) => classifySide(p, origin, dir) === 'right')
      .sort((a, b) => distanceCm(a, origin) - distanceCm(b, origin))
    centreCandidates = [...allPoints].sort((a, b) => {
      const crossA = Math.abs(dir.x * (a.y - origin.y) - dir.y * (a.x - origin.x))
      const crossB = Math.abs(dir.x * (b.y - origin.y) - dir.y * (b.x - origin.x))
      if (crossA !== crossB) return crossA - crossB
      return distanceCm(a, origin) - distanceCm(b, origin)
    })
  } else {
    candidatePoints = [...allPoints].sort(
      (a, b) => distanceCm(a, boundsCenter) - distanceCm(b, boundsCenter),
    )
  }

  const placedObjects: LayoutObject[] = []

  for (const instance of instances) {
    const { catalogItem, isRound, unitRadius, side } = instance
    const { maxChairs } = getTableChairConfig(catalogItem.name)
    const pointsToSearch =
      side === 'left' ? leftCandidates : side === 'right' ? rightCandidates : side === 'centre' ? centreCandidates : candidatePoints
    let placedThisInstance = false

    for (const point of pointsToSearch) {
      // Cheap reject first: is this point even far enough from everything
      // already placed (this run + pre-existing) before doing real footprint math?
      const farEnough = occupied.every(
        (u) => distanceCm(point, u.center) >= u.radius + unitRadius + AUTO_ARRANGE_CLEARANCE_CM,
      )
      if (!farEnough) continue

      const rotationsToTry = isRound ? [0] : [0, 90]

      for (const rotation of rotationsToTry) {
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

        let finalTable = draftTable
        if (rotation !== 0) {
          const rotated = rotateUnitRigid(draftTable, chairs, rotation)
          finalTable = rotated.table
          chairs = rotated.chairs
        }

        const tableFootprint = getFootprintCorners(
          finalTable.positionCm,
          catalogItem.width_cm,
          catalogItem.depth_cm,
          finalTable.rotationDeg,
        )
        const tableValid = validateFootprint(tableFootprint, boundaryPolygonCm, obstacles).valid
        const chairsValid = chairs.every(
          (c) =>
            validateFootprint(
              getFootprintCorners(c.positionCm, chairCatalogItem.width_cm, chairCatalogItem.depth_cm, c.rotationDeg),
              boundaryPolygonCm,
              obstacles,
            ).valid,
        )

        if (tableValid && chairsValid) {
          finalTable = {
            ...finalTable,
            chairCount: maxChairs,
            chairCatalogItemId: chairCatalogItem.id,
            chairIds: chairs.map((c) => c.id),
          }
          placedObjects.push(finalTable, ...chairs)
          occupied.push({ center: finalTable.positionCm, radius: unitRadius })
          placedThisInstance = true
          break
        }
      }

      if (placedThisInstance) break
    }

    if (!placedThisInstance) {
      const sideNote = side ? ` on the ${side === 'centre' ? 'centre line of' : side + ' side of'} the Sweetheart Table` : ''
      return {
        success: false,
        reason: `Couldn't find room for a "${catalogItem.name}"${sideNote} — the venue's boundary/obstacles/existing furniture don't leave enough space for this mix. Try fewer tables, a smaller mix, or a different Sweetheart Table position.`,
      }
    }
  }

  return { success: true, objects: placedObjects }
}
