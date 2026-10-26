// Vector reconstruction of the supplied final AEHA board, using its horizontal
// lockup. These three contours are shared by every logo and installation icon.
// Keep their spacing and proportions; the reference's slogan is not part of UI.
const contours = [
  'M531 152C516 184 483 214 444 240C394 273 351 298 326 344C311 372 306 404 304 436C319 393 343 358 377 332C408 309 441 296 471 274C514 244 530 207 531 152Z',
  'M508 268C487 291 458 307 428 321C381 345 349 376 328 414C355 384 384 369 416 357C462 340 497 312 508 268Z',
  'M479 365C446 371 412 376 379 393C339 413 309 452 289 496C320 463 351 446 389 430C434 412 464 397 479 365Z',
]

const colors = {
  light: [
    ['#0b1933', '#253f6a', '#7e819d', '#e6a798', '#f4a18b'],
    ['#1a3154', '#6b7b9a', '#b4adbd'],
    ['#07172f', '#2a426a', '#6f809c'],
  ],
  dark: [
    ['#cdd6e4', '#f4f7fb', '#ffffff', '#f3c1b1', '#ef9d87'],
    ['#a8b5c9', '#f0f3f8', '#ffffff'],
    ['#f5f7fb', '#c5cedc', '#6b7990'],
  ],
}

function gradients(theme) {
  const stops = colors[theme]
  const gradient = (id, attributes, palette) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ${attributes}>${palette.map((color, i) => `<stop offset="${i / (palette.length - 1)}" stop-color="${color}"/>`).join('')}</linearGradient>`
  return `<defs>${gradient('upper', 'x1="310" y1="424" x2="529" y2="158"', stops[0])}${gradient('middle', 'x1="330" y1="414" x2="510" y2="273"', stops[1])}${gradient('lower', 'x1="294" y1="488" x2="480" y2="364"', stops[2])}</defs>`
}

function symbol(theme, transform = '', mono = false) {
  return `${mono ? '' : gradients(theme)}<g${transform ? ` transform="${transform}"` : ''}>${contours.map((d, i) => `<path d="${d}" fill="${mono ? 'currentColor' : `url(#${['upper', 'middle', 'lower'][i]})`}"/>`).join('')}</g>`
}

// Open A forms, thin E/H strokes and wide spacing follow the supplied wordmark.
const wordmark = 'M160 126L184 80L208 126M260 80H292M260 80V126H292M260 103H286M352 80V126M352 103H384M384 80V126M448 126L472 80L496 126'
const svg = (viewBox, content, attributes = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${attributes}>${content}</svg>\n`

export function logoSvg(theme, mono = false) {
  const color = theme === 'dark' ? '#f4f6fb' : '#14213b'
  return svg('0 0 510 180', `${symbol(theme, 'translate(-140 -70) scale(.5)', mono)}<path d="${wordmark}" fill="none" stroke="${mono ? 'currentColor' : color}" stroke-width="4" stroke-linecap="butt" stroke-linejoin="miter"/>`, `color="${color}"`)
}

export function symbolSvg(theme, mono = false) {
  return svg('280 140 260 365', symbol(theme, '', mono), `color="${theme === 'dark' ? '#f4f6fb' : '#14213b'}"`)
}

export function appIconSvg(maskable = false) {
  // All three original tips fit in the maskable 80% safe circle, without cropping.
  return svg('0 0 512 512', `<defs><linearGradient id="background" x2=".85" y2="1"><stop stop-color="#293750"/><stop offset="1" stop-color="#101c30"/></linearGradient></defs><rect width="512" height="512" rx="${maskable ? 0 : 108}" fill="url(#background)"/>${maskable ? '' : '<rect x="1.5" y="1.5" width="509" height="509" rx="106.5" fill="none" stroke="#4c607d" stroke-opacity=".45" stroke-width="3"/>'}${symbol('dark', 'translate(-137.6 -55.04) scale(.96)')}`)
}
