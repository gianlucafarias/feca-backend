export const EXPLORE_INTENTS = [
  "open_now",
  "work_2h",
  "brunch_long",
  "solo",
  "first_date",
  "snack_fast",
  "reading",
  "group_4",
] as const;

export type ExploreIntent = (typeof EXPLORE_INTENTS)[number];
