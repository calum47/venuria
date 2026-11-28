'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { PdfExportData, PdfSections } from '@/lib/pdfExport/types'
import { safeFilePart } from '@/lib/pdfExport/text'
import { supabase } from '@/lib/supabase/client'

const SECTION_KEYS = ['plans', 'items', 'seating', 'guests'] as const satisfies readonly (keyof PdfSections)[]

export default function ExportPanel({ data }: { data: PdfExportData }) {
  const t = useTranslations('Export')
  const tp = useTranslations('Pdf')
  const locale = useLocale() as Locale
  const sectionText = {
    plans: { label: t('secPlans'), hint: t('secPlansHint') },
    items: { label: t('secItems'), hint: t('secItemsHint') },
    seating: { label: t('secSeating'), hint: t('secSeatingHint') },
    guests: { label: t('secGuests'), hint: t('secGuestsHint') },
  }
  const [sections, setSections] = useState<PdfSections>({ plans: true, items: true, seating: true, guests: true })
  const [roomIds, setRoomIds] = useState<string[]>(data.rooms.map((r) => r.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsRooms = sections.plans || sections.seating
  const anySection = Object.values(sections).some(Boolean)
  const canExport = anySection && (!needsRooms || roomIds.length > 0 || sections.items || sections.guests) && !busy

  async function run() {
    setBusy(true)
    setError(null)
    try {
      // Loaded on demand so the PDF libraries never weigh on the editor pages.
      const [{ buildProjectPdf }, { loadFontData, loadLogo, loadBrandMark }] = await Promise.all([
        import('@/lib/pdfExport/build'),
        import('@/lib/pdfExport/assets'),
      ])
      // The team's look (Settings → Exports). A font or logo that cannot be loaded never blocks the export.
      const style = data.teamStyle
      const [fonts, logo, brandMark] = await Promise.all([
        loadFontData(style.font),
        style.showLogo && data.logoPath ? loadLogo(supabase, data.logoPath) : Promise.resolve(null),
        loadBrandMark(),
      ])
      const doc = buildProjectPdf(data, { sections, roomIds, style, fonts, logo, brandMark, t: tp, locale })
      doc.save(`venuria-${safeFilePart(data.projectTitle)}-${data.eventDate ?? 'plan'}.pdf`)
    } catch (e) {
      console.error('PDF export failed', e)
      setError(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-gray-100 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('title')}</h2>
      <div className="space-y-2">
        {SECTION_KEYS.map((key) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={sections[key]}
              onChange={(e) => setSections({ ...sections, [key]: e.target.checked })}
            />
            <span>
              <span className="text-gray-900">{sectionText[key].label}</span>
              <span className="block text-xs text-gray-400">{sectionText[key].hint}</span>
            </span>
          </label>
        ))}
      </div>

      {needsRooms && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">{t('rooms')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.rooms.map((r) => (
              <label key={r.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={roomIds.includes(r.id)}
                  onChange={(e) => setRoomIds(e.target.checked ? [...roomIds, r.id] : roomIds.filter((id) => id !== r.id))}
                />
                {r.name}
              </label>
            ))}
          </div>
          {roomIds.length === 0 && <p className="mt-1 text-xs text-amber-700">{t('tickRoom')}</p>}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={!canExport}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? t('creating') : t('download')}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {t('note')}
      </p>
    </section>
  )
}
