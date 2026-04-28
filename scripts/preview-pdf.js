const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function previewPDF() {
  const browser = await chromium.launch({
    headless: true
  });
  
  const page = await browser.newPage({
    viewport: { width: 816, height: 1056 } // 8.5" x 11" at 96 DPI
  });
  
  const htmlPath = path.resolve(__dirname, '..', 'public', 'briefings', 'high-confidence-signals-complete.html');
  const fileUrl = `file://${htmlPath}`;
  
  await page.goto(fileUrl, {
    waitUntil: 'networkidle'
  });
  
  // Get the full page height
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  const pageHeight = 1056; // 11" at 96 DPI
  const estimatedPages = Math.ceil(bodyHeight / pageHeight);
  
  console.log(`Estimated ${estimatedPages} pages based on content height\n`);
  
  const outputDir = path.resolve(__dirname, '..', 'output', 'pdf-preview');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Take a full-page screenshot
  const fullScreenshotPath = path.join(outputDir, 'full-document.png');
  await page.screenshot({
    path: fullScreenshotPath,
    fullPage: true,
    type: 'png'
  });
  
  console.log(`✓ Captured full document: full-document.png`);
  
  // Take screenshots of first 3 "pages" worth of content
  for (let i = 0; i < Math.min(3, estimatedPages); i++) {
    const screenshotPath = path.join(outputDir, `page-${i + 1}-preview.png`);
    
    await page.screenshot({
      path: screenshotPath,
      type: 'png',
      clip: {
        x: 0,
        y: i * pageHeight,
        width: 816, // 8.5" at 96 DPI
        height: pageHeight
      }
    });
    
    console.log(`✓ Captured page ${i + 1} preview: page-${i + 1}-preview.png`);
  }
  
  console.log(`\nDocument Analysis:`);
  console.log(`- Body height: ${bodyHeight}px`);
  console.log(`- Estimated pages: ${estimatedPages}`);
  console.log(`- Page height: ${pageHeight}px`)
  
  await browser.close();
  
  console.log(`\n✓ Preview complete! Check: crm-platform/output/pdf-preview/`);
}

previewPDF().catch(console.error);
