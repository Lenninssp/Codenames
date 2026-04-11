import { Team } from "../enums/Team.ts";

export class Notification {
  private winner: Team;
  private reason: string;

  public constructor(winner: Team, reason: string) {
    this.winner = winner;
    this.reason = reason;
  }

  public getWinner(): Team {
    return this.winner;
  }

  public getReason(): string {
    return this.reason;
  }
}
