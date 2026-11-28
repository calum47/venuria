'use client'

import { useEffect } from 'react'
import { EMBED_HEIGHT_MESSAGE, EMBED_PING_MESSAGE, isEmbedded } from '@/lib/rsvpEmbed'

/**
 * Renders nothing. When the RSVP page is inside an iframe (a planner's own website), it
 *  1. marks <html data-embedded="true"> so globals.css drops the "full screen height" rules
 *     (inside an iframe 100vh is the iframe's own height, so the page could never shrink), and
 *  2. tells the host page the content height whenever it changes (language switch, step change,
 *     images loading), so the host can size the iframe exactly and no empty box is left below.
 * See src/lib/rsvpEmbed.ts. Outside an iframe it does nothing at all.
 */
export default function EmbedBridge() {
  useEffect(() => {
    if (!isEmbedded()) return
    const root = document.documentElement
    root.dataset.embedded = 'true'

    let last = -1
    let frame = 0
    const send = () => {
      frame = 0
      const height = Math.ceil(root.getBoundingClientRect().height)
      if (height === last) return
      last = height
      window.parent.postMessage({ type: EMBED_HEIGHT_MESSAGE, height }, '*')
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(send)
    }
    // The host asks again once its listener is ready (it may load after this page does).
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return
      const data = e.data as { type?: unknown } | null
      if (data && data.type === EMBED_PING_MESSAGE) {
        last = -1
        schedule()
      }
    }

    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    observer.observe(document.body)
    window.addEventListener('load', schedule)
    window.addEventListener('message', onMessage)
    schedule()

    return () => {
      observer.disconnect()
      window.removeEventListener('load', schedule)
      window.removeEventListener('message', onMessage)
      if (frame) cancelAnimationFrame(frame)
      delete root.dataset.embedded
    }
  }, [])

  return null
}
