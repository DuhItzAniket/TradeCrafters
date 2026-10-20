// Liveness only. Readiness, privileges and reconciliation are operator checks;
// a public probe must not acquire database connections or disclose internals.
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
