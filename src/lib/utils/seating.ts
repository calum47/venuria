import { LayoutObject } from '@/types'
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
  gapCm: number = 5
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
    // Distribute chairs across all four sides proportionally
    const halfW = tableWidthCm / 2
    const halfD = tableDepthCm / 2

    // Weight sides by their length
    const longSide = tableWidthCm   // top and bottom
    const shortSide = tableDepthCm  // left and right
    const totalLength = 2 * longSide + 2 * shortSide

    // Allocate chairs proportionally, minimum 1 per long side
    let topCount = Math.max(1, Math.round((longSide / totalLength) * chairCount))
    let bottomCount = Math.max(1, Math.round((longSide / totalLength) * chairCount))
    let leftCount = Math.round((shortSide / totalLength) * chairCount)
    let rightCount = Math.round((shortSide / totalLength) * chairCount)

    // Adjust to exactly match chairCount
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

    const distLong = halfD + gapCm + chairDepthCm / 2
    const distShort = halfW + gapCm + chairDepthCm / 2

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
  chairDepthCm: number
): LayoutObject[] {
  const positions = calculateChairPositions(
    tableObject.positionCm.x,
    tableObject.positionCm.y,
    tableWidthCm,
    tableDepthCm,
    isRound,
    chairCount,
    chairWidthCm,
    chairDepthCm
  )

  return positions.map((pos) => ({
    id: generateId(),
    catalogItemId: chairCatalogItemId,
    positionCm: { x: pos.x, y: pos.y },
    rotationDeg: pos.rotationDeg,
    quantity: 1,
    isChairFor: tableObject.id,
  }))
}

/**
 * Recalculate chair positions when a table moves.
 * Returns updated chair objects with new positions.
 */
export function recalculateChairPositions(
  tableObject: LayoutObject,
  tableWidthCm: number,
  tableDepthCm: number,
  isRound: boolean,
  chairWidthCm: number,
  chairDepthCm: number,
  existingChairs: LayoutObject[]
): LayoutObject[] {
  if (!tableObject.chairCount || existingChairs.length === 0) return []

  const positions = calculateChairPositions(
    tableObject.positionCm.x,
    tableObject.positionCm.y,
    tableWidthCm,
    tableDepthCm,
    isRound,
    existingChairs.length,
    chairWidthCm,
    chairDepthCm
  )

  return existingChairs.map((chair, i) => ({
    ...chair,
    positionCm: {
      x: positions[i]?.x ?? chair.positionCm.x,
      y: positions[i]?.y ?? chair.positionCm.y,
    },
    rotationDeg: positions[i]?.rotationDeg ?? chair.rotationDeg,
  }))
}