import { SessionData } from "../data/SessionData.ts";
import { Card } from "../../domain/entities/Card.ts";
import { Game } from "../../domain/entities/Game.ts";
import { Grid } from "../../domain/entities/Grid.ts";
import { Player } from "../../domain/entities/Player.ts";
import { Session } from "../../domain/entities/Session.ts";
import { Turn } from "../../domain/entities/Turn.ts";
import { GameStatus } from "../../domain/enums/GameStatus.ts";
import { Identity } from "../../domain/enums/Identity.ts";
import { Role } from "../../domain/enums/Role.ts";
import { SessionStatus } from "../../domain/enums/SessionStatus.ts";
import { Team } from "../../domain/enums/Team.ts";
import { TurnPhase } from "../../domain/enums/TurnPhase.ts";
import { SessionMemoryMap } from "../../infrastructure/persistence/SessionMemoryMap.ts";
import { WebSocketServer } from "../../infrastructure/realtime/WebSocketServer.ts";
import { WordBank } from "../../infrastructure/words/WordBank.ts";

type PlayerState = {
  username: string;
  team?: Team;
  role?: Role;
  isHost: boolean;
};

type SessionState = {
  roomCode: string;
  status: SessionStatus;
  players: Player[];
  game: Game | null;
};

type GameState = {
  activeTeam: Team;
  status: GameStatus;
  grid: Grid;
  turns: Turn[];
};

type CardState = {
  identity: Identity;
};

type TurnState = {
  phase: TurnPhase;
  isComplete: boolean;
};

const readPlayerState = (player: Player): PlayerState =>
  player as unknown as PlayerState;

const readSessionState = (session: Session): SessionState =>
  session as unknown as SessionState;

const readGameState = (game: Game): GameState => game as unknown as GameState;

const readCardState = (card: Card): CardState => card as unknown as CardState;

const readTurnState = (turn: Turn): TurnState => turn as unknown as TurnState;

const toIdentity = (team: Team): Identity =>
  team === Team.RED ? Identity.RED : Identity.BLUE;

const getCurrentTurn = (game: Game): Turn => {
  const { turns } = readGameState(game);
  const turn = turns[turns.length - 1];

  if (!turn) {
    throw new Error("The game has no active turn.");
  }

  return turn;
};

const createSessionData = (session: Session, username: string): SessionData => {
  const { roomCode, players, status } = readSessionState(session);
  return new SessionData(roomCode, username, [...players], status);
};

const assertRoleForActiveTeam = (
  session: Session,
  username: string,
  team: Team,
  role: Role,
): Player => {
  const player = session.getPlayer(username);
  const { team: assignedTeam, role: assignedRole } = readPlayerState(player);

  if (assignedTeam !== team || assignedRole !== role) {
    throw new Error("The player is not allowed to perform this action.");
  }

  return player;
};

export class GameService {
  private sessionStore: SessionMemoryMap;
  private webSocketServer: WebSocketServer;
  private wordBank: WordBank;

  public constructor(
    sessionStore: SessionMemoryMap,
    webSocketServer: WebSocketServer,
    wordBank: WordBank,
  ) {
    this.sessionStore = sessionStore;
    this.webSocketServer = webSocketServer;
    this.wordBank = wordBank;
  }

  public initializeSession(username: string): SessionData {
    const sanitizedUsername = username.trim();

    if (sanitizedUsername.length === 0) {
      throw new Error("The username cannot be empty.");
    }

    const roomCode = this.generateCode();
    const session = new Session(roomCode, SessionStatus.LOBBY);
    const host = new Player(sanitizedUsername, true);

    session.addPlayer(host);
    this.sessionStore.saveSession(roomCode, session);

    const sessionData = createSessionData(session, sanitizedUsername);
    this.webSocketServer.broadcastToRoom(roomCode, "sessionInitialized", sessionData);
    return sessionData;
  }

  public generateCode(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      let code = "";

      for (let index = 0; index < 6; index += 1) {
        const randomIndex = Math.floor(Math.random() * alphabet.length);
        code += alphabet[randomIndex] ?? alphabet[0];
      }

      if (!this.sessionStore.exists(code)) {
        return code;
      }
    }

