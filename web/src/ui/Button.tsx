import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

/** The three button styles used everywhere: primary (solid), secondary (outline), tertiary (text link). */
export type Variant = "primary" | "secondary" | "tertiary";

const cls = (variant: Variant, danger: boolean, className?: string) =>
  `btn btn-${variant}${danger ? " btn-danger" : ""}${className ? ` ${className}` : ""}`;

/** `danger` marks an action that cancels, denies or deletes something: same shape, red colour. */
export function Button({ variant = "secondary", danger = false, className, type = "button", ...rest }: { variant?: Variant; danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cls(variant, danger, className)} {...rest} />;
}

/** A link that looks like a button; use it when the action goes to a URL. */
export function ButtonLink({ variant = "secondary", className, ...rest }: { variant?: Variant } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cls(variant, false, className)} {...rest} />;
}
