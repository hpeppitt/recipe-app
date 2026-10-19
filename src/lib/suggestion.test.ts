import { describe, it, expect } from 'vitest';
import { composeSuggestionMessage } from './suggestion';

const e = (name: string, oldAmount: string, newAmount: string, why?: string) => ({ name, oldAmount, newAmount, why });

describe('composeSuggestionMessage', () => {
  it('writes one line for one edit', () => {
    expect(composeSuggestionMessage([e('garlic', '2 cloves', '4 cloves')])).toBe('Change 2 cloves garlic to 4 cloves.');
  });
  it('writes one line per edit', () => {
    expect(composeSuggestionMessage([e('garlic', '2 cloves', '4 cloves'), e('salt', '1 tsp', '½ tsp')])).toBe(
      'Change 2 cloves garlic to 4 cloves.\nChange 1 tsp salt to ½ tsp.'
    );
  });
  it('appends the why after the edit', () => {
    expect(composeSuggestionMessage([e('salt', '1 tsp', '½ tsp', 'Too salty for me')])).toBe(
      'Change 1 tsp salt to ½ tsp. Too salty for me'
    );
  });
  it('adds the note after a blank line', () => {
    expect(composeSuggestionMessage([e('salt', '1 tsp', '½ tsp')], 'Bake longer')).toBe(
      'Change 1 tsp salt to ½ tsp.\n\nBake longer'
    );
  });
  it('is just the note when there are no edits', () => {
    expect(composeSuggestionMessage([], 'Bake longer')).toBe('Bake longer');
  });
  it('drops an edit whose amount did not change, and a blank one', () => {
    expect(composeSuggestionMessage([e('salt', '1 tsp', '1 tsp', 'why'), e('oil', '2 tbsp', '  ')])).toBe('');
    expect(composeSuggestionMessage([e('salt', '1 tsp', ' 1 tsp '), e('oil', '2 tbsp', '3 tbsp')])).toBe(
      'Change 2 tbsp oil to 3 tbsp.'
    );
  });
  it('is empty when nothing remains', () => {
    expect(composeSuggestionMessage([], '   ')).toBe('');
  });
  it('trims whitespace', () => {
    expect(composeSuggestionMessage([e(' salt ', ' 1 tsp ', ' 2 tsp ', '  less  ')], '  hi  ')).toBe(
      'Change 1 tsp salt to 2 tsp. less\n\nhi'
    );
  });
  it('copes with an ingredient that has no amount', () => {
    expect(composeSuggestionMessage([e('salt', '', '1 pinch')])).toBe('Change salt to 1 pinch.');
  });
});
