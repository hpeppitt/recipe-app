// @vitest-environment jsdom
// jsdom has no canvas or image decoder, so both are stubbed: this covers the
// control flow (sizes, white fill, quality retry, caps, object URL revoke), not
// real decoding or JPEG output. Those are checked in the RL-119 browser QA.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_ENCODED_BYTES } from '../lib/imageAttachments';
import { downscaleToJpeg } from './imageDownscale';

const createObjectURL = vi.fn(() => 'blob:photo');
const revokeObjectURL = vi.fn();
let decode: 'ok' | 'error' = 'ok';

class FakeImage {
  naturalWidth = 4000;
  naturalHeight = 3000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    if (value) queueMicrotask(() => (decode === 'ok' ? this.onload?.() : this.onerror?.()));
  }
}

const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
const toDataURL = vi.fn();
const file = new File(['x'], 'photo.png', { type: 'image/png' });
const ofBytes = (n: number) => 'data:image/jpeg;base64,' + 'A'.repeat((n / 3) * 4);

beforeEach(() => {
  decode = 'ok';
  vi.stubGlobal('Image', FakeImage);
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('downscaleToJpeg', () => {
  it('draws on white at the planned size, encodes at 0.8 and revokes the URL', async () => {
    toDataURL.mockReturnValue(ofBytes(3000));

    const out = await downscaleToJpeg(file);

    expect(out).toEqual({ mimeType: 'image/jpeg', base64: 'A'.repeat(4000) });
    expect(ctx.fillStyle).toBe('#ffffff');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1024, 768);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 768);
    expect(toDataURL.mock.calls).toEqual([['image/jpeg', 0.8]]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });

  it('retries at 0.6 when 0.8 is over the cap', async () => {
    toDataURL.mockReturnValueOnce(ofBytes(MAX_ENCODED_BYTES + 3)).mockReturnValueOnce(ofBytes(3000));

    await expect(downscaleToJpeg(file)).resolves.toMatchObject({ mimeType: 'image/jpeg' });
    expect(toDataURL.mock.calls).toEqual([['image/jpeg', 0.8], ['image/jpeg', 0.6]]);
  });

  it('rejects and revokes when still over the cap at 0.6', async () => {
    toDataURL.mockReturnValue(ofBytes(MAX_ENCODED_BYTES + 3));

    await expect(downscaleToJpeg(file)).rejects.toThrow();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });

  it('rejects and revokes when the photo cannot be decoded', async () => {
    decode = 'error';

    await expect(downscaleToJpeg(file)).rejects.toThrow();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });

  it('rejects a photo over MAX_SOURCE_PIXELS before drawing, and revokes', async () => {
    vi.stubGlobal(
      'Image',
      class extends FakeImage {
        naturalWidth = 10000;
        naturalHeight = 6001;
      }
    );

    await expect(downscaleToJpeg(file)).rejects.toThrow(/too many pixels/);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });

  it('accepts a photo at MAX_SOURCE_PIXELS', async () => {
    vi.stubGlobal(
      'Image',
      class extends FakeImage {
        naturalWidth = 10000;
        naturalHeight = 6000;
      }
    );
    toDataURL.mockReturnValue(ofBytes(3000));

    await expect(downscaleToJpeg(file)).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('takes maxSide and maxBytes options', async () => {
    toDataURL.mockReturnValueOnce(ofBytes(3003)).mockReturnValueOnce(ofBytes(3000));

    await expect(downscaleToJpeg(file, { maxSide: 800, maxBytes: 3000 })).resolves.toMatchObject({ mimeType: 'image/jpeg' });
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
    expect(toDataURL.mock.calls).toEqual([['image/jpeg', 0.8], ['image/jpeg', 0.6]]);
  });

  it('rejects when still over a custom maxBytes', async () => {
    toDataURL.mockReturnValue(ofBytes(3003));

    await expect(downscaleToJpeg(file, { maxBytes: 3000 })).rejects.toThrow(/too large/);
  });

  it('with shrinkToFit, redraws at 80% per step at quality 0.5 until it fits', async () => {
    // Stays over the cap until the canvas is 600px wide or less.
    toDataURL.mockImplementation(function (this: HTMLCanvasElement) {
      return this.width <= 600 ? ofBytes(3000) : ofBytes(3003);
    });

    await expect(downscaleToJpeg(file, { maxSide: 800, maxBytes: 3000, shrinkToFit: true })).resolves.toMatchObject({ mimeType: 'image/jpeg' });
    expect(ctx.drawImage.mock.calls.map((c) => [c[3], c[4]])).toEqual([[800, 600], [640, 480], [512, 384]]);
    expect(toDataURL.mock.calls).toEqual([['image/jpeg', 0.8], ['image/jpeg', 0.6], ['image/jpeg', 0.5], ['image/jpeg', 0.5]]);
    expect(ctx.fillRect).toHaveBeenLastCalledWith(0, 0, 512, 384);
  });

  it('with shrinkToFit, gives up before the long side drops under 200px', async () => {
    toDataURL.mockReturnValue(ofBytes(3003));

    await expect(downscaleToJpeg(file, { maxSide: 800, maxBytes: 3000, shrinkToFit: true })).rejects.toThrow(/too large/);
    const sides = ctx.drawImage.mock.calls.map((c) => c[3] as number);
    expect(sides).toEqual([800, 640, 512, 410, 328, 262, 210]);
  });

  it('without shrinkToFit, does not redraw smaller', async () => {
    toDataURL.mockReturnValue(ofBytes(3003));

    await expect(downscaleToJpeg(file, { maxBytes: 3000 })).rejects.toThrow(/too large/);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledTimes(2);
  });

  it('rejects when the browser returns PNG instead of JPEG', async () => {
    toDataURL.mockReturnValue('data:image/png;base64,AAAA');

    await expect(downscaleToJpeg(file)).rejects.toThrow();
  });
});
