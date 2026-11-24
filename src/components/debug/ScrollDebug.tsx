'use client'

import { useEffect, useState } from 'react'

/**
 * TEMPORARY diagnostic for the "page can't scroll back to the top on iPad" bug.
 * Renders nothing unless the URL contains ?scrolldebug=1, then shows live scroll
 * and viewport numbers in a small box so they can be screenshotted when stuck.
 * Remove once the cause is found.
 */
export default function ScrollDebug() {
  const [on, setOn] = useState(false)
  const [info, setInfo] = useState('')

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get('scrolldebug') === '1')
  }, [])

  useEffect(() => {
    if (!on) return
    const read = () => {
      const de = document.documentElement
      const vv = window.visualViewport
      const se = document.scrollingElement
      setInfo(
        [
          `scrollY ${Math.round(window.scrollY)}`,
          `docEl.scrollTop ${Math.round(de.scrollTop)}`,
          `body.scrollTop ${Math.round(document.body.scrollTop)}`,
          `scrollingEl ${se ? se.tagName : 'none'}`,
          `scrollH ${de.scrollHeight}  clientH ${de.clientHeight}`,
          `innerH ${window.innerHeight}  innerW ${window.innerWidth}`,
          `scrollW ${de.scrollWidth}  clientW ${de.clientWidth}`,
          vv ? `vv offTop ${Math.round(vv.offsetTop)}  offLeft ${Math.round(vv.offsetLeft)}  scale ${vv.scale.toFixed(2)}  h ${Math.round(vv.height)}` : 'no visualViewport',
          `html.offsetH ${de.offsetHeight}  body.offsetH ${document.body.offsetHeight}`,
        ].join('\n'),
      )
    }
    read()
    window.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', read)
    window.visualViewport?.addEventListener('scroll', read)
    window.visualViewport?.addEventListener('resize', read)
    const t = window.setInterval(read, 500)
    return () => {
      window.removeEventListener('scroll', read)
      window.removeEventListener('resize', read)
      window.visualViewport?.removeEventListener('scroll', read)
      window.visualViewport?.removeEventListener('resize', read)
      window.clearInterval(t)
    }
  }, [on])

  if (!on) return null
  return (
    <pre
      style={{
        position: 'fixed', left: 8, bottom: 8, zIndex: 99999, margin: 0, padding: 8,
        background: 'rgba(0,0,0,0.8)', color: '#0f0', fontSize: 12, lineHeight: 1.3,
        borderRadius: 6, pointerEvents: 'none', whiteSpace: 'pre',
      }}
    >
      {info}
    </pre>
  )
}
