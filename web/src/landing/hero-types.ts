import type { MotionValue } from "motion/react";

export type Scene = "pool" | "chain" | "prism";

/** What every hero scene receives: the accent colour, the product's real numbers, how far the hero has scrolled (0 to 1), the pointer (-1 to 1),
 *  and `page`, how far the whole page has scrolled (0 to 1). */
export interface SceneProps {
  accent: string;
  data?: number[];
  progress: MotionValue<number>;
  page: MotionValue<number>;
  pointer: { current: { x: number; y: number } };
}
