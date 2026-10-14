// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';

vi.mock('../../services/telemetry', () => ({ reportError: vi.fn() }));
import { reportError } from '../../services/telemetry';
import { RouteErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // React re-dispatches a caught render error to window in dev; jsdom would report it as uncaught.
    window.addEventListener('error', (e) => e.preventDefault(), { once: true });
  });

  it('shows the fallback, reports, and goes home', async () => {
    renderWithProviders(
      <RouteErrorBoundary>
        <Routes>
          <Route path="/" element={<p>Library</p>} />
          <Route path="/bad" element={<Boom />} />
        </Routes>
      </RouteErrorBoundary>,
      { route: '/bad' }
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'error-boundary');
    await userEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(screen.getByText('Library')).toBeTruthy();
  });
});
