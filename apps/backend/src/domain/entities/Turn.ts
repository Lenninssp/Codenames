import { Card } from "./Card.ts";
import { Guess } from "./Guess.ts";
import { Hint } from "./Hint.ts";
import { Team } from "../enums/Team.ts";
import { TurnPhase } from "../enums/TurnPhase.ts";

export class Turn {
  private turnNumber: number;
  private team: Team;
  private phase: TurnPhase;
  private remainingGuesses: number;
  private isComplete: boolean;
  private hint: Hint | null;
  private guesses: Guess[];

  public constructor(turnNumber: number, team: Team) {
    this.turnNumber = turnNumber;
    this.team = team;
    this.phase = TurnPhase.HINT;
    this.remainingGuesses = 0;
    this.isComplete = false;
    this.hint = null;
    this.guesses = [];
  }

  public submitHint(word: string, count: number): Hint {
    const sanitizedWord = word.trim();

    if (sanitizedWord.length === 0) {
      throw new Error("The hint cannot be empty.");
    }

    if (count < 0) {
      throw new Error("The hint count cannot be negative.");
    }

    this.hint = new Hint(sanitizedWord, count);
    this.remainingGuesses = count + 1;
    this.phase = TurnPhase.GUESS;
    return this.hint;
  }

  public recordGuess(card: Card): Guess {
    const guess = new Guess(card.getWord(), card.getIdentity());
    this.guesses.push(guess);
    return guess;
  }

  public decrementRemainingGuesses(): void {
    if (this.remainingGuesses > 0) {
      this.remainingGuesses -= 1;
    }
  }

  public complete(): void {
    this.isComplete = true;
    this.phase = TurnPhase.COMPLETE;
  }

  public getTurnNumber(): number {
    return this.turnNumber;
  }

  public getTeam(): Team {
    return this.team;
  }

  public getPhase(): TurnPhase {
    return this.phase;
  }

  public getRemainingGuesses(): number {
    return this.remainingGuesses;
  }

  public getIsComplete(): boolean {
    return this.isComplete;
  }

  public getHint(): Hint | null {
    return this.hint;
  }

  public getGuesses(): Guess[] {
    return [...this.guesses];
  }
}
