import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

const features = () => import("./features").then((m) => m.default);

/** One LazyMotion for the whole page. reducedMotion="user" drops transform and layout animation (opacity stays) when the OS asks. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
