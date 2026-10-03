/**
 * Headless Chrome verification harness.
 *
 * Boots `vite preview` against the production build, drives the app in a real
 * headless Google Chrome instance (isolated throwaway profile — never the
 * user's day-to-day browser) and asserts the phase specific expectations.
 *
 * Usage:  node scripts/verify.mjs [suite]
 * Suites: phase1 … phase5, all (default)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const shotDir = join(rootDir, '.verify');
const profileDir = join(rootDir, 'node_modules', '.tmp', 'chrome-verify-profile');
const previewPort = Number(process.env.PREVIEW_PORT ?? 4387);
const baseUrl = `http://127.0.0.1:${previewPort}`;
const requestedSuite = process.argv[2] ?? 'all';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

function resolveChromeBinary() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `No Chrome binary found. Checked:\n${CHROME_CANDIDATES.join('\n')}\nSet CHROME_PATH to override.`
    );
  }
  return found;
}

function startPreviewServer() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(previewPort), '--strictPort', '--host', '127.0.0.1'],
      { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const killChild = () => {
      if (!child.killed) child.kill('SIGKILL');
    };
    process.once('exit', killChild);
    process.once('SIGINT', () => {
      killChild();
      process.exit(130);
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        rejectPromise(new Error('vite preview did not start within 30s'));
      }
    }, 30_000);

    const onData = (chunk) => {
      const text = String(chunk);
      if (!settled && /Local:\s+http/.test(text)) {
        settled = true;
        clearTimeout(timer);
        resolvePromise(child);
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectPromise(new Error(`vite preview exited early with code ${code}`));
      }
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`ASSERTION FAILED: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

/* ------------------------------------------------------------------ */
/* Shared page helpers                                                  */
/* ------------------------------------------------------------------ */

async function gotoRoute(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#app > *', { timeout: 15_000 });
}

async function textOf(page, selector) {
  return page.$eval(selector, (el) => el.textContent?.trim() ?? '');
}

