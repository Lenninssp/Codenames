import { Identity } from "../enums/Identity.ts";

export class Guess {
  private selectedWord: string;
  private revealedIdentity: Identity;

  public constructor(selectedWord: string, revealedIdentity: Identity) {
    this.selectedWord = selectedWord;
    this.revealedIdentity = revealedIdentity;
  }

  public getSelectedWord(): string {
    return this.selectedWord;
  }

  public getRevealedIdentity(): Identity {
    return this.revealedIdentity;
  }
}
