import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { zoneAreaM2 } from '@/lib/zones'
import { drawPlan, tableHeading, tablesOfRoom } from './plan'
import { formatDateEn, pdfText } from './text'
import type { PdfExportData, PdfGuest, PdfOptions } from './types'

const M = 36 // page margin, pt
const TOP = 52 // first content line under the running header
const AGE_LABEL = { adult: 'Adult', child: 'Child', baby: 'Baby' } as const

type Doc = jsPDF & { lastAutoTable?: { finalY: number } }

function finalY(doc: Doc): number {
  return doc.lastAutoTable?.finalY ?? TOP
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [99, 102, 241]
}

/** Builds the PDF in memory. Works in the browser and in Node (used by the tests). */
export function buildProjectPdf(data: PdfExportData, opts: PdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }) as Doc
  let usedFirst = false
  const newPage = (orientation: 'l' | 'p') => {
    if (!usedFirst) {
      usedFirst = true
      if (orientation === 'p') {
        // jsPDF starts landscape here; swap the first page's size instead of adding a blank one.
        doc.deletePage(1)
        doc.addPage('a4', 'p')
      }
      return
    }
    doc.addPage('a4', orientation)
  }

  const rooms = data.rooms.filter((r) => opts.roomIds.includes(r.id))
  const catalog = data.catalog
  const guestById = new Map(data.guests.map((g) => [g.id, g]))
  const seatOfGuest = new Map(data.assignments.map((a) => [a.guestId, a.layoutObjectId]))
  const objectById = new Map(data.objects.map((o) => [o.id, o]))

  /** table object id → heading, per room numbering (matches the plan labels). */
  const headingByTableId = new Map<string, string>()
  for (const room of data.rooms) {
    tablesOfRoom(room.id, data.objects, catalog).forEach((t, i) => headingByTableId.set(t.id, tableHeading(t, i)))
  }
  const tableOfChair = (chairId: string): string | null => {
    const chair = objectById.get(chairId)
    return chair?.isChairFor ?? (headingByTableId.has(chairId) ? chairId : null)
  }
  const tableNameForGuest = (g: PdfGuest): string => {
    const seat = seatOfGuest.get(g.id)
    if (!seat) return ''
    const t = tableOfChair(seat)
    return t ? (headingByTableId.get(t) ?? '') : ''
  }

  // ── 1. Floor plans ─────────────────────────────────────────────────────────
  if (opts.sections.plans) {
    for (const room of rooms) {
      newPage('l')
      const objs = data.objects.filter((o) => o.roomId === room.id)
      const zones = data.zones.filter((z) => z.roomId === room.id)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.setTextColor(20, 20, 20)
      doc.text(pdfText(room.name), M, TOP + 8)

      const sideX = 640
      const sideW = 842 - M - sideX
      drawPlan(doc, room, objs, catalog, zones, { x: M, y: TOP + 22, w: sideX - M - 16, h: 595 - TOP - 22 - 50 })

      let y = TOP + 22
      const tables = tablesOfRoom(room.id, data.objects, catalog)
      const chairs = objs.filter((o) => o.isChairFor || catalog[o.catalogItemId]?.category === 'chairs').length
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
      doc.text(`${tables.length} table${tables.length === 1 ? '' : 's'} · ${chairs} chairs`, sideX, y)
      y += 18

      if (zones.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(20, 20, 20)
        doc.text('Zones', sideX, y)
        y += 12
        doc.setFont('helvetica', 'normal')
        for (const z of zones) {
          const [r, g, b] = hexRgb(z.color)
          doc.setFillColor(r, g, b)
          doc.rect(sideX, y - 7, 9, 9, 'F')
          doc.setTextColor(20, 20, 20)
          const area = `${zoneAreaM2(z).toFixed(1)} sq m`
          doc.text(doc.splitTextToSize(pdfText(z.name), sideW - 60)[0] ?? '', sideX + 14, y)
          doc.setTextColor(110, 110, 110)
          doc.text(area, sideX + sideW, y, { align: 'right' })
          y += 13
        }
        y += 8
      }

      const notes = tables
        .map((t, i) => ({ h: tableHeading(t, i), note: t.tableNote?.trim() ?? '' }))
        .filter((n) => n.note)
      if (notes.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(20, 20, 20)
        doc.text('Table notes', sideX, y)
        y += 12
        let continued = false
        let cx = sideX
        let cw = sideW
        let limit = 595 - 40
        for (const n of notes) {
          const lines = doc.splitTextToSize(`${n.h}: ${pdfText(n.note)}`, cw) as string[]
          if (y + lines.length * 11 > limit) {
            if (!continued) {
              continued = true
              newPage('l')
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(12)
              doc.setTextColor(20, 20, 20)
              doc.text(`${pdfText(room.name)} — table notes (continued)`, M, TOP + 8)
              cx = M
              cw = 842 - 2 * M
              limit = 595 - 40
            } else {
              newPage('l')
            }
            y = TOP + 28
          }
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8.5)
          doc.setTextColor(50, 50, 50)
          doc.text(lines, cx, y)
          y += lines.length * 11 + 3
        }
      }
    }
  }

  // ── 2. Itemised list ───────────────────────────────────────────────────────
  if (opts.sections.items) {
    newPage('p')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(20, 20, 20)
    doc.text('Items and stock', M, TOP + 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 100, 100)
    doc.text(
      doc.splitTextToSize(
        `Whole project, all rooms. Compared with ${pdfText(data.venueName)}'s own stock; only tables and chairs are stock-tracked.`,
        595 - 2 * M,
      ),
      M,
      TOP + 22,
    )
    const rows = data.itemRows
    if (rows.length === 0) {
      doc.setFontSize(10)
      doc.text('Nothing placed in this project yet.', M, TOP + 52)
    } else {
      autoTable(doc, {
        startY: TOP + 40,
        margin: { left: M, right: M, top: TOP, bottom: 40 },
        head: [['Item', 'Placed', 'Venue has', 'To rent']],
        body: rows.map((r) => [
          pdfText(r.name),
          String(r.used),
          r.isStockTracked ? String(r.venueStock) : 'not tracked',
          r.shortfall > 0
            ? `${r.shortfall} short — ` +
              (r.rentalAvailability.length > 0
                ? 'available: ' + r.rentalAvailability.map((a) => `${pdfText(a.companyName)} (${a.quantity})`).join(', ')
                : 'no rental company has stock yet')
            : '—',
        ]),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [40, 40, 40] },
        columnStyles: { 1: { halign: 'right', cellWidth: 48 }, 2: { halign: 'right', cellWidth: 62 } },
        didParseCell: (h) => {
          if (h.section === 'body' && rows[h.row.index]?.shortfall > 0) h.cell.styles.fillColor = [255, 243, 214]
        },
      })
    }
  }

  // ── 3. Seating chart ───────────────────────────────────────────────────────
  if (opts.sections.seating) {
    newPage('p')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(20, 20, 20)
    doc.text('Seating chart', M, TOP + 8)
    let y = TOP + 24
    let any = false
    for (const room of rooms) {
      const tables = tablesOfRoom(room.id, data.objects, catalog)
      if (tables.length === 0) continue
      any = true
      const seatsByTable = new Map<string, string[]>()
      const totalByTable = new Map<string, number>()
      for (const o of data.objects) {
        if (o.roomId !== room.id || !o.isChairFor) continue
        totalByTable.set(o.isChairFor, (totalByTable.get(o.isChairFor) ?? 0) + 1)
      }
      for (const a of data.assignments) {
        const t = tableOfChair(a.layoutObjectId)
        const g = guestById.get(a.guestId)
        if (!t || !g || objectById.get(t)?.roomId !== room.id) continue
        seatsByTable.set(t, [...(seatsByTable.get(t) ?? []), g.name])
      }
      if (y > 700) {
        doc.addPage('a4', 'p')
        y = TOP
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(20, 20, 20)
      doc.text(pdfText(room.name), M, y + 8)
      autoTable(doc, {
        startY: y + 14,
        margin: { left: M, right: M, top: TOP, bottom: 40 },
        head: [['Table', 'Seats', 'Guests', 'Note']],
        body: tables.map((t, i) => {
          const guests = (seatsByTable.get(t.id) ?? []).sort((a, b) => a.localeCompare(b))
          const total = totalByTable.get(t.id) ?? 0
          return [
            tableHeading(t, i),
            total > 0 ? `${guests.length}/${total}` : String(guests.length),
            guests.map(pdfText).join(', ') || '—',
            pdfText(t.tableNote),
          ]
        }),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, valign: 'top' },
        headStyles: { fillColor: [40, 40, 40] },
        columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' }, 1: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 110 } },
      })
      y = finalY(doc) + 22
    }
    if (!any) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text('No tables in the selected rooms.', M, TOP + 32)
    }
    const seated = new Set(data.assignments.map((a) => a.guestId))
    const unseated = data.guests.filter((g) => !seated.has(g.id) && !g.seatDismissed)
    if (unseated.length > 0) {
      if (y > 680) {
        doc.addPage('a4', 'p')
        y = TOP
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(20, 20, 20)
      doc.text(`Not seated yet (${unseated.length}, whole project)`, M, y + 8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
      const lines = doc.splitTextToSize(
        unseated
          .map((g) => pdfText(g.name))
          .sort((a, b) => a.localeCompare(b))
          .join(', '),
        595 - 2 * M,
      ) as string[]
      let ly = y + 24
      for (const line of lines) {
        if (ly > 800) {
          doc.addPage('a4', 'p')
          ly = TOP
        }
        doc.text(line, M, ly)
        ly += 11
      }
    }
  }

  // ── 4. Guest list ──────────────────────────────────────────────────────────
  if (opts.sections.guests) {
    newPage('p')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(20, 20, 20)
    doc.text('Guest list', M, TOP + 8)
    const g = data.guests
    const count = (f: (x: PdfGuest) => boolean) => g.filter(f).length
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(
      `${g.length} guests · ${count((x) => x.vip)} VIP · ${count((x) => x.speech)} speeches · ` +
        `${count((x) => x.ageGroup === 'child')} children · ${count((x) => x.ageGroup === 'baby')} babies · ` +
        `${count((x) => !!x.dietary?.trim())} with dietary needs`,
      M,
      TOP + 22,
    )
    autoTable(doc, {
      startY: TOP + 34,
      margin: { left: M, right: M, top: TOP, bottom: 40 },
      head: [['Name', 'Family', 'Group', 'VIP', 'Dietary', 'Notes', 'Table']],
      body: [...g]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((x) => [
          pdfText(x.name),
          pdfText(x.family),
          AGE_LABEL[x.ageGroup],
          [x.vip ? 'VIP' : '', x.speech ? 'Speech' : ''].filter(Boolean).join(' + '),
          pdfText(x.dietary),
          pdfText(x.notes),
          tableNameForGuest(x),
        ]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, valign: 'top' },
      headStyles: { fillColor: [40, 40, 40] },
      columnStyles: { 3: { cellWidth: 52 }, 2: { cellWidth: 38 }, 6: { cellWidth: 52 } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 3 && h.cell.raw) h.cell.styles.fontStyle = 'bold'
      },
    })
  }

  // ── Running header / footer ────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)
    doc.text(pdfText(data.projectTitle), M, 26)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`${pdfText(data.teamName)} · ${formatDateEn(data.eventDate)}`, w - M, 26, { align: 'right' })
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.line(M, 33, w - M, 33)
    doc.setFontSize(8)
    doc.text('Venuria', M, h - 20)
    doc.text(`Page ${p} of ${total}`, w - M, h - 20, { align: 'right' })
  }

  return doc
}
