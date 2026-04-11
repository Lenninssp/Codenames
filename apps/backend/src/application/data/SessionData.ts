import { Game } from "../../domain/entities/Game.ts";
import { Player } from "../../domain/entities/Player.ts";
import { SessionStatus } from "../../domain/enums/SessionStatus.ts";

export class SessionData {
  private roomCode: string;
  private status: SessionStatus;
  private players: Player[];
  private game: Game | null;

  public constructor(
    roomCode: string,
    status: SessionStatus,
    players: Player[],
    game: Game | null = null,
  ) {
    this.roomCode = roomCode;
    this.status = status;
    this.players = players;
    this.game = game;
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

  public getGame(): Game | null {
    return this.game;
  }
}
