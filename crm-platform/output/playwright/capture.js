const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1900 },
    deviceScaleFactor: 2,
  });
  const filePath = path.resolve(__dirname, 'ercot-live-pulse.html').replace(/\\/g, '/');
  await page.goto('file:///' + filePath);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const el = page.locator('.artboard');
  await el.screenshot({ path: path.resolve(__dirname, 'ercot-live-pulse.png'), type: 'png' });
  console.log('Screenshot saved to output/playwright/ercot-live-pulse.png');
  await browser.close();
})();
