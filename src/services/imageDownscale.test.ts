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

  it('rejects when the browser returns PNG instead of JPEG', async () => {
    toDataURL.mockReturnValue('data:image/png;base64,AAAA');

    await expect(downscaleToJpeg(file)).rejects.toThrow();
  });
});
