'use client'

import { Group, Rect, Line, Circle, Text } from 'react-konva'
import type Konva from 'konva'
import type { ProjectZone, ObstacleShape, Point2D } from '@/types'
import { hexToRgba, zoneLabelAnchor } from '@/lib/zones'

export type ZoneDraft =
  | { type: 'rect'; startPx: Point2D; currentPx: Point2D }
  | { type: 'polygon'; pointsPx: Point2D[]; cursorPx: Point2D | null }

type Props = {
  zones: ProjectZone[]
  editable: boolean
  selectedZoneId: string | null
  toPx: (p: Point2D) => Point2D
  toCm: (p: Point2D) => Point2D
  pxPerCm: number
  onSelect: (id: string) => void
  onChangeLocal: (id: string, shape: ObstacleShape) => void
  onCommit: (id: string) => void
  draft: ZoneDraft | null
  draftColor: string
}

const HANDLE_RADIUS = 5
const MIN_RECT_PX = 16

/**
 * Rendered inside FloorPlanCanvas's Layer, after the grid and before the
 * furniture, so zones read as painted floor areas under the tables.
 *
 * View mode (editable=false): nothing listens, so clicks fall through to the
 * stage/furniture exactly as before zones existed.
 *
 * Edit mode: shapes are draggable (translate), the selected shape shows
 * handles (rect corners / polygon vertices), and an in-progress draft is
 * drawn while the planner is creating a new zone. Live feedback goes through
 * onChangeLocal; onCommit fires once at the end of a gesture so each drag is
 * one DB write, not hundreds.
 */
export default function ZoneOverlay({
  zones,
  editable,
  selectedZoneId,
  toPx,
  toCm,
  pxPerCm,
  onSelect,
  onChangeLocal,
  onCommit,
  draft,
  draftColor,
}: Props) {
  return (
    <>
      {zones.map((zone) => (
        <ZoneShape
          key={zone.id}
          zone={zone}
          editable={editable}
          selected={zone.id === selectedZoneId}
          toPx={toPx}
          toCm={toCm}
          pxPerCm={pxPerCm}
          onSelect={() => onSelect(zone.id)}
          onChangeLocal={(shape) => onChangeLocal(zone.id, shape)}
          onCommit={() => onCommit(zone.id)}
        />
      ))}
      {draft && <DraftShape draft={draft} color={draftColor} />}
    </>
  )
}

// ─── One zone ─────────────────────────────────────────────────────────────────

function ZoneShape({
  zone,
  editable,
  selected,
  toPx,
  toCm,
  pxPerCm,
  onSelect,
  onChangeLocal,
  onCommit,
}: {
  zone: ProjectZone
  editable: boolean
  selected: boolean
  toPx: (p: Point2D) => Point2D
  toCm: (p: Point2D) => Point2D
  pxPerCm: number
  onSelect: () => void
  onChangeLocal: (shape: ObstacleShape) => void
  onCommit: () => void
}) {
  const { shape, color, name } = zone
  const fill = hexToRgba(color, selected ? 0.34 : 0.2)
  const stroke = color
  const strokeWidth = selected ? 2 : 1.5
  const stopBubble = (e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true }
  const labelAnchorPx = toPx(zoneLabelAnchor(shape))

  const label = (
    <Text
      x={labelAnchorPx.x}
      y={labelAnchorPx.y}
      offsetX={120}
      offsetY={7}
      width={240}
      align="center"
      text={name}
      fontSize={12}
      fontStyle="bold"
      fill={color}
      listening={false}
    />
  )

  if (shape.type === 'rect') {
    const c = toPx(shape.center)
    const wPx = shape.widthCm * pxPerCm
    const dPx = shape.depthCm * pxPerCm
    return (
      <>
        <Group
          x={c.x}
          y={c.y}
          rotation={shape.rotationDeg}
          draggable={editable}
          listening={editable}
          onMouseDown={stopBubble}
          onClick={(e) => { stopBubble(e); onSelect() }}
          onDragStart={onSelect}
          onDragMove={(e) => onChangeLocal({ ...shape, center: toCm({ x: e.target.x(), y: e.target.y() }) })}
          onDragEnd={(e) => {
            onChangeLocal({ ...shape, center: toCm({ x: e.target.x(), y: e.target.y() }) })
            onCommit()
          }}
        >
          <Rect x={-wPx / 2} y={-dPx / 2} width={wPx} height={dPx} fill={fill} stroke={stroke} strokeWidth={strokeWidth} dash={[6, 4]} cornerRadius={2} />
        </Group>
        {label}
        {editable && selected && shape.rotationDeg === 0 && (
          <RectCornerHandles
            centerPx={c}
            wPx={wPx}
            dPx={dPx}
            color={color}
            onResize={(centerPx, newWPx, newDPx) =>
              onChangeLocal({ ...shape, center: toCm(centerPx), widthCm: newWPx / pxPerCm, depthCm: newDPx / pxPerCm })
            }
            onCommit={onCommit}
          />
        )}
      </>
    )
  }

  if (shape.type === 'polygon') {
    const pointsPx = shape.points.map(toPx)
    return (
      <>
        {/* Group so the label travels with the shape during a translate-drag.
            Points are absolute, so the Group starts at 0,0 and its post-drag
            position IS the px delta — apply it to every point, then reset. */}
        <Group
          x={0}
          y={0}
          draggable={editable}
          listening={editable}
          onMouseDown={stopBubble}
          onClick={(e) => { stopBubble(e); onSelect() }}
          onDragStart={onSelect}
          onDragEnd={(e) => {
            const dxCm = e.target.x() / pxPerCm
            const dyCm = e.target.y() / pxPerCm
            e.target.position({ x: 0, y: 0 })
            onChangeLocal({ ...shape, points: shape.points.map((p) => ({ x: p.x + dxCm, y: p.y + dyCm })) })
            onCommit()
          }}
        >
          <Line points={pointsPx.flatMap((p) => [p.x, p.y])} closed fill={fill} stroke={stroke} strokeWidth={strokeWidth} dash={[6, 4]} />
          {label}
        </Group>
        {editable && selected && pointsPx.map((p, i) => (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={HANDLE_RADIUS}
            fill="#ffffff"
            stroke={color}
            strokeWidth={2}
            draggable
            onMouseDown={stopBubble}
            onDragMove={(e) => {
              const next = shape.points.slice()
              next[i] = toCm({ x: e.target.x(), y: e.target.y() })
              onChangeLocal({ ...shape, points: next })
            }}
            onDragEnd={onCommit}
          />
        ))}
      </>
    )
  }

  // Circle zones aren't creatable from the planner UI; render read-only if one ever appears.
  const c = toPx(shape.center)
  return (
    <>
      <Circle x={c.x} y={c.y} radius={shape.radiusCm * pxPerCm} fill={fill} stroke={stroke} strokeWidth={strokeWidth} dash={[6, 4]} listening={editable} onClick={(e) => { stopBubble(e); onSelect() }} />
      {label}
    </>
  )
}

