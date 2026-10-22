// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePage } from './pageCapture';

const mocks = vi.hoisted(() => ({ toBlob: vi.fn(), downscale: vi.fn() }));
vi.mock('html-to-image', () => ({ toBlob: mocks.toBlob }));
vi.mock('./imageDownscale', () => ({ downscaleToJpeg: mocks.downscale }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  mocks.toBlob.mockReset();
  mocks.downscale.mockReset();
});

describe('capturePage', () => {
  it('returns a JPEG data URL and filters out the excluded node', async () => {
    const tab = document.createElement('button');
    mocks.toBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    mocks.downscale.mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QUJD' });
    expect(await capturePage(tab)).toBe('data:image/jpeg;base64,QUJD');
    const opts = mocks.toBlob.mock.calls[0][1];
    expect(opts.pixelRatio).toBe(1);
    expect(opts.filter(tab)).toBe(false);
    expect(opts.filter(document.body)).toBe(true);
  });
  it('returns null when the library throws', async () => {
    mocks.toBlob.mockRejectedValue(new Error('tainted'));
    expect(await capturePage(null)).toBeNull();
  });
  it('returns null after 3 s', async () => {
    vi.useFakeTimers();
    mocks.toBlob.mockReturnValue(new Promise(() => {}));
    const p = capturePage(null);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBeNull();
  });
  it('skips the capture on a 1 GB phone', async () => {
    vi.stubGlobal('navigator', { deviceMemory: 1 });
    expect(await capturePage(null)).toBeNull();
    expect(mocks.toBlob).not.toHaveBeenCalled();
  });
});
