import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { TwaManifest, TwaGenerator, ConsoleLog, fetchUtils } = require('@bubblewrap/core')
const androidRoot = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = new URL('../../', import.meta.url)
const web = JSON.parse(await readFile(new URL('dist/manifest.webmanifest', sourceRoot), 'utf8'))
const config = JSON.parse(await readFile(new URL('../twa-manifest.json', import.meta.url), 'utf8'))
if (web.name !== 'AEHA' || web.id !== '/A/' || web.start_url !== '/A/' || web.scope !== '/A/') {
  throw new Error('Build the unchanged AEHA PWA with base /A/ before generating Android.')
}
// Use Bubblewrap's official generator with the checked-out PWA assets. This
// doesn't fetch a possibly stale deployment, bypass verification, or create keys.
const assets = new Map([
  [config.webManifestUrl, ['dist/manifest.webmanifest', 'application/manifest+json']],
  [config.iconUrl, ['public/icon-512.png', 'image/png']],
  [config.maskableIconUrl, ['public/icon-maskable-512.png', 'image/png']],
])
fetchUtils.fetch = async url => {
  const asset = assets.get(String(url))
  if (!asset) throw new Error(`Unexpected generator asset: ${url}`)
  return new Response(await readFile(new URL(asset[0], sourceRoot)), { headers: { 'content-type': asset[1] } })
}
const manifest = TwaManifest.fromWebManifestJson(new URL(config.webManifestUrl), web)
Object.assign(manifest, new TwaManifest(config))
const project = `${androidRoot}project`
await mkdir(project, { recursive: true })
await new TwaGenerator().createTwaProject(project, manifest, new ConsoleLog('AEHA'))
// Play applies its own icon mask. Reuse the existing opaque square brand asset.
await copyFile(new URL('public/icon-maskable-512.png', sourceRoot), `${project}/store_icon.png`)
const adaptiveIcon = `${project}/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
await writeFile(adaptiveIcon, (await readFile(adaptiveIcon, 'utf8')).replace('@android:color/white', '@color/backgroundColor'))
// jcenter is retired; these standard dependencies are in Maven Central/Google.
const rootGradle = `${project}/build.gradle`
await writeFile(rootGradle, (await readFile(rootGradle, 'utf8')).replaceAll('jcenter()', 'mavenCentral()'))
const appGradle = `${project}/app/build.gradle`
await writeFile(appGradle, (await readFile(appGradle, 'utf8')).replace('compileSdkVersion 36', "compileSdkVersion 36\n    buildToolsVersion '36.0.0'") + "\n// Local, explicitly opted-in upload signing.\napply from: rootProject.file('../signing.gradle')\n")
// Normalize generated template whitespace, leaving binaries and Windows CRLF alone.
async function cleanTemplates(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['build', '.gradle'].includes(entry.name)) continue
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) await cleanTemplates(path)
    else if (/\.(gradle|java|xml|properties)$/.test(entry.name)) {
      await writeFile(path, (await readFile(path, 'utf8')).replace(/[\t ]+$/gm, '').trimEnd() + '\n')
    }
  }
}
await cleanTemplates(project)
console.log('Generated com.esaedev.aeha using Bubblewrap 1.27.0; no signing key created.')
