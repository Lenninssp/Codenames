import { Role } from "../enums/Role.ts";
import { Team } from "../enums/Team.ts";

export class Player {
  private username: string;
  // definite assignment assertion
  private team!: Team;
  private role!: Role;
  private isHost: boolean;

  public constructor(username: string, isHost: boolean) {
    this.username = username;
    this.isHost = isHost;
  }

  public setTeam(team: Team): void {
    this.team = team;
  }

  public setRole(role: Role): void {
    this.role = role;
  }
}
