import { LayoutObject, ChairArrangement, ChairEdge, ChairSides } from '@/types'
import { generateId } from './coordinates'

export function calculateChairPositions(
  tablePosX: number,
  tablePosY: number,
  tableWidthCm: number,
  tableDepthCm: number,
  isRound: boolean,
  chairCount: number,
  chairWidthCm: number,
  chairDepthCm: number,
  gapCm: number = 5,
  arrangement: ChairArrangement = 'all-sides'
): Array<{ x: number; y: number; rotationDeg: number }> {
  const positions: Array<{ x: number; y: number; rotationDeg: number }> = []

  if (isRound) {
    const tableRadius = tableWidthCm / 2
    const distanceFromCenter = tableRadius + gapCm + chairDepthCm / 2

    for (let i = 0; i < chairCount; i++) {
      const angleDeg = (360 / chairCount) * i - 90
      const angleRad = (angleDeg * Math.PI) / 180
      positions.push({
        x: tablePosX + distanceFromCenter * Math.cos(angleRad),
        y: tablePosY + distanceFromCenter * Math.sin(angleRad),
        rotationDeg: angleDeg + 90,
      })
    }
  } else {
    const halfW = tableWidthCm / 2
    const halfD = tableDepthCm / 2
    const distLong = halfD + gapCm + chairDepthCm / 2
    const distShort = halfW + gapCm + chairDepthCm / 2

    let topCount = 0
    let bottomCount = 0
    let leftCount = 0
    let rightCount = 0

    if (arrangement === 'long-only') {
      topCount = Math.floor(chairCount / 2)
      bottomCount = chairCount - topCount
    } else if (arrangement === 'short-only') {
      leftCount = Math.floor(chairCount / 2)
      rightCount = chairCount - leftCount
    } else {
      const longSide = tableWidthCm
      const shortSide = tableDepthCm
      const totalLength = 2 * longSide + 2 * shortSide

      topCount = Math.max(1, Math.round((longSide / totalLength) * chairCount))
      bottomCount = Math.max(1, Math.round((longSide / totalLength) * chairCount))
      leftCount = Math.round((shortSide / totalLength) * chairCount)
      rightCount = Math.round((shortSide / totalLength) * chairCount)

      let total = topCount + bottomCount + leftCount + rightCount
      while (total > chairCount) {
        if (leftCount > 0) leftCount--
        else if (rightCount > 0) rightCount--
        else if (topCount > 1) topCount--
        else if (bottomCount > 1) bottomCount--
        total--
      }
      while (total < chairCount) {
        if (topCount <= bottomCount) topCount++
        else bottomCount++
        total++
      }
    }

    for (let i = 0; i < topCount; i++) {
      const spacing = tableWidthCm / (topCount + 1)
      positions.push({
        x: tablePosX - halfW + spacing * (i + 1),
        y: tablePosY - distLong,
        rotationDeg: 180,
      })
    }

    for (let i = 0; i < bottomCount; i++) {
      const spacing = tableWidthCm / (bottomCount + 1)
      positions.push({
        x: tablePosX - halfW + spacing * (i + 1),
        y: tablePosY + distLong,
        rotationDeg: 0,
      })
    }

    for (let i = 0; i < leftCount; i++) {
      const spacing = tableDepthCm / (leftCount + 1)
      positions.push({
        x: tablePosX - distShort,
        y: tablePosY - halfD + spacing * (i + 1),
        rotationDeg: 90,
      })
    }

    for (let i = 0; i < rightCount; i++) {
      const spacing = tableDepthCm / (rightCount + 1)
      positions.push({
        x: tablePosX + distShort,
        y: tablePosY - halfD + spacing * (i + 1),
        rotationDeg: 270,
      })
    }
  }

  return positions
}

