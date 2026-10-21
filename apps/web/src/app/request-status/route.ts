export function GET(request: Request) {
  const limited =
    new URL(request.url).searchParams.get("reason") !== "unavailable";
  const title = limited
    ? "A moment to catch up."
    : "The lab is taking a moment.";
  const message = limited
    ? "This connection has reached its request allowance. Wait a minute before returning to the market lab."
    : "The service is busy or temporarily unavailable. Please try again shortly.";
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · TradeCrafters</title><style>body{margin:0;background:#101415;color:#eceee9;font:17px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:38rem;margin:2rem;padding:2rem;border:1px solid #353b39;border-radius:8px}p{color:#b6c0ba}h1{font-size:clamp(2rem,5vw,3rem);line-height:1.15}a{display:inline-block;margin-top:1rem;padding:.7rem 1rem;background:#efc36d;color:#141819;border-radius:4px;text-decoration:none;font-weight:600}small{color:#d7b66e}</style></head><body><main><small>TRADECRAFTERS / THE MARKET LAB</small><h1>${title}</h1><p>${message}</p><p>Your saved account and receipts are preserved. Recover an unconfirmed operation before placing another trade.</p><a href="/">Return to the market lab →</a></main></body></html>`,
    {
      status: limited ? 429 : 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": limited ? "60" : "1",
      },
    },
  );
}
