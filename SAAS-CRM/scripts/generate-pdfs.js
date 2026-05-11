const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function generatePDF(htmlFile, outputFile) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  const htmlPath = path.resolve(__dirname, '..', 'public', 'briefings', htmlFile);
  const fileUrl = `file://${htmlPath}`;
  
  await page.goto(fileUrl, {
    waitUntil: 'networkidle0'
  });
  
  const outputPath = path.resolve(__dirname, '..', 'public', 'briefings', outputFile);
  
  await page.pdf({
    path: outputPath,
    format: 'Letter',
    printBackground: true,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  });
  
  await browser.close();
  
  console.log(`✓ Generated: ${outputFile}`);
}

async function main() {
  console.log('Generating PDF from HTML briefing...\n');
  
  await generatePDF('high-confidence-signals-complete.html', 'high-confidence-signals-complete.pdf');
  
  console.log('\n✓ PDF generated successfully!');
  console.log('\nOutput location: crm-platform/public/briefings/high-confidence-signals-complete.pdf');
}

main().catch(console.error);
