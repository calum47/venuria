'use client'

import { useState } from 'react'
import { LANGS, LANG_NAME, TEXT, fill, type Lang } from '@/lib/rsvpText'
import type { RsvpStatus } from '@/lib/rsvp'
import { lookupGuest, submitRsvp, type LookupResult, type SubmitResult } from './actions'

type Props = {
  token: string
  initialLang: Lang
  welcome: string | null
  deadline: string | null
  allowPlusOne: boolean
  venueName: string | null
  eventDate: string | null
}

type Step = 'name' | 'confirm' | 'answers' | 'done'

const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none'
const primary = 'w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50'
const secondary = 'w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50'

function longDate(iso: string, lang: Lang): string {
  // en-GB, not plain 'en' (US order), for guests of an event in Spain.
  const locale = lang === 'en' ? 'en-GB' : lang === 'fr' ? 'fr-FR' : 'es-ES'
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function RsvpForm({ token, initialLang, welcome, deadline, allowPlusOne, venueName, eventDate }: Props) {
  const [lang, setLang] = useState<Lang>(initialLang)
  const t = TEXT[lang]

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
  const header = (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{t.invited}</h1>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <span className="sr-only">{t.language}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700" aria-label={t.language}>
            {LANGS.map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}
          </select>
        </label>
      </div>
      {(venueName || eventDate) && (
        <p className="text-sm text-gray-500">{[venueName, eventDate ? longDate(eventDate, lang) : null].filter(Boolean).join(' · ')}</p>
      )}
      <p className="whitespace-pre-line pt-1 text-sm text-gray-700">{welcome?.trim() ? welcome : t.intro}</p>
      {deadline && <p className="text-xs text-gray-500">{fill(t.deadline, { date: longDate(deadline, lang) })}</p>}
    </div>
  )

  if (closed) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-gray-900">{t.closedTitle}</h1>
        <p className="text-sm text-gray-500">{t.closedBody}</p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="space-y-3">
        {header}
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800" role="status">
          {status === 'declined' ? t.thanksDeclined : status === 'maybe' ? t.thanksMaybe : t.thanksAttending}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {header}

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
          <p className="rounded-md bg-gray-50 px-3 py-3 text-base font-medium text-gray-900">{matchedName}</p>
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
              <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${status === s ? 'border-gray-900 bg-gray-50' : 'border-gray-300'}`}>
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
}