export function calculateChairPositionsFromSides(
  tablePosX: number,
  tablePosY: number,
  tableWidthCm: number,
  tableDepthCm: number,
  chairCount: number,
  chairDepthCm: number,
  sides: ChairSides,
  gapCm: number = 5
): Array<{ x: number; y: number; rotationDeg: number }> {
  const halfW = tableWidthCm / 2
  const halfD = tableDepthCm / 2
  const distLong = halfD + gapCm + chairDepthCm / 2
  const distShort = halfW + gapCm + chairDepthCm / 2

  const enabledSides = (['top', 'bottom', 'left', 'right'] as const).filter((s) => sides[s])
  if (enabledSides.length === 0) return []

  // Simple even distribution — no while loops
  const perSide = Math.floor(chairCount / enabledSides.length)
  let remainder = chairCount % enabledSides.length

  const counts: Record<string, number> = {}
  enabledSides.forEach((s) => {
    counts[s] = perSide + (remainder > 0 ? 1 : 0)
    remainder = Math.max(0, remainder - 1)
  })

  const positions: Array<{ x: number; y: number; rotationDeg: number }> = []

  enabledSides.forEach((side) => {
    const count = counts[side]
    if (side === 'top') {
      for (let i = 0; i < count; i++) {
        positions.push({
          x: tablePosX - halfW + (tableWidthCm / (count + 1)) * (i + 1),
          y: tablePosY - distLong,
          rotationDeg: 180,
        })
      }
    } else if (side === 'bottom') {
      for (let i = 0; i < count; i++) {
        positions.push({
          x: tablePosX - halfW + (tableWidthCm / (count + 1)) * (i + 1),
          y: tablePosY + distLong,
          rotationDeg: 0,
        })
      }
    } else if (side === 'left') {
      for (let i = 0; i < count; i++) {
        positions.push({
          x: tablePosX - distShort,
          y: tablePosY - halfD + (tableDepthCm / (count + 1)) * (i + 1),
          rotationDeg: 90,
        })
      }
    } else if (side === 'right') {
      for (let i = 0; i < count; i++) {
        positions.push({
          x: tablePosX + distShort,
          y: tablePosY - halfD + (tableDepthCm / (count + 1)) * (i + 1),
          rotationDeg: 270,
        })
      }
    }
  })

  return positions
}
function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  const dx = px - cx
  const dy = py - cy
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

function lockToEdge(
  posCm: { x: number; y: number },
  edge: ChairEdge,
  tx: number,
  ty: number,
  distLong: number,
  distShort: number,
  halfW: number,
  halfD: number,
  tableRotationDeg: number = 0
): { x: number; y: number } {
  const unrotatedDrag = rotatePoint(posCm.x, posCm.y, tx, ty, -tableRotationDeg)

  let unrotated: { x: number; y: number }

  if (edge === 'top') {
    unrotated = {
      x: Math.max(tx - halfW, Math.min(tx + halfW, unrotatedDrag.x)),
      y: ty - distLong,
    }
  } else if (edge === 'bottom') {
    unrotated = {
      x: Math.max(tx - halfW, Math.min(tx + halfW, unrotatedDrag.x)),
      y: ty + distLong,
    }
  } else if (edge === 'left') {
    unrotated = {
      x: tx - distShort,
      y: Math.max(ty - halfD, Math.min(ty + halfD, unrotatedDrag.y)),
    }
  } else if (edge === 'right') {
    unrotated = {
      x: tx + distShort,
      y: Math.max(ty - halfD, Math.min(ty + halfD, unrotatedDrag.y)),
    }
  } else {
    return posCm
  }

  return rotatePoint(unrotated.x, unrotated.y, tx, ty, tableRotationDeg)
}

export function rotateChairsWithTable(
  tableObject: LayoutObject,
  newRotationDeg: number,
  oldRotationDeg: number,
  existingChairs: LayoutObject[]
): LayoutObject[] {
  const deltaRad = ((newRotationDeg - oldRotationDeg) * Math.PI) / 180
  const tx = tableObject.positionCm.x
  const ty = tableObject.positionCm.y

  return existingChairs.map((chair) => {
    const dx = chair.positionCm.x - tx
    const dy = chair.positionCm.y - ty
    const rotatedX = dx * Math.cos(deltaRad) - dy * Math.sin(deltaRad)
    const rotatedY = dx * Math.sin(deltaRad) + dy * Math.cos(deltaRad)

    return {
      ...chair,
      positionCm: { x: tx + rotatedX, y: ty + rotatedY },
      rotationDeg: chair.rotationDeg + (newRotationDeg - oldRotationDeg),
    }
  })
}

