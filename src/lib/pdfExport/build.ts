import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { zoneAreaM2 } from '@/lib/zones'
import { INTL_TAG } from '@/i18n/config'
import { drawPlan, tableHeading, tablesOfRoom } from './plan'
import { formatDateLong, pdfText } from './text'
import type { PdfExportData, PdfGuest, PdfOptions } from './types'
import { BRAND_HEIGHT_PT, DEFAULT_PDF_STYLE, LOGO_HEIGHT_PT, LOGO_MAX_ASPECT, SPACING_FACTOR, fontOption, hexToRgb } from './style'

const M = 36 // page margin, pt
const TOP = 52 // first content line under the running header
const BOTTOM = 790 // last text line on a portrait page; the footer band (logo) sits below it

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
  const { t, locale } = opts
  const AGE_LABEL = { adult: t('ageAdult'), child: t('ageChild'), baby: t('ageBaby') } as const
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }) as Doc
  const style = opts.style ?? DEFAULT_PDF_STYLE
  const fontInfo = fontOption(style.font)
  let F = 'helvetica'
  if (fontInfo.files && opts.fonts) {
    doc.addFileToVFS(`${fontInfo.key}-normal.ttf`, opts.fonts.normal)
    doc.addFont(`${fontInfo.key}-normal.ttf`, fontInfo.key, 'normal')
    doc.addFileToVFS(`${fontInfo.key}-bold.ttf`, opts.fonts.bold)
    doc.addFont(`${fontInfo.key}-bold.ttf`, fontInfo.key, 'bold')
    F = fontInfo.key
  }
  const accent = hexToRgb(style.accent)
  const k = style.baseSize / 9 // body text scale (the original layout was drawn at 9 pt)
  const sp = SPACING_FACTOR[style.spacing]
  const T = (n: number) => (style.titleSize * n) / 15 // heading sizes keep their ratio to the 15 pt title
  const B = (n: number) => Math.round(n * k * 2) / 2
  const lineSp = style.spacing === 'compact' ? 0.95 : style.spacing === 'roomy' ? 1.3 : 1 // gentler than cell padding: lines must never touch
  const LH = (n: number) => n * k * lineSp // line pitch / gap
  const W = (n: number) => n * k // fixed column widths grow with the text
  const PAD = (n: number) => n * sp
  const SUB = Math.max(0, k - 1) * 20 // a bigger body text can wrap the subtitle onto a second line
  const TG = Math.max(0, style.titleSize - 15) // extra room under a title bigger than the default
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
    tablesOfRoom(room.id, data.objects, catalog).forEach((tb, i) => headingByTableId.set(tb.id, tableHeading(tb, i, t)))
  }
  const tableOfChair = (chairId: string): string | null => {
    const chair = objectById.get(chairId)
    return chair?.isChairFor ?? (headingByTableId.has(chairId) ? chairId : null)
  }
  const tableNameForGuest = (g: PdfGuest): string => {
    const seat = seatOfGuest.get(g.id)
    if (!seat) return ''
    const tb = tableOfChair(seat)
    return tb ? (headingByTableId.get(tb) ?? '') : ''
  }

  // ── 1. Floor plans ─────────────────────────────────────────────────────────
  if (opts.sections.plans) {
    for (const room of rooms) {
      newPage('l')
      const objs = data.objects.filter((o) => o.roomId === room.id)
      const zones = data.zones.filter((z) => z.roomId === room.id)
      doc.setFont(F, 'bold')
      doc.setFontSize(T(15))
      doc.setTextColor(...accent)
      doc.text(pdfText(room.name), M, TOP + 8)

      const sideX = 640
      const sideW = 842 - M - sideX
      drawPlan(doc, room, objs, catalog, zones, { x: M, y: TOP + 22 + TG, w: sideX - M - 16, h: 595 - TOP - 22 - 50 - TG }, F)

      let y = TOP + 22 + TG
      const tables = tablesOfRoom(room.id, data.objects, catalog)
      const chairs = objs.filter((o) => o.isChairFor || catalog[o.catalogItemId]?.category === 'chairs').length
      doc.setFont(F, 'normal')
      doc.setFontSize(B(9))
      doc.setTextColor(60, 60, 60)
      doc.text(t('tablesChairs', { tables: tables.length, chairs }), sideX, y)
      y += LH(18)

      if (zones.length > 0) {
        doc.setFont(F, 'bold')
        doc.setFontSize(B(9))
        doc.setTextColor(20, 20, 20)
        doc.text(t('zones'), sideX, y)
        y += LH(12)
        doc.setFont(F, 'normal')
        for (const z of zones) {
          const [r, g, b] = hexRgb(z.color)
          doc.setFillColor(r, g, b)
          doc.rect(sideX, y - 7, 9, 9, 'F')
          doc.setTextColor(20, 20, 20)
          const area = t('sqm', { area: zoneAreaM2(z).toFixed(1) })
          doc.text(doc.splitTextToSize(pdfText(z.name), sideW - 60)[0] ?? '', sideX + 14, y)
          doc.setTextColor(110, 110, 110)
          doc.text(area, sideX + sideW, y, { align: 'right' })
          y += LH(13)
        }
        y += LH(8)
      }

      const notes = tables
        .map((tb, i) => ({ h: tableHeading(tb, i, t), note: tb.tableNote?.trim() ?? '' }))
        .filter((n) => n.note)
      if (notes.length > 0) {
        doc.setFont(F, 'bold')
        doc.setFontSize(B(9))
        doc.setTextColor(20, 20, 20)
        doc.text(t('tableNotes'), sideX, y)
        y += LH(12)
        let continued = false
        let cx = sideX
        let cw = sideW
        let limit = 595 - 40
        for (const n of notes) {
          const lines = doc.splitTextToSize(`${n.h}: ${pdfText(n.note)}`, cw) as string[]
          if (y + lines.length * LH(11) > limit) {
            if (!continued) {
              continued = true
              newPage('l')
              doc.setFont(F, 'bold')
              doc.setFontSize(T(12))
              doc.setTextColor(...accent)
              doc.text(t('tableNotesContinued', { room: pdfText(room.name) }), M, TOP + 8)
              cx = M
              cw = 842 - 2 * M
              limit = 595 - 40
            } else {
              newPage('l')
            }
            y = TOP + 28 + TG
          }
          doc.setFont(F, 'normal')
          doc.setFontSize(B(8.5))
          doc.setTextColor(50, 50, 50)
          doc.text(lines, cx, y)
          y += lines.length * LH(11) + 3
        }
      }
    }
  }

  // ── 2. Itemised list ───────────────────────────────────────────────────────
  if (opts.sections.items) {
    newPage('p')
    doc.setFont(F, 'bold')
    doc.setFontSize(T(15))
    doc.setTextColor(...accent)
    doc.text(t('itemsTitle'), M, TOP + 8)
    doc.setFont(F, 'normal')
    doc.setFontSize(B(8.5))
    doc.setTextColor(100, 100, 100)
    doc.text(
      doc.splitTextToSize(
        t('itemsIntro', { venue: pdfText(data.venueName) }),
        595 - 2 * M,
      ),
      M,
      TOP + 22 + TG,
    )
    const rows = data.itemRows
    if (rows.length === 0) {
      doc.setFontSize(B(10))
      doc.text(t('nothingPlaced'), M, TOP + 52 + TG)
    } else {
      autoTable(doc, {
        startY: TOP + 40 + TG + SUB,
        margin: { left: M, right: M, top: TOP, bottom: 40 },
        head: [[t('colItem'), t('colPlaced'), t('colVenueHas'), t('colToRent')]],
        body: rows.map((r) => [
          pdfText(r.name),
          String(r.used),
          r.isStockTracked ? String(r.venueStock) : t('notTracked'),
          r.shortfall > 0
            ? t('shortage', { count: r.shortfall }) +
              (r.rentalAvailability.length > 0
                ? t('availableFrom') + r.rentalAvailability.map((a) => `${pdfText(a.companyName)} (${a.quantity})`).join(', ')
                : t('noRentalStock'))
            : '—',
        ]),
        styles: { font: F, fontSize: B(9), cellPadding: PAD(4) },
        headStyles: { fillColor: accent, font: F, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right', cellWidth: W(48) }, 2: { halign: 'right', cellWidth: W(62) } },
        didParseCell: (h) => {
          if (h.section === 'body' && rows[h.row.index]?.shortfall > 0) h.cell.styles.fillColor = [255, 243, 214]
        },
      })
    }
  }

  // ── 3. Seating chart ───────────────────────────────────────────────────────
  if (opts.sections.seating) {
    newPage('p')
    doc.setFont(F, 'bold')
    doc.setFontSize(T(15))
    doc.setTextColor(...accent)
    doc.text(t('seatingTitle'), M, TOP + 8)
    let y = TOP + 24 + TG
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
        const tb = tableOfChair(a.layoutObjectId)
        const g = guestById.get(a.guestId)
        if (!tb || !g || objectById.get(tb)?.roomId !== room.id) continue
        seatsByTable.set(tb, [...(seatsByTable.get(tb) ?? []), g.name])
      }
      if (y > 700) {
        doc.addPage('a4', 'p')
        y = TOP
      }
      doc.setFont(F, 'bold')
      doc.setFontSize(T(11))
      doc.setTextColor(...accent)
      doc.text(pdfText(room.name), M, y + 8)
      autoTable(doc, {
        startY: y + 14,
        margin: { left: M, right: M, top: TOP, bottom: 40 },
        head: [[t('colTable'), t('colSeats'), t('colGuests'), t('colNote')]],
        body: tables.map((tb, i) => {
          const guests = (seatsByTable.get(tb.id) ?? []).sort((a, b) => a.localeCompare(b, INTL_TAG[locale]))
          const total = totalByTable.get(tb.id) ?? 0
          return [
            tableHeading(tb, i, t),
            total > 0 ? `${guests.length}/${total}` : String(guests.length),
            guests.map(pdfText).join(', ') || '—',
            pdfText(tb.tableNote),
          ]
        }),
        styles: { font: F, fontSize: B(9), cellPadding: PAD(4), valign: 'top' },
        headStyles: { fillColor: accent, font: F, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: W(80), fontStyle: 'bold' }, 1: { cellWidth: W(40), halign: 'right' }, 3: { cellWidth: W(110) } },
      })
      y = finalY(doc) + 22
    }
    if (!any) {
      doc.setFont(F, 'normal')
      doc.setFontSize(B(10))
      doc.text(t('noTables'), M, TOP + 32 + TG)
    }
    const seated = new Set(data.assignments.map((a) => a.guestId))
    const unseated = data.guests.filter((g) => !seated.has(g.id) && !g.seatDismissed)
    if (unseated.length > 0) {
      if (y > 680) {
        doc.addPage('a4', 'p')
        y = TOP
      }
      doc.setFont(F, 'bold')
      doc.setFontSize(T(11))
      doc.setTextColor(...accent)
      doc.text(t('notSeated', { count: unseated.length }), M, y + 8)
      doc.setFont(F, 'normal')
      doc.setFontSize(B(9))
      doc.setTextColor(60, 60, 60)
      const lines = doc.splitTextToSize(
        unseated
          .map((g) => pdfText(g.name))
          .sort((a, b) => a.localeCompare(b, INTL_TAG[locale]))
          .join(', '),
        595 - 2 * M,
      ) as string[]
      let ly = y + 24
      for (const line of lines) {
        if (ly > BOTTOM) {
          doc.addPage('a4', 'p')
          ly = TOP
        }
        doc.text(line, M, ly)
        ly += LH(11)
      }
    }
  }

  // ── 4. Guest list ──────────────────────────────────────────────────────────
  if (opts.sections.guests) {
    newPage('p')
    doc.setFont(F, 'bold')
    doc.setFontSize(T(15))
    doc.setTextColor(...accent)
    doc.text(t('guestListTitle'), M, TOP + 8)
    const g = data.guests
    const count = (f: (x: PdfGuest) => boolean) => g.filter(f).length
    doc.setFont(F, 'normal')
    doc.setFontSize(B(9))
    doc.setTextColor(80, 80, 80)
    doc.text(
      t('guestSummary', {
        total: g.length,
        vip: count((x) => x.vip),
        speeches: count((x) => x.speech),
        children: count((x) => x.ageGroup === 'child'),
        babies: count((x) => x.ageGroup === 'baby'),
        dietary: count((x) => !!x.dietary?.trim()),
      }),
      M,
      TOP + 22 + TG,
    )
    autoTable(doc, {
      startY: TOP + 34 + TG,
      margin: { left: M, right: M, top: TOP, bottom: 40 },
      head: [[t('colName'), t('colFamily'), t('colGroup'), t('colVip'), t('colDietary'), t('colNotes'), t('colTable')]],
      body: [...g]
        .sort((a, b) => a.name.localeCompare(b.name, INTL_TAG[locale]))
        .map((x) => [
          pdfText(x.name),
          pdfText(x.family),
          AGE_LABEL[x.ageGroup],
          [x.vip ? t('vip') : '', x.speech ? t('speech') : ''].filter(Boolean).join(' + '),
          pdfText(x.dietary),
          pdfText(x.notes),
          tableNameForGuest(x),
        ]),
      styles: { font: F, fontSize: B(8), cellPadding: PAD(3), valign: 'top' },
      headStyles: { fillColor: accent, font: F, fontStyle: 'bold' },
      columnStyles: { 3: { cellWidth: W(52) }, 2: { cellWidth: W(38) }, 6: { cellWidth: W(52) } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 3 && h.cell.raw) h.cell.styles.fontStyle = 'bold'
      },
    })
  }

  // ── Running header / footer ────────────────────────────────────────────────
  const logo = style.showLogo ? opts.logo : null
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFont(F, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)
    doc.text(pdfText(data.projectTitle), M, 26)
    doc.setFont(F, 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`${pdfText(data.teamName)} · ${formatDateLong(data.eventDate, locale, t)}`, w - M, 26, { align: 'right' })
    doc.setDrawColor(...accent)
    doc.setLineWidth(0.75)
    doc.line(M, 33, w - M, 33)

    // Footer. The Venuria mark is fixed at the bottom right and cannot be turned off; the page
    // number sits just left of it. The team logo takes the bottom left or centre (their choice)
    // and the footer text uses whichever of those two it leaves free.
    const brandH = BRAND_HEIGHT_PT
    let brandLeft: number
    if (opts.brandMark) {
      const bw = brandH * (opts.brandMark.widthPx / opts.brandMark.heightPx)
      brandLeft = w - M - bw
      doc.addImage(opts.brandMark.dataUrl, opts.brandMark.format, brandLeft, h - 10 - brandH, bw, brandH, undefined, 'FAST')
    } else {
      // Fallback if the image could not be loaded: the name is still printed.
      doc.setFont(F, 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...accent)
      const tw = doc.getTextWidth('Venuria')
      brandLeft = w - M - tw
      doc.text('Venuria', brandLeft, h - 16)
    }
    doc.setFont(F, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text(t('pageOf', { page: p, total }), brandLeft - 12, h - 20, { align: 'right' })

    const logoSlot = logo ? (style.logoPosition === 'bottom-left' ? 'left' : 'center') : null
    const textSlot = logoSlot === 'left' ? 'center' : 'left'
    const footerText = pdfText(style.footerText)
    if (footerText) doc.text(footerText, textSlot === 'left' ? M : w / 2, h - 20, { align: textSlot })

    if (logo && logoSlot) {
      const aspect = Math.min(logo.widthPx / logo.heightPx, LOGO_MAX_ASPECT)
      const lh = LOGO_HEIGHT_PT[style.logoSize]
      const lw = lh * aspect
      const x = logoSlot === 'left' ? M : (w - lw) / 2
      doc.addImage(logo.dataUrl, logo.format, x, h - 10 - lh, lw, lh, undefined, 'FAST')
    }
  }

  return doc
}
