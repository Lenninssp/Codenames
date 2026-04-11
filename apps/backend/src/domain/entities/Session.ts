import { Game } from "./Game.ts";
import { Player } from "./Player.ts";
import { Role } from "../enums/Role.ts";
import { SessionStatus } from "../enums/SessionStatus.ts";
import { Team } from "../enums/Team.ts";

export class Session {
  private roomCode: string;
  private status: SessionStatus;
  private players: Player[];
  private game: Game | null;

  public constructor(roomCode: string, status: SessionStatus) {
    this.roomCode = roomCode;
    this.status = status;
    this.players = [];
    this.game = null;
  }

  public addPlayer(player: Player): void {
    const username = player.getUsername();

    if (!this.checkUsernameUnique(username)) {
      throw new Error("The username is already in use in this session.");
    }

    this.players.push(player);
  }

  public getGame(): Game {
    if (this.game === null) {
      throw new Error("The session has no active game.");
    }

    return this.game;
  }

  public getPlayer(username: string): Player {
    const normalizedUsername = username.trim().toLowerCase();
    const player = this.players.find(
      (candidate) => candidate.getUsername().trim().toLowerCase() === normalizedUsername,
    );

    if (!player) {
      throw new Error("The player does not exist in this session.");
    }

    return player;
  }

  public isSpymasterSlotAvailable(team: Team): boolean {
    return !this.players.some((player) => {
      const assignedTeam = player.getTeam();
      const role = player.getRole();
      return assignedTeam === team && role === Role.SPYMASTER;
    });
  }

  public checkUsernameUnique(username: string): boolean {
    const normalizedUsername = username.trim().toLowerCase();
    return !this.players.some(
      (player) => player.getUsername().trim().toLowerCase() === normalizedUsername,
    );
  }

  public validateLobbyState(): boolean {
    if (this.status !== SessionStatus.LOBBY || this.players.length < 4) {
      return false;
    }

    const teamAssignments = new Map<Team, { spymasters: number; operators: number }>([
      [Team.RED, { spymasters: 0, operators: 0 }],
      [Team.BLUE, { spymasters: 0, operators: 0 }],
    ]);

    for (const player of this.players) {
      const team = player.getTeam();
      const role = player.getRole();

      if (team === Team.NONE) {
        return false;
      }

      const assignment = teamAssignments.get(team);

      if (!assignment) {
        return false;
      }

      if (role === Role.SPYMASTER) {
        assignment.spymasters += 1;
      } else {
        assignment.operators += 1;
      }
    }

    return [...teamAssignments.values()].every(
      ({ spymasters, operators }) => spymasters === 1 && operators >= 1,
    );
  }

  public getHost(): Player {
    const host = this.players.find((player) => player.getIsHost());

    if (!host) {
      throw new Error("The session does not have a host.");
    }

    return host;
  }

  public setGame(game: Game): void {
    this.game = game;
  }

  public setStatus(status: SessionStatus): void {
    this.status = status;
  }

  public getRoomCode(): string {
    return this.roomCode;
  }

  public getStatus(): SessionStatus {
    return this.status;
  }

  public getPlayers(): Player[] {
    return [...this.players];
  }
}
