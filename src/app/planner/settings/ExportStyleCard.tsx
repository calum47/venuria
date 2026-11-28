'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { supabase } from '@/lib/supabase/client'
import {
  BASE_SIZE_RANGE,
  DEFAULT_PDF_STYLE,
  PDF_FONTS,
  TITLE_SIZE_RANGE,
  normalizePdfStyle,
  type LogoPosition,
  type LogoSize,
  type PdfSpacing,
  type PdfStyle,
} from '@/lib/pdfExport/style'
import { LOGO_BUCKET, loadBrandMark, loadFontData, loadLogo, prepareLogoFile } from '@/lib/pdfExport/assets'
import type { PdfExportData, PdfLogo } from '@/lib/pdfExport/types'
import { loadPreviewData, saveExportStyle, saveTeamLogo } from './actions'

type PreviewProject = { id: string; title: string }

type Props = {
  teamId: string
  initialStyle: PdfStyle
  initialLogoPath: string | null
  projects: PreviewProject[]
}

const ACCENT_SWATCHES = ['#282828', '#8b4a6b', '#1f4e79', '#2f6b4f', '#9a6a1f', '#a33a3a']


export default function ExportStyleCard({ teamId, initialStyle, initialLogoPath, projects }: Props) {
  const t = useTranslations('ExportStyle')
  const tp = useTranslations('Pdf')
  const locale = useLocale() as Locale
  const POSITIONS: { value: LogoPosition; label: string }[] = [
    { value: 'bottom-left', label: t('posLeft') },
    { value: 'bottom-center', label: t('posCenter') },
  ]
  const SIZES: { value: LogoSize; label: string }[] = [
    { value: 'small', label: t('sizeSmall') },
    { value: 'medium', label: t('sizeMedium') },
    { value: 'large', label: t('sizeLarge') },
  ]
  const SPACINGS: { value: PdfSpacing; label: string }[] = [
    { value: 'compact', label: t('spacingCompact') },
    { value: 'normal', label: t('spacingNormal') },
    { value: 'roomy', label: t('spacingRoomy') },
  ]
  const [saved, setSaved] = useState<PdfStyle>(initialStyle)
  const [style, setStyle] = useState<PdfStyle>(initialStyle)
  const [logoPath, setLogoPath] = useState<string | null>(initialLogoPath)
  const [loadedLogo, setLoadedLogo] = useState<PdfLogo | null>(null)
  const [brandMark, setBrandMark] = useState<PdfLogo | null>(null)
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '')
  const [data, setData] = useState<PdfExportData | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const logo = logoPath ? loadedLogo : null // a removed logo disappears at once; a new one shows when loaded
  const dirty = useMemo(() => JSON.stringify(style) !== JSON.stringify(saved), [style, saved])
  const patch = (p: Partial<PdfStyle>) => {
    setMessage(null)
    setStyle((s) => normalizePdfStyle({ ...s, ...p }))
  }

  // The real project behind the preview.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    loadPreviewData(projectId)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setDataError(d ? null : t('loadProjectFailed'))
      })
      .catch(() => !cancelled && setDataError(t('loadProjectFailed')))
    return () => {
      cancelled = true
    }
  }, [projectId, t])

  // The logo image (re-read whenever a new file is uploaded).
  useEffect(() => {
    if (!logoPath) return
    let cancelled = false
    loadLogo(supabase, logoPath).then((l) => !cancelled && setLoadedLogo(l))
    return () => {
      cancelled = true
    }
  }, [logoPath])

  // The Venuria mark that every export carries.
  useEffect(() => {
    let cancelled = false
    loadBrandMark().then((b) => !cancelled && setBrandMark(b))
    return () => {
      cancelled = true
    }
  }, [])

  // Re-render the preview a moment after the last change.
  useEffect(() => {
    if (!data) return
    let cancelled = false
    let url: string | null = null
    const timer = setTimeout(async () => {
      setRendering(true)
      try {
        const [{ buildProjectPdf }, fonts] = await Promise.all([import('@/lib/pdfExport/build'), loadFontData(style.font)])
        if (cancelled) return
        const doc = buildProjectPdf(data, {
          sections: { plans: true, tableViews: true, items: true, seating: true, guests: true },
          roomIds: data.rooms.map((r) => r.id),
          style,
          fonts,
          logo,
          brandMark,
          t: tp,
          locale,
        })
        url = URL.createObjectURL(doc.output('blob'))
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old)
          return url
        })
        setPreviewError(null)
      } catch (e) {
        console.error('Preview failed', e)
        if (!cancelled) setPreviewError(t('previewFailed'))
      } finally {
        if (!cancelled) setRendering(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [data, style, logo, brandMark, t, tp, locale])

  function save() {
    setMessage(null)
    startSaving(async () => {
      const r = await saveExportStyle(style)
      if (r.error) setMessage({ kind: 'error', text: r.error })
      else {
        setSaved(style)
        setMessage({ kind: 'ok', text: t('saved') })
      }
    })
  }

  async function onLogoFile(file: File | undefined) {
    if (!file) return
    setMessage(null)
    setLogoBusy(true)
    let uploaded: string | null = null
    try {
      const { blob, ext } = await prepareLogoFile(file, tp)
      const path = `${teamId}/logo-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(LOGO_BUCKET).upload(path, blob, {
        contentType: blob.type,
        upsert: false,
      })
      if (upErr) throw new Error(upErr.message)
      uploaded = path
      const r = await saveTeamLogo(path)
      if (r.error) throw new Error(r.error)
      setLogoPath(path)
      setMessage({ kind: 'ok', text: t('logoSaved') })
    } catch (e) {
      if (uploaded) await supabase.storage.from(LOGO_BUCKET).remove([uploaded])
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : t('logoUploadFailed') })
    } finally {
      setLogoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeLogo() {
    setMessage(null)
    setLogoBusy(true)
    const r = await saveTeamLogo(null)
    setLogoBusy(false)
    if (r.error) setMessage({ kind: 'error', text: r.error })
    else {
      setLogoPath(null)
      setMessage({ kind: 'ok', text: t('logoRemoved') })
    }
  }

  const label = 'block text-xs font-medium text-gray-500 mb-1'
  const radio = (name: string, value: string, current: string, text: string, onPick: () => void) => (
    <label key={value} className="flex items-center gap-1.5 text-sm text-gray-700">
      <input type="radio" name={name} checked={current === value} onChange={onPick} />
      {text}
    </label>
  )

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{t('title')}</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {t('intro')}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* Controls */}
        <div className="space-y-4">
          <div>
            <label className={label}>{t('font')}</label>
            <select
              value={style.font}
              onChange={(e) => patch({ font: e.target.value as PdfStyle['font'] })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {(['Sans', 'Serif'] as const).map((kind) => (
                <optgroup key={kind} label={kind === 'Sans' ? t('kindSans') : t('kindSerif')}>
                  {PDF_FONTS.filter((f) => f.kind === kind).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.key === 'helvetica' ? t('fontHelvetica') : f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{t('titleSize', { size: style.titleSize })}</label>
              <input
                type="range"
                min={TITLE_SIZE_RANGE.min}
                max={TITLE_SIZE_RANGE.max}
                step={1}
                value={style.titleSize}
                onChange={(e) => patch({ titleSize: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <label className={label}>{t('textSize', { size: style.baseSize })}</label>
              <input
                type="range"
                min={BASE_SIZE_RANGE.min}
                max={BASE_SIZE_RANGE.max}
                step={0.5}
                value={style.baseSize}
                onChange={(e) => patch({ baseSize: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label className={label}>{t('accent')}</label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => patch({ accent: c })}
                  aria-label={t('useColour', { colour: c })}
                  className={`h-6 w-6 rounded-full border ${style.accent === c ? 'ring-2 ring-offset-1 ring-gray-900' : 'border-gray-200'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={style.accent}
                onChange={(e) => patch({ accent: e.target.value })}
                aria-label={t('customAccent')}
                className="h-7 w-9 cursor-pointer rounded border border-gray-200 p-0.5"
              />
              <span className="font-mono text-xs text-gray-500">{style.accent}</span>
            </div>
          </div>

          <div>
            <label className={label}>{t('spacing')}</label>
            <div className="flex gap-4">{SPACINGS.map((o) => radio('spacing', o.value, style.spacing, o.label, () => patch({ spacing: o.value })))}</div>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-500">{t('logo')}</span>
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="checkbox" checked={style.showLogo} onChange={(e) => patch({ showLogo: e.target.checked })} />
                {t('showEveryPage')}
              </label>
            </div>
            <div className="flex items-center gap-3">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.dataUrl} alt={t('teamLogo')} className="h-10 max-w-[140px] rounded border border-gray-200 bg-white object-contain p-1" />
              ) : (
                <span className="text-xs text-gray-400">{logoPath ? t('loadingLogo') : t('noLogo')}</span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => onLogoFile(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={logoBusy}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 disabled:opacity-50"
              >
                {logoBusy ? t('working') : logoPath ? t('replace') : t('uploadLogo')}
              </button>
              {logoPath && (
                <button type="button" disabled={logoBusy} onClick={removeLogo} className="text-xs text-red-600 disabled:opacity-50">
                  {t('remove')}
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">{t('formats')}</p>
            <div>
              <label className={label}>{t('position')}</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {POSITIONS.map((o) => radio('logoPos', o.value, style.logoPosition, o.label, () => patch({ logoPosition: o.value })))}
              </div>
            </div>
            <div>
              <label className={label}>{t('size')}</label>
              <div className="flex gap-4">{SIZES.map((o) => radio('logoSize', o.value, style.logoSize, o.label, () => patch({ logoSize: o.value })))}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || isSaving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {isSaving ? t('saving') : t('saveLook')}
            </button>
            <button
              type="button"
              onClick={() => patch({ ...DEFAULT_PDF_STYLE })}
              className="text-xs text-gray-500 underline-offset-2 hover:underline"
            >
              {t('reset')}
            </button>
            {dirty && !isSaving && <span className="text-xs text-amber-700">{t('unsaved')}</span>}
          </div>
          {message && <p className={`text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
        </div>

        {/* Live preview */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">{t('previewFrom')}</span>
            {projects.length > 0 ? (
              <select
                value={projectId}
                onChange={(e) => {
                  setData(null)
                  setPreviewUrl(null)
                  setProjectId(e.target.value)
                }}
                className="max-w-[220px] rounded-lg border border-gray-200 px-2 py-1 text-xs"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-gray-400">{t('noProjects')}</span>
            )}
            {rendering && <span className="text-xs text-gray-400">{t('updating')}</span>}
          </div>
          <div className="h-[560px] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {projects.length === 0 ? (
              <p className="p-6 text-sm text-gray-400">{t('createFirst')}</p>
            ) : dataError || previewError ? (
              <p className="p-6 text-sm text-red-600">{dataError ?? previewError}</p>
            ) : previewUrl ? (
              <iframe key={previewUrl} src={`${previewUrl}#toolbar=0&navpanes=0`} title={t('previewTitle')} className="h-full w-full" />
            ) : (
              <p className="p-6 text-sm text-gray-400">{t('loadingPreview')}</p>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            {t('previewNote')}
          </p>
        </div>
      </div>
    </section>
  )
}
