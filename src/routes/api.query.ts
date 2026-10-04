import { createFileRoute } from "@tanstack/react-router";
import { handleQuery } from "../lib/upstream.server";
export const Route = createFileRoute("/api/query")({
  server: { handlers: { GET: ({ request }) => handleQuery(request) } },
});
