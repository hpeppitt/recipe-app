// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportedFrom } from './ImportedFrom';
import { MetadataPills } from './MetadataPills';
import { MemoryRouter } from 'react-router-dom';

describe('ImportedFrom', () => {
  it('links to the source with the host shown and safe rel', () => {
    render(<ImportedFrom url="https://www.seriouseats.com/a/b" />);
    const a = screen.getByRole('link', { name: /Imported from seriouseats\.com/ });
    expect(a.getAttribute('href')).toBe('https://www.seriouseats.com/a/b');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow');
  });

  it.each([undefined, '', 'javascript:alert(1)', 'not a url'])('renders nothing for %s', (url) => {
    const { container } = render(<ImportedFrom url={url} />);
    expect(container.innerHTML).toBe('');
  });

  it('prefixes the author pill with via for imports', () => {
    const pills = { prepTime: 0, cookTime: 0, totalTime: 10, difficulty: 'easy', author: { uid: 'u1', displayName: 'Sam' } };
    const { rerender } = render(<MemoryRouter><MetadataPills {...pills} via /></MemoryRouter>);
    expect(screen.getByText('via')).toBeInTheDocument();
    rerender(<MemoryRouter><MetadataPills {...pills} /></MemoryRouter>);
    expect(screen.queryByText('via')).toBeNull();
  });
});
