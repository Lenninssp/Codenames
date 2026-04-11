import { SessionData } from "../data/SessionData.ts";
import { Session } from "../../domain/entities/Session.ts";
import { Player } from "../../domain/entities/Player.ts";
import { Role } from "../../domain/enums/Role.ts";
import { SessionStatus } from "../../domain/enums/SessionStatus.ts";
import { Team } from "../../domain/enums/Team.ts";
import type { SessionRepository } from "../../infrastructure/persistence/SessionRepository.ts";
import type { EventPublisher } from "../../infrastructure/realtime/EventPublisher.ts";
import { GameFactory } from "./GameFactory.ts";
import { LobbyService } from "./LobbyService.ts";
import { SessionCodeGenerator } from "./SessionCodeGenerator.ts";
import { TurnService } from "./TurnService.ts";

const normalizeRoomCode = (roomCode: string): string => roomCode.trim().toUpperCase();

export class GameController {
  private sessionRepository: SessionRepository;
  private eventPublisher: EventPublisher;
  private lobbyService: LobbyService;
  private gameFactory: GameFactory;
  private turnService: TurnService;
  private sessionCodeGenerator: SessionCodeGenerator;

  public constructor(
    sessionRepository: SessionRepository,
    eventPublisher: EventPublisher,
    lobbyService: LobbyService,
    gameFactory: GameFactory,
    turnService: TurnService,
    sessionCodeGenerator: SessionCodeGenerator,
  ) {
    this.sessionRepository = sessionRepository;
    this.eventPublisher = eventPublisher;
    this.lobbyService = lobbyService;
    this.gameFactory = gameFactory;
    this.turnService = turnService;
    this.sessionCodeGenerator = sessionCodeGenerator;
  }

  public initializeSession(username: string): SessionData {
    const sanitizedUsername = username.trim();

    if (sanitizedUsername.length === 0) {
      throw new Error("The username cannot be empty.");
    }

    const roomCode = this.generateUniqueCode();
    const session = new Session(roomCode, SessionStatus.LOBBY);

    session.addPlayer(new Player(sanitizedUsername, true));
    this.sessionRepository.saveSession(roomCode, session);

    const sessionData = this.createSessionData(session);
    this.eventPublisher.publishToRoom(roomCode, "sessionInitialized", sessionData);
    return sessionData;
  }

  public joinSession(roomCode: string, username: string): SessionData {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const sanitizedUsername = username.trim();

    if (sanitizedUsername.length === 0) {
      throw new Error("The username cannot be empty.");
    }

    const session = this.sessionRepository.getSession(normalizedRoomCode);

    if (session.getStatus() !== SessionStatus.LOBBY) {
      throw new Error("Players can only join a session while it is in the lobby.");
    }

    if (!this.lobbyService.checkUsernameUnique(session, sanitizedUsername)) {
      throw new Error("The username is already in use in this session.");
    }

    session.addPlayer(new Player(sanitizedUsername, false));

    const sessionData = this.createSessionData(session);
    this.eventPublisher.publishToRoom(normalizedRoomCode, "playerJoined", sessionData);
    return sessionData;
  }

  public resumeSession(roomCode: string, username: string): SessionData {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const sanitizedUsername = username.trim();

    if (sanitizedUsername.length === 0) {
      throw new Error("The username cannot be empty.");
    }

    const session = this.sessionRepository.getSession(normalizedRoomCode);

    if (session.getStatus() === SessionStatus.TERMINATED) {
      throw new Error("This session is no longer available.");
    }

    session.getPlayer(sanitizedUsername);
    return this.createSessionData(session);
  }

  public selectPlayerRole(
    roomCode: string,
    username: string,
    team: Team,
    role: Role,
  ): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const session = this.sessionRepository.getSession(normalizedRoomCode);

    if (session.getStatus() !== SessionStatus.LOBBY) {
      throw new Error("Roles can only be selected while the session is in the lobby.");
    }

    this.lobbyService.assignRole(session, username, team, role);
    this.eventPublisher.publishToRoom(
      normalizedRoomCode,
      "playerRoleSelected",
      this.createSessionData(session),
    );
  }

  public initializeGame(roomCode: string, hostUsername: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const session = this.sessionRepository.getSession(normalizedRoomCode);
    const host = session.getHost();

    if (host.getUsername() !== hostUsername) {
      throw new Error("Only the host can initialize the game.");
    }

    if (!this.lobbyService.validateLobbyState(session)) {
      throw new Error("The lobby is not ready to start the game.");
    }

    const game = this.gameFactory.createGame(session.getPlayers());
    session.setGame(game);
    session.setStatus(SessionStatus.ACTIVE);

    this.eventPublisher.publishToRoom(
      normalizedRoomCode,
      "gameInitialized",
      this.createSessionData(session),
    );
  }

  public submitHint(
    roomCode: string,
    username: string,
    hintWord: string,
    hintCount: number,
  ): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const session = this.sessionRepository.getSession(normalizedRoomCode);
    this.turnService.submitHint(session, username, hintWord, hintCount);
    this.eventPublisher.publishToRoom(
      normalizedRoomCode,
      "sessionUpdated",
      this.createSessionData(session),
    );
  }

  public selectWord(roomCode: string, username: string, cardIndex: number): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const session = this.sessionRepository.getSession(normalizedRoomCode);
    const result = this.turnService.selectWord(session, username, cardIndex);

    if (result.gameFinished) {
      session.setStatus(SessionStatus.TERMINATED);
      this.eventPublisher.publishToRoom(normalizedRoomCode, "sessionTerminated", {
        roomCode: normalizedRoomCode,
      });
      this.sessionRepository.deleteSession(normalizedRoomCode);
      return;
    }

    this.eventPublisher.publishToRoom(
      normalizedRoomCode,
      "sessionUpdated",
      this.createSessionData(session),
    );
  }

  public endTurn(roomCode: string, username: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const session = this.sessionRepository.getSession(normalizedRoomCode);
    this.turnService.endTurn(session, username);
    this.eventPublisher.publishToRoom(
      normalizedRoomCode,
      "sessionUpdated",
      this.createSessionData(session),
    );
  }

  public terminateSession(roomCode: string, hostUsername: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const session = this.sessionRepository.getSession(normalizedRoomCode);

    if (session.getHost().getUsername() !== hostUsername) {
      throw new Error("Only the host can terminate the session.");
    }

    session.setStatus(SessionStatus.TERMINATED);
    this.eventPublisher.publishToRoom(normalizedRoomCode, "sessionTerminated", {
      roomCode: normalizedRoomCode,
    });
    this.sessionRepository.deleteSession(normalizedRoomCode);
  }

  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const code = this.sessionCodeGenerator.generateCode();

      if (!this.sessionRepository.exists(code)) {
        return code;
      }
    }

    throw new Error("Unable to generate a unique room code.");
  }

  private createSessionData(session: Session): SessionData {
    const roomCode = session.getRoomCode();
    const status = session.getStatus();
    const players = session.getPlayers();

    try {
      return new SessionData(roomCode, status, players, session.getGame());
    } catch {
      return new SessionData(roomCode, status, players, null);
    }
  }
}
