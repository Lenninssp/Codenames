import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import type { EventPublisher } from "./EventPublisher.ts";

type RoomEvent = {
  eventType: string;
  payload: object;
};

type ClientMessage = {
  action?: string;
  roomCode?: string;
  [key: string]: unknown;
};

type ClientMessageHandler = (
  socket: WebSocket,
  message: ClientMessage,
) => boolean | Promise<boolean>;

export class WebSocketEventPublisher implements EventPublisher {
  private host: string;
  private port: number;
  private websocketPath: string;
  private httpServer: ReturnType<typeof createServer> | null;
  private websocketServer: WebSocketServer | null;
  private clients: Set<WebSocket>;
  private roomSubscriptions: Map<string, Set<WebSocket>>;
  private clientMessageHandler: ClientMessageHandler | null;

  public constructor(
    options: {
      host?: string;
      port?: number;
      websocketPath?: string;
    } = {},
  ) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 3000;
    this.websocketPath = options.websocketPath ?? "/ws";
    this.httpServer = null;
    this.websocketServer = null;
    this.clients = new Set<WebSocket>();
    this.roomSubscriptions = new Map<string, Set<WebSocket>>();
    this.clientMessageHandler = null;
  }

  public start(): void {
    if (this.httpServer || this.websocketServer) {
      return;
    }

    this.httpServer = createServer((request: IncomingMessage, response: ServerResponse) => {
      this.handleHttpRequest(request, response);
    });

    this.websocketServer = new WebSocketServer({ noServer: true });

    this.websocketServer.on("connection", (socket: WebSocket, request: IncomingMessage) => {
      this.handleOpen(socket, request);
    });

    this.httpServer.on("upgrade", (request, socket, head) => {
      const pathname = this.getPathname(request);

      if (pathname !== this.websocketPath || !this.websocketServer) {
        socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
        socket.destroy();
        return;
      }

      this.websocketServer.handleUpgrade(request, socket, head, (ws) => {
        this.websocketServer?.emit("connection", ws, request);
      });
    });

    this.httpServer.listen(this.port, this.host, () => {
      const address = this.httpServer?.address() as AddressInfo | null;
      const boundPort = address?.port ?? this.port;

      console.log(`[http] listening on http://${this.host}:${boundPort}`);
      console.log(`[ws] listening on ws://${this.host}:${boundPort}${this.websocketPath}`);
    });
  }

  public stop(): void {
    for (const client of this.clients) {
      client.close(1001, "Server shutdown");
    }

    this.websocketServer?.close();
    this.httpServer?.close();

    this.websocketServer = null;
    this.httpServer = null;
    this.clients.clear();
    this.roomSubscriptions.clear();
  }

  public publish(eventType: string, payload: object): void {
    const event: RoomEvent = { eventType, payload };

    for (const socket of this.clients) {
      this.sendToSocket(socket, event);
    }
  }

  public publishToRoom(roomCode: string, eventType: string, payload: object): void {
    const normalizedCode = roomCode.trim().toUpperCase();
    const sockets = this.roomSubscriptions.get(normalizedCode);

    if (!sockets) {
      return;
    }

    const event: RoomEvent = { eventType, payload };

    for (const socket of sockets) {
      this.sendToSocket(socket, event);
    }
  }

  public emitToClient(socket: WebSocket, eventType: string, payload: object): void {
    this.sendToSocket(socket, { eventType, payload });
  }

  public setClientMessageHandler(handler: ClientMessageHandler): void {
    this.clientMessageHandler = handler;
  }

  public joinRoom(roomCode: string, socket: WebSocket): void {
    const normalizedCode = roomCode.trim().toUpperCase();

    if (!normalizedCode) {
      throw new Error("Room code cannot be empty.");
    }

    const sockets = this.roomSubscriptions.get(normalizedCode) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.roomSubscriptions.set(normalizedCode, sockets);
  }

  public leaveRoom(roomCode: string, socket: WebSocket): void {
    const normalizedCode = roomCode.trim().toUpperCase();
    const sockets = this.roomSubscriptions.get(normalizedCode);

    if (!sockets) {
      return;
    }

    sockets.delete(socket);

    if (sockets.size === 0) {
      this.roomSubscriptions.delete(normalizedCode);
    }
  }

  private handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
    const pathname = this.getPathname(request);

    if (pathname === "/health") {
      const payload = JSON.stringify({
        status: "ok",
        transport: "websocket",
        websocketPath: this.websocketPath,
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(payload);
      return;
    }

    response.statusCode = 404;
    response.end("Not Found");
  }

  private handleOpen(socket: WebSocket, request: IncomingMessage): void {
    this.clients.add(socket);

    const roomCode = this.getRoomCodeFromRequest(request);

    if (roomCode) {
      this.joinRoom(roomCode, socket);
    }

    this.sendToSocket(socket, {
      eventType: "connectionEstablished",
      payload: {
        message: "Connected",
        roomCode: roomCode ?? null,
      },
    });

    socket.on("message", (data) => {
      this.handleClientMessage(socket, data);
    });

    socket.on("close", () => {
      this.clients.delete(socket);
      this.unsubscribeFromAllRooms(socket);
    });
  }

  private handleClientMessage(socket: WebSocket, rawMessage: unknown): void {
    const text = this.decodeMessage(rawMessage);

    if (text === null) {
      this.sendToSocket(socket, {
        eventType: "error",
        payload: { message: "Unsupported payload type." },
      });
      return;
    }

    let parsed: ClientMessage;

    try {
      parsed = JSON.parse(text) as ClientMessage;
    } catch {
      this.sendToSocket(socket, {
        eventType: "error",
        payload: { message: "Invalid JSON payload." },
      });
      return;
    }

    if (parsed.action === "joinRoom") {
      if (!parsed.roomCode) {
        this.sendToSocket(socket, {
          eventType: "error",
          payload: { message: "roomCode is required for joinRoom." },
        });
        return;
      }

      this.joinRoom(parsed.roomCode, socket);
      this.sendToSocket(socket, {
        eventType: "roomJoined",
        payload: { roomCode: parsed.roomCode.trim().toUpperCase() },
      });
      return;
    }

    if (parsed.action === "leaveRoom") {
      if (!parsed.roomCode) {
        this.sendToSocket(socket, {
          eventType: "error",
          payload: { message: "roomCode is required for leaveRoom." },
        });
        return;
      }

      this.leaveRoom(parsed.roomCode, socket);
      this.sendToSocket(socket, {
        eventType: "roomLeft",
        payload: { roomCode: parsed.roomCode.trim().toUpperCase() },
      });
      return;
    }

    if (parsed.action === "ping") {
      this.sendToSocket(socket, {
        eventType: "pong",
        payload: { timestamp: Date.now() },
      });
      return;
    }

    if (this.clientMessageHandler !== null) {
      Promise.resolve(this.clientMessageHandler(socket, parsed))
        .then((handled) => {
          if (!handled) {
            this.sendToSocket(socket, {
              eventType: "error",
              payload: {
                message: "Unsupported action. Use joinRoom, leaveRoom, or ping.",
              },
            });
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown server error.";
          this.sendToSocket(socket, {
            eventType: "error",
            payload: { message },
          });
        });
      return;
    }

    this.sendToSocket(socket, {
      eventType: "error",
      payload: {
        message: "Unsupported action. Use joinRoom, leaveRoom, or ping.",
      },
    });
  }

  private decodeMessage(rawMessage: unknown): string | null {
    if (typeof rawMessage === "string") {
      return rawMessage;
    }

    if (rawMessage instanceof Buffer) {
      return rawMessage.toString("utf-8");
    }

    if (Array.isArray(rawMessage)) {
      return Buffer.concat(rawMessage).toString("utf-8");
    }

    if (rawMessage instanceof ArrayBuffer) {
      return Buffer.from(rawMessage).toString("utf-8");
    }

    return null;
  }

  private unsubscribeFromAllRooms(socket: WebSocket): void {
    for (const [roomCode, sockets] of this.roomSubscriptions.entries()) {
      sockets.delete(socket);

      if (sockets.size === 0) {
        this.roomSubscriptions.delete(roomCode);
      }
    }
  }

  private sendToSocket(socket: WebSocket, event: RoomEvent): void {
    if (socket.readyState !== socket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(event));
  }

  private getPathname(request: IncomingMessage): string {
    const rawUrl = request.url ?? "/";
    const url = new URL(rawUrl, `http://${this.host}:${this.port}`);
    return url.pathname;
  }

  private getRoomCodeFromRequest(request: IncomingMessage): string | null {
    const rawUrl = request.url ?? "/";
    const url = new URL(rawUrl, `http://${this.host}:${this.port}`);
    const roomCode = url.searchParams.get("room");

    if (!roomCode) {
      return null;
    }

    return roomCode.trim().toUpperCase() || null;
  }
}