export function reassignChairEdge(
  draggedChair: LayoutObject,
  newPosCm: { x: number; y: number },
  tableObject: LayoutObject,
  tableWidthCm: number,
  tableDepthCm: number,
  chairDepthCm: number,
  existingChairs: LayoutObject[],
  gapCm: number = 5
): LayoutObject[] {
  const halfW = tableWidthCm / 2
  const halfD = tableDepthCm / 2
  const distLong = halfD + gapCm + chairDepthCm / 2
  const distShort = halfW + gapCm + chairDepthCm / 2

  const tx = tableObject.positionCm.x
  const ty = tableObject.positionCm.y
  const tableRot = tableObject.rotationDeg ?? 0

  // Project drag position into unrotated table space
  const unrotatedPos = rotatePoint(newPosCm.x, newPosCm.y, tx, ty, -tableRot)

  const dist2D = (ax: number, ay: number, bx: number, by: number) =>
    Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)

  const distToTop    = dist2D(unrotatedPos.x, unrotatedPos.y, unrotatedPos.x, ty - distLong)
  const distToBottom = dist2D(unrotatedPos.x, unrotatedPos.y, unrotatedPos.x, ty + distLong)
  const distToLeft   = dist2D(unrotatedPos.x, unrotatedPos.y, tx - distShort, unrotatedPos.y)
  const distToRight  = dist2D(unrotatedPos.x, unrotatedPos.y, tx + distShort, unrotatedPos.y)

  const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight)
  const newEdge: 'top' | 'bottom' | 'left' | 'right' =
    minDist === distToTop ? 'top' :
    minDist === distToBottom ? 'bottom' :
    minDist === distToLeft ? 'left' : 'right'

  const oldEdge = draggedChair.chairEdge as 'top' | 'bottom' | 'left' | 'right'

  // If same edge, no reassignment needed
  if (newEdge === oldEdge) return existingChairs

  // Reassign the dragged chair to the new edge
  const updatedChairs = existingChairs.map((c) =>
    c.id === draggedChair.id ? { ...c, chairEdge: newEdge } : c
  )

  // Redistribute chairs on old edge and new edge evenly
  const edgeRotMap = { top: 180, bottom: 0, left: 90, right: 270 }
  const edgeDistMap = {
    top: { x: (i: number, count: number) => tx - halfW + (tableWidthCm / (count + 1)) * (i + 1), y: () => ty - distLong },
    bottom: { x: (i: number, count: number) => tx - halfW + (tableWidthCm / (count + 1)) * (i + 1), y: () => ty + distLong },
    left: { x: () => tx - distShort, y: (i: number, count: number) => ty - halfD + (tableDepthCm / (count + 1)) * (i + 1) },
    right: { x: () => tx + distShort, y: (i: number, count: number) => ty - halfD + (tableDepthCm / (count + 1)) * (i + 1) },
  }

  const result = updatedChairs.map((chair) => {
    const edge = chair.chairEdge as 'top' | 'bottom' | 'left' | 'right'
    if (edge !== oldEdge && edge !== newEdge) return chair

    const edgeChairs = updatedChairs.filter((c) => c.chairEdge === edge)
    const idx = edgeChairs.findIndex((c) => c.id === chair.id)
    const count = edgeChairs.length
    const eMap = edgeDistMap[edge]

    const unrotatedNewPos = {
      x: typeof eMap.x === 'function' ? (eMap.x as any)(idx, count) : eMap.x(idx, count),
      y: typeof eMap.y === 'function' ? (eMap.y as any)(idx, count) : eMap.y(idx, count),
    }

    const rotatedPos = rotatePoint(unrotatedNewPos.x, unrotatedNewPos.y, tx, ty, tableRot)

    return {
      ...chair,
      positionCm: rotatedPos,
      rotationDeg: edgeRotMap[edge] + tableRot,
      chairEdge: edge,
    }
  })

  return result
}

