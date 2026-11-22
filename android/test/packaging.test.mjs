import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url))
const android = '../project/app/src/main/'
const manifest = (await read(android + 'AndroidManifest.xml')).toString()
const gradle = (await read('../project/app/build.gradle')).toString()
const launcher = (await read(android + 'java/com/esaedev/aeha/LauncherActivity.java')).toString()
const strings = (await read(android + 'res/values/strings.xml')).toString()

test('Google Play update keeps its application ID, increments the version and targets API 36', () => {
  assert.match(gradle, /applicationId\s+['"]com\.esaedev\.aeha['"]/)
  assert.match(gradle, /versionCode\s+2\b/)
  assert.match(gradle, /versionName\s+['"]1\.0\.1['"]/)
  assert.match(gradle, /targetSdk(?:Version)?\s+36\b/)
  assert.match(gradle, /minSdk(?:Version)?\s+24\b/)
})

test('launcher opens AEHA inside the app with a persistent WebView profile', () => {
  assert.match(manifest, /android\.intent\.category\.LAUNCHER/)
  assert.match(manifest, /android\.permission\.INTERNET/)
  assert.match(manifest, /android:usesCleartextTraffic="false"/)
  assert.doesNotMatch(manifest + gradle + launcher, /androidbrowserhelper|TrustedWebActivity|CustomTabsIntent|startActivity\s*\(/i)
  assert.match(launcher + strings, /https:\/\/esae-dev\.github\.io\/A\//)
  assert.match(launcher, /new WebView\(/)
  assert.match(launcher, /setJavaScriptEnabled\(true\)/)
  assert.match(launcher, /setDomStorageEnabled\(true\)/)
  assert.doesNotMatch(launcher, /deleteAllData\(|deleteDatabase\(|clearCache\(|removeAllCookies\(/)
})

test('launcher icon and Play Store image retain their existing Android assets', async () => {
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/)
  assert.deepEqual(await read('../project/store_icon.png'), await read('../../public/icon-maskable-512.png'))
  for (const [name, size] of [['ic_launcher', 192], ['ic_maskable', 328]]) {
    const png = await read(android + `res/mipmap-xxxhdpi/${name}.png`)
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
})

test('upload signing requires explicit opt-in and owner-supplied credentials', async () => {
  const signing = (await read('../signing.gradle')).toString()
  assert.match(gradle, /apply from: rootProject\.file\(['"]\.\.\/signing\.gradle['"]\)/)
  assert.match(signing, /aehaSignRelease/)
  assert.match(signing, /Missing local signing environment variables/)
  assert.match(signing, /System\.getenv/)
  assert.doesNotMatch(signing, /keytool|genkey|debug\.keystore/)
})
