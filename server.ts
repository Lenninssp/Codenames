import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { GameController } from "./apps/backend/src/application/services/GameController.ts";
import { GameFactory } from "./apps/backend/src/application/services/GameFactory.ts";
import { HintValidator } from "./apps/backend/src/application/services/HintValidator.ts";
import { LobbyService } from "./apps/backend/src/application/services/LobbyService.ts";
import { SessionCodeGenerator } from "./apps/backend/src/application/services/SessionCodeGenerator.ts";
import { TurnService } from "./apps/backend/src/application/services/TurnService.ts";
import { Role } from "./apps/backend/src/domain/enums/Role.ts";
import { Team } from "./apps/backend/src/domain/enums/Team.ts";
import { InMemorySessionRepository } from "./apps/backend/src/infrastructure/persistence/InMemorySessionRepository.ts";
import type { EventPublisher } from "./apps/backend/src/infrastructure/realtime/EventPublisher.ts";
import { RandomWordBank } from "./apps/backend/src/infrastructure/words/RandomWordBank.ts";

type ClientMessage = {
  action?: string;
  roomCode?: string;
  [key: string]: unknown;
};

type SocketData = {
  id: string;
};

type AppSocket = {
  send(message: string): unknown;
};

type RoomEvent = {
  eventType: string;
  payload: object;
};

type ClientMessageHandler = (
  socket: AppSocket,
  message: ClientMessage,
) => boolean | Promise<boolean>;

const host = "0.0.0.0";
const port = Number.parseInt(Bun.env.PORT ?? "3000", 10);
const websocketPath = Bun.env.WS_PATH ?? "/ws";
const projectRoot = import.meta.dir;
const frontendDistDir = join(projectRoot, "apps/frontend/dist");

const mimeTypes = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".webp", "image/webp"],
]);

const normalizeRoomCode = (value: string): string => value.trim().toUpperCase();

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

class BunEventPublisher implements EventPublisher {
  private sockets = new Set<AppSocket>();
  private roomSubscriptions = new Map<string, Set<AppSocket>>();
  private clientMessageHandler: ClientMessageHandler | null = null;

  public publish(eventType: string, payload: object): void {
    const event = JSON.stringify({ eventType, payload } satisfies RoomEvent);

    for (const socket of this.sockets) {
      socket.send(event);
    }
  }

  public publishToRoom(roomCode: string, eventType: string, payload: object): void {
    const sockets = this.roomSubscriptions.get(normalizeRoomCode(roomCode));

    if (!sockets) {
      return;
    }

    const event = JSON.stringify({ eventType, payload } satisfies RoomEvent);

    for (const socket of sockets) {
      socket.send(event);
    }
  }

  public emitToClient(
    socket: AppSocket,
    eventType: string,
    payload: object,
  ): void {
    socket.send(JSON.stringify({ eventType, payload } satisfies RoomEvent));
  }

  public joinRoom(roomCode: string, socket: AppSocket): void {
    const normalizedCode = normalizeRoomCode(roomCode);

    if (!normalizedCode) {
      throw new Error("Room code cannot be empty.");
    }

    const sockets = this.roomSubscriptions.get(normalizedCode) ?? new Set<AppSocket>();
    sockets.add(socket);
    this.roomSubscriptions.set(normalizedCode, sockets);
  }

  public leaveRoom(roomCode: string, socket: AppSocket): void {
    const normalizedCode = normalizeRoomCode(roomCode);
    const sockets = this.roomSubscriptions.get(normalizedCode);

    if (!sockets) {
      return;
    }

    sockets.delete(socket);

    if (sockets.size === 0) {
      this.roomSubscriptions.delete(normalizedCode);
    }
  }

  public setClientMessageHandler(handler: ClientMessageHandler): void {
    this.clientMessageHandler = handler;
  }

  public handleOpen(socket: AppSocket): void {
    this.sockets.add(socket);
    this.emitToClient(socket, "connectionEstablished", {
      message: "Connected",
    });
  }

  public handleClose(socket: AppSocket): void {
    this.sockets.delete(socket);

    for (const [roomCode, sockets] of this.roomSubscriptions.entries()) {
      sockets.delete(socket);

      if (sockets.size === 0) {
        this.roomSubscriptions.delete(roomCode);
      }
    }
  }