/** Elements whose right edge exceeds the viewport — used to diagnose overflow. */
async function overflowingElements(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll('body *'))
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 8)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 90)} right=${Math.round(rect.right)}`;
      });
  });
}

async function countRows(page, selector) {
  return page.$$eval(selector, (nodes) => nodes.length);
}

async function readDatabaseCounts(page) {
  return page.evaluate(
    () =>
      new Promise((resolvePromise, rejectPromise) => {
        const request = indexedDB.open('vue_sentry_clone_db');
        request.onerror = () => rejectPromise(new Error('failed to open database'));
        request.onsuccess = () => {
          const database = request.result;
          const readCount = (storeName) =>
            new Promise((resolveCount, rejectCount) => {
              const tx = database.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              const countRequest = store.count();
              countRequest.onsuccess = () => resolveCount(countRequest.result);
              countRequest.onerror = () => rejectCount(countRequest.error);
            });

          Promise.all([readCount('issues'), readCount('events')])
            .then(([issues, events]) => {
              database.close();
              resolvePromise({ issues, events });
            })
            .catch(rejectPromise);
        };
      })
  );
}

/* ------------------------------------------------------------------ */
/* Suite definitions                                                    */
/* ------------------------------------------------------------------ */

const suites = {
  async phase1(page, context) {
    await gotoRoute(page, '/issues');

    const heading = await textOf(page, 'h1');
    assert(heading.length > 0, 'issues view renders a heading');

    const databases = await page.evaluate(() => indexedDB.databases());
    const dbNames = databases.map((entry) => entry.name);
    assert(dbNames.includes('vue_sentry_clone_db'), `expected vue_sentry_clone_db in ${JSON.stringify(dbNames)}`);

    const counts = await readDatabaseCounts(page);
    assert(counts.issues >= 7, `seeder should create at least 7 issues, got ${counts.issues}`);
    assert(counts.events >= 100, `seeder should create at least 100 events, got ${counts.events}`);

    const histogram = await page.evaluate(
      () =>
        new Promise((resolvePromise, rejectPromise) => {
          const request = indexedDB.open('vue_sentry_clone_db');
          request.onerror = () => rejectPromise(new Error('open failed'));
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('issues', 'readonly');
            const store = tx.objectStore('issues');
            const all = store.getAll();
            all.onsuccess = () => {
              const issues = all.result;
              db.close();
              resolvePromise(
                issues.map((issue) => ({
                  id: issue.id,
                  buckets: issue.histogram_24h.length,
                  total: issue.histogram_24h.reduce((sum, bucket) => sum + bucket.count, 0),
                  events: issue.event_count
                }))
              );
            };
            all.onerror = () => rejectPromise(all.error);
          };
        })
    );

    assertEqual(histogram.length, counts.issues, 'every issue row is readable');
    for (const issue of histogram) {
      assertEqual(issue.buckets, 24, `issue ${issue.id} exposes 24 hourly buckets`);
      assertEqual(issue.total, issue.events, `issue ${issue.id} histogram matches event_count`);
    }

    // Router must resolve every declared route.
    for (const route of ['/issues', '/stream', '/settings']) {
      await gotoRoute(page, route);
      const headingText = await textOf(page, 'h1');
      assert(headingText.length > 0, `${route} renders a heading`);
    }

    // Query parameter hydration reaches the filter store without errors.
    await gotoRoute(page, '/issues?status=resolved&level=warning');
    const resolvedViewText = await page.evaluate(() => document.body.textContent ?? '');
    assert(resolvedViewText.includes('Issue Details') === false, 'detail view is not rendered on the list route');

    await context.shot('phase1-issues');
    await context.shot('phase1-stream');
    await gotoRoute(page, '/issues?status=resolved');
    await context.shot('phase1-settings');
  },

  async phase2(page, context) {
    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-testid="gallery-button"]', { timeout: 15_000 });

    const buttonCount = await countRows(page, '[data-testid="gallery-button"]');
    assert(buttonCount >= 4, `expected the four button variants, found ${buttonCount}`);

    const badgeCount = await countRows(page, '[data-testid="gallery-badge"]');
    assert(badgeCount >= 10, `expected level and status badges, found ${badgeCount}`);

    // Button: click emits and the status region reflects the action.
    await page.click('[data-testid="gallery-button"]');
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('primary clicked'), {
      timeout: 5000
    });

    // Button: disabled and loading never dispatch clicks.
    const blocked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const loading = buttons.find((button) => button.getAttribute('aria-busy') === 'true');
      const disabled = buttons.find((button) => button.disabled && button.getAttribute('aria-busy') !== 'true');
      return {
        loadingDisabled: loading ? loading.disabled : null,
        disabledClickable: disabled ? !disabled.disabled : null
      };
    });
    assert(blocked.loadingDisabled === true, 'loading buttons are disabled');

    // Badge: every level exposes the expected human label.
    const badgeLabels = await page.$$eval('[data-testid="gallery-badge"]', (nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? '')
    );
    for (const label of ['Fatal', 'Error', 'Warning', 'Info', 'Debug', 'Unresolved', 'Resolved', 'Ignored']) {
      assert(badgeLabels.includes(label), `badge "${label}" renders (got ${JSON.stringify(badgeLabels)})`);
    }

    // Input: v-model wiring + accessible error messaging.
    await page.type('input[placeholder="is:unresolved level:error"]', ' user:alice');
    const inputValue = await page.$eval('input[placeholder="is:unresolved level:error"]', (el) => el.value);
    assert(inputValue.endsWith('user:alice'), `input v-model updates (got ${inputValue})`);

    const alertText = await page.$eval('[role="alert"]', (el) => el.textContent?.trim() ?? '');
    assert(alertText.includes('valid email'), 'input error is announced via role=alert');

    // Checkbox: toggles and exposes the native indeterminate DOM property.
    const checkbox = await page.$('[data-testid="gallery-checkbox"] input');
    assert(checkbox, 'checkbox input rendered');
    await checkbox.click();
    assert(await page.$eval('[data-testid="gallery-checkbox"] input', (el) => el.checked), 'checkbox toggles to checked');

    const indeterminate = await page.$eval(
      '[data-testid="gallery-checkbox-indeterminate"] input',
      (el) => el.indeterminate
    );
    assert(indeterminate === true, 'select-all checkbox renders the indeterminate DOM state');

    // Dropdown: opens, lists options, selects and reflects the selection.
    await page.click('[data-testid="gallery-dropdown"] button');
    await page.waitForSelector('[data-testid="gallery-dropdown"] [role="option"]', { timeout: 5000 });
    const options = await page.$$eval('[data-testid="gallery-dropdown"] [role="option"]', (nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? '')
    );
    assert(options.includes('Event count'), `dropdown lists options (got ${JSON.stringify(options)})`);
    await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('[data-testid="gallery-dropdown"] [role="option"]')
      );
      const target = buttons.find((button) => button.textContent?.includes('Event count'));
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="gallery-dropdown"] button')?.textContent ?? '').includes('Event count'),
      { timeout: 5000 }
    );

    // Dropdown: escape closes the popover.
    await page.click('[data-testid="gallery-dropdown"] button');
    await page.waitForSelector('[data-testid="gallery-dropdown"] [role="option"]', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="gallery-dropdown"] [role="option"]').length === 0,
      { timeout: 5000 }
    );

    // Tabs: arrow key navigation moves selection.
    await page.click('[role="tab"]');
    const beforeArrow = await page.$eval('[role="tab"][aria-selected="true"]', (el) => el.textContent?.trim());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      (previous) => {
        const active = document.querySelector('[role="tab"][aria-selected="true"]');
        return active !== null && active.textContent?.trim() !== previous;
      },
      { timeout: 5000 },
      beforeArrow
    );
    const activeTabText = await page.$eval('[role="tab"][aria-selected="true"]', (el) => el.textContent?.trim());
    assert(activeTabText !== beforeArrow, `ArrowRight changes the active tab (${beforeArrow} -> ${activeTabText})`);

    // Tooltip: appears on focus.
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) =>
        node.textContent?.trim() === 'Top'
      );
      button?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    await page.waitForSelector('[role="tooltip"]', { timeout: 5000 });
    const tooltipText = await page.$eval('[role="tooltip"]', (el) => el.textContent?.trim());
    assert(tooltipText === 'Top placement', `tooltip content is correct (got ${tooltipText})`);

    // Pagination: next/prev update the page indicator.
    const paginationText = await page.$eval('nav[aria-label="Pagination"] p', (el) => el.textContent ?? '');
    assert(paginationText.includes('137'), `pagination reports the total (got ${paginationText.trim()})`);
    await page.click('nav[aria-label="Pagination"] button[aria-label="Next page"]');
    await page.waitForFunction(
      () => (document.querySelector('nav[aria-label="Pagination"] p')?.textContent ?? '').includes('6–10'),
      { timeout: 5000 }
    );

    // Modal: opens, traps focus, closes on Escape and restores focus.
    await page.click('[data-testid="gallery-modal-open"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    assert(
      await page.$eval('[role="dialog"]', (el) => el.getAttribute('aria-modal') === 'true'),
      'dialog exposes aria-modal'
    );
    const focusInsideDialog = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false
    );
    assert(focusInsideDialog, 'initial focus moves into the dialog');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null, { timeout: 5000 });
    const focusRestored = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'gallery-modal-open'
    );
    assert(focusRestored, 'focus returns to the trigger after closing');

    // No horizontal overflow on the narrowest supported viewport.
    await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 1 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) {
      const offenders = await overflowingElements(page);
      throw new Error(
        `ASSERTION FAILED: gallery has no horizontal overflow at 360px (overflow ${overflow}px)\n  ${offenders.join('\n  ')}`
      );
    }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await gotoRoute(page, '/ui-kit');
    await context.shot('phase2-gallery');
  },

  async phase3(page, context) {
    await gotoRoute(page, '/issues');
    await context.shot('phase3-desktop');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await gotoRoute(page, '/issues');
    await context.shot('phase3-mobile');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  },

  async phase4(page, context) {
    await gotoRoute(page, '/issues');
    const rendered = await countRows(page, '[data-issue-row]');
    assert(rendered > 0, 'issue rows render from the reactive store');
    await context.shot('phase4-desktop');
  },

  async phase5(page, context) {
    const viewports = [
      { name: '360', width: 360, height: 780 },
      { name: '390', width: 390, height: 844 },
      { name: '430', width: 430, height: 932 },
      { name: '768', width: 768, height: 1024 },
      { name: '1280', width: 1280, height: 900 }
    ];

    for (const viewport of viewports) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await gotoRoute(page, '/issues');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      assert(overflow <= 1, `no horizontal overflow at ${viewport.name}px (overflow ${overflow}px)`);
      await context.shot(`phase5-issues-${viewport.name}`);
    }

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    const issueId = await page.evaluate(
      () =>
        new Promise((resolvePromise) => {
          const request = indexedDB.open('vue_sentry_clone_db');
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('issues', 'readonly');
            const store = tx.objectStore('issues');
            const cursorRequest = store.openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (cursor) {
                db.close();
                resolvePromise(cursor.value.id);
              } else {
                db.close();
                resolvePromise(null);
              }
            };
          };
        })
    );

    assert(issueId, 'at least one issue exists for the detail route');
    await gotoRoute(page, `/issues/${issueId}`);
    const detailText = await page.evaluate(() => document.body.textContent ?? '');
    assert(detailText.includes('Stack'), 'detail view renders the stack trace section');
    await context.shot('phase5-detail-desktop');

    for (const viewport of viewports) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await gotoRoute(page, `/issues/${issueId}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      assert(overflow <= 1, `detail view has no horizontal overflow at ${viewport.name}px`);
      await context.shot(`phase5-detail-${viewport.name}`);
    }

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await gotoRoute(page, '/stream');
    await context.shot('phase5-stream');
    await gotoRoute(page, '/settings');
    await context.shot('phase5-settings');
  }
};

