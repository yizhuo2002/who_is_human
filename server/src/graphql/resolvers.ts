import { engine } from "../engine.js";
import fs from "fs";
import path from "path";
import { getOrCreateAgent, stopAgent } from "../engine/agents.js";

export const resolvers = {
  Query: {
    gameState: (_: any, { gameId }: { gameId: string }) => {
      const g = engine.get(gameId);
      return g.publicState();
    },
  },

  Mutation: {

    startGame: (_: any, { name }: { name?: string }) => {
      const g = engine.createGame(name ?? "Human");
      return g.publicState();
    },


    say: async (_: any, { gameId, text }: { gameId: string; text: string }) => {
      const g = engine.get(gameId);
      const human = g.players.find((p) => p.kind === "HUMAN")!;
      g.postMessage(human.id, text);


      if (g.phase === "ROUND_START") {
        g.nextPhase();
        const host = g.players.find(
          (p) => p.name === "Host AI" || p.name.includes("Host")
        );
        if (host) g.postMessage(host.id, g.host.announceRules());
      }

      g.nextPhase();
      for (const ai of g.players.filter((p) => p.kind === "AI") as any[]) {
        const reply = await ai.speak(
          `Round ${g.round} discussion. Human said: "${text}"`
        );
        g.postMessage(ai.id, reply);
      }

      g.nextPhase();
      return g.publicState();
    },


    vote: (
      _: any,
      { gameId, votes }: { gameId: string; votes: { voterId: string; targetId: string }[] }
    ) => {
      const g = engine.get(gameId);
      const byTarget: Record<string, string[]> = {};
      for (const { voterId, targetId } of votes) {
        (byTarget[targetId] ||= []).push(voterId);
      }
      g.nextPhase();
      g.tallyAndEliminate(byTarget);

      const result = g.winOrLose();
      if (result === "CONTINUE") g.newRoundOrEnd();
      else g.phase = "END";

      return g.publicState();
    },


    startAuto: async (_: any, { gameId }: { gameId: string }) => {
      const g = engine.get(gameId);
      const agent = getOrCreateAgent(g, (evt) => {
        // For now, just log. Later can push via Subscriptions or Socket.IO
        console.log("[Host event]", evt);
      });
      await agent.start();
      return true;
    },

    stopAuto: (_: any, { gameId }: { gameId: string }) => {
      stopAgent(gameId);
      return true;
    },
  },
};
