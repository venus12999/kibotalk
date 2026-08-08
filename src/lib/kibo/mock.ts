import type { Turn } from "./types";

export const makeTurn = (speaker: Turn["speaker"], text: string): Turn => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  speaker,
  text,
  at: Date.now(),
});
