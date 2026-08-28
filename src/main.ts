/**
 * Moon Phase widget for Even Realities G2 (Even Hub plugin).
 *
 * Layout on the 576x288 canvas:
 *   [z1] full-screen blank text container  — collects input (image-first pattern)
 *   [z2] 144x144 image container           — the moon disc
 *   [z3] text container on the right       — phase name, %, age, next full/new
 *
 * Tap = refresh now. Double-tap = exit (system confirm dialog, required on root).
 */

import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  ImageContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
  AppLocationAccuracy,
  OsEventTypeList,
  StartUpPageCreateResult,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';

import { getMoonPhase, type MoonPhase } from './moon';
import { renderMoonPng, drawMoon, litSide, MOON_IMG_SIZE } from './render';

// Dev-only on-device console: floating button overlays a real console,
// network and element inspector inside the Even app's WebView.
// Stripped from production builds automatically.
if (import.meta.env.DEV) {
  void import('eruda').then((eruda) => eruda.default.init());
}

/** Mirror status onto the companion page so failures are visible without a console. */
function setStatus(msg: string): void {
  const label = document.getElementById('moon-label');
  if (label) label.textContent = msg;
  console.log('[moonphase]', msg);
}

const IDS = {
  bg: { containerID: 1, containerName: 'bg' },
  moon: { containerID: 2, containerName: 'moon' },
  info: { containerID: 3, containerName: 'info' },
} as const;

const REFRESH_MS = 30 * 60 * 1000; // the moon moves ~0.7%/hour at most

let bridge: EvenAppBridge;
let latitude = 45; // northern-hemisphere default until we get a fix
let lastPct = -1;
let busy = false;

function infoText(phase: MoonPhase): string {
  const pct = Math.round(phase.fraction * 100);
  const trend = phase.waxing ? 'waxing' : 'waning';
  const next =
    phase.daysToFull <= phase.daysToNew
      ? `Full moon in ${phase.daysToFull.toFixed(1)} d`
      : `New moon in ${phase.daysToNew.toFixed(1)} d`;
  return [
    phase.phaseName,
    `${pct}% illuminated (${trend})`,
    `Moon age ${phase.ageDays.toFixed(1)} days`,
    next,
  ].join('\n');
}

async function refresh(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const phase = getMoonPhase(new Date());
    const pct = Math.round(phase.fraction * 100);

    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ ...IDS.info, content: infoText(phase) }),
    );

    // Only push pixels when the visible disc actually changed.
    if (pct !== lastPct) {
      const png = await renderMoonPng(phase, litSide(phase, latitude));
      const result = await bridge.updateImageRawData(
        new ImageRawDataUpdate({ ...IDS.moon, imageData: png }),
      );
      if (ImageRawDataUpdateResult.isSuccess(result)) {
        lastPct = pct;
      } else {
        console.warn('Moon image update failed:', result);
      }
    }

    updateCompanion(phase);
  } finally {
    busy = false;
  }
}

/**
 * Startup page, matching the pattern proven by working community apps
 * (e.g. Pong): no zOrderIndex — stacking comes from declaration order, with
 * the full-screen blank input-catcher declared first so image and info text
 * draw on top of it.
 *
 * Returned as a plain field object so the same layout can feed both
 * CreateStartUpPageContainer and the RebuildPageContainer fallback.
 */
function makeLayout() {
  return {
    containerTotalNum: 3,
    textObject: [
      new TextContainerProperty({
        containerID: IDS.bg.containerID,
        containerName: IDS.bg.containerName,
        content: ' ',
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        isEventCapture: 1,
        paddingLength: 0,
      }),
      new TextContainerProperty({
        containerID: IDS.info.containerID,
        containerName: IDS.info.containerName,
        content: 'Reading the sky...',
        xPosition: 190,
        yPosition: 88,
        width: 370,
        height: 130,
        isEventCapture: 0,
        paddingLength: 0,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: IDS.moon.containerID,
        containerName: IDS.moon.containerName,
        xPosition: 48,
        yPosition: 94,
        width: MOON_IMG_SIZE,
        height: MOON_IMG_SIZE,
      }),
    ],
  };
}