  public async handleMessage(
    socket: AppSocket,
    rawMessage: string | Buffer,
  ): Promise<void> {
    const text = typeof rawMessage === "string" ? rawMessage : rawMessage.toString("utf-8");

    let parsed: ClientMessage;

    try {
      parsed = JSON.parse(text) as ClientMessage;
    } catch {
      this.emitToClient(socket, "error", {
        message: "Invalid JSON payload.",
      });
      return;
    }

    if (parsed.action === "joinRoom") {
      if (!parsed.roomCode) {
        this.emitToClient(socket, "error", {
          message: "roomCode is required for joinRoom.",
        });
        return;
      }

      this.joinRoom(parsed.roomCode, socket);
      this.emitToClient(socket, "roomJoined", {
        roomCode: normalizeRoomCode(parsed.roomCode),
      });
      return;
    }

    if (parsed.action === "leaveRoom") {
      if (!parsed.roomCode) {
        this.emitToClient(socket, "error", {
          message: "roomCode is required for leaveRoom.",
        });
        return;
      }

      this.leaveRoom(parsed.roomCode, socket);
      this.emitToClient(socket, "roomLeft", {
        roomCode: normalizeRoomCode(parsed.roomCode),
      });
      return;
    }

    if (parsed.action === "ping") {
      this.emitToClient(socket, "pong", {
        timestamp: Date.now(),
      });
      return;
    }

    if (!this.clientMessageHandler) {
      this.emitToClient(socket, "error", {
        message: "No client message handler configured.",
      });
      return;
    }

    const handled = await this.clientMessageHandler(socket, parsed);

    if (!handled) {
      this.emitToClient(socket, "error", {
        message: "Unsupported action. Use joinRoom, leaveRoom, or ping.",
      });
    }
  }
}

const repository = new InMemorySessionRepository();
const publisher = new BunEventPublisher();
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
          roomCode: normalizeRoomCode(roomCode),
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
          roomCode: normalizeRoomCode(roomCode),
          sessionData,
        });
        return true;
      }
      case "selectPlayerRole": {
        const roomCode = getRequiredString(payload, "roomCode");
        const username = getRequiredString(payload, "username");
        controller.selectPlayerRole(roomCode, username, toTeam(payload.team), toRole(payload.role));
        publisher.emitToClient(socket, "actionResult", {
          action: message.action,
          roomCode: normalizeRoomCode(roomCode),
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
          roomCode: normalizeRoomCode(roomCode),
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
          roomCode: normalizeRoomCode(roomCode),
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
          roomCode: normalizeRoomCode(roomCode),
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
          roomCode: normalizeRoomCode(roomCode),
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
          roomCode: normalizeRoomCode(roomCode),
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

const getAssetResponse = async (pathname: string): Promise<Response | null> => {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const relativePath = safePath.replace(/^\/+/, "");
  const fullPath = join(frontendDistDir, relativePath);

  if (existsSync(fullPath)) {
    const file = Bun.file(fullPath);
    const extension = extname(fullPath);
    const contentType = mimeTypes.get(extension);

    return new Response(file, {
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  }

  const indexPath = join(frontendDistDir, "index.html");

  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return null;
};

const server = Bun.serve<SocketData>({
  hostname: host,
  port,
  fetch(request, serverInstance) {
    const url = new URL(request.url);

    if (url.pathname === websocketPath) {
      const upgraded = serverInstance.upgrade(request, {
        data: {
          id: crypto.randomUUID(),
        },
      });

      if (upgraded) {
        return undefined;
      }

      return new Response("WebSocket upgrade failed.", { status: 400 });
    }

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        transport: "bun-websocket",
        websocketPath,
      });
    }

    return getAssetResponse(url.pathname).then((response) => {
      if (response) {
        return response;
      }

      return new Response(
        "Frontend build not found. Run `bun run build:frontend` before starting the server.",
        { status: 503 },
      );
    });
  },
  websocket: {
    open(socket) {
      publisher.handleOpen(socket);
    },
    async message(socket, message) {
      await publisher.handleMessage(socket, message);
    },
    close(socket) {
      publisher.handleClose(socket);
    },
  },
});

console.log(`[bun] serving http://${host}:${server.port}`);
console.log(`[bun] websocket ws://${host}:${server.port}${websocketPath}`);
