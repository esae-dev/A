import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const signed = process.argv.includes('--signed')
const { appVersion } = JSON.parse(await readFile(new URL('../twa-manifest.json', import.meta.url), 'utf8'))
const project = fileURLToPath(new URL('../project/', import.meta.url))
const args = ['--no-daemon', '--console=plain', `-PaehaSignRelease=${signed}`, 'assembleRelease', 'bundleRelease']
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', args, {
  cwd: project, stdio: 'inherit', shell: process.platform === 'win32',
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url))
await mkdir(artifacts, { recursive: true })
await copyFile(`${project}app/build/outputs/apk/release/app-release${signed ? '' : '-unsigned'}.apk`, `${artifacts}aeha-${appVersion}${signed ? '-signed' : '-unsigned'}.apk`)
await copyFile(`${project}app/build/outputs/bundle/release/app-release.aab`, `${artifacts}aeha-${appVersion}${signed ? '-upload-signed' : '-unsigned'}.aab`)
console.log(signed ? 'Upload-signed artifacts created; Play-distributed signing and DAL still need verification.' : 'UNSIGNED artifacts created. Not installable/uploadable until signed by the owner.')
