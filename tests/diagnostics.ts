import { expect, test, type Page } from '@playwright/test';

// Do not log or attach uploaded document contents. Capture only application
// errors, displayed status messages and browser diagnostics.
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(`Uncaught JS: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`Browser console: ${message.text()}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const details = await getDiagnostics(page);
  const errors = browserErrors.get(page) || [];
  await testInfo.attach('paprify-diagnostics.txt', {
    body: Buffer.from(`${details}\n\nBrowser errors:\n${errors.join('\n') || 'none'}`),
    contentType: 'text/plain',
  });
});

async function getDiagnostics(page: Page): Promise<string> {
  if (page.isClosed()) return 'Browser page already closed';
  return page.evaluate(() => {
    const elements = (selector: string) => Array.from(document.querySelectorAll(selector))
      .map(element => element.textContent?.trim() || '')
      .filter(Boolean)
      .slice(0, 5);
    return JSON.stringify({
      url: location.href,
      errors: elements('[role="alert"], [role="status"], .toast-message, .page-error'),
      loaders: elements('.global-loading'),
      editorName: elements('.document-name'),
      pageShells: document.querySelectorAll('.page-shell').length,
      heading: elements('h1'),
    }, null, 2);
  }).catch(error => `Could not collect page diagnostics: ${String(error)}`);
}

export async function expectDocumentReady(page: Page, filename: string): Promise<void> {
  try {
    // PDF.js chunks load on demand; allow for cold-start Macs without hiding
    // failures. If opening actually fails, the sticky error is reported below.
    await expect(page.locator('.document-name')).toHaveText(filename, { timeout: 30_000 });
    await expect(page.locator('.page-shell').first()).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    throw new Error(`PDF editor did not open ${filename}.\n${await getDiagnostics(page)}\n${String(error)}`);
  }
}
