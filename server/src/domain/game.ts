import type { Phase, PublicPlayer } from "./types.js";
import { Player, AIPlayer, HostAI } from "./player.js";

type Msg = { playerId: string; round: number; text: string };

export class Game {
  id: string;
  phase: Phase = "ROUND_START";
  round = 1;
  players: Player[] = [];
  messages: Msg[] = [];

  constructor(id: string, public human: Player, public host: HostAI, public ais: AIPlayer[]) {
    this.id = id;
    // Host stays in players for display, but is immune to elimination
    this.players = [human, host, ...ais];
  }

  private isHost = (p: Player) => p.id === this.host.id;

  postMessage(playerId: string, text: string) {
    this.messages.push({ playerId, round: this.round, text });
  }

  nextPhase() {
    const order: Phase[] = ["ROUND_START","HOST_ANNOUNCE","DISCUSS","SUMMARY","VOTE","END"];
    const i = order.indexOf(this.phase);
    this.phase = order[Math.min(i + 1, order.length - 1)];
  }

  /** Eliminate top-voted non-host player. Votes for host are ignored. */
  tallyAndEliminate(votes: Record<string, string[]>) {
    const count: Record<string, number> = {};
    for (const [targetId, voters] of Object.entries(votes)) {
      const target = this.players.find(p => p.id === targetId);
      if (!target) continue;
      if (this.isHost(target)) continue; // host is immune
      count[targetId] = (count[targetId] ?? 0) + voters.length;
    }
    const target = Object.entries(count).sort((a,b) => b[1]-a[1])[0]?.[0];
    if (target) {
      const p = this.players.find(x => x.id === target)!;
      p.isEliminated = true;
      this.postMessage("system", `${p.name} was eliminated at round ${this.round}.`);
    }
  }

  winOrLose(): "WIN" | "LOSE" | "CONTINUE" {
    const eliminatedAIs = this.players.filter(p => p.kind === "AI" && !this.isHost(p) && p.isEliminated).length;
    const humanOut = this.players.find(p => p.kind === "HUMAN")!.isEliminated;
    if (humanOut) return "LOSE";
    if (this.round <= 2 && eliminatedAIs >= 2) return "WIN";
    return "CONTINUE";
  }

  newRoundOrEnd() {
    this.round++;
    this.phase = this.round > 3 ? "END" : "ROUND_START";
  }

  publicState() {
    const players: PublicPlayer[] = this.players.map(p => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      isEliminated: this.isHost(p) ? false : p.isEliminated, // host always reported as not eliminated
    }));
    return {
      id: this.id,
      phase: this.phase,
      round: this.round,
      players,
      messages: this.messages.filter(m => m.round === this.round),
    };
  }
}
