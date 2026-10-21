// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { CreatePage } from './CreatePage';

const taste = vi.hoisted(() => ({ avoids: [] as string[], tendToChange: [] as string[], loading: false, loadFailed: false, cooks: [] as unknown[] }));
vi.mock('../hooks/useTasteProfile', () => ({
  useTasteProfile: (cooks: unknown[]) => {
    taste.cooks = cooks;
    return taste;
  },
}));

function Probe() {
  const { pathname, state } = useLocation();
  return <output data-testid="probe">{`${pathname}|${JSON.stringify(state)}`}</output>;
}

const render = () =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/new" element={<CreatePage />} />
        <Route path="*" element={null} />
      </Routes>
      <Probe />
    </>,
    { route: '/new' }
  );

const probe = () => screen.getByTestId('probe').textContent;
const live = () => document.querySelector('p[role="status"]')!.textContent;
const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('CreatePage', () => {
  beforeEach(() => Object.assign(taste, { avoids: [], tendToChange: [], loading: false, loadFailed: false }));

  it('starts at the first options, with the hint describing each word', () => {
    render();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('I want something quick with chickpeas for two.');
    const hint = screen.getByText('Tap the underlined words');
    for (const name of ['quick', 'chickpeas', 'two']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-describedby')).toBe(hint.id);
    }
    expect(live()).toBe('');
  });

  it('cycles each word and announces only the new word', () => {
    render();
    tap('quick');
    expect(live()).toBe('one-pan');
    tap('chickpeas');
    expect(live()).toBe('salmon');
    tap('two');
    expect(live()).toBe('a crowd');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('I want something one-pan with salmon for a crowd.');
    tap('one-pan');
    tap('slow-cooked');
    expect(screen.getByRole('button', { name: 'quick' })).toBeTruthy();
  });

  it('Write it hands the built prompt to /create', () => {
    render();
    tap('quick');
    tap('chickpeas');
    tap('two');
    tap('Write it');
    expect(probe()).toBe('/create|{"suggestion":"Something one-pan with salmon for a crowd"}');
  });

  it('Describe it my own way opens /search', () => {
    render();
    tap('Describe it my own way');
    expect(probe()).toBe('/search|null');
  });

  it('shows two import tiles instead of the old link row (RL-250)', () => {
    render();
    expect(screen.queryByText('Add from a link')).toBeNull();
    expect(screen.getByRole('link', { name: /Paste a link/ }).getAttribute('href')).toBe('/import');
    expect(screen.getByRole('link', { name: /Snap a page/ }).getAttribute('href')).toBe('/import?mode=photo');
    fireEvent.click(screen.getByRole('link', { name: /Snap a page/ }));
    expect(probe()).toBe('/import|null');
  });

  it('hides both tiles in local-only mode', () => {
    renderWithProviders(<CreatePage />, { route: '/new', auth: { isConfigured: false } });
    expect(screen.queryByRole('link', { name: /Paste a link/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Snap a page/ })).toBeNull();
  });

  // jsdom has no layout, so this pins the classes: overflow-hidden would turn the page into the
  // sticky scroller and a consent banner could push the actions under the nav again.
  it('keeps the actions sticky above the nav and the words at a 44px hit height', () => {
    render();
    const actions = screen.getByTestId('create-actions');
    expect(actions.className).toContain('sticky');
    expect(actions.className).toContain('bottom-[calc(78px_+_max(8px,env(safe-area-inset-bottom)))]');
    expect(actions.parentElement!.className).toContain('overflow-clip');
    expect(actions.parentElement!.className).not.toContain('overflow-hidden');
    expect(screen.getByRole('button', { name: 'quick' }).className).toMatch(/inline-block.*py-1 -my-1/);
  });

  describe('profile terms (RL-235)', () => {
    const withTerms = () => {
      Object.assign(taste, { avoids: ['Peanuts', 'Pork'], tendToChange: ['Quicker'] });
      return render();
    };

    it('shows avoids and under 30 min as bold buttons, read without cooks', () => {
      withTerms();
      expect(taste.cooks).toEqual([]);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        'I want something quick with chickpeas for two, no peanuts, no pork, under 30 min.'
      );
      const b = screen.getByRole('button', { name: 'Drop no peanuts for this recipe' });
      expect(b.querySelector('.font-semibold')?.textContent).toBe('no peanuts');
      expect(b.className).toMatch(/inline-block.*py-1 -my-1/);
      expect(live()).toBe('');
      tap('Write it');
      expect(probe()).toBe('/create|{"suggestion":"Something quick with chickpeas for two, no peanuts, no pork, under 30 min"}');
    });

    it('a dropped term is struck through, left out of the prompt and passed as dropAvoids, and can be kept again', () => {
      withTerms();
      tap('Drop no peanuts for this recipe');
      tap('Drop under 30 min for this recipe');
      const off = screen.getByRole('button', { name: 'Keep no peanuts' });
      expect(off.className).toContain('line-through');
      expect(live()).toBe('under 30 min dropped');
      tap('Write it');
      expect(probe()).toBe('/create|{"suggestion":"Something quick with chickpeas for two, no pork","dropAvoids":["Peanuts"]}');
    });

    it('tapping a dropped term keeps it again', () => {
      withTerms();
      tap('Drop no pork for this recipe');
      tap('Keep no pork');
      expect(live()).toBe('no pork kept');
      expect(screen.getByRole('button', { name: 'Drop no pork for this recipe' }).className).not.toContain('line-through');
      tap('Write it');
      expect(probe()).toBe('/create|{"suggestion":"Something quick with chickpeas for two, no peanuts, no pork, under 30 min"}');
    });

    it('drops reset on the next visit', () => {
      const first = withTerms();
      tap('Drop no peanuts for this recipe');
      first.unmount();
      withTerms();
      expect(screen.getByRole('button', { name: 'Drop no peanuts for this recipe' })).toBeTruthy();
    });

    it('shows no terms while loading or after a failed read', () => {
      Object.assign(taste, { avoids: ['Peanuts'], tendToChange: ['Quicker'], loadFailed: true });
      const r = render();
      expect(screen.queryByRole('button', { name: /no peanuts/ })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      r.unmount();
      Object.assign(taste, { loadFailed: false, loading: true });
      render();
      expect(screen.queryByRole('button', { name: /under 30 min/ })).toBeNull();
    });
  
    it('shows three terms, then +N more expands the rest and focuses the first revealed; Write it uses all kept terms', () => {
      Object.assign(taste, { avoids: ['Peanuts', 'Pork', 'Fish', 'Dairy'], tendToChange: ['Quicker'] });
      render();
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        'I want something quick with chickpeas for two, no peanuts, no pork, no fish, +2 more.'
      );
      expect(screen.queryByRole('button', { name: /no dairy/ })).toBeNull();
      tap('Show 2 more');
      expect(screen.queryByRole('button', { name: 'Show 2 more' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Drop no dairy for this recipe' }));
      expect(screen.getByRole('button', { name: 'Drop under 30 min for this recipe' })).toBeTruthy();
    });

    it('Write it uses the terms behind +N more too', () => {
      Object.assign(taste, { avoids: ['Peanuts', 'Pork', 'Fish', 'Dairy'], tendToChange: ['Quicker'] });
      render();
      tap('Write it');
      expect(probe()).toBe('/create|{"suggestion":"Something quick with chickpeas for two, no peanuts, no pork, no fish, no dairy, under 30 min"}');
    });
  });
});
