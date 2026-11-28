/**
 * Helpers for the RSVP page when it is shown inside an <iframe> on a planner's own website.
 *
 * A page from another domain cannot be measured by the page around it, so the RSVP page tells its
 * host how tall it is (and where to scroll to) with window.postMessage. The host page listens for
 * these messages and checks that they come from venuria.app. Nothing personal is ever sent: only
 * a number. Outside an iframe none of this does anything.
 *
 * Messages (all from the RSVP page to its parent):
 *   { type: 'venuria-rsvp-height', height }   the page's content height in px
 *   { type: 'venuria-rsvp-scroll', top }      scroll the host so this y offset (px, inside the frame) is in view
 * And one the other way (optional): { type: 'venuria-rsvp-ping' } makes the page send its height again.
 */

export const EMBED_HEIGHT_MESSAGE = 'venuria-rsvp-height'
export const EMBED_SCROLL_MESSAGE = 'venuria-rsvp-scroll'
export const EMBED_PING_MESSAGE = 'venuria-rsvp-ping'

/** True when this page is running inside an iframe. Reading window.top can throw in some browsers, which also means "framed". */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** Ask the host page to scroll to `el` (the form), e.g. when the guest moves to the next step. No-op outside an iframe. */
export function notifyEmbedScroll(el: HTMLElement | null): void {
  if (!isEmbedded()) return
  const top = el ? Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)) : 0
  window.parent.postMessage({ type: EMBED_SCROLL_MESSAGE, top }, '*')
}