// ─── Rect corner handles ──────────────────────────────────────────────────────

function RectCornerHandles({
  centerPx,
  wPx,
  dPx,
  color,
  onResize,
  onCommit,
}: {
  centerPx: Point2D
  wPx: number
  dPx: number
  color: string
  onResize: (centerPx: Point2D, wPx: number, dPx: number) => void
  onCommit: () => void
}) {
  const hw = wPx / 2
  const hd = dPx / 2
  const corners: Point2D[] = [
    { x: centerPx.x - hw, y: centerPx.y - hd }, // 0 top-left
    { x: centerPx.x + hw, y: centerPx.y - hd }, // 1 top-right
    { x: centerPx.x + hw, y: centerPx.y + hd }, // 2 bottom-right
    { x: centerPx.x - hw, y: centerPx.y + hd }, // 3 bottom-left
  ]
  return (
    <>
      {corners.map((corner, i) => {
        const opposite = corners[(i + 2) % 4]
        return (
          <Circle
            key={i}
            x={corner.x}
            y={corner.y}
            radius={HANDLE_RADIUS}
            fill="#ffffff"
            stroke={color}
            strokeWidth={2}
            draggable
            onMouseDown={(e) => { e.cancelBubble = true }}
            onDragMove={(e) => {
              const cur = { x: e.target.x(), y: e.target.y() }
              const newW = Math.max(MIN_RECT_PX, Math.abs(cur.x - opposite.x))
              const newD = Math.max(MIN_RECT_PX, Math.abs(cur.y - opposite.y))
              const newCenter = { x: (cur.x + opposite.x) / 2, y: (cur.y + opposite.y) / 2 }
              onResize(newCenter, newW, newD)
            }}
            onDragEnd={onCommit}
          />
        )
      })}
    </>
  )
}

// ─── In-progress draft ────────────────────────────────────────────────────────

function DraftShape({ draft, color }: { draft: ZoneDraft; color: string }) {
  const fill = hexToRgba(color, 0.15)
  if (draft.type === 'rect') {
    const x = Math.min(draft.startPx.x, draft.currentPx.x)
    const y = Math.min(draft.startPx.y, draft.currentPx.y)
    const w = Math.abs(draft.currentPx.x - draft.startPx.x)
    const h = Math.abs(draft.currentPx.y - draft.startPx.y)
    return <Rect x={x} y={y} width={w} height={h} fill={fill} stroke={color} strokeWidth={1.5} dash={[6, 4]} listening={false} />
  }
  const pts = draft.cursorPx ? [...draft.pointsPx, draft.cursorPx] : draft.pointsPx
  return (
    <>
      {pts.length >= 2 && (
        <Line points={pts.flatMap((p) => [p.x, p.y])} stroke={color} strokeWidth={1.5} dash={[6, 4]} listening={false} />
      )}
      {draft.pointsPx.length >= 3 && draft.cursorPx && (
        <Line points={[draft.cursorPx.x, draft.cursorPx.y, draft.pointsPx[0].x, draft.pointsPx[0].y]} stroke={color} strokeWidth={1} dash={[2, 4]} listening={false} />
      )}
      {draft.pointsPx.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={i === 0 ? HANDLE_RADIUS + 1 : HANDLE_RADIUS - 1} fill={i === 0 ? color : '#ffffff'} stroke={color} strokeWidth={1.5} listening={false} />
      ))}
    </>
  )
}
