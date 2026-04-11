export interface EventPublisher {
  publish(eventType: string, payload: object): void;
  publishToRoom(roomCode: string, eventType: string, payload: object): void;
}
