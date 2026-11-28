'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase/client'
import type { PlannerRole } from '@/lib/supabase/plannerContext'
import { START_TOUR_EVENT, TOUR_STEPS, tourText, type TourCtx, type TourStep } from '@/lib/tour/steps'
import { getOrCreateTourProject } from '@/app/planner/tourActions'
import { useLayoutStore } from '@/stores/layoutStore'

/** user_metadata key: 'done' or 'skipped'. Stored on the account so it follows the planner across devices. */
const STATE_KEY = 'planner_tour'

type Run = { steps: TourStep[]; ctx: TourCtx; index: number }
type Box = { top: number; left: number; width: number; height: number }

const targetsOf = (step: TourStep): string[] => (step.target ? (Array.isArray(step.target) ? step.target : [step.target]) : [])
const findTarget = (name: string) => document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
const isShown = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
/** Smallest box containing every target that is currently on screen. */
function unionBox(names: string[]): Box | null {
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity
  for (const n of names) {
    const el = findTarget(n)
    if (!el || !isShown(el)) continue
    const r = el.getBoundingClientRect()
    top = Math.min(top, r.top); left = Math.min(left, r.left)
    right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom)
  }
  return right === -Infinity ? null : { top, left, width: right - left, height: bottom - top }
}

/**
 * Guided tour for planners. Mounted once in the root layout so it survives navigation between pages.
 *
 * - Offers itself once, on /planner, to a planner who has never answered (stored in user_metadata).
 * - Started again from Settings via the START_TOUR_EVENT window event.
 * - Starting asks the server for the project to walk through: the planner's most recent own project, or,
 *   if they have none, a freshly created practice project (see tourActions.ts).
 * - Each step belongs to a route; the tour navigates there, waits for the spotlight target to render
 *   and skips the step if it never appears (e.g. the catalogue on a view-only project).
 * - Interactive steps (place a table, add a guest) exist only on the practice project. The page stays
 *   clickable during them and the step completes when the thing actually happens. Elsewhere the same
 *   steps just explain, so a real project is never changed by the tour.
 */
