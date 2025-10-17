import { Game } from "../domain/game.js";

export type PhaseDurations = {
  roundStartMs: number;  // delay before moving to DISCUSS
  discussMs: number;     // length of discussion
  warningMs: number;     // warn before discussion ends
  voteMs: number;        // voting window length
};

export class HostAgent {
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private game: Game,
    private onBroadcast: (event: any) => void,
    private durations: PhaseDurations = {
      roundStartMs: 300,
      discussMs: 30_000,
      warningMs: 10_000,
      voteMs: 15_000,
    }
  ) {}

  stop() {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.loop();
  }

  private async loop() {
    while (this.running && this.game.phase !== "END") {
      if (this.game.phase === "ROUND_START") {
        this.onBroadcast({ type: "phase", phase: "ROUND_START", round: this.game.round });

        // Host announces rules
        this.game.nextPhase(); // HOST_ANNOUNCE
        this.game.postMessage(this.game.host.id, this.game.host.announceRules());
        this.onBroadcast({ type: "message", round: this.game.round });

        // Proceed to discuss
        await this.sleep(this.durations.roundStartMs);
        this.game.nextPhase(); // DISCUSS
        this.onBroadcast({ type: "phase", phase: "DISCUSS", round: this.game.round });

        // Warn before end of discussion
        this.setTimer(this.durations.discussMs - this.durations.warningMs, () => {
          this.onBroadcast({ type: "notice", text: "⏳ Discussion almost over" });
        });

        // End of discussion -> summary
        await this.sleep(this.durations.discussMs);
        this.game.nextPhase(); // SUMMARY
        this.onBroadcast({ type: "phase", phase: "SUMMARY", round: this.game.round });

        // Host summary (simple text; you can call LLM here if you wish)
        this.game.postMessage(this.game.host.id, `Round ${this.game.round} summary: please vote.`);
        this.onBroadcast({ type: "message", round: this.game.round });

        // Open voting
        this.game.nextPhase(); // VOTE
        this.onBroadcast({ type: "phase", phase: "VOTE", round: this.game.round });

        // Close voting and advance automatically
        await this.sleep(this.durations.voteMs);
        this.finishVoteAndAdvance();
      } else {
        // If loop is entered mid-phase, just try to finish coherently
        this.finishVoteAndAdvance();
      }
    }
  }

  /** After voting window: tally (your resolvers should have recorded votes), advance rounds/end */
  private finishVoteAndAdvance() {
    // If you buffer votes in memory somewhere, call: this.game.tallyAndEliminate(buffer)
    // Our current example assumes votes were tallied via the Mutation already.

    const result = this.game.winOrLose();
    if (result === "CONTINUE") {
      this.onBroadcast({ type: "result", result, round: this.game.round });
      this.game.newRoundOrEnd();
    } else {
      this.game.phase = "END";
      this.onBroadcast({ type: "result", result, round: this.game.round });
    }
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      this.timers.push(t);
    });
  }

  private setTimer(ms: number, fn: () => void) {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
  }
}
