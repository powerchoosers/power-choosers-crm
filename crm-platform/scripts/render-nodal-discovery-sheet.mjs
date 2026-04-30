import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { mkdir } from 'fs/promises'
import puppeteer from 'puppeteer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const htmlPath = path.join(rootDir, 'public', 'briefings', 'nodal-discovery-sheet.html')
const pdfPath = path.join(rootDir, 'public', 'briefings', 'nodal-discovery-sheet.pdf')

async function render() {
  await mkdir(path.dirname(pdfPath), { recursive: true })

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage({
      viewport: {
        width: 816,
        height: 1056,
        deviceScaleFactor: 2,
      },
    })

    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' })
    await page.emulateMediaType('print')
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready
      }
    })

    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.38in',
        right: '0.38in',
        bottom: '0.38in',
        left: '0.38in',
      },
    })

    console.log(`PDF written to ${pdfPath}`)
  } finally {
    await browser.close()
  }
}

render().catch((error) => {
  console.error(error)
  process.exit(1)
})
