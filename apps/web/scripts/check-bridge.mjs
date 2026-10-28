// Starts the built Next app, opens the play page in headless Chromium and verifies the bridge handshake end to end.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const port = 3100 + Math.floor(Math.random() * 500);
const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port)], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
server.stdout.on('data', (d) => (serverOut += d));
server.stderr.on('data', (d) => (serverOut += d));
const stop = () => { try { server.kill('SIGTERM'); } catch {} };
process.on('exit', stop);
const url = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try { const r = await fetch(url); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let ok = false;
try {
  await page.goto(`${url}/play/sample?mode=preview&seed=7`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="status"]:has-text("ready")', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click('[data-testid="request-state"]');
  await page.waitForSelector('[data-testid="state"]', { timeout: 5000 });
  const stateText = await page.textContent('[data-testid="state"]');
  const tick = Number(/tick (\d+)/.exec(stateText ?? '')?.[1] ?? 0);
  ok = tick > 30 && errors.length === 0;
  console.log(JSON.stringify({ ok, stateText, errors }, null, 2));
} catch (e) {
  console.error('check-bridge failed:', e.message);
  try { console.error('status text:', await page.textContent('[data-testid="status"]')); } catch {}
  console.error(serverOut.slice(-2000));
} finally {
  await browser.close();
  stop();
}
process.exit(ok ? 0 : 1);
