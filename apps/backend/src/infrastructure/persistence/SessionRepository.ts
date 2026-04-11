import { Session } from "../../domain/entities/Session.ts";

export interface SessionRepository {
  exists(code: string): boolean;
  saveSession(code: string, session: Session): void;
  getSession(code: string): Session;
  deleteSession(code: string): void;
}
