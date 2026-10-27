import type { MotionValue } from "motion/react";

export type Scene = "pool" | "chain" | "prism";

/** What every hero scene receives: the accent colour, the product's real numbers, the hero's scroll progress (0 to 1) and the pointer (-1 to 1). */
export interface SceneProps {
  accent: string;
  data?: number[];
  progress: MotionValue<number>;
  pointer: { current: { x: number; y: number } };
}
