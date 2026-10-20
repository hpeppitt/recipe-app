// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import type { GeneratedRecipe } from '../types/api';
import type { ChatMessage } from '../types/recipe';

vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
let parent: ReturnType<typeof makeRecipe> | undefined;
let parentLoading = false;
let parentError: Error | null = null;
const retryParent = vi.fn();
vi.mock('../hooks/useRecipe', () => ({
  useRecipe: () => ({
    recipe: parent,
    isLoading: parentLoading,
    cloudError: parentError,
    retry: retryParent,
  }),
}));

const sendMessage = vi.fn();
const saveRecipe = vi.fn();
const previewDuplicates = vi.fn();
const hideTypingMatches = vi.fn();
type Chat = {
  messages: ChatMessage[];
  isLoading: boolean;
  latestRecipe: GeneratedRecipe | null;
  loadingPhase?: 'checking' | 'generating';
  error?: { message: string; retryable?: boolean } | null;
  attachmentPreviews?: Record<number, string[]>;
  sentImageCount?: number;
  similarRecipes?: import('../hooks/useRecipeChat').SimilarRecipe[];
  typingMatches?: import('../hooks/useRecipeChat').TypingMatches | null;
  typingAnnouncement?: string;
  pendingQuery?: string | null;
  dismissSimilar?: () => void;
};
let chat: Chat;
let setChat: (c: Chat) => void;
vi.mock('../hooks/useRecipeChat', async () => {
  const { useState } = await import('react');
  return {
  useRecipeChat: () => {
    const [state, set] = useState(chat);
    setChat = set;
    return {
      isSaving: false,
      error: null,
      generationUnavailable: false,
      similarRecipes: [],
      loadingPhase: 'generating',
      pendingQuery: null,
      attachmentPreviews: {},
      sentImageCount: 0,
      sendMessage,
      retryGeneration: vi.fn(),
      dismissSimilar: vi.fn(),
      saveRecipe,
      typingMatches: null,
      typingAnnouncement: '',
      previewDuplicates,
      hideTypingMatches,
    ...state,
    };
  },
  };
});

vi.mock('../hooks/useBranchFamily', () => ({ useBranchFamily: () => null }));

const downscale = vi.hoisted(() => vi.fn());
vi.mock('../services/imageDownscale', () => ({ downscaleToJpeg: downscale }));

import { RecipeChatPage } from './RecipeChatPage';

const gen = (title: string) => makeRecipe({ title }) as unknown as GeneratedRecipe;
const user = (content: string): ChatMessage => ({ role: 'user', content, timestamp: 1 });
const bot = (title: string): ChatMessage => ({
  role: 'assistant',
  content: '',
  recipe: gen(title) as never,
  timestamp: 2,
});
const withRecipes = (...titles: string[]): Chat => {
  const messages = titles.flatMap((t) => [user(`make ${t}`), bot(t)]);
  return { messages, isLoading: false, latestRecipe: gen(titles[titles.length - 1]) };
};

const view = () =>
  renderWithProviders(
    <Routes>
      <Route path="/create" element={<RecipeChatPage />} />
      <Route path="*" element={<p>elsewhere</p>} />
    </Routes>,
    { route: '/create' }
  );
const toggles = () =>
  screen
    .getAllByRole('button')
    .filter((b) => ['Show full recipe', 'Hide full recipe'].includes(b.getAttribute('aria-label') ?? ''));

