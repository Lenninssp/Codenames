import { Grid } from "../../domain/entities/Grid.ts";

export class HintValidator {
  public validate(grid: Grid, hintWord: string): boolean {
    const normalizedHintWord = hintWord.trim().toLowerCase();

    if (normalizedHintWord.length === 0) {
      return false;
    }

    return grid
      .getUnrevealedCards()
      .every((card) => card.getWord().trim().toLowerCase() !== normalizedHintWord);
  }
}
