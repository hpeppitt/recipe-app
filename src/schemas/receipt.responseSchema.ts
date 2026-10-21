import { Schema } from 'firebase/ai';

/** The receipt read's model config shape (RL-241): food and drink names only. `lib/receipt.ts` validates with Zod on the way in. */
export const RECEIPT_RESPONSE_SCHEMA = Schema.object({
  properties: { items: Schema.array({ items: Schema.string() }) },
});
