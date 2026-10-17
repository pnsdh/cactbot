// Shared pieces of the dev tools: a headless browser, overlay pages of the built cactbot (dist/)
// with OverlayPlugin's API mocked, and small helpers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// CHROME: the browser to drive (any recent Chrome); CHROME95: a Chromium 95, the engine of the
// original OverlayPlugin, for checking what it still has to draw.
export const chromePath = () =>
  process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const chrome95Path = () => process.env.CHROME95;

// The player the replays play as (some triggers only fire for them): CACTBOT_PLAYER and
// CACTBOT_PLAYER_ID (hex), CACTBOT_JOB.
export const player = () => ({
  name: process.env.CACTBOT_PLAYER ?? 'Tester',
  id: parseInt(process.env.CACTBOT_PLAYER_ID ?? '10000001', 16),
  job: process.env.CACTBOT_JOB ?? 'WAR',
});

const kPages = {
  raidboss: 'ui/raidboss/raidboss.html',
  config: 'ui/config/config.html',
  oopsy: 'ui/oopsyraidsy/oopsyraidsy.html',
};

// A built page: by name from dist/, or a full URL (e.g. an installed copy to compare against).
export const pageUrl = (page) =>
  /^[a-z]+:/i.test(page)
    ? page
    : pathToFileURL(path.join(repoRoot, 'dist', kPages[page] ?? page)).href;

export const outDir = (name) => {
  const dir = path.join(repoRoot, 'dev', 'out', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const launch = (options = {}) =>
  puppeteer.launch({
    executablePath: options.chrome ?? chromePath(),
    headless: true,
    args: [
      '--allow-file-access-from-files',
      '--autoplay-policy=no-user-gesture-required',
      ...(options.args ?? []),
    ],
  });

// OverlayPlugin's API as cactbot uses it: user files and saved options (`data`, as in
// cactbotLoadData), and no combatants.
export const mockOverlayPlugin = (page, data = {}) =>
  page.evaluateOnNewDocument((data) => {
    window.OverlayPluginApi = {
      ready: true,
      callHandler: (msgStr, cb) => {
        const m = JSON.parse(msgStr);
        let r = {};
        if (m.call === 'cactbotLoadUser') {
          r = {
            detail: {
              userLocation: 'C:/dev',
              localUserFiles: {},
              parserLanguage: 'ko',
              displayLanguage: 'ko',
              systemLocale: 'ko-KR',
              cactbotVersion: '0',
              overlayPluginVersion: '0',
              ffxivPluginVersion: '0',
              actVersion: '0',
              gameRegion: 'Korean',
            },
          };
        } else if (m.call === 'cactbotLoadData') {
          r = { data: data };
        } else if (m.call === 'getCombatants') {
          r = { combatants: [] };
        }
        if (cb)
          setTimeout(() => cb(JSON.stringify(r)), 0);
      },
    };
  }, data);

// A page with the mock, loaded and settled (user options and skin applied).
export const openPage = async (browser, page, options = {}) => {
  const p = await browser.newPage();
  await p.setViewport(options.viewport ?? { width: 490, height: 300 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await mockOverlayPlugin(p, options.data ?? { raidboss: { Skin: 'cbkr' } });
  if (options.beforeLoad)
    await options.beforeLoad(p);
  const url = pageUrl(page);
  await p.goto(options.query ? `${url}?${options.query}` : url, { waitUntil: 'load' });
  if (options.background !== null)
    await p.evaluate((bg) => document.body.style.background = bg, options.background ?? '#2a3340');
  await wait(options.settleMs ?? 2500);
  return { page: p, errors };
};

export const send = (page, event) => page.evaluate((e) => window.__OverlayCallback(e), event);

// The events a fight starts with: the player, the zone, combat.
// raidboss loads nothing for a zone without a name.
export const startFight = async (page, zoneId, zoneName = `zone ${zoneId}`) => {
  const me = player();
  await send(page, {
    type: 'onPlayerChangedEvent',
    detail: {
      id: me.id,
      name: me.name,
      job: me.job,
      level: 100,
      currentHP: 1,
      maxHP: 1,
      currentMP: 1,
      maxMP: 1,
      currentCP: 0,
      maxCP: 0,
      currentGP: 0,
      maxGP: 0,
      currentShield: 0,
      pos: { x: 0, y: 0, z: 0 },
      rotation: 0,
      bait: 0,
      debugJob: '',
      jobDetail: null,
    },
  });
  await send(page, { type: 'ChangeZone', zoneID: zoneId, zoneName: zoneName });
  await wait(1500);
  await send(page, {
    type: 'onInCombatChangedEvent',
    detail: { inACTCombat: true, inGameCombat: true },
  });
};

// Log lines, all at once (the timeline syncs to the last ones).
export const sendLines = (page, lines) =>
  page.evaluate((lines) => {
    for (const raw of lines)
      window.__OverlayCallback({ type: 'LogLine', line: raw.split('|'), rawLine: raw });
  }, lines);

export const nextFrames = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Chrome's performance counters, for differences over a stretch of time.
export const perfMetrics = async (cdp) =>
  Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
  );
