import { GameController } from "./application/services/GameController.ts";
import { GameFactory } from "./application/services/GameFactory.ts";
import { HintValidator } from "./application/services/HintValidator.ts";
import { LobbyService } from "./application/services/LobbyService.ts";
import { SessionCodeGenerator } from "./application/services/SessionCodeGenerator.ts";
import { TurnService } from "./application/services/TurnService.ts";
import { Role } from "./domain/enums/Role.ts";
import { Team } from "./domain/enums/Team.ts";
import { InMemorySessionRepository } from "./infrastructure/persistence/InMemorySessionRepository.ts";
import { WebSocketEventPublisher } from "./infrastructure/realtime/WebSocketEventPublisher.ts";
import { RandomWordBank } from "./infrastructure/words/RandomWordBank.ts";

type ProcessLike = {
  env?: Record<string, string | undefined>;
  on?: (signal: string, listener: () => void) => void;
};

const getProcessLike = (): ProcessLike =>
  (globalThis as { process?: ProcessLike }).process ?? {};

const getEnvNumber = (name: string, fallback: number): number => {
  const value = getProcessLike().env?.[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getEnvString = (name: string, fallback: string): string => {
  const value = getProcessLike().env?.[name];
  return value && value.trim().length > 0 ? value : fallback;
};

const toTeam = (value: unknown): Team => {
  if (value === Team.RED || value === Team.BLUE || value === Team.NONE) {
    return value;
  }

  throw new Error("Invalid team value.");
};

const toRole = (value: unknown): Role => {
  if (value === Role.SPYMASTER || value === Role.OPERATOR) {
    return value;
  }

  throw new Error("Invalid role value.");
};

const getRequiredString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
};

const getRequiredNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${key} must be a number.`);
  }

  return value;
};

const repository = new InMemorySessionRepository();
const publisher = new WebSocketEventPublisher({
  host: getEnvString("HOST", "127.0.0.1"),
  port: getEnvNumber("PORT", 3000),
  websocketPath: getEnvString("WS_PATH", "/ws"),
});

const controller = new GameController(
  repository,
  publisher,
  new LobbyService(),
  new GameFactory(new RandomWordBank()),
  new TurnService(new HintValidator(), publisher),
  new SessionCodeGenerator(),
);

publisher.setClientMessageHandler((socket, message) => {
  if (!message.action) {
    return false;
  }

  const payload = message as Record<string, unknown>;

  try {
    switch (message.action) {
      case "initializeSession": {
        const username = getRequiredString(payload, "username");
        const sessionData = controller.initializeSession(username);
        const roomCode = sessionData.getRoomCode();
        publisher.joinRoom(roomCode, socket);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          sessionData,
        });
        return true;
      }
      case "joinSession": {
        const roomCode = getRequiredString(payload, "roomCode");
        const username = getRequiredString(payload, "username");
        const sessionData = controller.joinSession(roomCode, username);
        publisher.joinRoom(roomCode, socket);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          sessionData,
        });
        return true;
      }
      case "resumeSession": {
        const roomCode = getRequiredString(payload, "roomCode");
        const username = getRequiredString(payload, "username");
        const sessionData = controller.resumeSession(roomCode, username);
        publisher.joinRoom(roomCode, socket);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          sessionData,
        });
        return true;
      }
      case "selectPlayerRole": {
        const roomCode = getRequiredString(payload, "roomCode");
        const username = getRequiredString(payload, "username");
        const team = toTeam(payload.team);
        const role = toRole(payload.role);
        controller.selectPlayerRole(roomCode, username, team, role);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          success: true,
        });
        return true;
      }
      case "initializeGame": {
        const roomCode = getRequiredString(payload, "roomCode");
        const hostUsername = getRequiredString(payload, "hostUsername");
        controller.initializeGame(roomCode, hostUsername);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          success: true,
        });
        return true;
      }
      case "submitHint": {
        const roomCode = getRequiredString(payload, "roomCode");
        const username = getRequiredString(payload, "username");
        const hintWord = getRequiredString(payload, "hintWord");
        const hintCount = getRequiredNumber(payload, "hintCount");
        controller.submitHint(roomCode, username, hintWord, hintCount);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          success: true,
        });
        return true;
      }
      case "selectWord": {
        const roomCode = getRequiredString(payload, "roomCode");
        const username = getRequiredString(payload, "username");
        const cardIndex = getRequiredNumber(payload, "cardIndex");
        controller.selectWord(roomCode, username, cardIndex);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          success: true,
        });
        return true;
      }
      case "endTurn": {
        const roomCode = getRequiredString(payload, "roomCode");
        const username = getRequiredString(payload, "username");
        controller.endTurn(roomCode, username);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          success: true,
        });
        return true;
      }
      case "terminateSession": {
        const roomCode = getRequiredString(payload, "roomCode");
        const hostUsername = getRequiredString(payload, "hostUsername");
        controller.terminateSession(roomCode, hostUsername);
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode,
          success: true,
        });
        return true;
      }
      default:
        return false;
    }
  } catch (error: unknown) {
    publisher.emitToClient(socket, "error", {
      action: message.action,
      message: error instanceof Error ? error.message : "Unknown server error.",
    });
    return true;
  }
});

publisher.start();

getProcessLike().on?.("SIGINT", () => {
  publisher.stop();
});

getProcessLike().on?.("SIGTERM", () => {
  publisher.stop();
});
