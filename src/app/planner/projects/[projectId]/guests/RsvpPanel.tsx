'use client'

import { useState } from 'react'
import type { DbGuest, DbProjectRsvp, DbRsvpHotel, DbRsvpPhoto } from '@/types/db'
import { regenerateRsvpToken, saveRsvpSettings } from '@/lib/supabase/rsvpQueries'
import { madridToday, rsvpPath, rsvpSummary } from '@/lib/rsvp'
import RsvpContentEditor from './RsvpContentEditor'

const input = 'rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900'
const btn = 'rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
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
  /** Signed URLs (path → URL) for the page's saved images. */
  initialUrls: Record<string, string>
}

/**
 * The project's RSVP link: on/off, deadline, welcome text, plus-ones, and the
 * running counts. One link per project; anyone holding it can answer, so a
 * guest's FIRST answer is the only one the link accepts (changes are made here).
 */
export default function RsvpPanel({ projectId, origin, initial, guests, teamId, initialPhotos, initialHotels, initialUrls }: Props) {
  const [cfg, setCfg] = useState<DbProjectRsvp | null>(initial)
  const [open, setOpen] = useState(!!initial?.enabled)
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [welcome, setWelcome] = useState(initial?.welcome_message ?? '')
  const [plusOne, setPlusOne] = useState(initial?.allow_plus_one ?? true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)

  const sum = rsvpSummary(guests)
  const dirty =
    enabled !== (cfg?.enabled ?? false) ||
    (deadline || null) !== (cfg?.deadline ?? null) ||
    (welcome.trim() || null) !== (cfg?.welcome_message ?? null) ||
    plusOne !== (cfg?.allow_plus_one ?? true)
  const url = cfg ? `${origin}${rsvpPath(cfg.token)}` : ''
  const deadlinePassed = !!cfg?.deadline && madridToday() > cfg.deadline

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    run('save', async () => {
      const saved = await saveRsvpSettings(projectId, { enabled, deadline: deadline || null, welcome_message: welcome, allow_plus_one: plusOne })
      setCfg(saved)
    })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy. Select the link and copy it by hand.')
    }
  }

  const newLink = () =>
    run('token', async () => {
      setCfg(await regenerateRsvpToken(projectId))
      setConfirmNew(false)
    })

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span>
          <span className="text-sm font-medium text-gray-900">Guest RSVP link</span>
          <span className="ml-2 text-xs text-gray-500">
            {cfg?.enabled ? (deadlinePassed ? 'Deadline passed' : 'Open') : 'Off'} · {sum.attending} attending · {sum.declined} declined · {sum.maybe} maybe · {sum.pending} pending
            {sum.needsReview > 0 ? ` · ${sum.needsReview} to review` : ''}
          </span>
        </span>
        <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            {([
              ['Attending', sum.attending],
              ['Declined', sum.declined],
              ['Maybe', sum.maybe],
              ['Pending', sum.pending],
              ['Dietary (coming)', sum.dietaryAmongComing],
            ] as const).map(([label, n]) => (
              <div key={label} className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                <p className="text-lg font-semibold text-gray-900">{n}</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Accept answers through the link
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              Answer by (last day)
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={input + ' mt-1 block'} />
            </label>
            <label className="flex items-end gap-2 pb-1 text-sm text-gray-900">
              <input type="checkbox" checked={plusOne} onChange={(e) => setPlusOne(e.target.checked)} />
              Guests may add a plus-one
            </label>
          </div>

          <label className="block text-xs text-gray-600">
            Welcome text shown on the page (names of the couple, a short note…)
            <textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={500} rows={3} className={input + ' mt-1 block w-full'} />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={!dirty || busy !== null} className={btnPrimary}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
            {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          </div>

          {cfg && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-600">Share this one link with every guest. It is secret: anyone who has it can answer.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={input + ' min-w-0 flex-1 font-mono text-xs'} aria-label="RSVP link" />
                <button type="button" onClick={copy} className={btn}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
              {!cfg.enabled && <p className="text-xs text-amber-700">The link is saved but switched off: guests who open it see “RSVP is closed”.</p>}
              {!confirmNew ? (
                <button type="button" onClick={() => setConfirmNew(true)} className="text-xs text-gray-500 underline hover:text-gray-900">Create a new link…</button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <span>The current link stops working at once. Answers already given are kept.</span>
                  <button type="button" onClick={newLink} disabled={busy !== null} className={btn}>{busy === 'token' ? 'Creating…' : 'Create new link'}</button>
                  <button type="button" onClick={() => setConfirmNew(false)} className={btn}>Cancel</button>
                </div>
              )}
              <p className="text-xs text-gray-500">
                A guest types their name and is matched against this list. Names not on the list, and plus-ones, are added and marked “To review”.
                The link only takes a guest&rsquo;s first answer; change an answer in the guest&rsquo;s details.
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
            initialUrls={initialUrls}
          />
        </div>
      )}
    </section>
  )
}
