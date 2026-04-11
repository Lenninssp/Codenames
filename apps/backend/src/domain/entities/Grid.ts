import { Card } from "./Card.ts";

export class Grid {
  private cards: Card[];

  public constructor(cards: Card[] = []) {
    this.cards = [...cards];
  }

  public addCard(card: Card): void {
    if (this.cards.length >= 25) {
      throw new Error("The grid cannot contain more than 25 cards.");
    }

    this.cards.push(card);
  }

  public getUnrevealedCards(): Card[] {
    return this.cards.filter((card) => !card.getIsRevealed());
  }

  public getCards(): Card[] {
    return [...this.cards];
  }

  public revealCard(cardIndex: number): Card {
    const card = this.cards[cardIndex];

    if (!card) {
      throw new Error("The selected card index is invalid.");
    }

    card.reveal();
    return card;
  }
}
