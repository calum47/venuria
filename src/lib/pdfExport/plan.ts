import type { jsPDF } from 'jspdf'
import type { ObstacleShape, Point2D, ProjectZone } from '@/types'
import { zoneLabelAnchor } from '@/lib/zones'
import { pdfText } from './text'
import type { PdfCatalogItem, PdfObject, PdfRoom } from './types'

type Box = { x: number; y: number; w: number; h: number }

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [99, 102, 241]
}

function rotatedRect(c: Point2D, w: number, d: number, deg: number): Point2D[] {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos }))
}

export function isTable(o: PdfObject, catalog: Record<string, PdfCatalogItem>): boolean {
  return !o.isChairFor && catalog[o.catalogItemId]?.category === 'tables'
}

/** Tables of a room in a stable reading order; the index is the table's number. */
export function tablesOfRoom(roomId: string, objects: PdfObject[], catalog: Record<string, PdfCatalogItem>): PdfObject[] {
  return objects
    .filter((o) => o.roomId === roomId && isTable(o, catalog))
    .sort((a, b) => Math.round(a.positionCm.y / 100) - Math.round(b.positionCm.y / 100) || a.positionCm.x - b.positionCm.x)
}

export function tableHeading(o: PdfObject, index: number): string {
  return o.tableLabel?.trim() ? pdfText(o.tableLabel.trim()) : `Table ${index + 1}`
}

function shapePoints(shape: ObstacleShape): Point2D[] | null {
  if (shape.type === 'rect') return rotatedRect(shape.center, shape.widthCm, shape.depthCm, shape.rotationDeg)
  if (shape.type === 'polygon') return shape.points
  return null
}

export function roomBounds(room: PdfRoom, objects: PdfObject[]) {
  const pts: Point2D[] =
    room.polygon.length >= 3
      ? [...room.polygon]
      : [
          { x: 0, y: 0 },
          { x: room.widthCm, y: room.depthCm },
        ]
  // Objects can sit outside the traced boundary; never cut them off.
  for (const o of objects) pts.push(o.positionCm)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { minX, minY, w: Math.max(1, Math.max(...xs) - minX), h: Math.max(1, Math.max(...ys) - minY) }
}

function withOpacity(doc: jsPDF, opacity: number, fn: () => void) {
  doc.saveGraphicsState()
  doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity }) as never)
  fn()
  doc.restoreGraphicsState()
}

/**
 * Draws one room as vectors inside `box` (PDF points). Pure function of the
 * data: it follows the editor's conventions (cm coordinates, object centre +
 * rotation, "round" in the catalog name → circle, chairs are separate objects).
 */
export function drawPlan(
  doc: jsPDF,
  room: PdfRoom,
  roomObjects: PdfObject[],
  catalog: Record<string, PdfCatalogItem>,
  zones: ProjectZone[],
  box: Box,
) {
  const b = roomBounds(room, roomObjects)
  const s = Math.min(box.w / b.w, box.h / b.h)
  const ox = box.x + (box.w - b.w * s) / 2
  const oy = box.y
  const tx = (x: number) => ox + (x - b.minX) * s
  const ty = (y: number) => oy + (y - b.minY) * s

  const poly = (pts: Point2D[], style: string) => {
    const p = pts.map((q) => [tx(q.x), ty(q.y)] as [number, number])
    const rel: [number, number][] = []
    for (let i = 1; i < p.length; i++) rel.push([p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]])
    doc.lines(rel, p[0][0], p[0][1], [1, 1], style, true)
  }
  const shape = (sh: ObstacleShape, style: string) => {
    if (sh.type === 'circle') doc.circle(tx(sh.center.x), ty(sh.center.y), sh.radiusCm * s, style)
    else {
      const pts = shapePoints(sh)
      if (pts && pts.length >= 3) poly(pts, style)
    }
  }

  // Floor
  doc.setLineWidth(0.8)
  doc.setDrawColor(60, 60, 60)
  doc.setFillColor(250, 250, 248)
  if (room.polygon.length >= 3) poly(room.polygon, 'FD')
  else doc.rect(tx(0), ty(0), room.widthCm * s, room.depthCm * s, 'FD')

  // Zones (translucent fill, solid outline)
  for (const z of zones) {
    const [r, g, bl] = hexRgb(z.color)
    doc.setFillColor(r, g, bl)
    doc.setDrawColor(r, g, bl)
    doc.setLineWidth(0.6)
    withOpacity(doc, 0.28, () => shape(z.shape, 'F'))
    shape(z.shape, 'S')
  }

  // Obstacles
  doc.setFillColor(190, 190, 190)
  doc.setDrawColor(110, 110, 110)
  doc.setLineWidth(0.4)
  for (const ob of room.obstacles) shape(ob, 'FD')

  // Chairs first so tables draw on top
  doc.setLineWidth(0.3)
  for (const o of roomObjects) {
    const item = catalog[o.catalogItemId]
    if (!o.isChairFor && item?.category !== 'chairs') continue
    doc.setFillColor(205, 215, 235)
    doc.setDrawColor(90, 105, 140)
    poly(rotatedRect(o.positionCm, item?.widthCm ?? 45, item?.depthCm ?? 45, o.rotationDeg), 'FD')
  }

  // Tables + decorations
  const tables = tablesOfRoom(room.id, roomObjects, catalog)
  const tableIndex = new Map(tables.map((t, i) => [t.id, i]))
  for (const o of roomObjects) {
    const item = catalog[o.catalogItemId]
    if (o.isChairFor || item?.category === 'chairs') continue
    const w = item?.widthCm ?? 100
    const d = item?.depthCm ?? 100
    const table = item?.category === 'tables'
    doc.setLineWidth(0.5)
    if (table) {
      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(40, 40, 40)
    } else {
      doc.setFillColor(238, 232, 220)
      doc.setDrawColor(150, 135, 105)
    }
    if (table && /round/i.test(item?.name ?? '')) doc.circle(tx(o.positionCm.x), ty(o.positionCm.y), (w / 2) * s, 'FD')
    else poly(rotatedRect(o.positionCm, w, d, o.rotationDeg), 'FD')

    const idx = tableIndex.get(o.id)
    const label = table ? (o.tableLabel?.trim() ? o.tableLabel.trim() : String((idx ?? 0) + 1)) : (item?.name ?? '')
    if (label) {
      const fit = Math.max(w, d) * s
      doc.setFont('helvetica', table ? 'bold' : 'normal')
      doc.setFontSize(table ? 7 : 5.5)
      doc.setTextColor(30, 30, 30)
      let t = pdfText(label)
      while (t.length > 1 && doc.getTextWidth(t) > Math.max(fit, 14)) t = t.slice(0, -1)
      doc.text(t, tx(o.positionCm.x), ty(o.positionCm.y), { align: 'center', baseline: 'middle' })
    }
  }

  // Zone names last, on top
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  for (const z of zones) {
    const a = zoneLabelAnchor(z.shape)
    const [r, g, bl] = hexRgb(z.color)
    doc.setTextColor(Math.floor(r * 0.5), Math.floor(g * 0.5), Math.floor(bl * 0.5))
    doc.text(pdfText(z.name), tx(a.x), ty(a.y) - 8, { align: 'center' })
  }
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)

  // Scale bar (1 m or 5 m depending on size)
  const barCm = b.w > 2500 ? 500 : 100
  const barPt = barCm * s
  doc.setLineWidth(0.8)
  doc.setDrawColor(0, 0, 0)
  const barY = oy + b.h * s + 14
  doc.line(box.x, barY, box.x + barPt, barY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(`${barCm / 100} m`, box.x + barPt + 4, barY + 2.5)
}
