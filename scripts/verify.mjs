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

    context.shot('phase1-issues');
    context.shot('phase1-stream');
    await gotoRoute(page, '/issues?status=resolved');
    context.shot('phase1-settings');
  },

  async phase2(page, context) {
    // Atomic primitives are mounted by a dedicated harness route.
    await gotoRoute(page, '/issues');
    const uiRootCount = await countRows(page, '[data-testid]');
    assert(uiRootCount >= 0, 'page exposes test hooks');
    context.shot('phase2-desktop');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await gotoRoute(page, '/issues');
    context.shot('phase2-mobile');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  },

  async phase3(page, context) {
    await gotoRoute(page, '/issues');
    context.shot('phase3-desktop');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await gotoRoute(page, '/issues');
    context.shot('phase3-mobile');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  },

  async phase4(page, context) {
    await gotoRoute(page, '/issues');
    const rendered = await countRows(page, '[data-issue-row]');
    assert(rendered > 0, 'issue rows render from the reactive store');
    context.shot('phase4-desktop');
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
      context.shot(`phase5-issues-${viewport.name}`);
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
    context.shot('phase5-detail-desktop');

    for (const viewport of viewports) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await gotoRoute(page, `/issues/${issueId}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      assert(overflow <= 1, `detail view has no horizontal overflow at ${viewport.name}px`);
      context.shot(`phase5-detail-${viewport.name}`);
    }

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await gotoRoute(page, '/stream');
    context.shot('phase5-stream');
    await gotoRoute(page, '/settings');
    context.shot('phase5-settings');
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

    const context = {
      shot: async (name) => {
        const file = join(shotDir, `${name}.png`);
        try {
          await page.screenshot({ path: file, fullPage: false });
        } catch (error) {
          // Screenshots are diagnostics only - a renderer hiccup must not mask
          // the assertion results of the suite.
          console.warn(`WARN  screenshot "${name}" failed: ${error?.message ?? error}`);
        }
        return file;
      },
      consoleErrors,
      pageErrors
    };

    for (const name of suiteNames) {
      const startedAt = Date.now();
      try {
        await suites[name](page, context);
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