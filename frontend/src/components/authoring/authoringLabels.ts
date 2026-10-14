export const CONTENT_STATUS_LABELS = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
  published: "Published",
  retired: "Retired",
} as const;

export type ContentStatus = keyof typeof CONTENT_STATUS_LABELS;

/** The first server message for a field, if any. */
export function fieldError(errors: Record<string, string[]>, ...fields: string[]) {
  for (const field of fields) {
    if (errors[field]?.length) return errors[field].join(" ");
  }
  return undefined;
}
