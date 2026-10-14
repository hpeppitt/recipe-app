// Provides indexedDB/IDBKeyRange globals so Dexie works under node in tests.
import 'fake-indexeddb/auto';
// jest-dom matchers (toBeInTheDocument etc.). Harmless in node-environment files.
import '@testing-library/jest-dom/vitest';
