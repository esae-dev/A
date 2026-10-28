import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { appIconSvg, logoSvg, symbolSvg } from './brand-source.mjs'

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
await mkdir(`${publicDir}/brand`, { recursive: true })
for (const theme of ['light', 'dark']) {
  await writeFile(`${publicDir}/brand/logo-${theme}.svg`, logoSvg(theme))
  await writeFile(`${publicDir}/brand/symbol-${theme}.svg`, symbolSvg(theme))
  await writeFile(`${publicDir}/brand/logo-mono-${theme}.svg`, logoSvg(theme, true))
  await writeFile(`${publicDir}/brand/symbol-mono-${theme}.svg`, symbolSvg(theme, true))
}
const icon = appIconSvg()
await writeFile(`${publicDir}/brand/app-icon.svg`, icon)
await writeFile(`${publicDir}/favicon.svg`, icon)

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
})
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  // Render the SVG source, without an image-generation step or a remote font.
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180], ['apple-touch-icon-v2.png', 180], ['favicon-32.png', 32]]) {
    await page.setViewportSize({ width: size, height: size })
    const apple = file.startsWith('apple-touch-icon')
    // Apple applies its own mask. Keep the existing square, borderless vector
    // and explicitly render an opaque PNG backed by navy.
    const source = file === 'icon-maskable-512.png' || apple ? appIconSvg(true) : icon
    await page.setContent(`<style>html,body{margin:0${apple ? ';background:#101c30' : ''}}svg{display:block;width:${size}px;height:${size}px}</style>${source}`)
    await page.screenshot({ path: `${publicDir}/${file}`, omitBackground: !apple })
    const png = await readFile(`${publicDir}/${file}`)
    if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`Invalid dimensions: ${file}`)
  }
} finally {
  await browser.close()
}
console.log('AEHA: theme/monochrome SVG lockups and symbols, favicon, 192/512/maskable/Apple PNGs generated.')
