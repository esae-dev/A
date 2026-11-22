import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const signed = process.argv.includes('--signed')
const project = fileURLToPath(new URL('../project/', import.meta.url))
const args = ['--no-daemon', '--console=plain', `-PaehaSignRelease=${signed}`, 'assembleRelease', 'bundleRelease']
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', args, {
  cwd: project, stdio: 'inherit', shell: process.platform === 'win32',
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url))
const apkDir = join(project, 'app/build/outputs/apk/release')
const { elements: [apk] } = JSON.parse(await readFile(join(apkDir, 'output-metadata.json'), 'utf8'))
const name = `aeha-${apk.versionName}`
await mkdir(artifacts, { recursive: true })
await copyFile(join(apkDir, apk.outputFile), join(artifacts, `${name}-${signed ? 'signed' : 'unsigned'}.apk`))
const bundle = join(artifacts, `${name}-${signed ? 'upload-signed' : 'unsigned'}.aab`)
await copyFile(join(project, 'app/build/outputs/bundle/release/app-release.aab'), bundle)
console.log(`${signed ? 'Upload-signed' : 'Unsigned'} release bundle: ${bundle}`)