export function generateChairObjects(
  tableObject: LayoutObject,
  tableWidthCm: number,
  tableDepthCm: number,
  isRound: boolean,
  chairCount: number,
  chairCatalogItemId: string,
  chairWidthCm: number,
  chairDepthCm: number,
  arrangement: ChairArrangement = 'all-sides'
): LayoutObject[] {
  const positions = calculateChairPositions(
    tableObject.positionCm.x,
    tableObject.positionCm.y,
    tableWidthCm,
    tableDepthCm,
    isRound,
    chairCount,
    chairWidthCm,
    chairDepthCm,
    5,
    arrangement
  )

  return positions.map((pos) => {
    let chairEdge: ChairEdge = 'orbit'
    if (!isRound) {
      if (pos.rotationDeg === 180) chairEdge = 'top'
      else if (pos.rotationDeg === 0) chairEdge = 'bottom'
      else if (pos.rotationDeg === 90) chairEdge = 'left'
      else if (pos.rotationDeg === 270) chairEdge = 'right'
    }

    return {
      id: generateId(),
      catalogItemId: chairCatalogItemId,
      positionCm: { x: pos.x, y: pos.y },
      rotationDeg: pos.rotationDeg,
      quantity: 1,
      isChairFor: tableObject.id,
      chairEdge,
    }
  })
}

export function getTableChairConfig(tableName: string): {
  maxChairs: number
  acceptsChairs: boolean
} {
  const name = tableName.toLowerCase()

  if (name.includes('cocktail')) return { maxChairs: 0, acceptsChairs: false }
  if (name.includes('sweetheart')) return { maxChairs: 2, acceptsChairs: true }
  if (name.includes('head table')) return { maxChairs: 12, acceptsChairs: true }
  if (name.includes('round') && name.includes('small')) return { maxChairs: 6, acceptsChairs: true }
  if (name.includes('round') && name.includes('medium')) return { maxChairs: 8, acceptsChairs: true }
  if (name.includes('round') && name.includes('large') && !name.includes('xl')) return { maxChairs: 10, acceptsChairs: true }
  if (name.includes('round') && name.includes('xl')) return { maxChairs: 12, acceptsChairs: true }
  if (name.includes('rectangular') && name.includes('small')) return { maxChairs: 4, acceptsChairs: true }
  if (name.includes('rectangular') && name.includes('medium')) return { maxChairs: 6, acceptsChairs: true }
  if (name.includes('rectangular') && name.includes('large') && !name.includes('banquet')) return { maxChairs: 8, acceptsChairs: true }
  if (name.includes('banquet')) return { maxChairs: 10, acceptsChairs: true }

  return { maxChairs: 12, acceptsChairs: true }
}

export function recalculateChairPositions(
  tableObject: LayoutObject,
  tableWidthCm: number,
  tableDepthCm: number,
  isRound: boolean,
  chairWidthCm: number,
  chairDepthCm: number,
  existingChairs: LayoutObject[],
  arrangement: ChairArrangement = 'all-sides'
): LayoutObject[] {
  if (!tableObject.chairCount || existingChairs.length === 0) return []

  const newChairs = generateChairObjects(
    tableObject,
    tableWidthCm,
    tableDepthCm,
    isRound,
    existingChairs.length,
    existingChairs[0].catalogItemId,
    chairWidthCm,
    chairDepthCm,
    arrangement
  )

  return existingChairs.map((chair, i) => ({
    ...chair,
    positionCm: newChairs[i]?.positionCm ?? chair.positionCm,
    rotationDeg: newChairs[i]?.rotationDeg ?? chair.rotationDeg,
    chairEdge: newChairs[i]?.chairEdge ?? chair.chairEdge,
  }))
}

