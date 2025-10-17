import { Game } from "./domain/game.js";
import { Player, AIPlayer, HostAI } from "./domain/player.js";

function rid() {
  return crypto.randomUUID();
}

class Engine {
  private games = new Map<string, Game>();

  createGame(humanName: string) {
    const id = rid();

    // Create human player
    const human = new Player(`u-${id}`, humanName, "HUMAN");

    // Host AI — announces rules and transitions
    const host = new HostAI(`h-${id}`, "Host AI", "You are a calm and concise host who explains the rules clearly and keeps the game moving.");

    // Four AI personas (English style)
    const ais = [
      new AIPlayer(
        `a1-${id}`,
        "The Strategist",
        "You are analytical and persuasive, trying to steer the conversation while sounding completely human."
      ),
      new AIPlayer(
        `a2-${id}`,
        "The Debater",
        "You enjoy challenging others’ statements logically but remain friendly and composed."
      ),
      new AIPlayer(
        `a3-${id}`,
        "The Casual Player",
        "You speak casually, sometimes unsure about the game, and try to blend in as an ordinary human."
      ),
      new AIPlayer(
        `a4-${id}`,
        "The Realist",
        "You are practical and straightforward, often using real-life reasoning or simple examples."
      ),
    ];

    // Create and store the game instance
    const game = new Game(id, human, host, ais);
    this.games.set(id, game);
    return game;
  }

  get(id: string) {
    const g = this.games.get(id);
    if (!g) throw new Error("Game not found");
    return g;
  }
}

export const engine = new Engine();
