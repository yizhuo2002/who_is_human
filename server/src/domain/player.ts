import type { Kind } from "./types.js";

export class Player {
  constructor(
    public id: string,
    public name: string,
    public kind: Kind,
    public isEliminated = false
  ) {}
}

export class AIPlayer extends Player {
  constructor(id: string, name: string, private persona: string) {
    super(id, name, "AI");
  }

  async speak(context: string): Promise<string> {
    const { askLLM } = await import("../ai/provider.js");
    return askLLM(
      `${this.persona}\nContext: ${context}\nPlease reply in natural, human-like English:`
    );
  }
}

export class HostAI extends AIPlayer {
  announceRules(): string {
    return (
      "Rules: 3 rounds of discussion → summary → voting. " +
      "You win if you eliminate 2 AIs within 2 rounds. " +
      "You lose if the human is eliminated."
    );
  }
}
