import type { Locator } from '@playwright/test'

export async function contrastRatio(locator: Locator, background: 'self' | 'fill' | 'card' = 'self') {
  return locator.evaluate((element, mode) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
        const c = value / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    const foreground = luminance(getComputedStyle(element).color)
    const behind = luminance(mode === 'fill' ? getComputedStyle(element, '::before').backgroundColor
      : getComputedStyle(mode === 'card' ? element.closest('.streak-card')! : element).backgroundColor)
    return (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05)
  }, background)
}
