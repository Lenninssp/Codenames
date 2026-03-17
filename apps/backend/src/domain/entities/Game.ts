import { Card } from "./Card.ts";
import { Grid } from "./Grid.ts";
import { Notification } from "./Notification.ts";
import { Turn } from "./Turn.ts";
import { GameStatus } from "../enums/GameStatus.ts";
import { Identity } from "../enums/Identity.ts";
import { Team } from "../enums/Team.ts";

type CardState = {
  identity: Identity;
  isRevealed: boolean;
};

type GridState = {
  cards: Card[];
};

const readCardState = (card: Card): CardState => card as unknown as CardState;

const readGridState = (grid: Grid): GridState => grid as unknown as GridState;

const oppositeTeam = (team: Team): Team => (team === Team.RED ? Team.BLUE : Team.RED);

const countRemainingCards = (grid: Grid): { red: number; blue: number } => {
  const { cards } = readGridState(grid);

  return cards.reduce(
    (totals, card) => {
      const { identity, isRevealed } = readCardState(card);

      if (isRevealed) {
        return totals;
      }

      if (identity === Identity.RED) {
        totals.red += 1;
      } else if (identity === Identity.BLUE) {
        totals.blue += 1;
      }

      return totals;
    },
    { red: 0, blue: 0 },
  );
};

export class Game {
  private activeTeam: Team;
  private status: GameStatus;
  private winner: Team | null;
  private victoryReason: string | null;
  private grid: Grid;
  private turns: Turn[];

  public constructor() {
    this.activeTeam = Team.RED;
    this.status = GameStatus.ACTIVE;
    this.winner = null;
    this.victoryReason = null;
    this.grid = new Grid();
    this.turns = [];
  }

  public setGrid(grid: Grid): void {
    this.grid = grid;
  }

  public setActiveTeam(team: Team): void {
    this.activeTeam = team;
  }

  public setStatus(status: GameStatus): void {
    this.status = status;
  }

  public getResult(): Notification {
    if (this.winner === null || this.victoryReason === null) {
      throw new Error("The game has not produced a result yet.");
    }

    return new Notification(this.winner, this.victoryReason);
  }

  public toggleActiveTeam(): void {
    this.activeTeam = oppositeTeam(this.activeTeam);
  }

  public createTurn(): Turn {
    const turn = new Turn(this.turns.length + 1, this.activeTeam);
    this.turns.push(turn);
    return turn;
  }

  public evaluateGameState(identity: Identity): void {
    if (this.status === GameStatus.FINISHED) {
      return;
    }

    if (identity === Identity.KILLER) {
      this.winner = oppositeTeam(this.activeTeam);
      this.victoryReason = `${this.activeTeam} revealed the KILLER card.`;
      this.status = GameStatus.FINISHED;
      return;
    }

    const remainingCards = countRemainingCards(this.grid);

    if (remainingCards.red === 0) {
      this.winner = Team.RED;
      this.victoryReason = "RED revealed all of its cards.";
      this.status = GameStatus.FINISHED;
      return;
    }

    if (remainingCards.blue === 0) {
      this.winner = Team.BLUE;
      this.victoryReason = "BLUE revealed all of its cards.";
      this.status = GameStatus.FINISHED;
    }
  }
}
