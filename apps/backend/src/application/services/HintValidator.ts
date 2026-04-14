import { Grid } from "../../domain/entities/Grid.ts";

const normalizeComparableTerm = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const isNearMatch = (left: string, right: string): boolean =>
  left === right || left.includes(right) || right.includes(left);

export class HintValidator {
  public validate(grid: Grid, hintWord: string): boolean {
    const normalizedHintWord = normalizeComparableTerm(hintWord);

    if (normalizedHintWord.length === 0) {
      return false;
    }

    return grid
      .getCards()
      .every(
        (card) => !isNearMatch(normalizedHintWord, normalizeComparableTerm(card.getWord())),
      );
  }
}
