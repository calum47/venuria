'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { PlannerRole } from '@/lib/supabase/plannerContext'
import { START_TOUR_EVENT, TOUR_STEPS, type TourCtx, type TourStep } from '@/lib/tour/steps'

/** user_metadata key: 'done' or 'skipped'. Stored on the account so it follows the planner across devices. */
const STATE_KEY = 'planner_tour'

type Run = { steps: TourStep[]; ctx: TourCtx; index: number }
type Box = { top: number; left: number; width: number; height: number }

const findTarget = (name: string) => document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
const isShown = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/**
 * Guided tour for planners. Mounted once in the root layout so it survives navigation between pages.
 *
 * - Offers itself once, on /planner, to a planner who has never answered (stored in user_metadata).
 * - Started again from Settings via the START_TOUR_EVENT window event.
 * - Each step belongs to a route; the tour navigates there, waits for the spotlight target to render
 *   and skips the step if it never appears (e.g. the catalogue on a view-only project).
 * - Steps are filtered by the planner's team role and by whether they have a project to open.
 */
export default function TourGuide() {
  const pathname = usePathname()
  const router = useRouter()
  const [offer, setOffer] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [ready, setReady] = useState(false)
  const [box, setBox] = useState<Box | null>(null)
  const offerChecked = useRef(false)
  const direction = useRef(1)

  const step = run ? run.steps[run.index] : null

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
    const { data: project } = await supabase.from('projects').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle()
    const ctx: TourCtx = { role: planner.role as PlannerRole, projectId: project?.id ?? null }
    const steps = TOUR_STEPS.filter((s) => (!s.roles || s.roles.includes(ctx.role)) && s.path(ctx) !== null)
    if (steps.length === 0) return
    direction.current = 1
    setOffer(false)
    setBox(null)
    setReady(false)
    setRun({ steps, ctx, index: 0 })
  }, [])

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

  // Drive the current step: go to its page, wait for its target, otherwise skip it.
  useEffect(() => {
    if (!run || !step) return
    const route = step.path(run.ctx)
    if (route && pathname !== route) { router.push(route); return }

    let cancelled = false
    let timer = 0
    const began = Date.now()
    const tick = () => {
      if (cancelled) return
      if (!step.target) { setReady(true); return }
      const el = findTarget(step.target)
      if (el && isShown(el)) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        setReady(true)
        return
      }
      if (Date.now() - began > 6000) {
        if (step.centerIfMissing) setReady(true)
        else goRef.current(direction.current)
        return
      }
      timer = window.setTimeout(tick, 150)
    }
    timer = window.setTimeout(tick, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [run, step, pathname, router])

  // Keep the spotlight on its target while the page scrolls or resizes.
  useEffect(() => {
    if (!ready || !step?.target) return
    const name = step.target
    let raf = 0
    const loop = () => {
      const el = findTarget(name)
      if (el) {
        const r = el.getBoundingClientRect()
        setBox((prev) => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height }))
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [ready, step])

  useEffect(() => {
    if (!run) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('skipped')
      else if (e.key === 'ArrowRight') goRef.current(1)
      else if (e.key === 'ArrowLeft') goRef.current(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run, finish])

  if (offer && !run) {
    return (
      <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl" role="dialog" aria-label="Take the tour">
        <p className="text-sm font-semibold text-gray-900">New to Venuria?</p>
        <p className="mt-1 text-sm text-gray-600">Take a short guided tour of the main pages. You can replay it any time from Settings.</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={() => finish('skipped')} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">No thanks</button>
          <button type="button" onClick={() => { start().catch(() => {}) }} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">Start the tour</button>
        </div>
      </div>
    )
  }

  if (!run || !step || !ready) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const mobile = vw < 640
  const W = Math.min(360, vw - 24)
  const pad = 6
  let cardStyle: React.CSSProperties
  if (mobile || !box) {
    cardStyle = mobile
      ? { left: 12, right: 12, bottom: 12 }
      : { left: Math.max(12, vw / 2 - W / 2), top: Math.max(12, vh / 2 - 100), width: W }
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

  return (
    <>
      {/* Blocks clicks on the page while the tour is open. */}
      <div className="fixed inset-0 z-[70]" aria-hidden="true" />
      {box ? (
        <div
          className="pointer-events-none fixed z-[70] rounded-xl transition-all duration-150"
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: '0 0 0 100vmax rgba(15, 23, 42, 0.55)' }}
          aria-hidden="true"
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-[70] bg-slate-900/55" aria-hidden="true" />
      )}
      <div className="fixed z-[71] rounded-xl bg-white p-4 shadow-2xl" style={cardStyle} role="dialog" aria-live="polite" aria-label={step.title}>
        <p className="text-[11px] uppercase tracking-wide text-gray-400">Step {run.index + 1} of {run.steps.length}</p>
        <h3 className="mt-1 text-base font-semibold text-gray-900">{step.title}</h3>
        <p className="mt-1 text-sm text-gray-600">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => finish('skipped')} className="rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100">Skip tour</button>
          <div className="ml-auto flex items-center gap-2">
            {run.index > 0 && (
              <button type="button" onClick={() => go(-1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Back</button>
            )}
            <button type="button" onClick={() => go(1)} autoFocus className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">{last ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
