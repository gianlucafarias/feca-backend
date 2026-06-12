import { describe, expect, it } from "vitest";

import {
  FECA_RECOMMENDED_BADGE_LABEL,
  MAX_VISIBLE_RECOMMENDED_BADGES,
} from "../place-curation";

describe("place-curation constants", () => {
  it("exposes the public badge label", () => {
    expect(FECA_RECOMMENDED_BADGE_LABEL).toBe("Recomendado por FECA");
  });

  it("caps visible badges to avoid saturation", () => {
    expect(MAX_VISIBLE_RECOMMENDED_BADGES).toBe(3);
  });
});
