// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Avatar } from './Avatar';

const draw = (photoURL?: string | null) =>
  renderWithProviders(
    <Avatar uid="u1" name="Ada Lovelace" photoType="uploaded" photoURL={photoURL} />
  ).container;

describe('Avatar photoURL', () => {
  it('renders the img for a data:image URL', () => {
    const c = draw('data:image/jpeg;base64,AAAA');
    expect(c.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
  });

  it.each([
    ['https', 'https://evil.example/a.png'],
    ['http', 'http://evil.example/a.png'],
    ['javascript', 'javascript:alert(1)'],
    ['data text', 'data:text/html,<b>x</b>'],
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
  ])('falls through to initials for %s', (_n, url) => {
    const c = draw(url);
    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toBe('AL');
  });

  it('falls through to initials for an uploaded type with a non-data URL even if an emoji is set', () => {
    const { container } = render(
      <Avatar uid="u1" name="Ada Lovelace" photoType="uploaded" photoURL="https://x.y/z.png" photoEmoji="🍕" />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('AL');
  });

  it('renders the emoji for an emoji type even with an https photoURL', () => {
    const { container } = render(
      <Avatar uid="u1" name="Ada" photoType="emoji" photoEmoji="🍕" photoURL="https://x.y/z.png" />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('🍕');
  });

  it.each(['generated', 'emoji'] as const)('renders no img for %s type with a data URL', (photoType) => {
    const { container } = render(
      <Avatar uid="u1" name="Ada Lovelace" photoType={photoType} photoURL="data:image/jpeg;base64,AAAA" />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('is case-sensitive: DATA:image/ falls through', () => {
    const c = draw('DATA:image/jpeg;base64,AAAA');
    expect(c.querySelector('img')).toBeNull();
  });
});
