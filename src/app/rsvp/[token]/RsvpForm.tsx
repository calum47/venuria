'use client'

import { Fragment, useState } from 'react'
import { LANGS, LANG_NAME, TEXT, fill, type Lang } from '@/lib/rsvpText'
import type { RsvpStatus } from '@/lib/rsvp'
import type { PublicContent } from '@/lib/rsvpContent'
import type { RsvpSectionKey } from '@/lib/rsvpSections'
import { Rings } from '@/components/brand/Rings'
import RsvpMap, { type MapTexts } from './RsvpMap'
import { lookupGuest, submitRsvp, type LookupResult, type SubmitResult } from './actions'

type Props = {
  token: string
  initialLang: Lang
  /** The welcome note in each language (the planner's own text where there is no translation). */
  welcomes: Record<Lang, string | null>
  coupleNames: string | null
  deadline: string | null
  allowPlusOne: boolean
  venueName: string | null
  eventDate: string | null
  /** The page content in each language, so switching language switches the planner's text too. */
  contents: Record<Lang, PublicContent>
  /** Planner preview: 'live' = guests see the same page, 'off' = guests currently see "closed". */
  preview: 'live' | 'off' | null
  sectionOrder: RsvpSectionKey[]
  controllerName: string | null
  controllerEmail: string | null
}

type Step = 'name' | 'confirm' | 'answers' | 'done'

const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'
const primary = 'w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50'
const secondary = 'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700 hover:bg-gray-50'

/** "THURSDAY · 17 JUNE" for a day-by-day entry, in the guest's language. Upper-casing is done in CSS. */
function dayLabel(iso: string, lang: Lang): string {
  const locale = lang === 'en' ? 'en-GB' : lang === 'fr' ? 'fr-FR' : 'es-ES'
  const d = new Date(`${iso}T12:00:00`)
  return `${d.toLocaleDateString(locale, { weekday: 'long' })} · ${d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`
}