declare global {
  interface Window {
    /** Injected by the Even app host. The SDK copies it verbatim into
     *  `widgetId` on createStartUpPageContainer — and only on that call. */
    __EVEN_HUB_APP_ID__?: number;
  }
}

/**
 * Report (but never touch) the host-injected app id. The SDK sends it
 * verbatim as `widgetId`; fabricating one when it's missing gets the page
 * rejected as invalid(1) just as reliably as the real problem it papers over,
 * so the only useful thing to do is surface what we saw for diagnostics.
 */
function describeAppId(): string {
  const found = window.__EVEN_HUB_APP_ID__;
  return found === undefined ? 'host app id missing' : `host app id = ${String(found)}`;
}

async function main(): Promise<void> {
  setStatus('Waiting for the Even app bridge…');
  const timeoutWarning = setTimeout(
    () =>
      setStatus(
        'Bridge not detected after 10s. This page must run inside the Even app (Prototype Mode), and the glasses must be connected. A plain browser will wait here forever - that is normal.',
      ),
    10000,
  );
  bridge = await waitForEvenAppBridge();
  clearTimeout(timeoutWarning);
  const appIdNote = describeAppId();
  setStatus(`Bridge OK. ${appIdNote}. Creating glasses page…`);

  // createStartUpPageContainer is one-shot per glasses session: after any
  // WebView reload (HMR, refresh, resume) the session has already spent it and
  // a retry returns invalid(1) no matter how valid the page is. The documented
  // recovery is rebuildPageContainer, which redraws the same layout in place.
  const layout = makeLayout();
  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer(layout),
  );
  if (created !== StartUpPageCreateResult.success) {
    setStatus(
      `createStartUpPageContainer returned ${String(created)} ` +
        '(likely a reload of an existing session) - rebuilding page instead…',
    );
    const rebuilt = await bridge.rebuildPageContainer(new RebuildPageContainer(layout));
    if (!rebuilt) {
      setStatus(
        `Page setup failed: create returned ${String(created)} ` +
          '(1=invalid params, 2=oversize, 3=out of memory) and the rebuild ' +
          `fallback was rejected too (${appIdNote}). Re-scan the QR for a ` +
          'fresh session; if it still fails, the app was not launched through ' +
          'the Even app as a registered plugin.',
      );
      return;
    }
  }
  setStatus('Glasses page created. Getting location…');

  // Location is only used to orient the crescent (southern hemisphere sees
  // the moon flipped). City-level accuracy is plenty. Never fatal: hosts
  // without location support (e.g. the simulator) reject the call outright,
  // and the northern-hemisphere default is a fine fallback.
  try {
    const fix = await bridge.getAppLocation({
      accuracy: AppLocationAccuracy.Low,
      timeoutMs: 5000,
    });
    if (fix) latitude = fix.latitude;
  } catch (err) {
    console.warn('getAppLocation unavailable, keeping northern default:', err);
  }

  bridge.onEvenHubEvent((event) => {
    // Taps arrive as textEvent on hardware but as sysEvent in the simulator;
    // CLICK (0) is normalized to undefined either way, so accept both shapes.
    const source = event.textEvent ?? event.sysEvent;
    if (!source) return;
    switch (source.eventType) {
      case OsEventTypeList.CLICK_EVENT:
      case undefined: // SDK normalizes CLICK (0) to undefined in some paths
        void refresh();
        break;
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        void bridge.shutDownPageContainer(1); // system exit-confirm dialog
        break;
    }
  });

  await refresh();
  setInterval(() => void refresh(), REFRESH_MS);
}

/* ---------- companion (phone WebView) view ---------- */

function updateCompanion(phase: MoonPhase): void {
  const canvas = document.getElementById('moon-canvas') as HTMLCanvasElement | null;
  const label = document.getElementById('moon-label');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) drawMoon(ctx, canvas.width, phase, litSide(phase, latitude));
  }
  if (label) label.textContent = infoText(phase).replace(/\n/g, ' · ');
}

main().catch((err) => setStatus('moonphase crashed: ' + (err instanceof Error ? err.message : String(err))));
