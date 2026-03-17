export class Guess {
  private cardIndex: number;
  private isCorrect: boolean;

  public constructor(cardIndex: number, isCorrect: boolean) {
    this.cardIndex = cardIndex;
    this.isCorrect = isCorrect;
  }
}
