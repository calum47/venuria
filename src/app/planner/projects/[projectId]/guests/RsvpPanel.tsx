'use client'

import { LANGS, LANG_NAME, type Lang } from '@/lib/rsvpText'
import { moveSection, normalizeSectionOrder, type RsvpSectionKey } from '@/lib/rsvpSections'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DbGuest, DbProjectRsvp, DbRsvpEvent, DbRsvpHotel, DbRsvpPhoto } from '@/types/db'
import { regenerateRsvpToken, saveRsvpSettings, translateRsvpText } from '@/lib/supabase/rsvpQueries'
import { madridToday, rsvpPath, rsvpSummary } from '@/lib/rsvp'
import RsvpContentEditor from './RsvpContentEditor'

const input = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900'
const btn = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50'

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : fallback
}

type Props = {
  projectId: string
  /** Site origin (https://host), worked out on the server so the link is the real public one. */
  origin: string
  initial: DbProjectRsvp | null
  guests: DbGuest[]
  teamId: string
  initialPhotos: DbRsvpPhoto[]
  initialHotels: DbRsvpHotel[]
  initialEvents: DbRsvpEvent[]
  eventDate: string | null
  /** Signed URLs (path → URL) for the page's saved images. */
  initialUrls: Record<string, string>
  /** Whether the team has a contact email for guests' data requests (Settings). */
  hasContactEmail: boolean
}

/**
 * The project's RSVP link: on/off, deadline, welcome text, plus-ones, and the
 * running counts. One link per project; anyone holding it can answer, so a
 * guest's FIRST answer is the only one the link accepts (changes are made here).
 */
