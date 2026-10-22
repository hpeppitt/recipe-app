import { FEEDBACK_SCREENSHOT_MAX } from '../lib/feedback';
import { JPEG_DATA_URL_PREFIX, maxBytesForDataUrl } from '../lib/imageAttachments';
import { downscaleToJpeg } from './imageDownscale';

export const CAPTURE_TIMEOUT_MS = 3000;
const SHOT_OPTIONS = { maxSide: 1024, maxBytes: maxBytesForDataUrl(FEEDBACK_SCREENSHOT_MAX), shrinkToFit: true };

/**
 * Captures the page as a JPEG data URL within FEEDBACK_SCREENSHOT_MAX, or null when it cannot
 * (blocked image, over 3 s, a phone with 1 GB or less of memory, any error). Never throws and
 * never logs the image. html-to-image is a dynamic import so only users who tap Feedback load it.
 */
export async function capturePage(exclude: Element | null): Promise<string | null> {
  // deviceMemory is Chromium only; iOS Safari does not report it, so there it is a plain try.
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory <= 1) return null;
  const work = (async () => {
    const { toBlob } = await import('html-to-image');
    // The viewport, not the whole page: size it and shift the clone by the window scroll. Dark mode needs the
    // body's own background. shortcut: an inner scroller (two-pane desktop) renders at scrollTop 0, check on device.
    const blob = await toBlob(document.body, {
      pixelRatio: 1,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
      filter: (node) => node !== exclude,
    });
    if (!blob) return null;
    const { base64 } = await downscaleToJpeg(new File([blob], 'page.png', { type: blob.type }), SHOT_OPTIONS);
    return JPEG_DATA_URL_PREFIX + base64;
  })();
  work.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
