import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_SOURCE_BYTES,
  attachmentErrorMessage,
  base64ByteLength,
  planDownscale,
  redactInlineData,
  validateImageFile,
} from './imageAttachments';

const none = { inMessage: 0, inChat: 0 };

describe('validateImageFile', () => {
  it.each(ACCEPTED_IMAGE_TYPES)('accepts %s', (type) => {
    expect(validateImageFile({ type, size: 1000 }, none)).toEqual({ ok: true });
  });

  it.each(['image/heic', 'image/gif', ''])('rejects %j as type', (type) => {
    expect(validateImageFile({ type, size: 1000 }, none)).toEqual({ ok: false, reason: 'type' });
  });

  it('accepts a file at the size cap and rejects one byte over', () => {
    expect(validateImageFile({ type: 'image/png', size: MAX_SOURCE_BYTES }, none)).toEqual({ ok: true });
    expect(validateImageFile({ type: 'image/png', size: MAX_SOURCE_BYTES + 1 }, none)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('rejects the fourth image in a message', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1 }, { inMessage: 2, inChat: 2 })).toEqual({ ok: true });
    expect(validateImageFile({ type: 'image/jpeg', size: 1 }, { inMessage: 3, inChat: 3 })).toEqual({
      ok: false,
      reason: 'message-limit',
    });
  });

  it('rejects the seventh image in a chat', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1 }, { inMessage: 0, inChat: 5 })).toEqual({ ok: true });
    expect(validateImageFile({ type: 'image/jpeg', size: 1 }, { inMessage: 0, inChat: 6 })).toEqual({
      ok: false,
      reason: 'chat-limit',
    });
  });
});

describe('planDownscale', () => {
  it('scales a landscape photo to a 1024 long side', () => {
    expect(planDownscale(4000, 3000)).toEqual({ width: 1024, height: 768 });
  });

  it('scales a portrait photo to a 1024 long side', () => {
    expect(planDownscale(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });

  it('scales a square photo', () => {
    expect(planDownscale(2048, 2048)).toEqual({ width: 1024, height: 1024 });
  });

  it('leaves an already small photo unchanged', () => {
    expect(planDownscale(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('keeps an extreme ratio at least 1px high', () => {
    expect(planDownscale(4000, 10)).toEqual({ width: 1024, height: 3 });
    expect(planDownscale(100000, 10).height).toBe(1);
  });

  it('returns integers for an odd ratio', () => {
    const { width, height } = planDownscale(3001, 1999);
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true);
  });
});

describe('base64ByteLength', () => {
  it('counts bytes with no padding', () => {
    expect(base64ByteLength(btoa('abc'))).toBe(3);
  });

  it('counts bytes with one padding character', () => {
    expect(btoa('ab')).toMatch(/[^=]=$/);
    expect(base64ByteLength(btoa('ab'))).toBe(2);
  });

  it('counts bytes with two padding characters', () => {
    expect(btoa('a')).toMatch(/==$/);
    expect(base64ByteLength(btoa('a'))).toBe(1);
  });

  it('is zero for an empty string', () => {
    expect(base64ByteLength('')).toBe(0);
  });
});

describe('attachmentErrorMessage', () => {
  it('has the copy for every reason', () => {
    expect(attachmentErrorMessage('type')).toBe('Use a JPEG, PNG or WebP photo.');
    expect(attachmentErrorMessage('too-large')).toBe('That photo is too large. Try a smaller one.');
    expect(attachmentErrorMessage('message-limit')).toBe('You can add up to 3 photos at a time.');
    expect(attachmentErrorMessage('chat-limit')).toBe(
      'This chat already has 6 photos. Start a new recipe to use more.'
    );
    expect(attachmentErrorMessage('encode')).toBe("That photo couldn't be read. Try another one.");
  });
});

describe('redactInlineData', () => {
  const run = 'QUJD'.repeat(75);

  it('replaces a long base64 run in the message and stack, without mutating the original', () => {
    const err = new Error(`failed: ${run} end`);
    const out = redactInlineData(err) as Error;

    expect(out).not.toBe(err);
    expect(out.message).toBe('failed: [redacted] end');
    expect(out.stack ?? '').not.toContain(run);
    expect(out.name).toBe('Error');
    expect(err.message).toContain(run);
  });

  it('returns an ordinary error as the same object', () => {
    const err = new Error('Failed to fetch');
    expect(redactInlineData(err)).toBe(err);
  });

  it('leaves a run shorter than 200 characters alone', () => {
    const err = new Error('x'.repeat(199));
    expect(redactInlineData(err)).toBe(err);
  });

  it('redacts a thrown string and passes other values through', () => {
    expect(redactInlineData(`oops ${run}`)).toBe('oops [redacted]');
    const obj = { code: 1 };
    expect(redactInlineData(obj)).toBe(obj);
  });
});
