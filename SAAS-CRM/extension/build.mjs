import { build } from 'esbuild'
import { mkdir, rm, copyFile, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, 'dist')

async function copyStaticFiles() {
  const extensionFiles = ['manifest.json', 'sidepanel.html', 'offscreen.html', 'sidepanel.css', 'icon.svg']
  const imageFiles = ['nodalpoint.png', 'nodalpoint-webicon.png']
  const iconSizes = [16, 32, 48, 128]

  await Promise.all(
    extensionFiles.map(async (file) => {
      await copyFile(path.join(__dirname, file), path.join(distDir, file))
    })
  )

  const publicImagesDir = path.resolve(__dirname, '..', 'public', 'images')
  await Promise.all(
    imageFiles.map(async (file) => {
      await copyFile(path.join(publicImagesDir, file), path.join(distDir, file))
    })
  )

  // Generate properly-sized icons for the Chrome toolbar
  try {
    const { default: sharp } = await import('sharp')
    const srcIcon = path.join(publicImagesDir, 'nodalpoint-webicon.png')
    await Promise.all(
      iconSizes.map((size) =>
        sharp(srcIcon)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(path.join(distDir, `icon${size}.png`))
      )
    )
  } catch {
    console.warn('[build] sharp not available — skipping sized icon generation')
  }
}

async function main() {
  await rm(distDir, { recursive: true, force: true })
  await mkdir(distDir, { recursive: true })

  await build({
    entryPoints: {
      background: path.join(__dirname, 'src/background.ts'),
      content: path.join(__dirname, 'src/content.ts'),
      offscreen: path.join(__dirname, 'src/offscreen.ts'),
      sidepanel: path.join(__dirname, 'src/sidepanel/index.tsx'),
    },
    outdir: distDir,
    bundle: true,
    platform: 'browser',
    target: ['chrome120'],
    format: 'iife',
    sourcemap: true,
    minify: false,
    logLevel: 'info',
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })

  await copyStaticFiles()
  console.log(`Extension build complete: ${distDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
