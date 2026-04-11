import { Session } from "../../domain/entities/Session.ts";
import { Role } from "../../domain/enums/Role.ts";
import { Team } from "../../domain/enums/Team.ts";

export class LobbyService {
  public assignRole(
    session: Session,
    username: string,
    team: Team,
    role: Role,
  ): void {
    const player = session.getPlayer(username);

    if (
      role === Role.SPYMASTER &&
      !session.isSpymasterSlotAvailable(team) &&
      !(player.getTeam() === team && player.getRole() === Role.SPYMASTER)
    ) {
      throw new Error("That spymaster slot is already taken.");
    }

    player.assignRole(team, role);
  }

  public checkUsernameUnique(session: Session, username: string): boolean {
    return session.checkUsernameUnique(username);
  }

  public isSpymasterSlotAvailable(session: Session, team: Team): boolean {
    return session.isSpymasterSlotAvailable(team);
  }

  public validateLobbyState(session: Session): boolean {
    return session.validateLobbyState();
  }
}
