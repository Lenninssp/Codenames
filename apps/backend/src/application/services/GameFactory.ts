import { Card } from "../../domain/entities/Card.ts";
import { Game } from "../../domain/entities/Game.ts";
import { Grid } from "../../domain/entities/Grid.ts";
import { Player } from "../../domain/entities/Player.ts";
import { Identity } from "../../domain/enums/Identity.ts";
import { Team } from "../../domain/enums/Team.ts";
import type { WordProvider } from "../../infrastructure/words/WordProvider.ts";

export class GameFactory {
  private wordProvider: WordProvider;

  public constructor(wordProvider: WordProvider) {
    this.wordProvider = wordProvider;
  }

  public createGame(players: Player[]): Game {
    if (players.length < 4) {
      throw new Error("A game requires at least four players.");
    }

    const words = this.wordProvider.fetchRandomWords(25);
    const startingTeam = this.selectStartingTeam();
    const grid = this.createGrid(words, startingTeam);
    const game = new Game(grid, startingTeam);

    game.start();
    return game;
  }

  public createGrid(words: string[], startingTeam: Team = this.selectStartingTeam()): Grid {
    const distributionMap = new Map<Identity, number>([
      [Identity.RED, startingTeam === Team.RED ? 9 : 8],
      [Identity.BLUE, startingTeam === Team.BLUE ? 9 : 8],
      [Identity.NEUTRAL, 7],
      [Identity.KILLER, 1],
    ]);

    const cards = words.map((word) => {
      const identity = this.determineIdentity(distributionMap);
      return new Card(word, identity);
    });

    return new Grid(cards);
  }

  public selectStartingTeam(): Team {
    return Math.random() < 0.5 ? Team.RED : Team.BLUE;
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
}
