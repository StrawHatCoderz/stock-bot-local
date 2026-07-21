export interface ErrorCodeEntry {
  code: string;
  humanPhrase: string;
}

export const ADMIN_ERROR_CODES: ErrorCodeEntry[] = [
  {
    code: "FORBIDDEN_ROLE",
    humanPhrase: "Your account no longer has admin permissions for this action, so I can't make this change.",
  },
  {
    code: "ASSOCIATE_NOT_FOUND",
    humanPhrase: "I couldn't find that associate in the system.",
  },
  {
    code: "INVALID_THRESHOLD",
    humanPhrase: "That threshold value isn't valid — it needs to be a percentage within the allowed range.",
  },
];

export const STOCK_ERROR_CODES: ErrorCodeEntry[] = [
  {
    code: "FORBIDDEN_ROLE",
    humanPhrase: "Your account doesn't have permission to do this.",
  },
  {
    code: "ADJUSTMENT_EXCEEDS_AVAILABLE",
    humanPhrase: "That's more than what's currently on hand, so I can't remove that much.",
  },
  {
    code: "ZERO_ADJUSTMENT_REQUIRES_MANAGER",
    humanPhrase: "Reducing this product all the way to zero needs a store manager — I can help with a smaller, partial adjustment instead.",
  },
  {
    code: "ADJUSTMENT_EXCEEDS_THRESHOLD",
    humanPhrase: "Their remaining adjustment allowance for this specific product has run out for now.",
  },
  {
    code: "CROSS_STORE_FORBIDDEN",
    humanPhrase: "That's not your own store, so I can't do that from here.",
  },
  {
    code: "INVALID_DESTINATION_STORE",
    humanPhrase: "I don't recognize that destination store — can you double check the name?",
  },
  {
    code: "EMPTY_PRODUCT_LIST",
    humanPhrase: "I need at least one product line before I can create a transfer.",
  },
  {
    code: "INVALID_QUANTITY",
    humanPhrase: "That quantity isn't valid for this line.",
  },
  {
    code: "TRANSFER_EXCEEDS_AVAILABLE",
    humanPhrase: "That line asks for more than what's currently on hand, so I can't move that much.",
  },
  {
    code: "AREA_OR_PRODUCT_NOT_FOUND",
    humanPhrase: "I couldn't match that area or product for this line.",
  },
];

export const renderErrorCodeTable = (entries: ErrorCodeEntry[]): string =>
  entries.map((entry) => `- \`${entry.code}\` → say: "${entry.humanPhrase}"`).join("\n");
