// Convert centimetres to canvas pixels
export function cmToPixels(cm: number, scale: number): number {
  return cm * scale
}

// Convert canvas pixels to centimetres
export function pixelsToCm(pixels: number, scale: number): number {
  return pixels / scale
}

// Snap a pixel value to the nearest grid line
export function snapToGrid(pixels: number, gridSizePx: number): number {
  return Math.round(pixels / gridSizePx) * gridSizePx
}

// Generate a simple unique id for layout objects
export function generateId(): string {
  return `obj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}