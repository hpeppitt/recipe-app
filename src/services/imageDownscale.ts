import {
  JPEG_QUALITIES,
  MAX_ENCODED_BYTES,
  MAX_SOURCE_PIXELS,
  base64ByteLength,
  planDownscale,
  type ImageAttachment,
} from '../lib/imageAttachments';

const JPEG_PREFIX = 'data:image/jpeg;base64,';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The photo could not be decoded'));
    img.src = src;
  });
}

/**
 * Decodes a photo, draws it at `planDownscale` size on white (so PNG and WebP
 * transparency is not black), and encodes it as JPEG under `MAX_ENCODED_BYTES`.
 * Browser only: needs a canvas. Validate the file with `validateImageFile` first.
 */
export async function downscaleToJpeg(file: File): Promise<ImageAttachment> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement | null = null;
  const canvas = document.createElement('canvas');
  try {
    img = await loadImage(url);
    if (img.naturalWidth * img.naturalHeight > MAX_SOURCE_PIXELS) {
      throw new Error('The photo has too many pixels to downscale safely');
    }
    const { width, height } = planDownscale(img.naturalWidth, img.naturalHeight);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas context');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of JPEG_QUALITIES) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      // A browser that cannot encode JPEG silently returns PNG instead.
      if (!dataUrl.startsWith(JPEG_PREFIX)) break;
      const base64 = dataUrl.slice(JPEG_PREFIX.length);
      if (base64ByteLength(base64) <= MAX_ENCODED_BYTES) return { mimeType: 'image/jpeg', base64 };
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
