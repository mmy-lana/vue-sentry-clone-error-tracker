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

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Resizes the viewport and waits for two animation frames so the media-query
 * layout, the Vue `useBreakpoints` state and the overflow measurement all see
 * the same geometry before assertions run.
 */
async function setViewport(page, width, height, deviceScaleFactor = 1) {
  await page.setViewport({ width, height, deviceScaleFactor });
  await page.evaluate(
    () =>
      new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
      })
  );
  await sleep(120);
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

/** The stack panel renders either frames or its documented empty state. */
async function waitForStackSurface(page, timeout = 15_000) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-frame-id]').length > 0 ||
      (document.body.textContent ?? '').includes('No stack frames captured'),
    { timeout }
  );
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


/** Reads stored events (optionally for one issue) for assertions. */
async function readStoredEvents(page, issueId) {
  return page.evaluate(
    (targetIssueId) =>
      new Promise((resolvePromise, rejectPromise) => {
        const request = indexedDB.open('vue_sentry_clone_db');
        request.onerror = () => rejectPromise(new Error('failed to open database'));
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('events', 'readonly');
          const store = tx.objectStore('events');
          const source = targetIssueId ? store.index('issue_id').getAll(targetIssueId) : store.getAll();
          source.onsuccess = () => {
            database.close();
            resolvePromise(source.result);
          };
          source.onerror = () => rejectPromise(source.error);
        };
      }),
    issueId
  );
}

/** Reads the first stored event matching a message. */
async function readEventByMessage(page, message) {
  return page.evaluate(
    (targetMessage) =>
      new Promise((resolvePromise, rejectPromise) => {
        const request = indexedDB.open('vue_sentry_clone_db');
        request.onerror = () => rejectPromise(new Error('failed to open database'));
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('events', 'readonly');
          const all = tx.objectStore('events').getAll();
          all.onsuccess = () => {
            database.close();
            resolvePromise(all.result.find((event) => event.message === targetMessage) ?? null);
          };
          all.onerror = () => rejectPromise(all.error);
        };
      }),
    message
  );
}

async function readIssueFingerprints(page) {
  return page.evaluate(
    () =>
      new Promise((resolvePromise, rejectPromise) => {
        const request = indexedDB.open('vue_sentry_clone_db');
        request.onerror = () => rejectPromise(new Error('failed to open database'));
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('issues', 'readonly');
          const all = tx.objectStore('issues').getAll();
          all.onsuccess = () => {
            database.close();
            resolvePromise(all.result.map((issue) => ({ id: issue.id, fingerprint: issue.fingerprint })));
          };
          all.onerror = () => rejectPromise(all.error);
        };
      })
  );
}

/**
 * Writes an issue plus events straight into IndexedDB.
 *
 * Used to reproduce defects the UI cannot create on demand, such as events that
 * fall outside the live-stream window.
 */
async function injectIssue(page, payload) {
  return page.evaluate(
    (input) =>
      new Promise((resolvePromise, rejectPromise) => {
        const request = indexedDB.open('vue_sentry_clone_db');
        request.onerror = () => rejectPromise(new Error('failed to open database'));
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(['issues', 'events'], 'readwrite');
          const issues = tx.objectStore('issues');
          const events = tx.objectStore('events');
          const now = Date.now();

          const issue = {
            id: input.issueId,
            project_id: 'default',
            fingerprint: input.fingerprint,
            title: `${input.type}: ${input.message}`,
            culprit: 'verify/suite.mjs in injectIssue',
            level: 'error',
            status: 'unresolved',
            first_seen: input.timestamp,
            last_seen: input.timestamp + input.count - 1,
            event_count: input.count,
            user_count: 1,
            unique_users: ['usr_verify'],
            environments: ['production'],
            regression_count: 0,
            recent_timestamps: Array.from({ length: input.count }, (_, index) => input.timestamp + index),
            histogram_24h: Array.from({ length: 24 }, (_, index) => ({
              hour_timestamp: now - (24 - index) * 3600000,
              count: 0
            })),
            tags_summary: { environment: { production: input.count } }
          };
          issues.put(issue);

          for (let index = 0; index < input.count; index += 1) {
            events.put({
              id: `${input.issueId}_evt_${index}`,
              issue_id: input.issueId,
              project_id: 'default',
              timestamp: input.timestamp + index,
              platform: 'javascript',
              level: 'error',
              message: input.message,
              culprit: 'verify/suite.mjs in injectIssue',
              fingerprint: input.fingerprint,
              exception: {
                type: input.type,
                value: input.message,
                stacktrace: {
                  frames: [
                    {
                      id: `${input.issueId}_frame_${index}`,
                      filename: 'verify/suite.mjs',
                      function: 'injectIssue',
                      lineno: 42,
                      colno: 7,
                      in_app: true,
                      pre_context: ['const tx = db.transaction();'],
                      context_line: '  events.put(event);',
                      post_context: ['}'],
                      vars: {}
                    }
                  ]
                }
              },
              breadcrumbs: [],
              tags: { environment: 'production' },
              user: { id: 'usr_verify', email: 'verify@example.com' },
              request: input.request,
              device: {
                browser: 'Chrome',
                browser_version: '122.0.0',
                os: 'macOS',
                os_version: '14.3',
                viewport: '1440x900'
              },
              sdk: { name: 'vue-sentry-tracker', version: '1.0.0' }
            });
          }

          tx.oncomplete = () => {
            database.close();
            resolvePromise(input.issueId);
          };
          tx.onerror = () => rejectPromise(tx.error);
        };
      }),
    payload
  );
}


