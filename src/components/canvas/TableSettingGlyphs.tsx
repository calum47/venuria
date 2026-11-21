'use client'

import { Group, Circle, Rect, Line } from 'react-konva'
import type { LayoutObject, TableSettingItem } from '@/types'
import type { DbCatalogItem } from '@/types/db'
import { cmToPixels } from '@/lib/utils/coordinates'

// Draws a table's setting on the 2D floor plan, inside the table's own rotated
// Group (origin = table centre). Everything is drawn at real catalog size.
//
//   per-seat items  → one place setting in front of every chair, pointing at the
//                     table centre: plates (stacked), forks on the left, knives and
//                     spoons on the right, glasses to the front-right
//   per-table items → a row down the middle of the table: runner underneath,
//                     then vases, candles, centrepieces
//
// All shapes are non-interactive (listening=false) so dragging and clicking the
// table works exactly as before.

type Props = {
  table: LayoutObject
  tableItem: DbCatalogItem
  isRound: boolean
  chairs: LayoutObject[]
  settingItems: Map<string, DbCatalogItem>
  scale: number
  /** false → a single small marker (zoomed far out, keeps the canvas fast) */
  detailed: boolean
}

type Resolved = { item: DbCatalogItem; quantity: number }

const GLASS_FILL: [RegExp, string][] = [
  [/red/i, '#b91c1c'],
  [/champagne|flute/i, '#fde68a'],
  [/white/i, '#fef08a'],
  [/water/i, '#bfdbfe'],
]

function glassFill(name: string): string {
  return GLASS_FILL.find(([re]) => re.test(name))?.[1] ?? '#e5e7eb'
}

