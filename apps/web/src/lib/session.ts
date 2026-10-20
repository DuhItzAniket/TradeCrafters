import { cache } from "react";
import { headers } from "next/headers";
import { getAuth } from "@tradecrafters/database/auth";
// Deduplicate validation only within one server render, never across requests.
// RSC cannot refresh cookies; refresh remains the HTTP auth handler's job.
export const sessionForPage = cache(async () => {
  const requestHeaders = await headers();
  return getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
});
