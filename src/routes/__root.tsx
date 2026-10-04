import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "../components/ui/button";
import styles from "../styles.css?url";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WETLA API Lab | Location explorer" },
    ],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  component: Outlet,
  shellComponent: Document,
  errorComponent: RouteError,
  notFoundComponent: () => (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="my-4 text-zinc-600">
        This route does not exist in the WETLA API lab.
      </p>
      <Link className="text-emerald-800 underline" to="/">
        Return to explorer
      </Link>
    </main>
  ),
});
function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Explorer could not load</h1>
      <p role="alert" className="my-4 break-words text-zinc-700">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Button onClick={reset}>Try again</Button>{" "}
      <Link className="text-emerald-800 underline" to="/">
        Return to explorer
      </Link>
    </main>
  );
}
