import { Identity } from "../enums/Identity.ts";

export class Card {
  private word: string;
  private identity: Identity;
  private isRevealed: boolean;

  public constructor(word: string, identity: Identity) {
    this.word = word;
    this.identity = identity;
    this.isRevealed = false;
  }

  public getWord(): string {
    return this.word;
  }

  public getIdentity(): Identity {
    return this.identity;
  }

  public getIsRevealed(): boolean {
    return this.isRevealed;
  }

  public reveal(): void {
    if (this.isRevealed) {
      throw new Error("The selected card has already been revealed.");
    }

    this.isRevealed = true;
  }
}
