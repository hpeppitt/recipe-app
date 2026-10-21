import {
  JPEG_DATA_URL_PREFIX,
  JPEG_QUALITIES,
  MAX_ENCODED_BYTES,
  MAX_LONG_SIDE_PX,
  MAX_SOURCE_PIXELS,
  base64ByteLength,
  planDownscale,
  type ImageAttachment,
} from '../lib/imageAttachments';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The photo could not be decoded'));
    img.src = src;
  });
}

/** Shrink steps for `shrinkToFit`: each pass is 80% of the last, at this quality, down to this long side. */
const SHRINK_FACTOR = 0.8;
const SHRINK_QUALITY = 0.5;
const SHRINK_MIN_SIDE_PX = 200;

/**
 * Decodes a photo, draws it at `planDownscale` size on white (so PNG and WebP
 * transparency is not black), and encodes it as JPEG of at most `maxBytes` decoded bytes.
 * With `shrinkToFit`, a photo still too large after `JPEG_QUALITIES` is redrawn at 80%
 * per step, quality 0.5, until it fits or its long side would drop under 200px.
 * Browser only: needs a canvas. Validate the file with `validateImageFile` first.
 */
export async function downscaleToJpeg(
  file: File,
  {
    maxSide = MAX_LONG_SIDE_PX,
    maxBytes = MAX_ENCODED_BYTES,
    shrinkToFit = false,
  }: { maxSide?: number; maxBytes?: number; shrinkToFit?: boolean } = {}
): Promise<ImageAttachment> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement | null = null;
  const canvas = document.createElement('canvas');
  try {
    img = await loadImage(url);
    if (img.naturalWidth * img.naturalHeight > MAX_SOURCE_PIXELS) {
      throw new Error('The photo has too many pixels to downscale safely');
    }
    const source = img;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas context');
    const draw = (width: number, height: number) => {
      // Resizing the canvas resets its state, fill style included.
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(source, 0, 0, width, height);
    };
    // The base64, or null when the browser silently returned PNG (it cannot encode JPEG).
    const encode = (quality: number) => {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      return dataUrl.startsWith(JPEG_DATA_URL_PREFIX) ? dataUrl.slice(JPEG_DATA_URL_PREFIX.length) : null;
    };

    let { width, height } = planDownscale(img.naturalWidth, img.naturalHeight, maxSide);
    draw(width, height);
    for (const quality of JPEG_QUALITIES) {
      const base64 = encode(quality);
      if (base64 === null) throw new Error('The browser cannot encode JPEG');
      if (base64ByteLength(base64) <= maxBytes) return { mimeType: 'image/jpeg', base64 };
    }
    while (shrinkToFit && Math.max(width, height) * SHRINK_FACTOR >= SHRINK_MIN_SIDE_PX) {
      width = Math.max(1, Math.round(width * SHRINK_FACTOR));
      height = Math.max(1, Math.round(height * SHRINK_FACTOR));
      draw(width, height);
      const base64 = encode(SHRINK_QUALITY);
      if (base64 === null) throw new Error('The browser cannot encode JPEG');
      if (base64ByteLength(base64) <= maxBytes) return { mimeType: 'image/jpeg', base64 };
    }
    throw new Error('The photo is still too large after downscaling');
  } finally {
    URL.revokeObjectURL(url);
    // Release the decoded bitmap and the canvas backing store now, not at GC.
    if (img) img.src = '';
    canvas.width = 0;
    canvas.height = 0;
  }
}
