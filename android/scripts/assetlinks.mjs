import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function fingerprint(value) {
  const compact = value.replace(/[\s:]/g, '').toUpperCase()
  if (!/^[A-F0-9]{64}$/.test(compact) || /^(0{64}|F{64})$/.test(compact)) {
    throw new Error('Supply the real public SHA-256 certificate fingerprint, not a placeholder.')
  }
  return compact.match(/.{2}/g).join(':')
}
export function assetLinks(playCertificates, apkCertificates = []) {
  if (!playCertificates.length) throw new Error('At least one Play APP SIGNING certificate is required.')
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app', package_name: 'com.esaedev.aeha',
      sha256_cert_fingerprints: [...new Set([...playCertificates, ...apkCertificates].map(fingerprint))],
    },
  }]
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const play = [], apk = []
  for (let i = 2; i < process.argv.length; i += 2) {
    const flag = process.argv[i], value = process.argv[i + 1]
    if (!value || !['--play-sha256', '--apk-sha256'].includes(flag)) {
      throw new Error('Usage: npm run assetlinks -- --play-sha256 REAL_PLAY_SHA256 [--apk-sha256 LOCAL_APK_SHA256]')
    }
    ;(flag === '--play-sha256' ? play : apk).push(value)
  }
  const json = assetLinks(play, apk)
  const output = new URL('../artifacts/assetlinks-site/', import.meta.url)
  await mkdir(new URL('.well-known/', output), { recursive: true })
  await writeFile(new URL('.well-known/assetlinks.json', output), JSON.stringify(json, null, 2) + '\n')
  await writeFile(new URL('.nojekyll', output), '')
  console.log('Prepared assetlinks-site for OWNER REVIEW, not deployed or remotely verified.')
}