export default function TourGuide() {
  const t = useTranslations('Tour')
  const pathname = usePathname()
  const router = useRouter()
  const [offer, setOffer] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [ready, setReady] = useState(false)
  const [box, setBox] = useState<Box | null>(null)
  const [actionDone, setActionDone] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const offerChecked = useRef(false)
  const direction = useRef(1)

  const step = run ? run.steps[run.index] : null
  const interactive = !!(run?.ctx.sample && step?.action)

  const remember = useCallback(async (value: 'done' | 'skipped') => {
    const { error } = await supabase.auth.updateUser({ data: { [STATE_KEY]: value } })
    if (error) console.error('Failed to store tour state:', error)
  }, [])

  const finish = useCallback((value: 'done' | 'skipped') => {
    setRun(null)
    setBox(null)
    setReady(false)
    setOffer(false)
    remember(value).catch(() => {})
  }, [remember])

  const go = useCallback((delta: number) => {
    if (!run) return
    const next = run.index + delta
    if (next < 0) return
    if (next >= run.steps.length) return finish('done')
    direction.current = delta < 0 ? -1 : 1
    setReady(false)
    setBox(null)
    setActionDone(false)
    setRun({ ...run, index: next })
  }, [run, finish])

  // Always-current handle for timers that outlive a render.
  const goRef = useRef(go)
  useEffect(() => { goRef.current = go }, [go])

  const start = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: planner } = await supabase.from('planners').select('role').eq('user_id', user.id).maybeSingle()
    if (!planner) return
    const target = await getOrCreateTourProject()
    // No project and none could be created: the tour still runs, minus the steps that need one.
    const ctx: TourCtx = {
      role: planner.role as PlannerRole,
      projectId: 'projectId' in target ? target.projectId : null,
      sample: 'projectId' in target ? target.sample : false,
    }
    if ('error' in target) {
      console.error('Tour project unavailable:', target.error)
      setNotice(t('notice'))
      window.setTimeout(() => setNotice(null), 6000)
    }
    const steps = TOUR_STEPS.filter((s) =>
      (!s.roles || s.roles.includes(ctx.role)) && (!s.sampleOnly || ctx.sample) && s.path(ctx) !== null)
    if (steps.length === 0) return
    direction.current = 1
    setOffer(false)
    setBox(null)
    setReady(false)
    setActionDone(false)
    setRun({ steps, ctx, index: 0 })
  }, [t])

  // Offer the tour once, on the planner home, to a planner who hasn't answered yet.
  useEffect(() => {
    if (pathname !== '/planner' || offerChecked.current) return
    offerChecked.current = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.user_metadata?.[STATE_KEY]) return
      const { data: planner } = await supabase.from('planners').select('id').eq('user_id', user.id).maybeSingle()
      if (planner) setOffer(true)
    })().catch((err) => console.error('Tour offer check failed:', err))
  }, [pathname])

  // "Replay tutorial" in Settings, and clean-up on sign-out (this component is never unmounted).
  useEffect(() => {
    const onStart = () => { start().catch((err) => console.error('Tour start failed:', err)) }
    window.addEventListener(START_TOUR_EVENT, onStart)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setRun(null); setOffer(false); setBox(null); offerChecked.current = false }
    })
    return () => { window.removeEventListener(START_TOUR_EVENT, onStart); sub.subscription.unsubscribe() }
  }, [start])

  // Drive the current step: go to its page, wait for its target(s), otherwise skip it.
  useEffect(() => {
    if (!run || !step) return
    const route = step.path(run.ctx)
    if (route && pathname !== route) { router.push(route); return }

    const names = targetsOf(step)
    let cancelled = false
    let timer = 0
    const began = Date.now()
    const tick = () => {
      if (cancelled) return
      // The editor asks "seated or standing?" the first time a room is opened. Don't talk over it:
      // wait (without using up the step's time limit) until the planner has answered.
      if (findTarget('room-mode-dialog')) {
        setNotice(t('chooseMode'))
        timer = window.setTimeout(tick, 400)
        return
      }
      setNotice(null)
      if (names.length === 0) { setReady(true); return }
      const found = names.map(findTarget).filter((el): el is HTMLElement => !!el && isShown(el))
      const timedOut = Date.now() - began > 6000
      if (found.length === names.length || (timedOut && found.length > 0)) {
        found[0].scrollIntoView({ block: 'center', inline: 'nearest' })
        setReady(true)
        return
      }
      if (timedOut) {
        if (step.centerIfMissing) setReady(true)
        else goRef.current(direction.current)
        return
      }
      timer = window.setTimeout(tick, 150)
    }
    timer = window.setTimeout(tick, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [run, step, pathname, router, t])

  // Keep the spotlight on its target(s) while the page scrolls or resizes.
  useEffect(() => {
    if (!ready || !step?.target) return
    const names = targetsOf(step)
    let raf = 0
    const loop = () => {
      const b = unionBox(names)
      if (b) setBox((prev) => (prev && prev.top === b.top && prev.left === b.left && prev.width === b.width && prev.height === b.height ? prev : b))
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [ready, step])

  // Interactive step: finish when the planner has actually done the thing.
  useEffect(() => {
    if (!ready || !interactive || actionDone || !step?.action || !run?.ctx.projectId) return
    if (step.action.until === 'object-placed') {
      // Something new on the floor plan. The baseline follows the count down while the room loads,
      // so a stale count from a previously open project can't hide the first real placement.
      let baseline = useLayoutStore.getState().layoutObjects.length
      return useLayoutStore.subscribe((s) => {
        const n = s.layoutObjects.length
        if (n < baseline) baseline = n
        else if (n > baseline) setActionDone(true)
      })
    }
    // guest-added: the project's guest count goes up.
    const projectId = run.ctx.projectId
    let cancelled = false
    let baseline: number | null = null
    const poll = async () => {
      const { count } = await supabase.from('guests').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
      if (cancelled || count === null) return
      if (baseline === null) baseline = count
      else if (count > baseline) setActionDone(true)
    }
    poll().catch(() => {})
    const timer = window.setInterval(() => { poll().catch(() => {}) }, 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [ready, interactive, actionDone, step, run])

  useEffect(() => {
    if (!run) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('skipped')
      else if (e.key === 'ArrowRight' && !(interactive && !actionDone)) goRef.current(1)
      else if (e.key === 'ArrowLeft') goRef.current(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run, finish, interactive, actionDone])

  if (offer && !run) {
    return (
      <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl" role="dialog" aria-label={t('offerAria')}>
        <p className="text-sm font-semibold text-gray-900">{t('offerTitle')}</p>
        <p className="mt-1 text-sm text-gray-600">{t('offerBody')}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={() => finish('skipped')} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">{t('noThanks')}</button>
          <button type="button" onClick={() => { start().catch(() => {}) }} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">{t('start')}</button>
        </div>
      </div>
    )
  }

  if (!run || !step || !ready) {
    return notice ? (
      <div className="fixed bottom-4 right-4 z-40 max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm text-white shadow-lg" role="status">{notice}</div>
    ) : null
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const mobile = vw < 640
  const W = Math.min(360, vw - 24)
  const pad = 6
  let cardStyle: React.CSSProperties
  if (mobile) {
    cardStyle = { left: 12, right: 12, bottom: 12 }
  } else if (interactive) {
    // Stay out of the way of the area the planner is working in.
    cardStyle = { right: 16, bottom: 16, width: W }
  } else if (!box) {
    cardStyle = { left: Math.max(12, vw / 2 - W / 2), top: Math.max(12, vh / 2 - 100), width: W }
  } else if (box.height > vh * 0.5 && box.left + box.width + W + 24 <= vw) {
    cardStyle = { left: box.left + box.width + 12, top: Math.min(Math.max(12, box.top), vh - 240), width: W }
  } else if (vh - (box.top + box.height) >= 230) {
    cardStyle = { left: Math.min(Math.max(12, box.left), vw - W - 12), top: box.top + box.height + pad + 8, width: W }
  } else if (box.top >= 230) {
    cardStyle = { left: Math.min(Math.max(12, box.left), vw - W - 12), bottom: vh - box.top + pad + 8, width: W }
  } else {
    cardStyle = { left: Math.max(12, vw / 2 - W / 2), bottom: 24, width: W }
  }

  const last = run.index === run.steps.length - 1
  const waiting = interactive && !actionDone
  const { title, text } = tourText(t, step, { sample: run.ctx.sample, interactive, actionDone })
  // Interactive steps keep the page clickable and sit under the app's own dialogs (z-50), e.g. the chair-count popup.
  const dimZ = interactive ? 'z-[45]' : 'z-[70]'

  return (
    <>
      {/* Info steps block clicks on the page; interactive steps leave it usable. */}
      {!interactive && <div className="fixed inset-0 z-[70]" aria-hidden="true" />}
      {box ? (
        <div
          className={`pointer-events-none fixed ${dimZ} rounded-xl transition-all duration-150`}
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: `0 0 0 100vmax rgba(15, 23, 42, ${interactive ? 0.4 : 0.55})` }}
          aria-hidden="true"
        />
      ) : (
        <div className={`pointer-events-none fixed inset-0 ${dimZ} bg-slate-900/55`} aria-hidden="true" />
      )}
      <div className="fixed z-[71] rounded-xl bg-white p-4 shadow-2xl" style={cardStyle} role="dialog" aria-live="polite" aria-label={title}>
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{t('stepOf', { n: run.index + 1, total: run.steps.length })}</p>
        <h3 className="mt-1 text-base font-semibold text-gray-900">{title}</h3>
        <p className={`mt-1 text-sm ${interactive && actionDone ? 'text-green-700' : 'text-gray-600'}`}>{text}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => finish('skipped')} className="rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100">{t('skipTour')}</button>
          <div className="ml-auto flex items-center gap-2">
            {run.index > 0 && (
              <button type="button" onClick={() => go(-1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('back')}</button>
            )}
            {waiting && (
              <button type="button" onClick={() => go(1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('skipStep')}</button>
            )}
            <button
              type="button"
              onClick={() => go(1)}
              disabled={waiting}
              autoFocus={!interactive}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {last ? t('finish') : t('next')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
