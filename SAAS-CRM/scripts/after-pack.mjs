import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: true,
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${path.basename(command)} exited with code ${code}`))
    })
  })
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const projectDir = context.packager.projectDir
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(projectDir, 'public', 'favicon.ico')
  const rceditPath = path.join(projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')

  await access(exePath)
  await access(iconPath)
  await access(rceditPath)

  await runCommand(rceditPath, [exePath, '--set-icon', iconPath])
}