beforeEach(() => {
  sendMessage.mockReset();
  previewDuplicates.mockReset();
  hideTypingMatches.mockReset();
  parent = undefined;
  parentLoading = false;
  parentError = null;
  retryParent.mockReset();
  saveRecipe.mockReset();
  chat = { messages: [], isLoading: false, latestRecipe: null };
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

describe('RecipeChatPage similar recipes', () => {
  it('names the author of a cloud match as a pill', () => {
    chat = {
      messages: [],
      isLoading: false,
      latestRecipe: null,
      similarRecipes: [
        {
          id: 'c1', rootId: 'c1', emoji: '🍲', title: 'Stew', description: 'Hearty',
          totalTime: 60, difficulty: 'easy', author: { uid: 'u9', name: 'Mia Stone' },
          cloudOrigin: { isOwn: false, creatorName: 'Mia Stone', creatorUid: 'u9' },
        },
      ],
    };
    view();
    expect(screen.getByText('Mia Stone')).toBeTruthy();
  });
});

describe('RecipeChatPage on-send sheet (RL-179)', () => {
  const match = (id: string, title: string) => ({
    id, rootId: id, emoji: '🍌', title, description: '', totalTime: 75, difficulty: 'easy',
    author: { uid: 'u9', name: 'Mia Stone' }, cloudOrigin: null,
  });
  const dismissSimilar = vi.fn();
  const open = () => {
    chat = {
      messages: [], isLoading: false, latestRecipe: null, pendingQuery: 'banana bread', dismissSimilar,
      similarRecipes: [match('c1', 'Chocolate loaf'), match('b1', 'Banana bread')],
    };
    return view();
  };

  it('opens with Same and Similar tags and branches the first Same match', async () => {
    open();
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText("Someone's already baked this")).toBeTruthy();
    expect(within(sheet).getByText('Same')).toBeTruthy();
    expect(within(sheet).getByText('Similar')).toBeTruthy();
    await userEvent.setup().click(within(sheet).getByRole('button', { name: /Branch Banana bread/ }));
    expect(screen.getByText('elsewhere')).toBeTruthy();
  });

  it('write-anyway calls dismissSimilar', async () => {
    dismissSimilar.mockReset();
    open();
    await userEvent.setup().click(screen.getByRole('button', { name: "Mine's different, write a new one" }));
    expect(dismissSimilar).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the sheet without generating and keeps the query', async () => {
    sendMessage.mockReset();
    dismissSimilar.mockReset();
    open();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.getByText(/banana bread/i, { selector: 'p' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show similar recipes' })).toBeTruthy();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(dismissSimilar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });
});

describe('RecipeChatPage typing-pause dedup card (RL-178)', () => {
  const match = (id: string, title: string) => ({
    id, rootId: 'bb', emoji: '🍌', title, description: '', totalTime: 75, difficulty: 'easy',
    author: { uid: 'u9', name: 'Mia Stone' }, cloudOrigin: null,
  });
  const typing = {
    matches: [match('bb', 'Banana bread'), match('bb2', 'Vegan banana bread')],
    family: { versions: 7, cooks: 5 },
    query: 'banana bread',
  };

  it('hands every keystroke to the hook', async () => {
    view();
    await userEvent.setup().type(screen.getByRole('textbox'), 'ban');
    expect(previewDuplicates.mock.calls.map((c) => c[0])).toEqual(['b', 'ba', 'ban']);
  });

  it('shows the top title, family counts, author pills and meta, and announces once', () => {
    chat = { messages: [], isLoading: false, latestRecipe: null, typingMatches: typing, typingAnnouncement: '2 similar recipes already here' };
    view();
    const card = screen.getByRole('region', { name: 'Similar recipes' });
    expect(card.textContent).toContain('Banana bread is already growing here · 7 versions by 5 cooks');
    expect(screen.getAllByText('Mia Stone')).toHaveLength(2);
    expect(screen.getAllByText('1h 15m · easy')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('2 similar recipes already here');
  });

  it('Hide matches dismisses and returns focus to the composer', async () => {
    chat = { messages: [], isLoading: false, latestRecipe: null, typingMatches: typing };
    view();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hide matches' }));
    expect(hideTypingMatches).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });

  it('Branch opens the vary route carrying the typed text; the title links to the recipe', async () => {
    chat = { messages: [], isLoading: false, latestRecipe: null, typingMatches: typing };
    function Probe() {
      const loc = useLocation();
      return <p>{`${loc.pathname} ${(loc.state as { suggestion?: string } | null)?.suggestion}`}</p>;
    }
    renderWithProviders(
      <Routes>
        <Route path="/create" element={<RecipeChatPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>,
      { route: '/create' }
    );
    expect(screen.getByRole('link', { name: 'Banana bread' }).getAttribute('href')).toBe('/recipe/bb');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Branch Vegan banana bread' }));
    expect(screen.getByText('/recipe/bb2/vary banana bread')).toBeTruthy();
  });

  it('Send still works while the card shows', async () => {
    chat = { messages: [], isLoading: false, latestRecipe: null, typingMatches: typing };
    view();
    const u = userEvent.setup();
    await u.type(screen.getByRole('textbox'), 'banana bread');
    await u.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendMessage).toHaveBeenCalledWith('banana bread', []);
  });

  it('is not shown once a recipe exists', () => {
    chat = { ...withRecipes('Pasta'), typingMatches: typing };
    view();
    expect(screen.queryByRole('region', { name: 'Similar recipes' })).toBeNull();
  });
});

describe('RecipeChatPage chips and composer', () => {
  it('before a recipe: starter chips, no refinement chips, the starter placeholder', async () => {
    view();
    expect(screen.getByText('What would you like to cook?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make it spicier' })).toBeNull();
    expect(screen.getByPlaceholderText('Describe what you want to cook...')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Banana bread' }));
    expect(sendMessage).toHaveBeenCalledWith('Banana bread');
  });

  it('with a recipe: refinement chips send their label, the placeholder changes, starters go', async () => {
    chat = withRecipes('Pasta');
    view();
    expect(screen.getByPlaceholderText('Ask for a change…')).toBeTruthy();
    expect(screen.queryByText('What would you like to cook?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Banana bread' })).toBeNull();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Make it spicier' }));
    await u.click(screen.getByRole('button', { name: 'Fewer dishes' }));
    await u.click(screen.getByRole('button', { name: 'No dairy' }));
    expect(sendMessage.mock.calls).toEqual([['Make it spicier'], ['Fewer dishes'], ['No dairy']]);
  });

  it('hides refinement chips while a reply is loading', () => {
    chat = { ...withRecipes('Pasta'), isLoading: true };
    view();
    expect(screen.queryByRole('button', { name: 'Make it spicier' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Generating recipe...');
  });

  it('sends typed text with the Send button', async () => {
    view();
    const u = userEvent.setup();
    await u.type(screen.getByRole('textbox'), 'tacos');
    await u.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendMessage).toHaveBeenCalledWith('tacos', []);
  });
});

describe('RecipeChatPage photos', () => {
  const pick = (name = 'a.jpg') =>
    userEvent
      .setup()
      .upload(
        document.querySelector('input[type="file"]') as HTMLInputElement,
        new File(['x'], name, { type: 'image/jpeg' })
      );

  beforeEach(() => {
    downscale.mockReset();
    downscale.mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QQ==' });
  });

  it('shows the hook previews in the user bubble by message timestamp', () => {
    chat = {
      ...withRecipes('Pasta'),
      messages: [user('what is in my fridge'), bot('Pasta')],
      attachmentPreviews: { 1: ['data:image/jpeg;base64,QQ=='] },
    };
    view();
    expect(screen.getByAltText('Your photo 1')).toBeTruthy();
  });

  it('shows no bubble photos without previews', () => {
    chat = withRecipes('Pasta');
    view();
    expect(screen.queryByAltText('Your photo 1')).toBeNull();
  });

  it('passes the hook sentImageCount to the composer, not the preview count', async () => {
    // Two failed 3-photo sends leave six previews but a count of zero.
    chat = {
      messages: [],
      isLoading: false,
      latestRecipe: null,
      attachmentPreviews: { 1: ['a', 'b', 'c'], 2: ['d', 'e', 'f'] },
      sentImageCount: 0,
    };
    view();
    await pick();
    expect(await screen.findByAltText('Attached photo 1 of 1')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses a pick when the hook says the chat is full', async () => {
    chat = { messages: [], isLoading: false, latestRecipe: null, sentImageCount: 6 };
    view();
    await pick();
    expect(screen.getByRole('alert').textContent).toBe(
      'This chat already has 6 photos. Start a new recipe to use more.'
    );
  });

  it('adds a status region only while a photo is being prepared', async () => {
    let resolve!: (a: unknown) => void;
    downscale.mockImplementation(() => new Promise((r) => (resolve = r)));
    chat = { messages: [], isLoading: false, latestRecipe: null };
    view();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await pick();
    expect(screen.getAllByRole('status').map((s) => s.getAttribute('aria-label'))).toEqual([
      null,
      'Preparing photo',
    ]);
    await act(async () => resolve({ mimeType: 'image/jpeg', base64: 'QQ==' }));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe('RecipeChatPage cards', () => {
  it('opens only the newest card and keeps every Save label', () => {
    chat = withRecipes('Pasta', 'Curry');
    view();
    expect(toggles().map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
    expect(screen.getAllByRole('button', { name: 'Read full recipe' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save This Version' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeTruthy();
  });

  it('a collapsed newest card pins a compact Save in the composer that saves once', async () => {
    chat = withRecipes('Pasta');
    const u = userEvent.setup();
    view();
    expect(screen.getAllByRole('button', { name: 'Save Recipe' })).toHaveLength(1);
    await u.click(toggles()[0]);
    const saves = screen.getAllByRole('button', { name: 'Save Recipe' });
    expect(saves).toHaveLength(2);
    await u.click(saves[saves.length - 1]);
    expect(saveRecipe).toHaveBeenCalledTimes(1);
    expect(saveRecipe.mock.calls[0][0].prompt).toBe('make Pasta');
    await u.click(toggles()[0]);
    expect(screen.getAllByRole('button', { name: 'Save Recipe' })).toHaveLength(1);
  });

  it('has no compact Save while loading', async () => {
    chat = { ...withRecipes('Pasta'), isLoading: true };
    const u = userEvent.setup();
    view();
    await u.click(toggles()[0]);
    expect(screen.queryAllByRole('button', { name: 'Save Recipe' })).toHaveLength(0);
  });

  it('collapsed card shows ingredient names cut at 8 with an ellipsis', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      amount: 1, unit: null, name: `item${i + 1}`, notes: null, group: null,
    }));
    const r = { ...gen('Big'), ingredients: many } as unknown as ChatMessage['recipe'];
    chat = {
      messages: [user('a'), { ...bot('Big'), recipe: r }, user('b'), bot('Next')],
      isLoading: false,
      latestRecipe: gen('Next'),
    };
    view();
    expect(
      screen.getByText('item1 · item2 · item3 · item4 · item5 · item6 · item7 · item8…')
    ).toBeTruthy();
  });

  it('the toggle and Read full recipe open and close a card from the keyboard', async () => {
    chat = withRecipes('Pasta', 'Curry');
    view();
    const u = userEvent.setup();
    toggles()[0].focus();
    await u.keyboard('{Enter}');
    expect(toggles().map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    await u.click(toggles()[1]);
    expect(toggles().map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    await u.click(screen.getByRole('button', { name: 'Read full recipe' }));
    expect(toggles()[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('a new card opens and the previous closes, unless the user toggled the previous', async () => {
    chat = withRecipes('Pasta', 'Curry');
    view();
    const u = userEvent.setup();
    // user collapses the newest (Curry) by hand
    await u.click(toggles()[1]);
    act(() => setChat(withRecipes('Pasta', 'Curry', 'Soup')));
    // Pasta untouched -> closed, Curry hand-collapsed -> stays closed, Soup newest -> open
    expect(toggles().map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'true']);

    // and a hand-opened older card survives the next arrival
    await u.click(toggles()[0]);
    act(() => setChat(withRecipes('Pasta', 'Curry', 'Soup', 'Stew')));
    expect(toggles().map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false', 'true']);
  });

  it('survives a card with no title or ingredients', () => {
    const r = { ...gen(''), ingredients: [] } as unknown as ChatMessage['recipe'];
    chat = { messages: [user('x'), { ...bot(''), recipe: r }], isLoading: false, latestRecipe: gen('') };
    view();
    expect(screen.getByRole('heading', { name: 'Untitled recipe' })).toBeTruthy();
  });
});

describe('RecipeChatPage close and gate', () => {
  it('Close asks before discarding an unsaved recipe', async () => {
    chat = withRecipes('Pasta');
    view();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog', { name: 'Discard this recipe?' })).toBeTruthy();
  });

  it('Close goes back one entry when there is history', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/create" element={<RecipeChatPage />} />
        <Route path="/other" element={<Link to="/create">open chat</Link>} />
        <Route path="*" element={<p>home</p>} />
      </Routes>,
      { route: '/other' }
    );
    const u = userEvent.setup();
    await u.click(screen.getByRole('link', { name: 'open chat' }));
    await u.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'open chat' })).toBeTruthy();
  });

  it('Close goes home on a cold load with no history', async () => {
    view();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('elsewhere')).toBeTruthy();
  });

  it('signed out sees the sign-up gate and no composer', () => {
    renderWithProviders(<RecipeChatPage />, { user: null, route: '/create' });
    expect(screen.getByRole('heading', { name: 'Sign up to start cooking up recipes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to recipes' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Describe what you want to cook...' })).toBeNull();
  });
});

describe('RecipeChatPage long generation', () => {
  const dots = (c: HTMLElement) => c.querySelector('.motion-safe\\:animate-bounce');
  const tree = (c: HTMLElement) => c.querySelector('svg[viewBox="0 0 300 380"]');
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never;
  });
  afterEach(() => vi.useRealTimers());

  it('shows dots before 4 s, the silent tree after, and neither once the reply lands', () => {
    chat = { messages: [user('a')], isLoading: true, latestRecipe: null };
    const { container } = view();
    wait(3900);
    expect(dots(container)).toBeTruthy();
    expect(tree(container)).toBeNull();
    wait(200);
    expect(dots(container)).toBeNull();
    expect(tree(container)?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    act(() => setChat(withRecipes('Pasta')));
    expect(tree(container)).toBeNull();
    expect(dots(container)).toBeNull();
  });

  it('restarts the timer on a new send', () => {
    chat = { messages: [user('a')], isLoading: true, latestRecipe: null };
    const { container } = view();
    wait(5000);
    act(() => setChat(withRecipes('Pasta')));
    act(() => setChat({ ...withRecipes('Pasta'), isLoading: true }));
    wait(3900);
    expect(tree(container)).toBeNull();
    wait(200);
    expect(tree(container)).toBeTruthy();
  });

  it('unmounting while waiting clears the timer', () => {
    chat = { messages: [user('a')], isLoading: true, latestRecipe: null };
    const { unmount } = view();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never shows the tree during the checking phase', () => {
    chat = { messages: [user('a')], isLoading: true, latestRecipe: null, loadingPhase: 'checking' };
    const { container } = view();
    wait(10000);
    expect(tree(container)).toBeNull();
    expect(dots(container)).toBeTruthy();
  });
});

describe('RecipeChatPage announcements', () => {
  const live = () => screen.getByRole('status').textContent;

  it('has one live region and the typing indicator is hidden from assistive tech', () => {
    chat = { ...withRecipes('Pasta'), isLoading: true };
    const { container } = view();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    const dots = container.querySelector('.motion-safe\\:animate-bounce');
    expect(dots?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('announces a new recipe once it arrives', () => {
    chat = { messages: [user('a')], isLoading: true, latestRecipe: null };
    view();
    expect(live()).toBe('Generating recipe...');
    act(() => setChat(withRecipes('Pasta')));
    expect(live()).toBe('Pasta is ready');
  });

  it('a failed refinement does not say ready and shows an alert', () => {
    chat = withRecipes('Pasta');
    view();
    act(() =>
      setChat({
        ...withRecipes('Pasta'),
        messages: [...withRecipes('Pasta').messages, user('No dairy')],
        error: { message: 'Something went wrong' },
      })
    );
    expect(live()).toBe('');
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
  });

  it('a failed save on the newest card does not say ready either', () => {
    chat = { ...withRecipes('Pasta'), error: { message: "Couldn't save the recipe." } };
    view();
    expect(live()).toBe('');
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('RecipeChatPage branch composer (/recipe/:id/vary)', () => {
  const vary = () =>
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id/vary" element={<RecipeChatPage />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>,
      { route: '/recipe/r1/vary' }
    );

  it('the suggestion seed prefills the instruction', async () => {
    parent = makeRecipe({ title: 'Banana bread' });
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id/vary" element={<RecipeChatPage />} />
        <Route
          path="*"
          element={
            <Link to="/recipe/r1/vary" state={{ suggestion: 'less sugar, add walnuts' }}>
              approve
            </Link>
          }
        />
      </Routes>,
      { route: '/other' }
    );
    await userEvent.setup().click(screen.getByRole('link', { name: 'approve' }));
    expect(
      (screen.getByRole('textbox', { name: 'What would you change?' }) as HTMLTextAreaElement).value
    ).toBe('less sugar, add walnuts');
    expect((screen.getByRole('button', { name: 'Grow this branch' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the composer first, not the old prompt or chat input, and Grow sends through sendMessage', async () => {
    parent = makeRecipe({ title: 'Banana bread' });
    vary();
    expect(screen.getByRole('heading', { name: 'What would you change?' })).toBeTruthy();
    expect(screen.queryByText('How would you like to modify this recipe?')).toBeNull();
    expect(screen.queryByPlaceholderText('Describe the modification...')).toBeNull();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Vegan' }));
    await u.click(screen.getByRole('button', { name: 'Grow this branch' }));
    expect(sendMessage).toHaveBeenCalledWith('vegan', []);
  });

  it('the first variation turn never swaps the growing card for the tree', () => {
    vi.useFakeTimers();
    try {
      parent = makeRecipe({ title: 'Banana bread' });
      const { container } = vary();
      act(() => setChat({ messages: [user('vegan')], isLoading: true, latestRecipe: null }));
      act(() => void vi.advanceTimersByTime(10000));
      expect(container.querySelector('svg[viewBox="0 0 300 380"]')).toBeNull();
      expect(screen.getAllByText('Growing your branch…').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('/create has no composer', () => {
    parent = makeRecipe({ title: 'Banana bread' }); // the mocked hook returns it even without an id
    view();
    expect(screen.queryByRole('button', { name: 'Grow this branch' })).toBeNull();
  });

  it('the page keeps one always-mounted live region: idle, growing, ready', () => {
    parent = makeRecipe({ title: 'Banana bread' });
    const { container } = vary();
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    act(() => setChat({ messages: [user('vegan')], isLoading: true, latestRecipe: null }));
    // the same node, so a screen reader sees its text change rather than a new region
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(region.textContent).toBe('Growing your branch…');
    expect(screen.queryByRole('button', { name: 'Grow this branch' })).toBeNull();
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    // the visible card says it too, but is hidden from assistive tech
    const card = screen.getAllByText('Growing your branch…').find((n) => n !== region);
    expect(card?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(container.querySelector('.motion-safe\\:animate-bounce')).toBeNull();
    act(() => setChat(withRecipes('Vegan banana bread')));
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('Vegan banana bread is ready');
    expect(screen.getByRole('button', { name: 'Save Variation' })).toBeTruthy();
  });

  it('a failed first turn falls to the chat: bubble, alert, Try again, empty input, silent region', () => {
    parent = makeRecipe({ title: 'Banana bread' });
    chat = {
      messages: [user('vegan')],
      isLoading: false,
      latestRecipe: null,
      error: { message: 'Something went wrong', retryable: true },
    };
    vary();
    expect(screen.getByText('vegan')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    const input = screen.getByPlaceholderText('Describe the modification...') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Grow this branch' })).toBeNull();
  });

  it('while the parent loads, a spinner notice replaces the composer', () => {
    parentLoading = true;
    vary();
    expect(screen.getByText('Loading the original recipe...')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Grow this branch' })).toBeNull();
  });

  it('a parent that failed to load shows the retry notice, not the composer', async () => {
    parentError = new Error('offline');
    vary();
    expect(screen.getByText("Couldn't load the original recipe")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Grow this branch' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retryParent).toHaveBeenCalledTimes(1);
  });

  it('a missing parent shows the not-found notice, not the composer', () => {
    vary();
    expect(screen.getByText('That recipe no longer exists')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Grow this branch' })).toBeNull();
  });

  it('a later turn uses the typing indicator, not the growing card', () => {
    parent = makeRecipe({ title: 'Banana bread' });
    chat = { ...withRecipes('Vegan banana bread'), isLoading: true };
    vary();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText('Growing your branch…')).toBeNull();
  });

  it('Close still guards an unsaved variation', async () => {
    parent = makeRecipe({ title: 'Banana bread' });
    chat = withRecipes('Vegan banana bread');
    vary();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog', { name: 'Discard this variation?' })).toBeTruthy();
  });
});
