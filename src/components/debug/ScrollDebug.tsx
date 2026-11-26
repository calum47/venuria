'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * TEMPORARY diagnostic for the "page can't scroll back to the top on iPad" bug.
 * Renders nothing unless the URL contains ?scrolldebug=1, then shows live scroll
 * and viewport numbers in a small box so they can be screenshotted when stuck.
 * Remove once the cause is found.
 */

function describe(el: EventTarget | null): string {
  if (!(el instanceof Element)) return String(el)
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('.')
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`.slice(0, 44)
}

/** Nearest ancestors that can scroll on their own (other than the page itself). */
function scrollParents(el: EventTarget | null): string {
  if (!(el instanceof Element)) return '-'
  const out: string[] = []
  let cur: Element | null = el
  for (let i = 0; cur && i < 15; i++, cur = cur.parentElement) {
    if (cur === document.documentElement || cur === document.body) continue
    const oy = getComputedStyle(cur).overflowY
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) out.push(describe(cur))
  }
  return out.length ? out.join(' > ') : 'none'
}

export default function ScrollDebug() {
  const [on, setOn] = useState(false)
  const [info, setInfo] = useState('')
  const ev = useRef({ last: '-', target: '-', parents: '-', prevented: '-', jump: '-', touches: 0, wheels: 0, pdown: 0 })

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get('scrolldebug') === '1')
  }, [])

  useEffect(() => {
    if (!on) return
    const e = ev.current
    let prevY = window.scrollY

    const read = () => {
      const de = document.documentElement
      const vv = window.visualViewport
      setInfo(
        [
          `scrollY ${Math.round(window.scrollY)}  max ${de.scrollHeight - window.innerHeight}`,
          `scrollH ${de.scrollHeight}  innerH ${window.innerHeight}  vv.offTop ${vv ? Math.round(vv.offsetTop) : '?'}`,
          `last ${e.last}  prevented ${e.prevented}`,
          `target ${e.target}`,
          `scroll-parents ${e.parents}`,
          `counts touch ${e.touches} wheel ${e.wheels} pdown ${e.pdown}`,
          `last jump ${e.jump}`,
        ].join('\n'),
      )
    }

    const onCapture = (ev2: Event) => {
      e.last = ev2.type
      e.target = describe(ev2.target)
      e.parents = scrollParents(ev2.target)
      if (ev2.type === 'wheel') e.wheels++
      else if (ev2.type === 'pointerdown') e.pdown++
      else e.touches++
    }
    const onBubble = (ev2: Event) => {
      e.prevented = ev2.defaultPrevented ? 'YES' : 'no'
      read()
    }
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - prevY) > 80) e.jump = `${Math.round(prevY)} -> ${Math.round(y)}`
      prevY = y
      read()
    }

    const types = ['touchstart', 'touchmove', 'wheel', 'pointerdown']
    types.forEach((t) => {
      window.addEventListener(t, onCapture, { capture: true, passive: true })
      window.addEventListener(t, onBubble, { passive: true })
    })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', read)
    window.visualViewport?.addEventListener('scroll', read)
    read()
    const t = window.setInterval(read, 500)
    return () => {
      types.forEach((tp) => {
        window.removeEventListener(tp, onCapture, { capture: true })
        window.removeEventListener(tp, onBubble)
      })
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', read)
      window.visualViewport?.removeEventListener('scroll', read)
      window.clearInterval(t)
    }
  }, [on])

  if (!on) return null
  return (
    <pre
      style={{
        position: 'fixed', left: 8, bottom: 8, zIndex: 99999, margin: 0, padding: 8,
        background: 'rgba(0,0,0,0.8)', color: '#0f0', fontSize: 12, lineHeight: 1.3,
        borderRadius: 6, pointerEvents: 'none', whiteSpace: 'pre', maxWidth: '95vw', overflow: 'hidden',
      }}
    >
      {info}
    </pre>
  )
}
