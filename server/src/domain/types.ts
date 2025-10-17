export type Phase =
  | "ROUND_START"
  | "HOST_ANNOUNCE"
  | "DISCUSS"
  | "SUMMARY"
  | "VOTE"
  | "END";

export type Kind = "HUMAN" | "AI";

export interface PublicPlayer {
  id: string;
  name: string;
  kind: Kind;
  isEliminated: boolean;
}
