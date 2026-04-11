import { Session } from "../../domain/entities/Session.ts";
import type { SessionRepository } from "./SessionRepository.ts";

export class InMemorySessionRepository implements SessionRepository {
  private sessionsByCode: Map<string, Session>;

  public constructor() {
    this.sessionsByCode = new Map<string, Session>();
  }

  public exists(code: string): boolean {
    return this.sessionsByCode.has(code);
  }

  public saveSession(code: string, session: Session): void {
    this.sessionsByCode.set(code, session);
  }

  public getSession(code: string): Session {
    const session = this.sessionsByCode.get(code);

    if (!session) {
      throw new Error("The requested session does not exist.");
    }

    return session;
  }

  public deleteSession(code: string): void {
    this.sessionsByCode.delete(code);
  }
}
