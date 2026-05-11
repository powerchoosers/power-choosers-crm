import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PDFDocument } from 'pdf-lib'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const htmlPath = path.join(rootDir, 'reports', 'zip-delivery-fixed-zone-agreement.html')
const screenshotPath = path.join(rootDir, 'output', 'playwright', 'zip-delivery-fixed-zone-agreement.png')
const pdfPath = path.join(rootDir, 'reports', 'zip-delivery-fixed-zone-agreement.pdf')

await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
await fs.mkdir(path.dirname(pdfPath), { recursive: true })

const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1600 },
    deviceScaleFactor: 2,
  })

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
  await page.locator('.sheet').scrollIntoViewIfNeeded()
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0)
  )

  const screenshot = await page.locator('.sheet').screenshot({ type: 'png' })
  await fs.writeFile(screenshotPath, screenshot)

  const pdfDoc = await PDFDocument.create()
  const pdfPage = pdfDoc.addPage([612, 792])
  const embedded = await pdfDoc.embedPng(screenshot)
  pdfPage.drawImage(embedded, {
    x: 0,
    y: 0,
    width: 612,
    height: 792,
  })

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false })
  await fs.writeFile(pdfPath, pdfBytes)

  console.log(`Screenshot written to ${screenshotPath}`)
  console.log(`PDF written to ${pdfPath}`)
} finally {
  await browser.close()
}
