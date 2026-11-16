/**
 * Browser-only: turn whatever the planner picked into a small JPEG.
 *
 * Why not upload the original? Phone photos are 3–12 MB; an avatar needs a few
 * hundred px. Re-drawing onto a canvas also drops all metadata (EXIF, which
 * can carry GPS coordinates of where the photo was taken) — worth doing for
 * photos of identifiable people. The file's real type is checked from its
 * bytes, not its name or the browser-claimed MIME type.
 */
import { MAX_PHOTO_BYTES, MAX_SOURCE_PHOTO_BYTES, PHOTO_MAX_EDGE, fitWithin, sniffImage } from '@/lib/guests'

export async function prepareGuestPhoto(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_PHOTO_BYTES) throw new Error('That photo is over 20 MB — pick a smaller one.')

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (!sniffImage(head)) throw new Error('Use a JPEG, PNG or WebP photo (iPhone HEIC files are not supported).')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Could not read that image — it may be damaged.')
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('This browser cannot resize images.')
  }
  ctx.fillStyle = '#ffffff' // JPEG has no transparency — a transparent PNG would turn black
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Could not process that image.')
  if (blob.size > MAX_PHOTO_BYTES) throw new Error('The resized photo is still over 5 MB — try another one.')
  return blob
}
