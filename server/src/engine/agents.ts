import { HostAgent } from "./hostAgent.js";
import { Game } from "../domain/game.js";

const agents = new Map<string, HostAgent>();

export function getOrCreateAgent(game: Game, onBroadcast: (e: any) => void) {
  let agent = agents.get(game.id);
  if (!agent) {
    agent = new HostAgent(game, onBroadcast);
    agents.set(game.id, agent);
  }
  return agent;
}

export function stopAgent(gameId: string) {
  const a = agents.get(gameId);
  if (a) {
    a.stop();
    agents.delete(gameId);
  }
}