export function mirrorDragRound(
  draggedChairId: string,
  newAngleDeg: number,
  tableObject: LayoutObject,
  tableWidthCm: number,
  chairDepthCm: number,
  existingChairs: LayoutObject[],
  gapCm: number = 5
): LayoutObject[] {
  const count = existingChairs.length
  if (count % 2 !== 0) return existingChairs

  const tableRadius = tableWidthCm / 2
  const distanceFromCenter = tableRadius + gapCm + chairDepthCm / 2

  const draggedIndex = existingChairs.findIndex((c) => c.id === draggedChairId)
  if (draggedIndex === -1) return existingChairs

  const oppositeIndex = (draggedIndex + count / 2) % count
  const oppositeAngleDeg = newAngleDeg + 180

  const currentAngles = existingChairs.map((chair) => {
    const dx = chair.positionCm.x - tableObject.positionCm.x
    const dy = chair.positionCm.y - tableObject.positionCm.y
    return (Math.atan2(dy, dx) * 180) / Math.PI
  })

  currentAngles[draggedIndex] = newAngleDeg
  currentAngles[oppositeIndex] = oppositeAngleDeg

  return existingChairs.map((chair, i) => {
    const angleRad = (currentAngles[i] * Math.PI) / 180
    return {
      ...chair,
      positionCm: {
        x: tableObject.positionCm.x + distanceFromCenter * Math.cos(angleRad),
        y: tableObject.positionCm.y + distanceFromCenter * Math.sin(angleRad),
      },
      rotationDeg: currentAngles[i] + 90,
    }
  })
}

export function mirrorDragRect(
  draggedChair: LayoutObject,
  newPosCm: { x: number; y: number },
  tableObject: LayoutObject,
  tableWidthCm: number,
  tableDepthCm: number,
  chairDepthCm: number,
  existingChairs: LayoutObject[],
  gapCm: number = 5
): LayoutObject[] {
  const halfW = tableWidthCm / 2
  const halfD = tableDepthCm / 2
  const distLong = halfD + gapCm + chairDepthCm / 2
  const distShort = halfW + gapCm + chairDepthCm / 2

  const tx = tableObject.positionCm.x
  const ty = tableObject.positionCm.y
  const tableRot = tableObject.rotationDeg ?? 0

  const draggedEdge = draggedChair.chairEdge
  if (!draggedEdge || draggedEdge === 'orbit') return existingChairs

  const oppositeEdge: ChairEdge =
    draggedEdge === 'top' ? 'bottom' :
    draggedEdge === 'bottom' ? 'top' :
    draggedEdge === 'left' ? 'right' : 'left'

  const draggedEdgeChairs = existingChairs
    .filter((c) => c.chairEdge === draggedEdge)
    .sort((a, b) =>
      draggedEdge === 'top' || draggedEdge === 'bottom'
        ? a.positionCm.x - b.positionCm.x
        : a.positionCm.y - b.positionCm.y
    )

  const oppositeEdgeChairs = existingChairs
    .filter((c) => c.chairEdge === oppositeEdge)
    .sort((a, b) =>
      oppositeEdge === 'top' || oppositeEdge === 'bottom'
        ? a.positionCm.x - b.positionCm.x
        : a.positionCm.y - b.positionCm.y
    )

  const draggedIndexInEdge = draggedEdgeChairs.findIndex((c) => c.id === draggedChair.id)
  if (draggedIndexInEdge === -1) return existingChairs

  const pairedChair = oppositeEdgeChairs[draggedIndexInEdge]

  const lockedPos = lockToEdge(
    newPosCm, draggedEdge, tx, ty,
    distLong, distShort, halfW, halfD, tableRot
  )

  // If no paired chair, just lock to edge and return
  if (!pairedChair) {
    return existingChairs.map((chair) =>
      chair.id === draggedChair.id ? { ...chair, positionCm: lockedPos } : chair
    )
  }

  const unrotatedLocked = rotatePoint(lockedPos.x, lockedPos.y, tx, ty, -tableRot)

  let unrotatedMirrored: { x: number; y: number }
  if (draggedEdge === 'top' || draggedEdge === 'bottom') {
    unrotatedMirrored = {
      x: unrotatedLocked.x,
      y: draggedEdge === 'top' ? ty + distLong : ty - distLong,
    }
  } else {
    unrotatedMirrored = {
      x: draggedEdge === 'left' ? tx + distShort : tx - distShort,
      y: unrotatedLocked.y,
    }
  }

  const mirroredPos = rotatePoint(
    unrotatedMirrored.x, unrotatedMirrored.y, tx, ty, tableRot
  )

  return existingChairs.map((chair) => {
    if (chair.id === draggedChair.id) return { ...chair, positionCm: lockedPos }
    if (chair.id === pairedChair.id) return { ...chair, positionCm: mirroredPos }
    return chair
  })
}