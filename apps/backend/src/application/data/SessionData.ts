import { Player } from "../../domain/entities/Player.ts";
import { SessionStatus } from "../../domain/enums/SessionStatus.ts";

export class SessionData {
  private roomCode: string;
  private username: string;
  private players: Player[];
  private status: SessionStatus;

  public constructor(
    roomCode: string,
    username: string,
    players: Player[],
    status: SessionStatus,
  ) {
    this.roomCode = roomCode;
    this.username = username;
    this.players = players;
    this.status = status;
  }
}
