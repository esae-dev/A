const luminance = (channels: number[]) => channels.map(value => {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)

/** Keep checks readable on both the new light palette and stored legacy colors. */
export function contrastInk(color: string) {
  const channels = color.slice(1).match(/.{2}/g)?.map(value => parseInt(value, 16))
  if (!channels || channels.length !== 3 || channels.some(Number.isNaN)) return '#182336'
  const background = luminance(channels)
  const navy = luminance([24, 35, 54])
  const navyContrast = (Math.max(background, navy) + 0.05) / (Math.min(background, navy) + 0.05)
  const whiteContrast = 1.05 / (background + 0.05)
  return navyContrast >= whiteContrast ? '#182336' : '#ffffff'
}
