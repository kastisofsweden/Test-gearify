import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Content-driven internal link. Paths come from the scraped content JSON at
 * runtime, so the literal-path typing of <Link> cannot be used here. All
 * targets resolve to existing dynamic routes via resolveLink().
 */
export function SiteLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  if (!to) return <span className={className}>{children}</span>;
  return (
    <Link to={to as never} className={className}>
      {children}
    </Link>
  );
}
