import { Session } from "../../domain/entities/Session.ts";
import { GameStatus } from "../../domain/enums/GameStatus.ts";
import { Identity } from "../../domain/enums/Identity.ts";
import { Role } from "../../domain/enums/Role.ts";
import { Team } from "../../domain/enums/Team.ts";
import { TurnPhase } from "../../domain/enums/TurnPhase.ts";
import type { EventPublisher } from "../../infrastructure/realtime/EventPublisher.ts";
import { HintValidator } from "./HintValidator.ts";

const isTeamIdentity = (team: Team, identity: Identity): boolean =>
  (team === Team.RED && identity === Identity.RED) ||
  (team === Team.BLUE && identity === Identity.BLUE);

export class TurnService {
  private hintValidator: HintValidator;
  private eventPublisher: EventPublisher;

  public constructor(hintValidator: HintValidator, eventPublisher: EventPublisher) {
    this.hintValidator = hintValidator;
    this.eventPublisher = eventPublisher;
  }

  public submitHint(
    session: Session,
    username: string,
    hintWord: string,
    hintCount: number,
  ): void {
    const game = session.getGame();
    const turn = game.getCurrentTurn();
    const activeTeam = game.getActiveTeam();
    const sanitizedHintWord = hintWord.trim();

    if (game.getStatus() !== GameStatus.ACTIVE) {
      throw new Error("The game is not active.");
    }

    if (turn.getPhase() !== TurnPhase.HINT) {
      throw new Error("Hints can only be submitted during the hint phase.");
    }

    if (sanitizedHintWord.length === 0) {
      throw new Error("The hint cannot be empty.");
    }

    if (hintCount < 0) {
      throw new Error("The hint count cannot be negative.");
    }

    this.assertRoleForActiveTeam(session, username, activeTeam, Role.SPYMASTER);

    if (!this.hintValidator.validate(game.getGrid(), sanitizedHintWord)) {
      throw new Error("The hint matches an unrevealed card.");
    }

    turn.submitHint(sanitizedHintWord, hintCount);

    this.eventPublisher.publishToRoom(session.getRoomCode(), "hintSubmitted", {
      roomCode: session.getRoomCode(),
      username,
      hintWord: sanitizedHintWord,
      hintCount,
    });
  }

  public selectWord(
    session: Session,
    username: string,
    cardIndex: number,
  ): { gameFinished: boolean } {
    const game = session.getGame();
    const turn = game.getCurrentTurn();
    const activeTeam = game.getActiveTeam();

    if (game.getStatus() !== GameStatus.ACTIVE) {
      throw new Error("The game is not active.");
    }

    if (turn.getPhase() !== TurnPhase.GUESS) {
      throw new Error("Words can only be selected during the guess phase.");
    }

    this.assertRoleForActiveTeam(session, username, activeTeam, Role.OPERATOR);

    const card = game.getGrid().revealCard(cardIndex);
    const identity = card.getIdentity();
    const isCorrect = isTeamIdentity(activeTeam, identity);

    turn.recordGuess(card);
    turn.decrementRemainingGuesses();

    if (!isCorrect || turn.getRemainingGuesses() <= 0) {
      turn.complete();
    }

    const notification = game.applyRevealResult(identity);

    if (notification !== null) {
      this.eventPublisher.publishToRoom(
        session.getRoomCode(),
        "gameFinished",
        notification,
      );
      return { gameFinished: true };
    }

    if (turn.getIsComplete()) {
      game.switchActiveTeam();
      game.startTurn();
    }

    this.eventPublisher.publishToRoom(session.getRoomCode(), "wordSelected", {
      roomCode: session.getRoomCode(),
      username,
      cardIndex,
      identity,
      isCorrect,
    });

    return { gameFinished: false };
  }

  public endTurn(session: Session, username: string): void {
    const game = session.getGame();
    const turn = game.getCurrentTurn();
    const activeTeam = game.getActiveTeam();

    if (game.getStatus() !== GameStatus.ACTIVE) {
      throw new Error("The game is not active.");
    }

    if (turn.getPhase() !== TurnPhase.GUESS) {
      throw new Error("Only an active operator phase can be ended.");
    }

    this.assertRoleForActiveTeam(session, username, activeTeam, Role.OPERATOR);

    turn.complete();
    game.switchActiveTeam();
    game.startTurn();

    this.eventPublisher.publishToRoom(session.getRoomCode(), "turnEnded", {
      roomCode: session.getRoomCode(),
      username,
    });
  }

  private assertRoleForActiveTeam(
    session: Session,
    username: string,
    team: Team,
    role: Role,
  ): void {
    const player = session.getPlayer(username);

    if (player.getTeam() !== team || player.getRole() !== role) {
      throw new Error("The player is not allowed to perform this action.");
    }
  }
}