    throw new Error("Unable to generate a unique room code.");
  }

  public selectPlayerRole(
    roomCode: string,
    username: string,
    team: Team,
    role: Role,
  ): void {
    const session = this.sessionStore.getSession(roomCode);
    const { status } = readSessionState(session);

    if (status !== SessionStatus.LOBBY) {
      throw new Error("Roles can only be selected while the session is in the lobby.");
    }

    const player = session.getPlayer(username);
    const playerState = readPlayerState(player);

    if (
      role === Role.SPYMASTER &&
      !session.isSpymasterSlotAvailable(team) &&
      !(playerState.team === team && playerState.role === Role.SPYMASTER)
    ) {
      throw new Error("That spymaster slot is already taken.");
    }

    player.setTeam(team);
    player.setRole(role);

    this.webSocketServer.broadcastToRoom(
      roomCode,
      "playerRoleSelected",
      createSessionData(session, username),
    );
  }

  public joinSession(roomCode: string, username: string): SessionData {
    const sanitizedUsername = username.trim();

    if (sanitizedUsername.length === 0) {
      throw new Error("The username cannot be empty.");
    }

    const session = this.sessionStore.getSession(roomCode);
    const { status } = readSessionState(session);

    if (status !== SessionStatus.LOBBY) {
      throw new Error("Players can only join a session while it is in the lobby.");
    }

    if (!session.checkUsernameUnique(sanitizedUsername)) {
      throw new Error("The username is already in use in this session.");
    }

    session.addPlayer(new Player(sanitizedUsername, false));

    const sessionData = createSessionData(session, sanitizedUsername);
    this.webSocketServer.broadcastToRoom(roomCode, "playerJoined", sessionData);
    return sessionData;
  }

  public initializeGame(roomCode: string, hostUsername: string): void {
    const session = this.sessionStore.getSession(roomCode);
    const host = session.getHost();
    const { username } = readPlayerState(host);

    if (username !== hostUsername) {
      throw new Error("Only the host can initialize the game.");
    }

    if (!session.validateLobbyState()) {
      throw new Error("The lobby is not ready to start the game.");
    }

    const words = this.wordBank.fetchRandomWords(25);
    const startingTeam = this.selectStartingTeam();
    const distributionMap = new Map<Identity, number>([
      [Identity.RED, startingTeam === Team.RED ? 9 : 8],
      [Identity.BLUE, startingTeam === Team.BLUE ? 9 : 8],
      [Identity.NEUTRAL, 7],
      [Identity.KILLER, 1],
    ]);

    const grid = new Grid();

    for (const word of words) {
      const identity = this.determineIdentity(distributionMap);
      grid.addCard(new Card(word, identity));
    }

    const game = new Game();
    game.setGrid(grid);
    game.setActiveTeam(startingTeam);
    game.setStatus(GameStatus.ACTIVE);
    game.createTurn();

    session.setGame(game);
    session.setStatus(SessionStatus.ACTIVE);

    this.webSocketServer.broadcastToRoom(
      roomCode,
      "gameInitialized",
      createSessionData(session, hostUsername),
    );
  }

  public submitHint(
    roomCode: string,
    username: string,
    hintWord: string,
    hintCount: number,
  ): void {
    const session = this.sessionStore.getSession(roomCode);
    const game = session.getGame();
    const { status, activeTeam, grid } = readGameState(game);
    const turn = getCurrentTurn(game);
    const { phase } = readTurnState(turn);
    const sanitizedHintWord = hintWord.trim();

    if (status !== GameStatus.ACTIVE) {
      throw new Error("The game is not active.");
    }

    if (phase !== TurnPhase.SPYMASTER_HINTING) {
      throw new Error("Hints can only be submitted during the spymaster phase.");
    }

    if (sanitizedHintWord.length === 0) {
      throw new Error("The hint cannot be empty.");
    }

    if (hintCount < 0) {
      throw new Error("The hint count cannot be negative.");
    }

    assertRoleForActiveTeam(session, username, activeTeam, Role.SPYMASTER);

    if (!grid.checkUnrevealedCards(sanitizedHintWord)) {
      throw new Error("The hint matches an unrevealed card.");
    }

    turn.createHint(sanitizedHintWord, hintCount);

    this.webSocketServer.broadcastToRoom(roomCode, "hintSubmitted", {
      roomCode,
      username,
      hintWord: sanitizedHintWord,
      hintCount,
    });
  }

  public selectWord(roomCode: string, username: string, cardIndex: number): void {
    const session = this.sessionStore.getSession(roomCode);
    const game = session.getGame();
    const gameState = readGameState(game);
    const turn = getCurrentTurn(game);
    const turnState = readTurnState(turn);

    if (gameState.status !== GameStatus.ACTIVE) {
      throw new Error("The game is not active.");
    }

    if (turnState.phase !== TurnPhase.OPERATOR_GUESSING) {
      throw new Error("Words can only be selected during the operator phase.");
    }

    assertRoleForActiveTeam(session, username, gameState.activeTeam, Role.OPERATOR);

    const card = gameState.grid.revealCard(cardIndex);
    const { identity } = readCardState(card);
    const isCorrect = identity === toIdentity(gameState.activeTeam);

    turn.recordGuess(cardIndex, isCorrect);
    turn.decrementRemainingGuesses();
    turn.markCompleteIfNeeded(identity);
    game.evaluateGameState(identity);

    if (readGameState(game).status === GameStatus.FINISHED) {
      this.webSocketServer.broadcastToRoom(roomCode, "gameFinished", game.getResult());
      return;
    }

    if (readTurnState(turn).isComplete) {
      game.toggleActiveTeam();
      game.createTurn();
    }

    this.webSocketServer.broadcastToRoom(roomCode, "wordSelected", {
      roomCode,
      username,
      cardIndex,
      identity,
      isCorrect,
    });
  }

  public endTurn(roomCode: string, username: string): void {
    const session = this.sessionStore.getSession(roomCode);
    const game = session.getGame();
    const { status, activeTeam } = readGameState(game);
    const turn = getCurrentTurn(game);
    const { phase } = readTurnState(turn);

    if (status !== GameStatus.ACTIVE) {
      throw new Error("The game is not active.");
    }

    if (phase !== TurnPhase.OPERATOR_GUESSING) {
      throw new Error("Only an active operator phase can be ended.");
    }

    assertRoleForActiveTeam(session, username, activeTeam, Role.OPERATOR);

    turn.markComplete();
    game.toggleActiveTeam();
    game.createTurn();

    this.webSocketServer.broadcastToRoom(roomCode, "turnEnded", {
      roomCode,
      username,
    });
  }

  public terminateSession(roomCode: string, hostUsername: string): void {
    const session = this.sessionStore.getSession(roomCode);
    const host = session.getHost();
    const { username } = readPlayerState(host);

    if (username !== hostUsername) {
      throw new Error("Only the host can terminate the session.");
    }

    session.setStatus(SessionStatus.TERMINATED);
    this.webSocketServer.broadcastToRoom(roomCode, "sessionTerminated", { roomCode });
    this.sessionStore.deleteSession(roomCode);
  }

  public determineIdentity(distributionMap: Map<Identity, number>): Identity {
    const availableEntries = [...distributionMap.entries()].filter(
      ([, count]) => count > 0,
    );

    if (availableEntries.length === 0) {
      throw new Error("The identity distribution map is empty.");
    }

    const total = availableEntries.reduce((sum, [, count]) => sum + count, 0);
    let selectedValue = Math.floor(Math.random() * total);

    for (const [identity, count] of availableEntries) {
      if (selectedValue < count) {
        distributionMap.set(identity, count - 1);
        return identity;
      }

      selectedValue -= count;
    }

    throw new Error("Unable to determine an identity.");
  }

  public selectStartingTeam(): Team {
    return Math.random() < 0.5 ? Team.RED : Team.BLUE;
  }
}
