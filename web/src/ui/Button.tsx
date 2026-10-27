import { m, type HTMLMotionProps } from "motion/react";
import { SPRING } from "../motion";

/** The three button styles used everywhere: primary (solid), secondary (outline), tertiary (text link). */
export type Variant = "primary" | "secondary" | "tertiary";

function cls(variant: Variant, danger: boolean, className?: string) {
  const parts = ["btn", `btn-${variant}`];
  if (danger) parts.push("btn-danger");
  if (className) parts.push(className);
  return parts.join(" ");
}

/** `danger` marks an action that cancels, denies or deletes something: same shape, red colour. Pressing gives a 0.98 spring; hover is colour only. */
export function Button({ variant = "secondary", danger = false, className, type = "button", disabled, ...rest }: { variant?: Variant; danger?: boolean } & HTMLMotionProps<"button">) {
  return <m.button type={type} disabled={disabled} className={cls(variant, danger, className)} whileTap={disabled ? undefined : { scale: 0.98 }} transition={SPRING} {...rest} />;
}

/** A link that looks like a button; use it when the action goes to a URL. */
export function ButtonLink({ variant = "secondary", className, ...rest }: { variant?: Variant } & HTMLMotionProps<"a">) {
  return <m.a className={cls(variant, false, className)} whileTap={{ scale: 0.98 }} transition={SPRING} {...rest} />;
}
