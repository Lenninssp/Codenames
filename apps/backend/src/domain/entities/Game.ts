import { Grid } from "./Grid.ts";
import { Notification } from "./Notification.ts";
import { Turn } from "./Turn.ts";
import { GameStatus } from "../enums/GameStatus.ts";
import { Identity } from "../enums/Identity.ts";
import { Team } from "../enums/Team.ts";

const oppositeTeam = (team: Team): Team =>
  team === Team.RED ? Team.BLUE : Team.RED;

export class Game {
  private activeTeam: Team;
  private status: GameStatus;
  private winner: Team | null;
  private victoryReason: string | null;
  private grid: Grid;
  private turns: Turn[];

  public constructor(grid: Grid, startingTeam: Team) {
    this.activeTeam = startingTeam;
    this.status = GameStatus.ACTIVE;
    this.winner = null;
    this.victoryReason = null;
    this.grid = grid;
    this.turns = [];
  }

  public start(): void {
    this.status = GameStatus.ACTIVE;
    this.startTurn();
  }

  public startTurn(): Turn {
    const turn = new Turn(this.turns.length + 1, this.activeTeam);
    this.turns.push(turn);
    return turn;
  }

  public switchActiveTeam(): void {
    this.activeTeam = oppositeTeam(this.activeTeam);
  }

  public applyRevealResult(identity: Identity): Notification | null {
    if (this.status === GameStatus.FINISHED) {
      return this.getResult();
    }

    if (identity === Identity.KILLER) {
      this.finish(
        oppositeTeam(this.activeTeam),
        `${this.activeTeam} revealed the KILLER card.`,
      );
      return this.getResult();
    }

    const unrevealedCards = this.grid.getUnrevealedCards();
    const redCardsRemaining = unrevealedCards.filter(
      (card) => card.getIdentity() === Identity.RED,
    ).length;
    const blueCardsRemaining = unrevealedCards.filter(
      (card) => card.getIdentity() === Identity.BLUE,
    ).length;

    if (redCardsRemaining === 0) {
      this.finish(Team.RED, "RED revealed all of its cards.");
      return this.getResult();
    }

    if (blueCardsRemaining === 0) {
      this.finish(Team.BLUE, "BLUE revealed all of its cards.");
      return this.getResult();
    }

    return null;
  }

  public finish(winner: Team, reason: string): void {
    this.winner = winner;
    this.victoryReason = reason;
    this.status = GameStatus.FINISHED;
  }

  public getCurrentTurn(): Turn {
    const currentTurn = this.turns[this.turns.length - 1];

    if (!currentTurn) {
      throw new Error("The game has no active turn.");
    }

    return currentTurn;
  }

  public getGrid(): Grid {
    return this.grid;
  }

  public getTurns(): Turn[] {
    return [...this.turns];
  }

  public getActiveTeam(): Team {
    return this.activeTeam;
  }

  public getStatus(): GameStatus {
    return this.status;
  }

  public getWinner(): Team | null {
    return this.winner;
  }

  public getResult(): Notification {
    if (this.winner === null || this.victoryReason === null) {
      throw new Error("The game has not produced a result yet.");
    }

    return new Notification(this.winner, this.victoryReason);
  }
}
