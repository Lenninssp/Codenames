import { describe, expect, test } from "bun:test";

import {
  getCardMetaLabel,
  getVisibleIdentity,
  shouldShowHintPanel,
} from "../../apps/frontend/src/gameView.ts";

describe("gameView helpers", () => {
  test("shows the hint panel for spymasters only", () => {
    expect(shouldShowHintPanel("SPYMASTER")).toBe(true);
    expect(shouldShowHintPanel("OPERATOR")).toBe(false);
  });

  test("keeps unrevealed identities hidden from operatives", () => {
    expect(
      getVisibleIdentity({
        role: "OPERATOR",
        card: {
          word: "Apple",
          identity: "RED",
          isRevealed: false,
        },
      }),
    ).toBe("");
  });

  test("shows revealed card identities to operatives and spymasters", () => {
    const revealedCard = {
      word: "Apple",
      identity: "RED" as const,
      isRevealed: true,
    };

    expect(getVisibleIdentity({ role: "OPERATOR", card: revealedCard })).toBe("RED");
    expect(getVisibleIdentity({ role: "SPYMASTER", card: revealedCard })).toBe("RED");
    expect(getCardMetaLabel({ role: "SPYMASTER", card: revealedCard })).toContain("Revealed");
  });
});
