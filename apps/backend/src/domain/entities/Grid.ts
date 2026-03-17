import { Card } from "./Card.ts";
import { Identity } from "../enums/Identity.ts";

type CardState = {
  word: string;
  identity: Identity;
  isRevealed: boolean;
};

const readCardState = (card: Card): CardState => card as unknown as CardState;

export class Grid {
  private cards: Card[];

  public constructor() {
    this.cards = [];
  }

  public addCard(card: Card): void {
    if (this.cards.length >= 25) {
      throw new Error("The grid cannot contain more than 25 cards.");
    }

    this.cards.push(card);
  }

  public checkUnrevealedCards(hintWord: string): boolean {
    const normalizedHintWord = hintWord.trim().toLowerCase();

    return this.cards.every((card) => {
      const { word, isRevealed } = readCardState(card);
      return isRevealed || word.trim().toLowerCase() !== normalizedHintWord;
    });
  }

  public revealCard(cardIndex: number): Card {
    const card = this.cards[cardIndex];

    if (!card) {
      throw new Error("The selected card index is invalid.");
    }

    const cardState = readCardState(card);

    if (cardState.isRevealed) {
      throw new Error("The selected card has already been revealed.");
    }

    cardState.isRevealed = true;
    return card;
  }
}
