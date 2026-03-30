import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const sourcePath = path.join(rootDir, 'public', 'images', 'nodalpoint-webicon.png')
const outputPath = path.join(rootDir, 'public', 'favicon.ico')
const sizes = [16, 32, 48, 64, 128, 256]

function createIconEntry(size, buffer, offset) {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size === 256 ? 0 : size, 0)
  entry.writeUInt8(size === 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(buffer.length, 8)
  entry.writeUInt32LE(offset, 12)
  return entry
}

async function main() {
  const sourceExists = await readFile(sourcePath)
  if (!sourceExists || sourceExists.length === 0) {
    throw new Error(`Source image not found or empty: ${sourcePath}`)
  }

  const images = await Promise.all(
    sizes.map(async (size) => {
      const buffer = await sharp(sourcePath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer()

      return { size, buffer }
    })
  )

  const headerSize = 6 + images.length * 16
  let offset = headerSize
  const entries = images.map(({ size, buffer }) => {
    const entry = createIconEntry(size, buffer, offset)
    offset += buffer.length
    return entry
  })

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const iconBuffer = Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)])
  await writeFile(outputPath, iconBuffer)

  console.log(`Wrote ${outputPath} from ${sourcePath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
