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
}
