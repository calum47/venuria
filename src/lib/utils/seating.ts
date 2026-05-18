import { LayoutObject, ChairArrangement, ChairEdge } from '@/types'
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
      // Chairs only on top and bottom (long sides)
      topCount = Math.floor(chairCount / 2)
      bottomCount = chairCount - topCount
    } else if (arrangement === 'short-only') {
      // Chairs only on left and right (short sides)
      leftCount = Math.floor(chairCount / 2)
      rightCount = chairCount - leftCount
    } else {
      // All sides — distribute proportionally
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

    // Top side
    for (let i = 0; i < topCount; i++) {
      const spacing = tableWidthCm / (topCount + 1)
      positions.push({
        x: tablePosX - halfW + spacing * (i + 1),
        y: tablePosY - distLong,
        rotationDeg: 180,
      })
    }

    // Bottom side
    for (let i = 0; i < bottomCount; i++) {
      const spacing = tableWidthCm / (bottomCount + 1)
      positions.push({
        x: tablePosX - halfW + spacing * (i + 1),
        y: tablePosY + distLong,
        rotationDeg: 0,
      })
    }

    // Left side
    for (let i = 0; i < leftCount; i++) {
      const spacing = tableDepthCm / (leftCount + 1)
      positions.push({
        x: tablePosX - distShort,
        y: tablePosY - halfD + spacing * (i + 1),
        rotationDeg: 90,
      })
    }

    // Right side
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

  return positions.map((pos, i) => {
    // Determine edge based on rotation
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

  // Map new positions back to existing chair ids
  return existingChairs.map((chair, i) => ({
    ...chair,
    positionCm: newChairs[i]?.positionCm ?? chair.positionCm,
    rotationDeg: newChairs[i]?.rotationDeg ?? chair.rotationDeg,
    chairEdge: newChairs[i]?.chairEdge ?? chair.chairEdge,
  }))
}

/**
 * Mirror drag for round tables — locks chair to orbit radius,
 * mirrors opposite chair, redistributes the rest evenly.
 */
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

  // Build angle array — only update dragged and its opposite
  // Keep all other chairs at their current angles
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

/**
 * Mirror drag for rectangular tables — mirrors chair along opposite edge.
 */
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

  const draggedEdge = draggedChair.chairEdge
  if (!draggedEdge || draggedEdge === 'orbit') return existingChairs

  const oppositeEdge: ChairEdge =
    draggedEdge === 'top' ? 'bottom' :
    draggedEdge === 'bottom' ? 'top' :
    draggedEdge === 'left' ? 'right' : 'left'

  // Get all chairs on the dragged edge and opposite edge, sorted by position
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

  // Find the index of the dragged chair within its edge
  const draggedIndexInEdge = draggedEdgeChairs.findIndex((c) => c.id === draggedChair.id)
  if (draggedIndexInEdge === -1) return existingChairs

  // Find the paired chair on the opposite edge (same index)
  const pairedChair = oppositeEdgeChairs[draggedIndexInEdge]
  if (!pairedChair) return existingChairs

  // Lock dragged chair to its edge
  const lockedPos = lockToEdge(newPosCm, draggedEdge, tx, ty, distLong, distShort, halfW, halfD)

  // Calculate mirrored position for paired chair
  let mirroredPos: { x: number; y: number }
  if (draggedEdge === 'top' || draggedEdge === 'bottom') {
    mirroredPos = {
      x: lockedPos.x, // same X
      y: draggedEdge === 'top' ? ty + distLong : ty - distLong,
    }
  } else {
    mirroredPos = {
      x: draggedEdge === 'left' ? tx + distShort : tx - distShort,
      y: lockedPos.y, // same Y
    }
  }

  return existingChairs.map((chair) => {
    if (chair.id === draggedChair.id) {
      return { ...chair, positionCm: lockedPos }
    }
    if (chair.id === pairedChair.id) {
      return { ...chair, positionCm: mirroredPos }
    }
    return chair
  })
}

function lockToEdge(
  posCm: { x: number; y: number },
  edge: ChairEdge,
  tx: number,
  ty: number,
  distLong: number,
  distShort: number,
  halfW: number,
  halfD: number
): { x: number; y: number } {
  if (edge === 'top') return {
    x: Math.max(tx - halfW, Math.min(tx + halfW, posCm.x)),
    y: ty - distLong,
  }
  if (edge === 'bottom') return {
    x: Math.max(tx - halfW, Math.min(tx + halfW, posCm.x)),
    y: ty + distLong,
  }
  if (edge === 'left') return {
    x: tx - distShort,
    y: Math.max(ty - halfD, Math.min(ty + halfD, posCm.y)),
  }
  if (edge === 'right') return {
    x: tx + distShort,
    y: Math.max(ty - halfD, Math.min(ty + halfD, posCm.y)),
  }
  return posCm
}