export default function RsvpPanel({ projectId, origin, initial, guests, teamId, initialPhotos, initialHotels, initialEvents, eventDate, initialUrls, hasContactEmail }: Props) {
  const t = useTranslations('Rsvp')
  const tg = useTranslations('Guests')
  const [cfg, setCfg] = useState<DbProjectRsvp | null>(initial)
  const [open, setOpen] = useState(!!initial?.enabled)
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [welcome, setWelcome] = useState(initial?.welcome_message ?? '')
  const [plusOne, setPlusOne] = useState(initial?.allow_plus_one ?? true)
  const [defaultLang, setDefaultLang] = useState<Lang>(initial?.default_lang ?? 'en')
  const [order, setOrder] = useState<RsvpSectionKey[]>(normalizeSectionOrder(initial?.section_order))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)

  const sum = rsvpSummary(guests)
  const dirty =
    enabled !== (cfg?.enabled ?? false) ||
    (deadline || null) !== (cfg?.deadline ?? null) ||
    (welcome.trim() || null) !== (cfg?.welcome_message ?? null) ||
    plusOne !== (cfg?.allow_plus_one ?? true) ||
    defaultLang !== (cfg?.default_lang ?? 'en') ||
    order.join() !== normalizeSectionOrder(cfg?.section_order).join()
  const url = cfg ? `${origin}${rsvpPath(cfg.token)}` : ''
  const deadlinePassed = !!cfg?.deadline && madridToday() > cfg.deadline

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e, tg('somethingWrong')))
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    run('save', async () => {
      const saved = await saveRsvpSettings(projectId, { enabled, deadline: deadline || null, welcome_message: welcome, allow_plus_one: plusOne, default_lang: defaultLang, section_order: order })
      setCfg(saved)
      const tr = await translateRsvpText(projectId)
      if (tr !== 'ok') setError(tr === 'not_configured' ? t('translateNotConfigured') : t('translateFailed'))
    })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t('couldNotCopy'))
    }
  }

  const newLink = () =>
    run('token', async () => {
      setCfg(await regenerateRsvpToken(projectId))
      setConfirmNew(false)
    })

  return (
    <section data-tour="rsvp-panel" className="rounded-lg border border-gray-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span>
          <span className="text-sm font-medium text-gray-900">{t('linkTitle')}</span>
          <span className="ml-2 text-xs text-gray-500">
            {cfg?.enabled ? (deadlinePassed ? t('deadlinePassed') : t('open')) : t('off')}{t('summary', { attending: sum.attending, declined: sum.declined, maybe: sum.maybe, pending: sum.pending })}
            {sum.needsReview > 0 ? t('toReviewCount', { count: sum.needsReview }) : ''}
          </span>
        </span>
        <span className="text-xs text-gray-400">{open ? t('hide') : t('show')}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            {([
              [t('statAttending'), sum.attending],
              [t('statDeclined'), sum.declined],
              [t('statMaybe'), sum.maybe],
              [t('statPending'), sum.pending],
              [t('statDietary'), sum.dietaryAmongComing],
            ] as const).map(([label, n]) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-2">
                <p className="text-lg font-semibold text-gray-900">{n}</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {!hasContactEmail && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('noContactEmail')}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('acceptAnswers')}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              {t('answerBy')}
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={input + ' mt-1 block'} />
            </label>
            <label className="flex items-end gap-2 pb-1 text-sm text-gray-900">
              <input type="checkbox" checked={plusOne} onChange={(e) => setPlusOne(e.target.checked)} />
              {t('allowPlusOne')}
            </label>
          </div>

          <label className="block text-xs text-gray-600">
            {t('welcomeNote')}
            <textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={500} rows={3} className={input + ' mt-1 block w-full'} />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              {t('pageLanguage')}
              <select value={defaultLang} onChange={(e) => setDefaultLang(e.target.value as Lang)} className={input + ' mt-1 block'}>
                {LANGS.map((l) => (
                  <option key={l} value={l}>{LANG_NAME[l]}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-gray-500">{t('canSwitchLanguage')}</span>
            </label>
            <div className="text-xs text-gray-600">
              {t('sectionOrder')}
              <ol className="mt-1 space-y-1">
                {order.map((k, i) => (
                  <li key={k} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900">
                    <span className="flex-1">{tg(`section_${k}`)}</span>
                    <button type="button" aria-label={t('moveUp', { name: tg(`section_${k}`) })} disabled={i === 0} onClick={() => setOrder(moveSection(order, k, -1))} className="px-1.5 text-gray-500 hover:text-gray-900 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={t('moveDown', { name: tg(`section_${k}`) })} disabled={i === order.length - 1} onClick={() => setOrder(moveSection(order, k, 1))} className="px-1.5 text-gray-500 hover:text-gray-900 disabled:opacity-30">↓</button>
                  </li>
                ))}
              </ol>
              <span className="mt-1 block text-[11px] text-gray-500">{t('coverStaysOnTop')}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={!dirty || busy !== null} className={btnPrimary}>{busy === 'save' ? t('saving') : t('save')}</button>
            {dirty && <span className="text-xs text-amber-700">{t('unsaved')}</span>}
          </div>

          {cfg && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-600">{t('oneLink')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={input + ' min-w-0 flex-1 font-mono text-xs'} aria-label={t('linkAria')} />
                <button type="button" onClick={copy} className={btn}>{copied ? t('copied') : t('copy')}</button>
              </div>
              {!cfg.enabled && <p className="text-xs text-amber-700">{t('linkIsOff')}</p>}
              {!confirmNew ? (
                <button type="button" onClick={() => setConfirmNew(true)} className="text-xs text-gray-500 underline hover:text-gray-900">{t('createNewLinkDots')}</button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <span>{t('newLinkWarning')}</span>
                  <button type="button" onClick={newLink} disabled={busy !== null} className={btn}>{busy === 'token' ? t('creating') : t('createNewLink')}</button>
                  <button type="button" onClick={() => setConfirmNew(false)} className={btn}>{t('cancel')}</button>
                </div>
              )}
              <p className="text-xs text-gray-500">
                {t('matchHelp')}
              </p>
            </div>
          )}

          <RsvpContentEditor
            projectId={projectId}
            teamId={teamId}
            origin={origin}
            cfg={cfg}
            onCfg={setCfg}
            initialPhotos={initialPhotos}
            initialHotels={initialHotels}
            initialEvents={initialEvents}
            eventDate={eventDate}
            initialUrls={initialUrls}
          />
        </div>
      )}
    </section>
  )
}
