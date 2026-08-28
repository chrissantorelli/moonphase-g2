/**
 * Hello world for Even G2 — the smallest thing that can possibly render.
 *
 * One text container. No image container, no zOrderIndex, no location,
 * no timers, no dynamic imports. If this doesn't render on glass, the
 * problem is the session/environment, not the page config.
 *
 * Tap = increment counter. Double-tap = exit.
 */

import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  StartUpPageCreateResult,
  OsEventTypeList,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';

const CONTAINER_ID = 1;
const CONTAINER_NAME = 'main';

let bridge: EvenAppBridge;
let taps = 0;

/** Mirror status onto the phone page — the only debug channel that always works. */
function status(msg: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  console.log('[hello]', msg);
}

async function main(): Promise<void> {
  status('Waiting for bridge…');
  bridge = await waitForEvenAppBridge();
  status('Bridge OK. Creating page…');

  // Same container set for create and for the rebuild fallback.
  const layout = {
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        content: 'Hello from G2',
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        isEventCapture: 1,
        paddingLength: 0,
      }),
    ],
  };

  // createStartUpPageContainer is one-shot per glasses session. After any
  // WebView reload (HMR, refresh, resume) the session has already spent it and
  // the retry is rejected with invalid(1) — rebuildPageContainer is the
  // documented recovery: it redraws the same layout on the live session.
  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer(layout),
  );

  if (result !== StartUpPageCreateResult.success) {
    status(
      `createStartUpPageContainer returned ${String(result)} ` +
        '(likely a reload of an existing session) — rebuilding page instead…',
    );
    const rebuilt = await bridge.rebuildPageContainer(new RebuildPageContainer(layout));
    if (!rebuilt) {
      status(
        `FAILED: create returned ${String(result)} ` +
          '(0=success, 1=invalid params, 2=oversize, 3=out of memory) and the ' +
          'rebuild fallback was rejected too. Re-scan the QR for a fresh session.',
      );
      return;
    }
  }

  status('SUCCESS — "Hello from G2" should be on the glasses now. Tap to count.');

  bridge.onEvenHubEvent((event) => {
    // Taps arrive as textEvent on hardware but as sysEvent in the simulator;
    // CLICK (0) is normalized to undefined either way, so accept both shapes.
    const source = event.textEvent ?? event.sysEvent;
    if (!source) return;
    const type = source.eventType;
    if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      void bridge.shutDownPageContainer(1);
      return;
    }
    if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
      taps += 1;
      void bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: CONTAINER_ID,
          containerName: CONTAINER_NAME,
          content: `Hello from G2\n\nTaps: ${taps}`,
        }),
      );
      status(`Tap ${taps} sent to glasses.`);
    }
  });
}

main().catch((err) => {
  status('CRASHED: ' + (err instanceof Error ? err.message : String(err)));
});