export default function TableSettingGlyphs({ table, tableItem, isRound, chairs, settingItems, scale, detailed }: Props) {
  const lines: Resolved[] = (table.tableSetting?.items ?? [])
    .map((l: TableSettingItem) => ({ item: settingItems.get(l.catalogItemId), quantity: l.quantity }))
    .filter((l): l is Resolved => !!l.item && l.quantity >= 1)
  if (lines.length === 0) return null

  const px = (cm: number) => cmToPixels(cm, scale)
  const halfW = tableItem.width_cm / 2
  const halfD = tableItem.depth_cm / 2

  if (!detailed) {
    return <Circle radius={5} x={isRound ? 0 : px(halfW) - 10} y={isRound ? px(halfW) - 10 : -px(halfD) + 10} fill="#e11d48" opacity={0.8} listening={false} />
  }

  const perSeat = lines.filter((l) => l.item.scope === 'per_seat')
  const perTable = lines.filter((l) => l.item.scope !== 'per_seat')

  const plates = perSeat.filter((l) => l.item.category === 'plates')
  const mainPlates = plates.filter((l) => !/side|bread/i.test(l.item.name)).sort((a, b) => b.item.width_cm - a.item.width_cm)
  const sidePlate = plates.find((l) => /side|bread/i.test(l.item.name))
  const cutlery = perSeat.filter((l) => l.item.category === 'cutlery')
  const forks = cutlery.filter((l) => /fork/i.test(l.item.name))
  const rightCutlery = cutlery.filter((l) => !/fork/i.test(l.item.name))
  const glasses = perSeat.filter((l) => l.item.category === 'glassware')

  const plateR = Math.max(12, ...mainPlates.map((p) => p.item.width_cm / 2))
  const inset = plateR + 4 // seat centre, in cm, from the table edge

  // ── Place setting at each chair ────────────────────────────────────────────
  const rad = (table.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const seats = perSeat.length === 0 ? [] : chairs.map((chair) => {
    const dx = chair.positionCm.x - table.positionCm.x
    const dy = chair.positionCm.y - table.positionCm.y
    const lx = dx * cos + dy * sin       // chair position in the table's own frame
    const ly = -dx * sin + dy * cos
    let ix: number, iy: number           // inward direction (toward the table centre)
    let sx: number, sy: number           // seat centre
    if (isRound) {
      const len = Math.hypot(lx, ly) || 1
      ix = -lx / len; iy = -ly / len
      sx = -ix * (halfW - inset); sy = -iy * (halfW - inset)
    } else if (Math.abs(lx) / halfW > Math.abs(ly) / halfD) {
      ix = -Math.sign(lx); iy = 0
      sx = Math.sign(lx) * (halfW - inset)
      sy = Math.max(-halfD + plateR, Math.min(halfD - plateR, ly))
    } else {
      ix = 0; iy = -Math.sign(ly)
      sx = Math.max(-halfW + plateR, Math.min(halfW - plateR, lx))
      sy = Math.sign(ly) * (halfD - inset)
    }
    // Rotate so the setting's "up" (−y) points at the table centre
    return { id: chair.id, x: sx, y: sy, rotation: (Math.atan2(ix, -iy) * 180) / Math.PI }
  })

  // Chairs at corners or ends can put two settings on top of each other: shrink them all
  // together (never below 60%) rather than let plates overlap.
  let minGap = Infinity
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      minGap = Math.min(minGap, Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y))
    }
  }
  const seatScale = Math.max(0.6, Math.min(1, minGap / (plateR * 2 + 16)))

  // ── Centre row ─────────────────────────────────────────────────────────────
  const runner = perTable.find((l) => /runner/i.test(l.item.name))
  const row: { key: string; item: DbCatalogItem }[] = []
  for (const l of perTable) {
    if (l === runner) continue
    for (let i = 0; i < l.quantity; i++) row.push({ key: `${l.item.id}-${i}`, item: l.item })
  }
  const gap = 4
  const natural = row.reduce((sum, r) => sum + r.item.width_cm + gap, -gap)
  const available = isRound ? tableItem.width_cm * 0.55 : tableItem.width_cm * 0.7
  const squeeze = natural > available && natural > 0 ? available / natural : 1
  let cursor = (-natural * squeeze) / 2
  const rowShapes = row.map((r) => {
    const w = r.item.width_cm
    const cx = cursor + (w * squeeze) / 2
    cursor += (w + gap) * squeeze
    return { ...r, cx }
  })

  const centreStyle = (item: DbCatalogItem) => {
    if (item.category === 'flowers') return { fill: '#f9a8d4', stroke: '#db2777' }
    if (/centrepiece/i.test(item.name)) return { fill: '#fbcfe8', stroke: '#be185d' }
    if (/tealight/i.test(item.name)) return { fill: '#fde047', stroke: '#ca8a04' }
    return { fill: '#fef3c7', stroke: '#d97706' } // candles and anything else
  }

  return (
    <Group listening={false}>
      {runner && (
        <Rect
          width={px(runner.item.width_cm)} height={px(runner.item.depth_cm)}
          offsetX={px(runner.item.width_cm) / 2} offsetY={px(runner.item.depth_cm) / 2}
          fill="#bbf7d0" opacity={0.7} stroke="#4ade80" strokeWidth={1} cornerRadius={4}
        />
      )}

      {seats.map((seat) => (
        <Group key={seat.id} x={px(seat.x)} y={px(seat.y)} rotation={seat.rotation} scaleX={seatScale} scaleY={seatScale}>
          {sidePlate && (
            <Circle x={px(-(plateR + 1))} y={px(-(10 + sidePlate.item.width_cm / 2 + 1))} radius={px(sidePlate.item.width_cm / 2)} fill="#ffffff" stroke="#9ca3af" strokeWidth={0.8} />
          )}
          {mainPlates.map((p, i) => (
            <Circle
              key={p.item.id}
              radius={px(p.item.width_cm / 2)}
              fill={i === 0 && mainPlates.length > 1 ? '#d6c7a1' : '#ffffff'}
              stroke="#9ca3af" strokeWidth={0.8}
            />
          ))}
          {forks.flatMap((f) => Array.from({ length: f.quantity }, (_, k) => ({ f, k }))).map(({ f, k }, n) => (
            <Line key={`${f.item.id}-${k}`} points={[px(-(plateR + 3 + n * 3.5)), px(-f.item.width_cm / 2), px(-(plateR + 3 + n * 3.5)), px(f.item.width_cm / 2)]} stroke="#6b7280" strokeWidth={2} lineCap="round" />
          ))}
          {rightCutlery.flatMap((c) => Array.from({ length: c.quantity }, (_, k) => ({ c, k }))).map(({ c, k }, n) => (
            <Line key={`${c.item.id}-${k}`} points={[px(plateR + 3 + n * 3.5), px(-c.item.width_cm / 2), px(plateR + 3 + n * 3.5), px(c.item.width_cm / 2)]} stroke="#6b7280" strokeWidth={2} lineCap="round" />
          ))}
          {glasses.flatMap((g) => Array.from({ length: g.quantity }, (_, k) => ({ g, k }))).map(({ g, k }, n) => {
            const r = g.item.width_cm / 2
            return (
              <Circle
                key={`${g.item.id}-${k}`}
                x={px(plateR * 0.4 + r + n * (r * 2 + 1.5))}
                y={px(-(plateR + r - 4) - n * 2)}
                radius={px(r)}
                fill={glassFill(g.item.name)} opacity={0.85} stroke="#6b7280" strokeWidth={0.8}
              />
            )
          })}
        </Group>
      ))}

      {rowShapes.map(({ key, item, cx }) => {
        const style = centreStyle(item)
        return <Circle key={key} x={px(cx)} y={0} radius={Math.max(3, px(item.width_cm / 2))} fill={style.fill} stroke={style.stroke} strokeWidth={1} />
      })}
    </Group>
  )
}
