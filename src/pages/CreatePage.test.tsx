// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { CreatePage } from './CreatePage';

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
const live = () => document.querySelector('[aria-live="polite"]')!.textContent;
const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('CreatePage', () => {
  it('starts at the first options, with the hint describing each word', () => {
    render();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('I want something quick with chickpeas for two.');
    const hint = screen.getByText('Tap the underlined words');
    for (const name of ['quick', 'chickpeas', 'two']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-describedby')).toBe(hint.id);
    }
    expect(live()).toBe('I want something quick with chickpeas for two.');
  });

  it('cycles each word and updates the live region', () => {
    render();
    tap('quick');
    expect(live()).toBe('I want something one-pan with chickpeas for two.');
    tap('chickpeas');
    expect(live()).toBe('I want something one-pan with salmon for two.');
    tap('two');
    expect(live()).toBe('I want something one-pan with salmon for a crowd.');
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

  it('Add from a link opens /import (RL-186)', () => {
    render();
    tap('Add from a link');
    expect(probe()).toBe('/import|null');
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
});