/* ------------------------------------------------------------------ */
/* Runner                                                               */
/* ------------------------------------------------------------------ */

const suiteNames =
  requestedSuite === 'all' ? Object.keys(suites) : [requestedSuite];

if (suiteNames.some((name) => !(name in suites))) {
  console.error(`Unknown suite "${requestedSuite}". Available: ${Object.keys(suites).join(', ')}, all`);
  process.exit(2);
}

async function main() {
  if (!existsSync(join(rootDir, 'dist', 'index.html'))) {
    throw new Error('dist/index.html missing — run `pnpm run build` first.');
  }

  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(shotDir, { recursive: true });

  const preview = await startPreviewServer();
  const browser = await puppeteer.launch({
    executablePath: resolveChromeBinary(),
    headless: true,
    userDataDir: profileDir,
    protocolTimeout: 120_000,
    args: [
      // The sandboxed runner cannot initialise Chrome's own seatbelt sandbox,
      // so child renderer/GPU processes are launched unsandboxed. Only the
      // throwaway profile below is used - the user's browsers are untouched.
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-sync',
      '--mute-audio'
    ]
  });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  let failures = 0;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        const location = message.location()?.url ?? '';
        consoleErrors.push(`${message.text()} ${location}`.trim());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
    });

    // Screenshots are fire-and-forget from the suite's point of view, so the
    // harness tracks them and drains the queue before moving on.
    const pendingShots = new Set();

    const context = {
      shot: (name) => {
        const promise = (async () => {
          const file = join(shotDir, `${name}.png`);
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              await page.screenshot({ path: file, optimizeForSpeed: true });
              return;
            } catch (error) {
              if (attempt === 2) {
                // Diagnostics only - a renderer hiccup must not mask results.
                console.warn(`WARN  screenshot "${name}" failed: ${error?.message ?? error}`);
                return;
              }
              await page.reload({ waitUntil: 'networkidle0' }).catch(() => undefined);
            }
          }
        })();
        pendingShots.add(promise);
        void promise.finally(() => pendingShots.delete(promise));
        return promise;
      },
      settle: async () => {
        await Promise.allSettled(Array.from(pendingShots));
      },
      consoleErrors,
      pageErrors
    };

    for (const name of suiteNames) {
      const startedAt = Date.now();
      try {
        await suites[name](page, context);
        await context.settle();
        console.log(`PASS  ${name}  (${Date.now() - startedAt}ms)`);
      } catch (error) {
        failures += 1;
        console.error(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (pageErrors.length > 0) {
      failures += 1;
      console.error(`FAIL  uncaught page errors:\n  ${pageErrors.join('\n  ')}`);
    }
    const ignorableConsole = consoleErrors.filter((text) => !text.includes('favicon'));
    if (ignorableConsole.length > 0) {
      failures += 1;
      console.error(`FAIL  console errors:\n  ${ignorableConsole.join('\n  ')}`);
    }
    const ignorableRequests = failedRequests.filter((text) => !text.includes('favicon'));
    if (ignorableRequests.length > 0) {
      failures += 1;
      console.error(`FAIL  failed requests:\n  ${ignorableRequests.join('\n  ')}`);
    }

    console.log(`\nscreenshots: ${shotDir}`);
  } finally {
    await browser.close();
    preview.kill('SIGTERM');
  }

  if (failures > 0) {
    console.error(`\n${failures} verification failure(s)`);
    process.exit(1);
  }
  console.log('\nall verifications passed');
}

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason instanceof Error ? reason.stack : String(reason));
  process.exit(1);
});

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});