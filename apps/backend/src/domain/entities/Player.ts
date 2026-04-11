import { Role } from "../enums/Role.ts";
import { Team } from "../enums/Team.ts";

export class Player {
  private username: string;
  private team: Team;
  private role: Role;
  private isHost: boolean;

  public constructor(username: string, isHost: boolean) {
    this.username = username;
    this.team = Team.NONE;
    this.role = Role.OPERATOR;
    this.isHost = isHost;
  }

  public assignRole(team: Team, role: Role): void {
    this.team = team;
    this.role = role;
  }

  public getUsername(): string {
    return this.username;
  }

  public getTeam(): Team {
    return this.team;
  }

  public getRole(): Role {
    return this.role;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }
}
