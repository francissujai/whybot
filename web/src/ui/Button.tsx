import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

/** The three button styles used everywhere: primary (solid), secondary (outline), tertiary (text link). */
export type Variant = "primary" | "secondary" | "tertiary";

const cls = (variant: Variant, className?: string) => `btn btn-${variant}${className ? ` ${className}` : ""}`;

export function Button({ variant = "secondary", className, type = "button", ...rest }: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cls(variant, className)} {...rest} />;
}

/** A link that looks like a button; use it when the action goes to a URL. */
export function ButtonLink({ variant = "secondary", className, ...rest }: { variant?: Variant } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cls(variant, className)} {...rest} />;
}
