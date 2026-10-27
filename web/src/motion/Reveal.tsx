import { useRef, type ReactNode } from "react";
import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { RISE, T_REVEAL } from "./tokens";

type Tag = "div" | "li" | "section" | "figure" | "h1" | "h2" | "p";

/** A section block fades in and rises 24px once, in 700 ms. `immediate` plays on load instead of on scroll. With reduced motion it is simply visible. */
export function Reveal({ children, as = "div", delay = 0, immediate = false, className }: { children: ReactNode; as?: Tag; delay?: number; immediate?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const Tag = m[as] as typeof m.div;
  const to = { opacity: 1, y: 0, transition: { ...T_REVEAL, delay } };
  return (
    <Tag className={className} initial={reduce ? false : { opacity: 0, y: RISE }}
      {...(immediate ? { animate: to } : { whileInView: to, viewport: { once: true, amount: 0.15 } })}>{children}</Tag>
  );
}

/** A preview scales from 0.96 to 1 as it enters. */
export function ScaleIn({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <m.div className={className} initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1, transition: T_REVEAL }} viewport={{ once: true, amount: 0.2 }}>{children}</m.div>
  );
}

function Word({ word, progress, from, to, still }: { word: string; progress: MotionValue<number>; from: number; to: number; still: boolean }) {
  const opacity = useTransform(progress, [from, to], [0.15, 1]);
  return <m.span style={still ? undefined : { opacity }}>{word} </m.span>;
}

/** One statement whose words go from 15% to full opacity, one by one, as it scrolls through the viewport. */
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const still = !!useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.5"] });
  const words = text.split(/\s+/);
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => <Word key={`${w}-${i}`} word={w} progress={scrollYProgress} from={i / words.length} to={(i + 1) / words.length} still={still} />)}
    </p>
  );
}