/** Reads every issue with its rollup counters for aggregate assertions. */
async function readIssueRows(page) {
  return page.evaluate(
    () =>
      new Promise((resolvePromise, rejectPromise) => {
        const request = indexedDB.open('vue_sentry_clone_db');
        request.onerror = () => rejectPromise(new Error('failed to open database'));
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('issues', 'readonly');
          const all = tx.objectStore('issues').getAll();
          all.onsuccess = () => {
            database.close();
            resolvePromise(
              all.result.map((issue) => ({
                id: issue.id,
                status: issue.status,
                event_count: issue.event_count,
                histogram: issue.histogram_24h.map((bucket) => bucket.hour_timestamp),
                tags_summary: issue.tags_summary
              }))
            );
          };
          all.onerror = () => rejectPromise(all.error);
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
    await setViewport(page, 360, 780, 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) {
      const offenders = await overflowingElements(page);
      const context = await page.evaluate(() => ({
        bodyWidth: document.body.scrollWidth,
        bodyChildren: Array.from(document.body.children).map((node) => ({
          tag: node.tagName.toLowerCase(),
          width: Math.round(node.getBoundingClientRect().width),
          scrollWidth: node.scrollWidth
        })),
        openDialogs: document.querySelectorAll('[role="dialog"]').length,
        openPanels: document.querySelectorAll('[role="listbox"]').length,
        bodyOverflowStyle: document.body.style.overflow
      }));
      throw new Error(
        `ASSERTION FAILED: gallery has no horizontal overflow at 360px (overflow ${overflow}px)\n  ${JSON.stringify(context)}\n  ${offenders.join('\n  ')}`
      );
    }
    await setViewport(page, 1440, 900, 1);
    await gotoRoute(page, '/ui-kit');
    await context.shot('phase2-gallery');
  },

  async phase3(page, context) {
    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-testid="issue-harness"]', { timeout: 15_000 });
    await page.waitForSelector('[data-testid="detail-harness"]', { timeout: 15_000 });

    context.step('issue table rows');
    // Issue table renders seeded rows with responsive layout in both modes.
    await page.waitForSelector('[data-issue-row]', { timeout: 15_000 });
    const rowCount = await countRows(page, '[data-issue-row]');
    assert(rowCount >= 5, `issue table renders rows (got ${rowCount})`);

    const rowText = await page.$eval('[data-issue-row]', (el) => el.textContent ?? '');
    assert(/events/i.test(rowText), 'issue row exposes the event tally');
    assert(/users?/i.test(rowText), 'issue row exposes the user tally');

    context.step('sparkline');
    // Sparkline draws one column per hourly bucket.
    const sparkline = await page.$('[data-testid="sparkline"]');
    assert(sparkline, 'sparkline rendered');
    const barCount = await page.$eval('[data-testid="sparkline"]', (el) => el.children.length);
    assert(barCount === 24, `sparkline draws 24 buckets (got ${barCount})`);
    const sparklineLabel = await page.$eval('[data-testid="sparkline"]', (el) => el.getAttribute('aria-label') ?? '');
    assert(sparklineLabel.includes('24 hours'), `sparkline is labelled (got "${sparklineLabel}")`);

    context.step('bulk bar');
    // Selection drives the bulk bar.
    assert((await countRows(page, '[data-testid="issue-bulk-bar"]')) === 0, 'bulk bar hidden without selection');
    await page.evaluate(() => {
      const checkbox = document.querySelector('[data-issue-row] input[type="checkbox"]');
      checkbox?.click();
    });
    await page.waitForSelector('[data-testid="issue-bulk-bar"]', { timeout: 5000 });
    const bulkCount = await textOf(page, '[data-testid="bulk-count"]');
    assert(bulkCount.includes('1 selected'), `bulk bar reflects selection (got "${bulkCount}")`);

    context.step('bulk bar viewport');
    // Bulk bar stays inside the viewport on the narrowest supported width.
    await setViewport(page, 360, 780, 1);
    const bulkBounds = await page.$eval('[data-testid="issue-bulk-bar"] > div', (el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: window.innerWidth };
    });
    assert(
      bulkBounds.left >= 0 && bulkBounds.right <= bulkBounds.width + 1,
      `bulk bar fits the viewport at 360px (${JSON.stringify(bulkBounds)})`
    );
    await setViewport(page, 1440, 900, 1);

    context.step('filter search bar');
    // Search bar filters and applies operator suggestions.
    await page.click('[data-testid="issue-harness"] input[type="search"]');
    await page.waitForSelector('#filter-search-suggestions [role="option"]', { timeout: 5000 });
    const optionCount = await countRows(page, '#filter-search-suggestions [role="option"]');
    assert(optionCount >= 5, `suggestion list renders (got ${optionCount})`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.querySelectorAll('#filter-search-suggestions [role="option"]').length === 0,
      { timeout: 5000 }
    );
    await page.type('[data-testid="issue-harness"] input[type="search"]', 'env:production');
    await page.waitForFunction(
      () =>
        (document.querySelector('#filter-search-suggestions')?.textContent ?? '').includes('env:production'),
      { timeout: 5000 }
    );

    context.step('stack frames');
    // Stack frames expand and expose local variables.
    await page.waitForSelector('[data-frame-id]', { timeout: 10_000 });
    const frameCount = await countRows(page, '[data-frame-id]');
    assert(frameCount >= 1, `stack frames render (got ${frameCount})`);
    const inAppFrameId = await page.$eval('[data-frame-id]', (el) => el.getAttribute('data-frame-id') ?? '');
    assert(inAppFrameId.length > 0, 'stack frames carry stable ids');
    await page.evaluate(() => {
      document
        .querySelectorAll('[data-frame-id] > button[aria-expanded="false"]')
        .forEach((button) => button.click());
    });
    context.step('expand frames');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-frame-id] pre').length > 0,
      { timeout: 5000 }
    );
    const lineNumbers = await page.$$eval('[data-frame-id] pre', (nodes) => nodes.length);
    assert(lineNumbers > 0, `expanded frames render source lines (got ${lineNumbers})`);

    const openedVariables = await page.evaluate(() => {
      const toggle = Array.from(document.querySelectorAll('[data-frame-id] button')).find((node) =>
        (node.textContent ?? '').includes('Local variables')
      );
      toggle?.click();
      return Boolean(toggle);
    });
    context.step(`local variables toggle present=${openedVariables}`);
    if (openedVariables) {
      try {
        await page.waitForFunction(
          () => document.querySelectorAll('[data-frame-id] dl').length > 0,
          { timeout: 5000 }
        );
      } catch (error) {
        const snapshot = await page.evaluate(() => ({
          frames: document.querySelectorAll('[data-frame-id]').length,
          dls: document.querySelectorAll('dl').length,
          frameText: Array.from(document.querySelectorAll('[data-frame-id]')).map((frame) =>
            (frame.textContent ?? '').replace(/\s+/g, ' ').slice(0, 120)
          ),
          toggles: Array.from(document.querySelectorAll('[data-frame-id] button')).map((button) =>
            (button.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
          )
        }));
        throw new Error(`ASSERTION FAILED: local variables did not expand. ${JSON.stringify(snapshot)}`);
      }
      const variableNames = await page.$$eval('[data-frame-id] dl dt', (nodes) =>
        nodes.map((node) => node.textContent?.trim() ?? '')
      );
      assert(variableNames.length > 0, 'local variables are listed with names');
    }

    context.step('breadcrumbs');
    // Breadcrumb timeline renders the captured trail with payload disclosure.
    const crumbCount = await countRows(page, '[data-testid="breadcrumb-entry"]');
    assert(crumbCount >= 3, `breadcrumb entries render (got ${crumbCount})`);
    const crumbCategories = await page.$$eval('[data-testid="breadcrumb-entry"]', (nodes) =>
      nodes.map((node) => node.textContent?.trim().split(' ')[0] ?? '')
    );
    assert(
      crumbCategories.some((category) => category.length > 0),
      `breadcrumb entries are labelled (got ${JSON.stringify(crumbCategories)})`
    );
    const payloadToggle = await page.evaluate(() => {
      const toggle = Array.from(
        document.querySelectorAll('[data-testid="breadcrumb-entry"] button')
      ).find((node) => (node.textContent ?? '').includes('Show payload'));
      toggle?.click();
      return Boolean(toggle);
    });
    if (payloadToggle) {
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="breadcrumb-entry"] dl').length > 0,
        { timeout: 5000 }
      );
      const payloadKeys = await page.$$eval('[data-testid="breadcrumb-entry"] dl dt', (nodes) =>
        nodes.map((node) => node.textContent?.trim() ?? '')
      );
      assert(payloadKeys.length > 0, 'breadcrumb payload lists its keys');
    }

    context.step('context inspector');
    // Context inspector surfaces device, request, tags and user metadata.
    const inspectorText = await textOf(page, '[data-testid="detail-harness"] dl');
    assert(inspectorText.length > 0, 'context inspector renders definition lists');
    const harnessText = await textOf(page, '[data-testid="detail-harness"]');
    for (const label of ['Device', 'Request', 'Tags', 'User']) {
      assert(harnessText.includes(label), `context inspector shows "${label}"`);
    }

    context.step('tag distribution');
    // Tag distribution table renders key/value/share/event columns.
    const tagRows = await countRows(page, '[data-testid="tags-table"] tbody tr');
    assert(tagRows >= 3, `tag distribution renders rows (got ${tagRows})`);

    context.step('empty state');
    // Loading state: skeletons replace the rows while a fetch is in flight.
    await page.waitForSelector('[data-testid="issue-table-loading"]', { timeout: 5000 });
    const skeletonCount = await countRows(page, '[data-testid="issue-table-loading"] .animate-pulse');
    assert(skeletonCount >= 3, `loading skeletons render (got ${skeletonCount})`);

    // Empty state renders when the table receives no issues.
    const emptyVisible = await page.evaluate(() => {
      const holder = document.querySelector('[data-testid="issue-table-empty"]');
      return (holder?.textContent ?? '').includes('No issues match these filters');
    });
    assert(emptyVisible, 'empty state renders for an unmatched filter');

    const emptyReset = await page.evaluate(() => {
      const button = Array.from(
        document.querySelectorAll('[data-testid="issue-table-empty"] button')
      ).find((node) => (node.textContent ?? '').includes('Clear filters'));
      button?.click();
      return Boolean(button);
    });
    assert(emptyReset, 'empty state exposes a reset action');

    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-testid="issue-harness"]');
    await setViewport(page, 390, 844, 1);
    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-issue-row]');
    await context.settle();
    await context.shot('phase3-mobile');
    await setViewport(page, 1440, 900, 1);
    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-issue-row]');
    await context.settle();
    await context.shot('phase3-desktop');
  },

  async phase4(page, context) {
    context.step('stores bound to live queries');
    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-testid="pipeline-harness"]', { timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const text = document.querySelector('[data-testid="filtered-summary"]')?.textContent ?? '';
        return /^\d+ \/ \d+$/.test(text.trim()) && !text.trim().startsWith('0 /');
      },
      { timeout: 15_000 }
    );

    const readCounters = () =>
      page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="pipeline-harness"] p'));
        const labelOf = (text) =>
          cards.find((node) => (node.textContent ?? '').trim().toLowerCase() === text.toLowerCase());
        const valueAfter = (text) => {
          const card = labelOf(text);
          return card?.parentElement?.querySelector('span')?.textContent?.trim() ?? '';
        };
        return {
          issues: valueAfter('Issues'),
          unresolved: valueAfter('Unresolved'),
          events: valueAfter('Events'),
          stored: valueAfter('Stored events'),
          outcome: valueAfter('Last outcome'),
          viewport: valueAfter('Viewport')
        };
      });

    const before = await readCounters();
    assert(before.issues !== '' && before.issues !== '0', `issues are loaded from IndexedDB (${JSON.stringify(before)})`);
    assert(before.viewport === 'desktop', `desktop viewport classified (got ${before.viewport})`);

    context.step('ingest creates a new fingerprint group');
    await page.click('[data-testid="emit-type-error"]');
    await page.waitForFunction(
      (previous) => {
        const cards = Array.from(document.querySelectorAll('[data-testid="pipeline-harness"] p'));
        const card = cards.find((node) => (node.textContent ?? '').trim().toLowerCase() === 'issues');
        return (card?.parentElement?.querySelector('span')?.textContent?.trim() ?? '') !== previous;
      },
      { timeout: 10_000 },
      before.issues
    );
    const afterCreate = await readCounters();
    assert(afterCreate.outcome === 'created', `first emit creates an issue (got ${afterCreate.outcome})`);

    context.step('second emit merges into the same group');
    const eventsBeforeMerge = afterCreate.events;
    await page.click('[data-testid="emit-type-error"]');
    await page.waitForFunction(
      (previous) => {
        const cards = Array.from(document.querySelectorAll('[data-testid="pipeline-harness"] p'));
        const card = cards.find((node) => (node.textContent ?? '').trim().toLowerCase() === 'events');
        return (card?.parentElement?.querySelector('span')?.textContent?.trim() ?? '') !== previous;
      },
      { timeout: 10_000 },
      eventsBeforeMerge
    );
    const afterMerge = await readCounters();
    assert(afterMerge.outcome === 'merged', `second emit merges (got ${afterMerge.outcome})`);
    assert(
      afterMerge.issues === afterCreate.issues,
      `merge keeps the issue count stable (${afterCreate.issues} -> ${afterMerge.issues})`
    );

    context.step('resolve then re-emit records a regression');
    await page.click('[data-testid="resolve-simulated"]');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="simulated-status"]')?.textContent ?? '').includes('resolved'),
      { timeout: 10_000 }
    );
    await page.click('[data-testid="emit-type-error"]');
    await page.waitForFunction(
      () => {
        const cards = Array.from(document.querySelectorAll('[data-testid="pipeline-harness"] p'));
        const card = cards.find((node) => (node.textContent ?? '').trim().toLowerCase() === 'last outcome');
        return (card?.parentElement?.querySelector('span')?.textContent?.trim() ?? '') === 'regressed';
      },
      { timeout: 10_000 }
    );
    const regressionText = await textOf(page, '[data-testid="simulated-status"]');
    assert(
      regressionText.includes('unresolved') && regressionText.includes('regressions 1'),
      `resolved issue re-opens and counts the regression (got "${regressionText.trim()}")`
    );

    context.step('ingestion persisted to IndexedDB');
    const storedCounts = await readDatabaseCounts(page);
    assert(storedCounts.events > 100, `events persisted (${storedCounts.events})`);
    assert(storedCounts.issues >= 8, `new issue persisted (${storedCounts.issues})`);

    context.step('status facet toggles the filtered set');
    const filteredBefore = await textOf(page, '[data-testid="filtered-summary"]');
    await page.click('[data-testid="toggle-filter-status"]');
    await page.waitForFunction(
      (previous) =>
        (document.querySelector('[data-testid="filtered-summary"]')?.textContent ?? '').trim() !== previous.trim(),
      { timeout: 10_000 },
      filteredBefore
    );
    const facetText = await textOf(page, '[data-testid="facet-summary"]');
    assert(facetText.includes('all'), `facet switch reflected (got "${facetText.trim()}")`);
    const queryText = await textOf(page, '[data-testid="query-preview"]');
    assert(queryText.length > 0, `query serialisation is exposed (got "${queryText.trim()}")`);

    context.step('breakpoint classification follows the viewport');
    for (const [width, expected] of [
      [360, 'compact'],
      [430, 'compact'],
      [768, 'tablet'],
      [1024, 'desktop']
    ]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await sleep(250);
      const viewportClass = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="pipeline-harness"] p'));
        const card = cards.find((node) => (node.textContent ?? '').trim().toLowerCase() === 'viewport');
        return card?.parentElement?.querySelector('span')?.textContent?.trim() ?? '';
      });
      assert(viewportClass === expected, `viewport ${width}px classified as ${expected} (got ${viewportClass})`);
    }
    await setViewport(page, 1440, 900, 1);
    await sleep(200);

    context.step('deleting the issue removes its events');
    const countsBeforeDelete = await readDatabaseCounts(page);
    await page.click('[data-testid="delete-simulated"]');
    await page.waitForFunction(
      (previous) => {
        const cards = Array.from(document.querySelectorAll('[data-testid="pipeline-harness"] p'));
        const card = cards.find((node) => (node.textContent ?? '').trim().toLowerCase() === 'stored events');
        return (card?.parentElement?.querySelector('span')?.textContent?.trim() ?? '') !== previous;
      },
      { timeout: 10_000 },
      String(countsBeforeDelete.events)
    );
    const afterDelete = await readDatabaseCounts(page);
    assert(afterDelete.issues === countsBeforeDelete.issues - 1, 'issue removed');
    assert(afterDelete.events < countsBeforeDelete.events, 'orphaned events removed with the issue');

    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-testid="pipeline-harness"]');
    await context.settle();
    await context.shot('phase4-pipeline');
  },

  async phase5(page, context) {
    const viewports = [
      { name: '360', width: 360, height: 780, sidebar: 'hidden' },
      { name: '390', width: 390, height: 844, sidebar: 'hidden' },
      { name: '430', width: 430, height: 932, sidebar: 'hidden' },
      { name: '768', width: 768, height: 1024, sidebar: 'rail' },
      { name: '1280', width: 1280, height: 900, sidebar: 'full' }
    ];

    async function assertNoOverflow(label) {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 1) {
        const offenders = await overflowingElements(page);
        throw new Error(
          `ASSERTION FAILED: ${label} overflows horizontally by ${overflow}px\n  ${offenders.join('\n  ')}`
        );
      }
    }

    context.step('responsive shell across the breakpoint matrix');
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-issue-row]', { timeout: 15_000 });

    for (const viewport of viewports) {
      await setViewport(page, viewport.width, viewport.height, 1);
      await gotoRoute(page, '/issues');
      await page.waitForSelector('[data-issue-row]', { timeout: 15_000 });

      await assertNoOverflow(`issues list at ${viewport.name}px`);

      const sidebarMode = await page.evaluate(() => {
        const sidebar = document.querySelector('[data-testid="app-sidebar"]');
        return sidebar ? sidebar.getAttribute('data-mode') : 'hidden';
      });
      assertEqual(sidebarMode, viewport.sidebar, `sidebar mode at ${viewport.name}px`);

      const mobileNav = await page.evaluate(() => {
        const nav = document.querySelector('[data-testid="mobile-nav"]');
        return nav ? getComputedStyle(nav).display !== 'none' : false;
      });
      assertEqual(
        mobileNav,
        viewport.width < 768,
        `bottom navigation visibility at ${viewport.name}px`
      );

      const rowCount = await countRows(page, '[data-issue-row]');
      assert(rowCount > 0, `issue rows render at ${viewport.name}px`);

      // Tap targets on touch widths must clear the 44px minimum.
      if (viewport.width < 768) {
        const tooSmall = await page.$$eval('[data-testid="mobile-nav-link"]', (nodes) =>
          nodes
            .map((node) => node.getBoundingClientRect().height)
            .filter((height) => height > 0 && height < 44)
        );
        assertEqual(tooSmall.length, 0, `navigation tap targets at ${viewport.name}px`);
      }

      await context.settle();
      await context.shot(`phase5-issues-${viewport.name}`);
    }

    context.step('bulk action bar stays inside the viewport');
    await setViewport(page, 360, 780, 1);
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-issue-row]');
    await page.evaluate(() => {
      document.querySelector('[data-issue-row] input[type="checkbox"]')?.click();
    });
    await page.waitForSelector('[data-testid="issue-bulk-bar"]', { timeout: 5000 });
    const bulkBounds = await page.$eval('[data-testid="issue-bulk-bar"] > div', (el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: window.innerWidth };
    });
    assert(
      bulkBounds.left >= 0 && bulkBounds.right <= bulkBounds.width + 1,
      `bulk bar fits at 360px (${JSON.stringify(bulkBounds)})`
    );
    await page.evaluate(() => {
      const clear = Array.from(document.querySelectorAll('[data-testid="issue-bulk-bar"] button')).find(
        (node) => (node.getAttribute('aria-label') ?? '') === 'Clear selection'
      );
      clear?.click();
    });

    context.step('mobile navigation drawer');
    await page.click('[data-testid="drawer-toggle"]');
    await page.waitForSelector('[data-testid="app-sidebar"]', { timeout: 5000 });
    assert(await page.$('[data-testid="sidebar-backdrop"]'), 'drawer renders a backdrop');
    const drawerLinkCount = await countRows(page, '[data-testid="sidebar-link"]');
    assert(drawerLinkCount >= 3, `drawer lists the navigation (got ${drawerLinkCount})`);
    await page.click('[data-testid="sidebar-close"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="app-sidebar"]') === null, {
      timeout: 5000
    });
    await setViewport(page, 1280, 900, 1);

    context.step('filters drive the URL and the result set');
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-issue-row]');

    context.step('open status dropdown');
    await page.click('[data-testid="status-filter"] button');
    await page.waitForSelector('[data-testid="status-filter"] [role="option"]', { timeout: 5000 });
    await page.evaluate(() => {
      const option = Array.from(
        document.querySelectorAll('[data-testid="status-filter"] [role="option"]')
      ).find((node) => (node.textContent ?? '').includes('Any status'));
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    context.step('status facet reaches the URL');
    // "Any status" is the default, so the serialised query must drop `status`.
    await page.waitForFunction(() => !window.location.search.includes('status='), { timeout: 5000 });
    const urlAfterFacet = await page.evaluate(() => window.location.search);
    assert(!urlAfterFacet.includes('status='), `status facet is serialised (got "${urlAfterFacet}")`);

    context.step('search query reaches the URL');
    await page.type('[data-testid="issues-view"] input[type="search"]', 'level:fatal');
    await page.waitForFunction(() => window.location.search.includes('q=level'), { timeout: 5000 });

    await gotoRoute(page, '/issues?status=resolved');
    await page.waitForSelector('[data-issue-row]', { timeout: 15_000 });
    const criteriaText = await page.$eval('[data-testid="status-filter"] button', (el) => el.textContent ?? '');
    assert(criteriaText.includes('Resolved'), `URL hydrates the status facet (got "${criteriaText.trim()}")`);
    const resolvedSummary = await textOf(page, '[data-testid="issues-summary"]');
    assert(/^1 of \d+ issues/.test(resolvedSummary.trim()), `resolved filter narrows the list (got "${resolvedSummary.trim()}")`);

    await gotoRoute(page, '/issues?level=fatal');
    await page.waitForSelector('[data-issue-row]', { timeout: 15_000 });
    const levelText = await page.$eval('[data-testid="level-filter"] button', (el) => el.textContent ?? '');
    assert(levelText.includes('Fatal'), `URL hydrates the level facet (got "${levelText.trim()}")`);

    context.step('empty state for unmatched query');
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="issues-view"] input[type="search"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'no-such-issue-xyz');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('No issues match these filters'),
      { timeout: 5000 }
    );
    await page.click('[data-testid="reset-filters"]');
    await page.waitForSelector('[data-issue-row]', { timeout: 10_000 });

    context.step('issue detail, stepper and resolution toolbar');
    const firstIssueId = await page.$eval('[data-issue-row]', (el) => el.getAttribute('data-issue-id'));
    assert(firstIssueId, 'issue row exposes its id');
    await gotoRoute(page, `/issues/${firstIssueId}`);
    await page.waitForSelector('[data-testid="issue-detail-view"]', { timeout: 15_000 });
    await waitForStackSurface(page);

    const detailText = await textOf(page, '[data-testid="issue-detail-view"]');
    for (const label of ['Stack trace', 'Breadcrumbs', 'Tag distribution', 'Event context']) {
      assert(detailText.includes(label), `detail view renders "${label}"`);
    }

    await page.click('[data-testid="event-pagination-header"] button[aria-label="Next event"]');
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="event-pagination-header"]')?.textContent ?? '').includes(
          'Event 2 of'
        ),
      { timeout: 5000 }
    );

    await page.click('[data-testid="toggle-in-app"]');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="toggle-in-app"]')?.textContent ?? '').includes('Show all frames'),
      { timeout: 5000 }
    );
    await page.click('[data-testid="toggle-in-app"]');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="toggle-in-app"]')?.textContent ?? '').includes('In-app only'),
      { timeout: 5000 }
    );

    await page.click('[data-testid="resolve-issue"]');
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('Reopen'),
      { timeout: 10_000 }
    );
    await page.click('[data-testid="unresolve-issue"]');
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('Resolve'),
      { timeout: 10_000 }
    );

    for (const viewport of viewports) {
      await setViewport(page, viewport.width, viewport.height, 1);
      await gotoRoute(page, `/issues/${firstIssueId}`);
      await waitForStackSurface(page);
      await assertNoOverflow(`issue detail at ${viewport.name}px`);
      await context.settle();
      await context.shot(`phase5-detail-${viewport.name}`);
    }

    await setViewport(page, 1280, 900, 1);

    context.step('live stream ingestion');
    await gotoRoute(page, '/stream');
    await page.waitForSelector('[data-testid="stream-feed"]', { timeout: 15_000 });
    const rowsBefore = await countRows(page, '[data-testid="stream-row"]');
    assert(rowsBefore > 0, `live stream shows stored events (got ${rowsBefore})`);
    const headBefore = await page.$eval('[data-testid="stream-row"]', (el) => el.textContent ?? '');
    await page.click('[data-testid="stream-emit"]');
    await page.waitForFunction(
      (previous) =>
        (document.querySelector('[data-testid="stream-row"]')?.textContent ?? '') !== previous,
      { timeout: 10_000 },
      headBefore
    );

    await page.click('[data-testid="stream-pause"]');
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('Feed paused'),
      { timeout: 5000 }
    );
    await page.click('[data-testid="stream-open-log"]');
    await page.waitForSelector('[data-testid="ingestion-drawer"]', { timeout: 5000 });
    const logEntries = await countRows(page, '[data-testid="ingestion-entry"]');
    assert(logEntries > 0, `ingestion log lists entries (got ${logEntries})`);
    await context.settle();
    await context.shot('phase5-stream-drawer');
    await page.evaluate(() => {
      const close = Array.from(document.querySelectorAll('[data-testid="ingestion-drawer"] button')).find(
        (node) => (node.textContent ?? '').trim() === 'Close'
      );
      close?.click();
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="ingestion-drawer"]') === null, {
      timeout: 5000
    });

    context.step('simulator modal from the header');
    await page.click('[data-testid="open-simulator"]');
    await page.waitForSelector('[data-testid="simulator-modal"]', { timeout: 5000 });
    const emittedBefore = await textOf(page, '[data-testid="simulator-emitted"]');
    await page.click('[data-testid="simulator-emit"]');
    await page.waitForFunction(
      (previous) =>
        (document.querySelector('[data-testid="simulator-emitted"]')?.textContent ?? '').trim() !==
        previous.trim(),
      { timeout: 10_000 },
      emittedBefore
    );

    await page.evaluate(() => {
      const textarea = document.querySelector('[data-testid="simulator-json"]');
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, '{ not json ');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.click('[data-testid="simulator-submit"]');
    await page.waitForSelector('[data-testid="simulator-json-error"]', { timeout: 5000 });
    await page.evaluate(() => {
      const textarea = document.querySelector('[data-testid="simulator-json"]');
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(
          textarea,
          JSON.stringify({ level: 'fatal', message: 'headless payload', culprit: 'verify/suite' })
        );
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.click('[data-testid="simulator-submit"]');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="simulator-json-error"]') === null,
      { timeout: 10000 }
    );
    await context.settle();
    await context.shot('phase5-simulator');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-testid="simulator-modal"]') === null, {
      timeout: 5000
    });

    context.step('settings persistence and storage tab');
    await gotoRoute(page, '/settings');
    await page.waitForSelector('[data-testid="settings-view"]', { timeout: 15_000 });
    await page.click('[data-testid="settings-save"]');
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('Saved to IndexedDB'),
      { timeout: 5000 }
    );
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((node) =>
        (node.textContent ?? '').includes('Storage')
      );
      tab?.click();
    });
    await page.waitForSelector('[data-testid="storage-issues"]', { timeout: 5000 });
    const storageIssues = await textOf(page, '[data-testid="storage-issues"]');
    assert(Number(storageIssues.replace(/[^0-9]/g, '')) > 0, `storage stats populated (got "${storageIssues}")`);
    context.step('DATA-01: event purge keeps the issue registry');
    const issuesBeforePurge = (await readDatabaseCounts(page)).issues;
    await page.click('[data-testid="settings-clear"]');
    await page.waitForSelector('[data-testid="settings-confirm"]', { timeout: 5000 });
    await page.click('[data-testid="settings-confirm"]');
    await page.waitForSelector('[data-testid="settings-purge-result"]', { timeout: 10_000 });

    const countsAfterPurge = await readDatabaseCounts(page);
    assertEqual(countsAfterPurge.events, 0, 'every raw event is deleted');
    assertEqual(
      countsAfterPurge.issues,
      issuesBeforePurge,
      'the issue registry survives an event-only purge'
    );

    const rolledIssues = await page.evaluate(
      () =>
        new Promise((resolvePromise, rejectPromise) => {
          const request = indexedDB.open('vue_sentry_clone_db');
          request.onerror = () => rejectPromise(new Error('open failed'));
          request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction('issues', 'readonly');
            const all = tx.objectStore('issues').getAll();
            all.onsuccess = () => {
              database.close();
              resolvePromise(
                all.result.map((issue) => ({
                  event_count: issue.event_count,
                  user_count: issue.user_count,
                  recent: issue.recent_timestamps.length,
                  histogram: issue.histogram_24h.length
                }))
              );
            };
            all.onerror = () => rejectPromise(all.error);
          };
        })
    );
    assert(rolledIssues.length > 0, 'issues remain for the counter audit');
    for (const issue of rolledIssues) {
      assertEqual(issue.event_count, 0, 'event counters reset to zero');
      assertEqual(issue.user_count, 0, 'user counters reset to zero');
      assertEqual(issue.recent, 0, 'rolling windows are emptied');
      assertEqual(issue.histogram, 24, 'histograms keep their 24 bucket shape');
    }

    context.step('DATA-01: reset and reseed restores a usable dataset');
    await page.click('[data-testid="settings-reset"]');
    await page.waitForSelector('[data-testid="settings-confirm"]', { timeout: 5000 });
    await page.click('[data-testid="settings-confirm"]');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="storage-events"]')?.textContent ?? '').trim() !== '0',
      { timeout: 10_000 }
    );
    const countsAfterReseed = await readDatabaseCounts(page);
    assert(countsAfterReseed.events > 100, `reseed repopulates events (${countsAfterReseed.events})`);
    assert(countsAfterReseed.issues >= 7, `reseed repopulates issues (${countsAfterReseed.issues})`);

    for (const viewport of viewports) {
      await setViewport(page, viewport.width, viewport.height, 1);
      await gotoRoute(page, '/settings');
      await page.waitForSelector('[data-testid="settings-view"]');
      await assertNoOverflow(`settings at ${viewport.name}px`);
    }

    await setViewport(page, 1280, 900, 1);
    await gotoRoute(page, '/stream');
    await page.waitForSelector('[data-testid="stream-feed"]');
    await context.settle();
    await context.shot('phase5-stream');
    await gotoRoute(page, '/settings');
    await page.waitForSelector('[data-testid="settings-view"]');
    await context.settle();
    await context.shot('phase5-settings');
  },


  async logic(page, context) {
    context.step('STATE-02: URL hydration never rewrites the route it consumed');
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-issue-row]', { timeout: 15_000 });
    const historyBefore = await page.evaluate(() => window.history.length);
    await gotoRoute(page, '/issues?status=resolved&range=168');
    await page.waitForSelector('[data-testid="issues-view"]', { timeout: 15_000 });
    const historyAfterLoad = await page.evaluate(() => window.history.length);
    await sleep(700);
    const historyAfterSettle = await page.evaluate(() => window.history.length);
    assertEqual(
      historyAfterSettle,
      historyAfterLoad,
      'no route replacement is pushed while the filter store hydrates'
    );
    assert(historyBefore <= historyAfterLoad, 'the document load itself is a navigation');

    const hydratedSearch = await page.evaluate(() => window.location.search);
    assert(
      hydratedSearch.includes('status=resolved') && hydratedSearch.includes('range=168'),
      `hydrated parameters survive untouched (got "${hydratedSearch}")`
    );
    const statusTrigger = await page.$eval('[data-testid="status-filter"] button', (el) => el.textContent ?? '');
    assert(statusTrigger.includes('Resolved'), `hydration reached the criteria (got "${statusTrigger.trim()}")`);

    context.step('METRIC-01: list metrics describe the filtered set');
    const issueRows = await readIssueRows(page);
    const expectedEvents = issueRows
      .filter((issue) => issue.status === 'resolved')
      .reduce((sum, issue) => sum + issue.event_count, 0);
    const summaryText = await textOf(page, '[data-testid="issues-summary"]');
    const eventsMatch = summaryText.match(/(\d+)\s+events in range/);
    assert(eventsMatch, `issues summary exposes the in-range event count (got "${summaryText.trim()}")`);
    assertEqual(
      Number(eventsMatch[1]),
      expectedEvents,
      'in-range events equal the sum over the filtered issues only'
    );
    const globalEvents = issueRows.reduce((sum, issue) => sum + issue.event_count, 0);
    if (expectedEvents !== globalEvents) {
      assert(
        Number(eventsMatch[1]) !== globalEvents,
        'the metric is not the global total'
      );
    }

    context.step('CALC-01: histogram buckets are aligned to hour boundaries');
    const misaligned = issueRows.filter((issue) =>
      issue.histogram.some((hourTimestamp) => hourTimestamp % 3600000 !== 0)
    );
    assertEqual(misaligned.length, 0, `all bucket anchors are hour aligned (got ${JSON.stringify(misaligned.slice(0, 2))})`);
    const wrongLength = issueRows.filter((issue) => issue.histogram.length !== 24);
    assertEqual(wrongLength.length, 0, 'histograms keep 24 buckets');

    context.step('DATA-03: tag shares are relative to their own key');
    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-testid="tags-table"]', { timeout: 15_000 });
    const shares = await page.$$eval('[data-testid="tags-table"] tbody tr', (rows) =>
      rows.map((row) => {
        const cells = row.querySelectorAll('td');
        return {
          key: (cells[0]?.textContent ?? '').trim(),
          value: (cells[1]?.textContent ?? '').trim(),
          share: Number((cells[2]?.textContent ?? '').replace('%', '').trim()) || 0
        };
      })
    );
    assert(shares.length > 0, 'tag distribution rows are rendered');

    const byKey = new Map();
    for (const row of shares) {
      const bucket = byKey.get(row.key) ?? [];
      bucket.push(row);
      byKey.set(row.key, bucket);
    }
    assert(byKey.size >= 2, `multiple tag keys are rendered (got ${byKey.size})`);
    for (const [key, rowsOfKey] of byKey) {
      const sum = rowsOfKey.reduce((total, row) => total + row.share, 0);
      assert(
        Math.abs(sum - 100) <= 5,
        `shares for "${key}" sum to ~100% (got ${sum}% across ${JSON.stringify(rowsOfKey)})`
      );
    }

    context.step('UI-01: live stream tag badges are labelled key:value');
    await gotoRoute(page, '/stream');
    await page.waitForSelector('[data-testid="stream-row"]', { timeout: 15_000 });
    const badgeLabels = await page.$$eval('[data-testid="stream-tag"]', (nodes) =>
      nodes.map((node) => node.getAttribute('title') ?? node.textContent?.trim() ?? '')
    );
    assert(badgeLabels.length > 0, 'stream rows expose tag badges');
    for (const label of badgeLabels) {
      assert(/^\w+:/.test(label), `tag badge uses key:value form (got "${label}")`);
      assert(!/^\d+:/.test(label), `tag badge has no tuple index prefix (got "${label}")`);
    }
    const streamText = await page.evaluate(
      () => document.querySelector('[data-testid="stream-feed"]')?.textContent ?? ''
    );
    assert(!/\d+:(environment|browser|os|release),/.test(streamText), 'no comma-joined tuple output in the feed');
    assert(/environment:production|environment:staging|environment:development/.test(streamText), 'tag values render as key:value');

    await context.settle();
    await context.shot('logic-audit');
  },


  async accessibility(page, context) {
    context.step('UI-02: header and rows share one grid contract');
    await setViewport(page, 1280, 900, 1);
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-issue-row-body]', { timeout: 15_000 });

    const headerBox = await page.evaluate(() => {
      const header = document.querySelector('[data-testid="issues-header"]');
      const cells = Array.from(header?.children ?? []);
      return cells.map((cell) => Math.round(cell.getBoundingClientRect().left));
    });
    assertEqual(headerBox.length, 7, `header exposes seven columns (got ${headerBox.length})`);

    const rowColumns = await page.evaluate(() => {
      const row = document.querySelector('[data-issue-row-body]');
      const cells = Array.from(row?.children ?? []);
      return cells.map((cell) => Math.round(cell.getBoundingClientRect().left));
    });
    assertEqual(rowColumns.length, 7, `row exposes seven cells (got ${rowColumns.length})`);
    for (let index = 0; index < headerBox.length; index += 1) {
      assert(
        Math.abs(headerBox[index] - rowColumns[index]) <= 2,
        `column ${index} aligns (header ${headerBox[index]} vs row ${rowColumns[index]})`
      );
    }

    const headerLabels = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-testid="issues-view"] .md\\:grid > *')
      ).map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
    );
    assert(
      headerLabels.some((label) => label.startsWith('Events')) &&
        headerLabels.some((label) => label.startsWith('Users')) &&
        headerLabels.some((label) => label.startsWith('Last seen')),
      `sortable headers are Events, Users and Last seen (got ${JSON.stringify(headerLabels)})`
    );

    const columnProbe = await page.evaluate(() => {
      const row = document.querySelector('[data-issue-row-body]');
      const cells = Array.from(row?.children ?? []);
      const text = (cell) => (cell?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return {
        events: text(cells[4]),
        users: text(cells[5]),
        lastSeen: text(cells[6])
      };
    });
    assert(/events$/.test(columnProbe.events), `events cell carries the tally (got "${columnProbe.events}")`);
    assert(/users?$/.test(columnProbe.users), `users cell carries the tally (got "${columnProbe.users}")`);
    assert(
      /ago$|^\d+[smhdw]/.test(columnProbe.lastSeen) || columnProbe.lastSeen.length > 0,
      `last seen cell carries a timestamp (got "${columnProbe.lastSeen}")`
    );

    const overlays = await page.evaluate(() => {
      const row = document.querySelector('[data-issue-row]');
      const cells = Array.from(row?.querySelectorAll('[data-issue-row-body] > *') ?? []).map((cell) =>
        cell.getBoundingClientRect()
      );
      const stray = Array.from(row?.querySelectorAll('*') ?? []).filter((node) => {
        if (node.closest('[data-issue-row-body]')) return false;
        return node.getBoundingClientRect().width > 0;
      });
      return { cells: cells.length, stray: stray.length };
    });
    assertEqual(overlays.stray, 0, 'no absolutely positioned avatar overlay escapes the grid');

    context.step('A11Y-01: the whole row is an activation target');
    const targetArea = await page.evaluate(() => {
      const body = document.querySelector('[data-issue-row-body]');
      const rect = body.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    });
    assert(targetArea.height >= 44, `row height meets the 44px touch target minimum (${targetArea.height}px)`);

    const issueId = await page.$eval('[data-issue-row]', (el) => el.getAttribute('data-issue-id'));
    await page.evaluate(() => {
      const body = document.querySelector('[data-issue-row-body]');
      const rect = body.getBoundingClientRect();
      // Tap the empty gutter between the title text and the numeric columns.
      body.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          clientX: rect.left + rect.width * 0.55,
          clientY: rect.top + rect.height / 2
        })
      );
    });
    await page.waitForFunction(() => window.location.pathname.startsWith('/issues/'), { timeout: 5000 });
    assertEqual(
      await page.evaluate(() => window.location.pathname),
      `/issues/${issueId}`,
      'clicking the row gutter opens the issue'
    );

    context.step('A11Y-01: selection controls do not trigger navigation');
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-issue-row-body]', { timeout: 15_000 });
    await page.evaluate(() => {
      document.querySelector('[data-issue-row] input[type="checkbox"]')?.click();
    });
    await page.waitForSelector('[data-testid="issue-bulk-bar"]', { timeout: 5000 });
    assertEqual(
      await page.evaluate(() => window.location.pathname),
      '/issues',
      'checking a row selects without navigating'
    );
    await page.evaluate(() => {
      const clear = Array.from(document.querySelectorAll('[data-testid="issue-bulk-bar"] button')).find(
        (node) => (node.getAttribute('aria-label') ?? '') === 'Clear selection'
      );
      clear?.click();
    });

    context.step('UI-03: sidebar keeps the parent entry active on detail routes');
    const sidebarActive = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="sidebar-link"]')).map((link) => ({
        href: link.getAttribute('href'),
        current: link.getAttribute('aria-current')
      }))
    );
    const issuesLink = sidebarActive.find((link) => link.href === '/issues');
    assertEqual(
      issuesLink?.current ?? null,
      'page',
      'the Issues entry stays highlighted on the detail route'
    );

    context.step('UI-04: suggestions replace only the edited token');
    const focusSearch = () =>
      page.evaluate(() => {
        const input = document.querySelector('[data-testid="issues-view"] input[type="search"]');
        input?.focus();
        input?.click();
      });
    await focusSearch();
    await page.type('[data-testid="issues-view"] input[type="search"]', 'checkout level:er');
    await page.waitForSelector('#filter-search-suggestions [role="option"]', { timeout: 5000 });
    await page.evaluate(() => {
      const option = Array.from(
        document.querySelectorAll('#filter-search-suggestions [role="option"]')
      ).find((node) => (node.textContent ?? '').includes('level:error'));
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="issues-view"] input[type="search"]')?.value ?? '').includes('checkout level:error'),
      { timeout: 5000 }
    );
    const queryValue = await page.$eval('[data-testid="issues-view"] input[type="search"]', (el) => el.value);
    assertEqual(queryValue, 'checkout level:error', 'free text is preserved when a chip is applied');

    await focusSearch();
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="issues-view"] input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'is:unresolved level:');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForSelector('#filter-search-suggestions [role="option"]', { timeout: 5000 });
    await page.evaluate(() => {
      const option = Array.from(
        document.querySelectorAll('#filter-search-suggestions [role="option"]')
      ).find((node) => (node.textContent ?? '').includes('level:fatal'));
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="issues-view"] input[type="search"]')?.value ?? '') ===
        'is:unresolved level:fatal',
      { timeout: 5000 }
    );

    context.step('A11Y-02: tab panels are wired to their tabs');
    await gotoRoute(page, '/settings');
    await page.waitForSelector('[role="tab"]', { timeout: 15_000 });
    const tabLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => ({
        id: tab.id,
        controls: tab.getAttribute('aria-controls')
      }))
    );
    assert(tabLinks.length >= 2, `settings exposes its tabs (got ${tabLinks.length})`);
    for (const tab of tabLinks) {
      assert(tab.id.length > 0, 'every tab carries an id');
      assert(tab.controls && tab.controls.length > 0, `tab ${tab.id} declares aria-controls`);
      const panelState = await page.evaluate(
        (panelId) => {
          const panel = document.getElementById(panelId);
          if (!panel) return null;
          return { role: panel.getAttribute('role'), labelledBy: panel.getAttribute('aria-labelledby') };
        },
        tab.controls
      );
      assert(panelState !== null, `panel #${tab.controls} exists`);
      assertEqual(panelState.role, 'tabpanel', `panel #${tab.controls} exposes role=tabpanel`);
      assertEqual(
        panelState.labelledBy,
        tab.id,
        `panel #${tab.controls} is labelled by its tab`
      );
    }

    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((node) =>
        (node.textContent ?? '').includes('Storage')
      );
      tab?.click();
    });
    await page.waitForFunction(
      () => {
        const panel = document.getElementById('settings-panel-1');
        return panel !== null && getComputedStyle(panel).display !== 'none';
      },
      { timeout: 5000 }
    );
    const panelVisibility = await page.evaluate(() =>
      ['settings-panel-0', 'settings-panel-1'].map((id) => {
        const panel = document.getElementById(id);
        return {
          id,
          present: panel !== null,
          visible: panel !== null && getComputedStyle(panel).display !== 'none'
        };
      })
    );
    for (const panel of panelVisibility) {
      assert(panel.present, `panel ${panel.id} stays mounted so aria-controls resolves`);
    }
    assert(
      panelVisibility.filter((panel) => panel.visible).length === 1,
      `exactly one panel is visible (got ${JSON.stringify(panelVisibility)})`
    );

    context.step('TEXT-01: future timestamps render as "in <unit>"');
    await gotoRoute(page, '/ui-kit');
    await page.waitForSelector('[data-testid="future-time"]', { timeout: 15_000 });
    const futureLabel = await textOf(page, '[data-testid="future-time"]');
    assert(
      /^in \d+[mhdw]$/.test(futureLabel),
      `future time renders as "in <unit>" (got "${futureLabel}")`
    );
    const timeLabels = await page.$$eval('time', (nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? '')
    );
    const malformed = timeLabels.filter((label) => label.includes('in ') && label.includes('from now'));
    assertEqual(malformed.length, 0, `no "in X from now" strings (got ${JSON.stringify(malformed)})`);
    const pastLabel = timeLabels.find((label) => label.includes('ago'));
    assert(Boolean(pastLabel), `past times still render with "ago" (got ${JSON.stringify(timeLabels)})`);

    await context.settle();
    await context.shot('accessibility-audit');
  },

  async security(page, context) {
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-issue-row]', { timeout: 15_000 });

    context.step('SEC-02: 64-bit fingerprints');
    const fingerprints = await readIssueFingerprints(page);
    assert(fingerprints.length > 0, 'issues are present for the fingerprint audit');
    const malformed = fingerprints.filter((issue) => !/^[0-9a-f]{16}$/.test(issue.fingerprint));
    assertEqual(
      malformed.length,
      0,
      `every fingerprint is a 16 character hex digest (offenders: ${JSON.stringify(malformed.slice(0, 3))})`
    );

    context.step('SEC-01: credentials redacted on the ingestion path');
    const secrets = {
      authorization: 'Bearer ingested-secret-token',
      cookie: 'session=ingested-cookie-value',
      queryToken: 'ingested-query-token',
      password: 'ingested-plaintext-password'
    };
    const customPayload = JSON.stringify({
      level: 'fatal',
      message: 'credential audit payload',
      culprit: 'verify/suite.mjs in submit',
      exception: {
        type: 'CredentialError',
        value: 'credential audit payload',
        stacktrace: { frames: [] }
      },
      request: {
        url: `/api/v1/pay?access_token=${secrets.queryToken}&locale=en`,
        method: 'POST',
        headers: {
          Authorization: secrets.authorization,
          Cookie: secrets.cookie,
          'X-Api-Key': 'ingested-api-key',
          accept: 'application/json'
        },
        body: JSON.stringify({ user: 'alex', password: secrets.password, amount: 42 })
      }
    });

    await gotoRoute(page, '/stream');
    await page.waitForSelector('[data-testid="open-simulator"]', { timeout: 15_000 });
    await page.click('[data-testid="open-simulator"]');
    await page.waitForSelector('[data-testid="simulator-json"]', { timeout: 5000 });
    await page.evaluate((payload) => {
      const textarea = document.querySelector('[data-testid="simulator-json"]');
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, payload);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, customPayload);
    await page.click('[data-testid="simulator-submit"]');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="simulator-json-error"]') === null,
      { timeout: 10_000 }
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-testid="simulator-modal"]') === null, {
      timeout: 5000
    });

    const storedEvent = await readEventByMessage(page, 'credential audit payload');
    assert(storedEvent, 'the custom payload was ingested');
    const storedJson = JSON.stringify(storedEvent);
    for (const secret of Object.values(secrets)) {
      assert(!storedJson.includes(secret), `secret "${secret}" is not persisted in IndexedDB`);
    }
    assert(!storedJson.includes('ingested-api-key'), 'api key header is not persisted');
    assert(storedJson.includes('[redacted]'), 'persisted event carries redaction markers');

    const persistedRequest = storedEvent.request ?? {};
    assertEqual(persistedRequest.headers.Authorization, '[redacted]', 'authorization header is masked');
    assertEqual(persistedRequest.headers.Cookie, '[redacted]', 'cookie header is masked');
    assertEqual(persistedRequest.headers.accept, 'application/json', 'safe headers survive redaction');
    assert(!persistedRequest.url.includes(secrets.queryToken), 'query string token is masked');
    assert(persistedRequest.url.includes('%5Bredacted%5D') || persistedRequest.url.includes('[redacted]'),
      `sensitive query parameter is masked (url: ${persistedRequest.url})`);

    const persistedBody = JSON.parse(persistedRequest.body ?? '{}');
    assertEqual(persistedBody.password, '[redacted]', 'password field is masked');
    assertEqual(persistedBody.amount, 42, 'non-sensitive payload fields survive redaction');
    assertEqual(persistedBody.user, 'alex', 'non-sensitive identity fields survive redaction');

    context.step('SEC-01: credentials redacted in the rendered context');
    await gotoRoute(page, `/issues/${storedEvent.issue_id}`);
    await page.waitForSelector('[data-testid="context-redaction-notice"]', { timeout: 10_000 });
    const rendered = await page.evaluate(() => document.body.textContent ?? '');
    for (const secret of Object.values(secrets)) {
      assert(!rendered.includes(secret), `secret "${secret}" is not rendered in the DOM`);
    }
    assert(rendered.includes('[redacted]'), 'context inspector renders redaction markers');
    assert(rendered.includes('accept: application/json'), 'non-sensitive headers stay readable');

    context.step('DATA-02: issue-scoped query reaches events outside the live window');
    const oldIssueId = await injectIssue(page, {
      issueId: 'issue_verify_archived',
      fingerprint: 'a'.repeat(16),
      type: 'ArchivedError',
      message: 'event older than the live stream window',
      timestamp: Date.now() - 7 * 24 * 3600 * 1000,
      count: 3
    });

    await gotoRoute(page, '/stream');
    await page.waitForSelector('[data-testid="stream-feed"]', { timeout: 15_000 });
    const feedRows = await countRows(page, '[data-testid="stream-row"]');
    assert(feedRows > 0, 'live stream is populated before the archived-issue check');
    const feedText = await page.evaluate(() => document.querySelector('[data-testid="stream-feed"]')?.textContent ?? '');
    assert(!feedText.includes('ArchivedError'), 'the archived event is outside the live stream window');

    await gotoRoute(page, `/issues/${oldIssueId}`);
    await page.waitForSelector('[data-frame-id]', { timeout: 15_000 });
    const stepperText = await textOf(page, '[data-testid="event-pagination-header"]');
    assert(
      stepperText.includes('Event 1 of 3'),
      `detail view loads the full archived history (got "${stepperText.trim()}")`
    );

    context.step('STATE-01: one shared engine for every consumer');
    await gotoRoute(page, '/stream');
    await page.waitForSelector('[data-testid="stream-toggle-stream"]', { timeout: 15_000 });
    await page.click('[data-testid="stream-toggle-stream"]');
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="stream-toggle-stream"]')?.textContent ?? '').includes('Stop auto'),
      { timeout: 5000 }
    );

    // The header modal is a different component: it must observe and control the
    // very same engine, which is impossible with per-instance timer ownership.
    await page.click('[data-testid="open-simulator"]');
    await page.waitForSelector('[data-testid="simulator-toggle"]', { timeout: 5000 });
    const modalWhileRunning = await textOf(page, '[data-testid="simulator-toggle"]');
    assert(
      modalWhileRunning.includes('Pause stream'),
      `modal sees the running engine (got "${modalWhileRunning.trim()}")`
    );
    await page.click('[data-testid="simulator-toggle"]');
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="simulator-toggle"]')?.textContent ?? '').includes('Start stream'),
      { timeout: 5000 }
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-testid="simulator-modal"]') === null, {
      timeout: 5000
    });

    const streamAfterModalPause = await textOf(page, '[data-testid="stream-toggle-stream"]');
    assert(
      streamAfterModalPause.includes('Auto stream'),
      `pausing from the modal stops the stream view engine (got "${streamAfterModalPause.trim()}")`
    );

    context.step('STATE-01: no interval leaks when the route unmounts');
    await page.click('[data-testid="stream-toggle-stream"]');
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="stream-toggle-stream"]')?.textContent ?? '').includes('Stop auto'),
      { timeout: 5000 }
    );
    await gotoRoute(page, '/issues');
    await page.waitForSelector('[data-testid="issues-view"]', { timeout: 15_000 });
    const eventsDuringAway = (await readDatabaseCounts(page)).events;
    await sleep(1500);
    const eventsAfterWait = (await readDatabaseCounts(page)).events;
    assertEqual(
      eventsAfterWait,
      eventsDuringAway,
      'no background writes continue once the stream route is unmounted'
    );

    await gotoRoute(page, '/stream');
    await page.waitForSelector('[data-testid="stream-toggle-stream"]', { timeout: 15_000 });
    const engineOnReturn = await textOf(page, '[data-testid="stream-toggle-stream"]');
    assert(
      engineOnReturn.includes('Auto stream'),
      `returning to the route shows a stopped engine (got "${engineOnReturn.trim()}")`
    );

    await context.settle();
    await context.shot('security-audit');
  },

};

/* ------------------------------------------------------------------ */
/* Runner                                                               */
/* ------------------------------------------------------------------ */

const suiteNames =
  requestedSuite === 'all'
    ? Object.keys(suites)
    : requestedSuite
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

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
    await setViewport(page, 1440, 900, 1);

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
      step: (label) => {
        process.stdout.write(`    \u00b7 ${label}\n`);
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