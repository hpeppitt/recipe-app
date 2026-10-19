// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import { db } from '../db/database';
import { Routes, Route } from 'react-router-dom';
import { SavedPage } from './SavedPage';

const other = { uid: 'chef', displayName: 'Chef Ann' };
const mine = { uid: fakeUser.uid, displayName: 'Me' };

beforeEach(async () => {
  await db.recipes.clear();
});

describe('SavedPage', () => {
  it('lists other people\'s recipes as one link each and excludes own', async () => {
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'a', title: 'Ann Soup', createdBy: other }),
      makeRecipe({ id: 'b', title: 'My Stew', createdBy: mine }),
    ]);
    renderWithProviders(<SavedPage />);
    const link = await screen.findByRole('link', { name: 'Ann Soup' });
    expect(link).toHaveAttribute('href', '/recipe/a');
    expect(link).toHaveTextContent('Chef Ann');
    expect(link.querySelectorAll('a,button')).toHaveLength(0);
    expect(link).toHaveAccessibleDescription(/Chef Ann/);
    expect(screen.queryByText('My Stew')).not.toBeInTheDocument();
  });

  it('shows the empty state with an action', async () => {
    renderWithProviders(<SavedPage />);
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.getByText('Recipes you keep from a shared link or an import wait for you here.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore recipes' })).toBeInTheDocument();
  });

  it('sends the empty-state action to /', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>,
      { route: '/saved' }
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Explore recipes' }));
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('is empty in local-only mode', async () => {
    await db.recipes.add(makeRecipe({ title: 'Ann Soup', createdBy: other }));
    renderWithProviders(<SavedPage />, { auth: { isConfigured: false } });
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('shows skeleton rows before the live query resolves', () => {
    renderWithProviders(<SavedPage />);
    expect(screen.getByRole('status', { name: 'Loading saved recipes' }).children).toHaveLength(3);
  });
});