function longDate(iso: string, lang: Lang): string {
  // en-GB, not plain 'en' (US order), for guests of an event in Spain.
  const locale = lang === 'en' ? 'en-GB' : lang === 'fr' ? 'fr-FR' : 'es-ES'
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function RsvpForm({ token, initialLang, welcomes, coupleNames, deadline, allowPlusOne, venueName, eventDate, contents, preview, sectionOrder, controllerName, controllerEmail }: Props) {
  const [lang, setLang] = useState<Lang>(initialLang)
  const [mapSelected, setMapSelected] = useState<string | null>(null)
  const t = TEXT[lang]
  const content = contents[lang]
  const welcome = welcomes[lang]

  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [matchedName, setMatchedName] = useState('')
  const [notOnList, setNotOnList] = useState(false)
  const [status, setStatus] = useState<RsvpStatus | ''>('')
  const [dietary, setDietary] = useState('')
  const [plusOne, setPlusOne] = useState(false)
  const [plusName, setPlusName] = useState('')
  const [plusDietary, setPlusDietary] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)

  const lookupMessage = (r: LookupResult['state']): string | null => {
    switch (r) {
      case 'ambiguous': return t.ambiguous
      case 'answered': return t.answered
      case 'rate_limited': return t.rateLimited
      case 'error': return t.generalError
      default: return null
    }
  }

  const onLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const r = await lookupGuest(token, name)
      if (r.state === 'closed') return setClosed(true)
      if (r.state === 'match') {
        setMatchedName(r.displayName)
        setNotOnList(false)
        return setStep('confirm')
      }
      if (r.state === 'none') {
        setNotOnList(true)
        return setStep('answers')
      }
      setMessage(lookupMessage(r.state))
    } catch {
      setMessage(t.generalError)
    } finally {
      setBusy(false)
    }
  }

  const submitMessage = (r: SubmitResult['result']): string | null => {
    switch (r) {
      case 'already_answered': return t.answered
      case 'plus_one_exists': return t.plusOneExists
      case 'rate_limited': return t.rateLimited
      case 'ambiguous': return t.ambiguous
      case 'invalid':
      case 'error': return t.generalError
      default: return null
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!status || !consent || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const r = await submitRsvp(token, {
        name,
        status,
        dietary,
        plusName: plusOne ? plusName : '',
        plusDietary: plusOne ? plusDietary : '',
        consent,
        website,
      })
      if (r.result === 'ok') return setStep('done')
      if (r.result === 'closed') return setClosed(true)
      if (r.result === 'ambiguous') {
        setStep('name')
        setMessage(t.ambiguous)
        return
      }
      setMessage(submitMessage(r.result))
    } catch {
      setMessage(t.generalError)
    } finally {
      setBusy(false)
    }
  }

  const coming = status === 'attending' || status === 'maybe'
  const title = coupleNames?.trim() || venueName || t.invited
  const subtitle = [coupleNames?.trim() ? venueName : null, eventDate ? longDate(eventDate, lang) : null].filter(Boolean).join(' · ')

  const langPicker = (
    <label className="absolute right-3 top-3 z-10 flex items-center rounded-full bg-white/85 px-2 py-1 text-xs text-gray-700 shadow-sm backdrop-blur">
      <span className="sr-only">{t.language}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="bg-transparent text-xs text-gray-800 focus:outline-none" aria-label={t.language}>
        {LANGS.map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}
      </select>
    </label>
  )

  // Photo-led: the cover fills the top with the names over it. Without a cover
  // the same text sits on a soft blush panel with the rings mark.
  const hero = content.coverUrl ? (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket, not a local asset */}
      <img src={content.coverUrl} alt="" className="h-80 w-full object-cover sm:h-[28rem]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10" />
      {langPicker}
      <div className="absolute inset-x-0 bottom-0 space-y-2 px-6 pb-8 text-center text-white sm:px-10">
        <p className="text-xs uppercase tracking-[0.25em] text-white/85">{t.invited}</p>
        <h1 className="text-5xl font-medium leading-tight sm:text-6xl">{title}</h1>
        {subtitle && <p className="text-sm text-white/90">{subtitle}</p>}
      </div>
    </div>
  ) : (
    <div className="relative bg-gradient-to-b from-brand-100/70 to-white px-6 pb-8 pt-16 text-center sm:px-10">
      {langPicker}
      <Rings className="mx-auto h-6 w-9 text-brand-500" />
      <p className="mt-4 text-xs uppercase tracking-[0.25em] text-brand-700">{t.invited}</p>
      <h1 className="mt-2 text-5xl font-medium leading-tight text-gray-900 sm:text-6xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-gray-600">{subtitle}</p>}
    </div>
  )

  const intro = (
    <div className="space-y-3 text-center">
      <p className="whitespace-pre-line font-serif text-lg leading-relaxed text-gray-700 [font-size-adjust:0.47] [text-wrap:balance] sm:text-xl">{welcome?.trim() ? welcome : t.intro}</p>
      {deadline && <p className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-800">{fill(t.deadline, { date: longDate(deadline, lang) })}</p>}
    </div>
  )

  const details = content.details && (
    <section className="space-y-6">
      {content.details.events.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-center text-3xl font-medium text-gray-900">{t.dayByDayTitle}</h2>
          <div className="mx-auto h-px w-12 bg-brand-300" />
          <ol className="pt-3">
            {content.details.events.map((e) => (
              <li key={e.id} className="grid gap-x-6 gap-y-2 border-t border-gray-200 py-5 text-left first:border-t-0 sm:grid-cols-[9rem_1fr_1fr]">
                <div className="space-y-1">
                  {e.date && <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">{dayLabel(e.date, lang)}</p>}
                  {(e.startsAt || e.endsAt) && (
                    <p className="text-sm text-gray-800">{e.startsAt && e.endsAt ? `${e.startsAt} – ${e.endsAt}` : e.startsAt ? `${t.fromTime} ${e.startsAt}` : `${t.untilTime} ${e.endsAt}`}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-2xl leading-tight text-gray-900">{e.title}</h3>
                  {e.location && <p className="text-sm text-gray-600">{e.location}</p>}
                </div>
                {(e.description || e.tag) && (
                  <div className="space-y-2">
                    {e.description && <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{e.description}</p>}
                    {e.tag && <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{e.tag}</p>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {(content.details.dressCode || content.details.mapUrl) && (
        <div className="space-y-5 rounded-2xl bg-brand-50/60 p-5 text-center">
          {content.details.dressCode && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{t.dressCodeTitle}</h2>
              <p className="whitespace-pre-line text-sm text-gray-800">{content.details.dressCode}</p>
            </div>
          )}
          {content.details.mapUrl && (
            <a href={content.details.mapUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-block rounded-full border border-brand-300 bg-white px-4 py-1.5 text-sm text-brand-800 transition-colors hover:bg-brand-50">
              {t.openMap} ↗
            </a>
          )}
        </div>
      )}
    </section>
  )

  const schedule = content.schedule && (
    <section className="space-y-3 rounded-2xl bg-brand-50/60 p-5 text-center">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{t.weddingDayTitle}</h2>
      <ul className="space-y-1 text-sm text-gray-800">
        {content.schedule.lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </section>
  )

  const area = content.area && (
    <section className="space-y-4 border-t border-gray-100 pt-8">
      <h2 className="text-center text-3xl font-medium text-gray-900">{t.areaTitle}</h2>
      {content.area.text && <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{content.area.text}</p>}
      {content.area.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {content.area.photos.map((p, i) => (
            <figure key={i} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket, not a local asset */}
              <img src={p.url} alt={p.caption ?? ''} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
              {p.caption && <figcaption className="text-xs text-gray-500">{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
    </section>
  )

  const mapTexts: MapTexts = {
    mapHint: t.mapHint,
    venueLabel: t.venueLabel,
    openInGoogleMaps: t.openInGoogleMaps,
    visitWebsite: t.visitWebsite,
    bookingInfo: t.bookingInfo,
    distanceFromVenue: t.distanceFromVenue,
    closeCard: t.closeCard,
  }
  const hotels = (content.hotels.length > 0 || content.map) && (
    <section className="space-y-4 border-t border-gray-100 pt-8">
      <h2 className="text-center text-3xl font-medium text-gray-900">{content.hotels.length > 0 ? t.hotelsTitle : t.mapTitle}</h2>
      {content.map && (
        <div id="rsvp-map" className="scroll-mt-4">
          <RsvpMap
            venue={content.map.venue}
            venueName={venueName}
            venueMapUrl={content.details?.mapUrl ?? null}
            hotels={content.hotels}
            selectedId={mapSelected}
            onSelect={setMapSelected}
            texts={mapTexts}
          />
        </div>
      )}
      <div className="space-y-4">
        {content.hotels.map((h, i) => (
          <div key={h.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {h.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket, not a local asset
              <img src={h.imageUrl} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
            )}
            <div className="space-y-1 p-4">
              <p className="font-serif text-xl font-semibold text-gray-900">
                {content.map && h.position && <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-900 align-middle font-sans text-xs font-semibold">{i + 1}</span>}
                {h.name}
              </p>
              {h.address && <p className="text-xs text-gray-500">{h.address}</p>}
              {h.description && <p className="whitespace-pre-line text-sm text-gray-700">{h.description}</p>}
              {h.bookingNote && <p className="text-sm text-gray-700"><span className="font-medium">{t.bookingInfo}:</span> {h.bookingNote}</p>}
              {content.map && h.position && (
                <button
                  type="button"
                  onClick={() => {
                    setMapSelected(h.id)
                    document.getElementById('rsvp-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                  className="mr-4 inline-block pt-1 text-sm text-brand-700 underline underline-offset-2 hover:text-brand-900"
                >
                  {t.showOnMap}
                </button>
              )}
              {h.url && (
                <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-block pt-1 text-sm text-brand-700 underline underline-offset-2 hover:text-brand-900">
                  {t.visitWebsite} ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  const previewBanner = preview && (
    <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" role="note">
      Planner preview. {preview === 'off' ? 'Guests currently see “RSVP is closed”: switch the link on (and check the last day to answer) to open it.' : 'This is what guests see.'} Answers sent from here are real.
    </p>
  )

  const closedBlock = (
    <div className="space-y-2 text-center">
      <h2 className="text-3xl font-medium text-gray-900">{t.closedTitle}</h2>
      <p className="text-sm text-gray-500">{t.closedBody}</p>
    </div>
  )

  const doneBlock = (
    <p className="rounded-2xl bg-brand-50 px-5 py-6 text-center font-serif text-2xl leading-snug text-brand-900 [font-size-adjust:0.47]" role="status">
      {status === 'declined' ? t.thanksDeclined : status === 'maybe' ? t.thanksMaybe : t.thanksAttending}
    </p>
  )

  const formBlock = closed ? closedBlock : step === 'done' ? doneBlock : (
          <div className="space-y-5">
      {message && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{message}</p>}

      {step === 'name' && (
        <form onSubmit={onLookup} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="rsvp-name" className="block text-sm font-medium text-gray-900">{t.nameLabel}</label>
            <input id="rsvp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={field} />
            <p className="text-xs text-gray-500">{t.nameHelp}</p>
          </div>
          <button type="submit" disabled={busy || !name.trim()} className={primary}>{busy ? t.checking : t.continue}</button>
        </form>
      )}

      {step === 'confirm' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{t.confirmTitle}</p>
          <p className="rounded-xl bg-brand-50 px-4 py-4 text-center font-serif text-2xl font-semibold text-gray-900 [font-size-adjust:0.47]">{matchedName}</p>
          <button type="button" onClick={() => setStep('answers')} className={primary}>{t.yesMe}</button>
          <button type="button" onClick={() => { setStep('name'); setMessage(null) }} className={secondary}>{t.notMe}</button>
        </div>
      )}

      {step === 'answers' && (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm font-medium text-gray-900">{notOnList ? name.trim() : matchedName}</p>
          {notOnList && <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">{t.noMatch}</p>}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-900">{t.attendQ}</legend>
            {(['attending', 'declined', 'maybe'] as const).map((s) => (
              <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${status === s ? 'border-brand-600 bg-brand-50' : 'border-gray-300 bg-white'}`}>
                <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                {t[s]}
              </label>
            ))}
          </fieldset>

          {coming && (
            <div className="space-y-1">
              <label htmlFor="rsvp-diet" className="block text-sm font-medium text-gray-900">{t.dietaryLabel}</label>
              <textarea id="rsvp-diet" value={dietary} onChange={(e) => setDietary(e.target.value)} maxLength={500} rows={2} className={field} />
              <p className="text-xs text-gray-500">{t.dietaryHelp}</p>
            </div>
          )}

          {status === 'attending' && allowPlusOne && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-900">
                <input type="checkbox" checked={plusOne} onChange={(e) => setPlusOne(e.target.checked)} />
                {t.plusOneCheck}
              </label>
              {plusOne && (
                <div className="space-y-2 rounded-md border border-gray-200 p-3">
                  <div className="space-y-1">
                    <label htmlFor="rsvp-plus" className="block text-sm text-gray-900">{t.plusName}</label>
                    <input id="rsvp-plus" value={plusName} onChange={(e) => setPlusName(e.target.value)} maxLength={120} className={field} required />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="rsvp-plus-diet" className="block text-sm text-gray-900">{t.plusDietary}</label>
                    <textarea id="rsvp-plus-diet" value={plusDietary} onChange={(e) => setPlusDietary(e.target.value)} maxLength={500} rows={2} className={field} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Honeypot: invisible to people, tempting to bots. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>

          <div className="space-y-1">
            <label className="flex items-start gap-2 text-sm text-gray-900">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" required />
              <span>{t.consent}</span>
            </label>
            {controllerName && (
              <p className="pl-6 text-xs text-gray-500">
                {controllerEmail ? fill(t.controller, { company: controllerName, email: controllerEmail }) : fill(t.controllerNoEmail, { company: controllerName })}
              </p>
            )}
            {coming && <p className="pl-6 text-xs text-gray-500">{t.privacy}</p>}
          </div>

          <button type="submit" disabled={busy || !status || !consent || (plusOne && !plusName.trim())} className={primary}>
            {busy ? t.sending : t.submit}
          </button>
          <button type="button" onClick={() => { setStep('name'); setMessage(null) }} className={secondary}>{t.back}</button>
        </form>
      )}
          </div>
        )

  const sections: Record<RsvpSectionKey, React.ReactNode> = { details, schedule, form: formBlock, area, hotels }

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-lg">
      {hero}
      <div className="space-y-8 px-5 pb-10 pt-8 sm:px-10">
        {previewBanner}
        {intro}
        {sectionOrder.map((k) => (
          <Fragment key={k}>{sections[k]}</Fragment>
        ))}
      </div>
    </article>
  )
}
