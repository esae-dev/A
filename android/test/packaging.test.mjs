import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { assetLinks, fingerprint } from '../scripts/assetlinks.mjs'

const read = path => readFile(new URL(path, import.meta.url))
const config = JSON.parse(await read('../twa-manifest.json'))

test('TWA uses the exact existing origin, start URL, scope and PWA identity', async () => {
  const web = JSON.parse(await read('../../dist/manifest.webmanifest'))
  assert.equal(config.packageId, 'com.esaedev.aeha')
  assert.equal(`https://${config.host}${config.startUrl}`, 'https://esae-dev.github.io/A/')
  assert.equal(config.fullScopeUrl, 'https://esae-dev.github.io/A/')
  assert.equal(config.name, web.name)
  assert.equal(web.id, '/A/')
  assert.equal(config.startUrl, web.start_url)
  assert.equal(config.fallbackType, 'customtabs')
  assert.equal(config.orientation, web.orientation ?? 'default')
  assert.equal(config.enableNotifications, false)
  assert.equal(config.enableSiteSettingsShortcut, false)
})

test('generated Android project targets API 36 and the library-compatible minimum 24', async () => {
  const gradle = (await read('../project/app/build.gradle')).toString()
  const manifest = (await read('../project/app/src/main/AndroidManifest.xml')).toString()
  const statements = (await read('../project/app/src/main/res/values/strings.xml')).toString()
  assert.match(gradle, /applicationId "com\.esaedev\.aeha"/)
  assert.match(gradle, /compileSdkVersion 36/)
  assert.match(gradle, /targetSdkVersion 36/)
  assert.match(gradle, /minSdkVersion 24/)
  assert.match(gradle, /buildToolsVersion '36\.0\.0'/)
  assert.ok(gradle.includes(`versionCode ${config.appVersionCode}`))
  assert.ok(gradle.includes(`versionName "${config.appVersion}"`))
  assert.match(gradle, /fallbackType: 'customtabs'/)
  assert.match(manifest, /android:pathPrefix="\/A\/"/)
  assert.match(statements, /https:\/\/esae-dev\.github\.io/)
  assert.doesNotMatch(manifest + statements + gradle, /127\.0\.0\.1|localhost/)
})

test('launcher images have generated density sizes and Play icon uses the unchanged square PWA asset', async () => {
  const store = await read('../project/store_icon.png')
  assert.deepEqual(store, await read('../../public/icon-maskable-512.png'))
  for (const [path, size] of [
    ['../project/store_icon.png', 512],
    ['../project/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192],
    ['../project/app/src/main/res/mipmap-xxxhdpi/ic_maskable.png', 328],
    ['../project/app/src/main/res/drawable-xxxhdpi/splash.png', 1200],
  ]) {
    const png = await read(path)
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
})

test('private signing material is absent from config and signing is explicitly opt-in', async () => {
  assert.deepEqual(config.fingerprints, [])
  assert.match(config.signingKey.path, /USER_MANAGED_OUTSIDE_REPOSITORY/)
  const signing = (await read('../signing.gradle')).toString()
  assert.match(signing, /aehaSignRelease/)
  assert.match(signing, /Missing local signing environment variables/)
  assert.match(signing, /System\.getenv/)
  assert.doesNotMatch(signing, /keytool|genkey|debug\.keystore/)
})

test('DAL refuses missing Play certificates and placeholder or malformed fingerprints', () => {
  for (const value of ['REPLACE_WITH_PLAY_APP_SIGNING_CERTIFICATE_SHA256', '00:00', '0'.repeat(64), 'F'.repeat(64)]) {
    assert.throws(() => fingerprint(value))
  }
  assert.throws(() => assetLinks([]))
})

test('DAL preserves the package and supports separate Play and sideload APK certificates', () => {
  // Test identifiers only; no certificate/private key is generated or deployed.
  const play = createHash('sha256').update('PLAY_TEST_ONLY').digest('hex')
  const apk = createHash('sha256').update('SIDELOAD_TEST_ONLY').digest('hex')
  const links = assetLinks([play, play], [apk])
  assert.equal(links[0].target.package_name, 'com.esaedev.aeha')
  assert.equal(links[0].target.namespace, 'android_app')
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [fingerprint(play), fingerprint(apk)])
  assert.equal(links[0].target.sha256_cert_fingerprints.length, 2)
})
