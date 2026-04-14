import { describe, expect, test } from "bun:test";

import { HintValidator } from "../../apps/backend/src/application/services/HintValidator.ts";
import { Grid } from "../../apps/backend/src/domain/entities/Grid.ts";
import { Card } from "../../apps/backend/src/domain/entities/Card.ts";
import { Identity } from "../../apps/backend/src/domain/enums/Identity.ts";

describe("HintValidator", () => {
  test("rejects hints that exactly match any card on the grid", () => {
    const validator = new HintValidator();
    const grid = new Grid([
      new Card("Apple", Identity.RED),
      new Card("Bridge", Identity.BLUE),
    ]);

    expect(validator.validate(grid, "apple")).toBe(false);
  });

  test("rejects hints that nearly match revealed card words", () => {
    const validator = new HintValidator();
    const revealedCard = new Card("Bridge", Identity.BLUE);
    revealedCard.reveal();

    const grid = new Grid([
      new Card("Apple", Identity.RED),
      revealedCard,
    ]);

    expect(validator.validate(grid, "bridges")).toBe(false);
  });

  test("accepts distinct hints that do not overlap with grid words", () => {
    const validator = new HintValidator();
    const grid = new Grid([
      new Card("Apple", Identity.RED),
      new Card("Bridge", Identity.BLUE),
    ]);

    expect(validator.validate(grid, "ocean")).toBe(true);
  });
});
