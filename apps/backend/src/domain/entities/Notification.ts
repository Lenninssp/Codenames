import { Team } from "../enums/Team.ts";

export class Notification {
  private winner: Team;
  private victoryReason: string;

  public constructor(winner: Team, victoryReason: string) {
    this.winner = winner;
    this.victoryReason = victoryReason;
  }
}
