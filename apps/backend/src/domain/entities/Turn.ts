import { Guess } from "./Guess.ts";
import { Hint } from "./Hint.ts";
import { Identity } from "../enums/Identity.ts";
import { Team } from "../enums/Team.ts";
import { TurnPhase } from "../enums/TurnPhase.ts";

const matchesTeam = (team: Team, identity: Identity): boolean =>
  (team === Team.RED && identity === Identity.RED) ||
  (team === Team.BLUE && identity === Identity.BLUE);

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
    this.phase = TurnPhase.SPYMASTER_HINTING;
    this.remainingGuesses = 0;
    this.isComplete = false;
    this.hint = null;
    this.guesses = [];
  }

  public createHint(word: string, count: number): Hint {
    if (count < 0) {
      throw new Error("The hint count cannot be negative.");
    }

    this.hint = new Hint(word, count);
    this.remainingGuesses = count + 1;
    this.phase = TurnPhase.OPERATOR_GUESSING;
    return this.hint;
  }

  public setPhase(phase: TurnPhase): void {
    this.phase = phase;
  }

  public setRemainingGuesses(count: number): void {
    this.remainingGuesses = count;
  }

  public recordGuess(cardIndex: number, isCorrect: boolean): Guess {
    const guess = new Guess(cardIndex, isCorrect);
    this.guesses.push(guess);
    return guess;
  }

  public decrementRemainingGuesses(): void {
    if (this.remainingGuesses > 0) {
      this.remainingGuesses -= 1;
    }
  }

  public markCompleteIfNeeded(identity: Identity): void {
    if (!matchesTeam(this.team, identity) || this.remainingGuesses <= 0) {
      this.markComplete();
    }
  }

  public markComplete(): void {
    this.isComplete = true;
    this.phase = TurnPhase.COMPLETE;
  }
}
