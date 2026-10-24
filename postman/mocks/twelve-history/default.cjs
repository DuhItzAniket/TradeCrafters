// Project-authored synthetic fixtures; never captured prices or coverage evidence.
const http = require("node:http");
const fixtures = {
  US: ["XNAS", "NASDAQ", "USD", "America/New_York"],
  UK: ["XLON", "LSE", "GBp", "Europe/London"],
  JP: ["XTKS", "JPX", "JPY", "Asia/Tokyo"],
  IN: ["XNSE", "NSE", "INR", "Asia/Kolkata"],
  HK: ["XHKG", "HKEX", "HKD", "Asia/Hong_Kong"],
  AU: ["XASX", "ASX", "AUD", "Australia/Sydney"],
  ZA: ["XJSE", "JSE", "ZAR", "Africa/Johannesburg"],
  AE: ["XDFM", "DFM", "AED", "Asia/Dubai"],
  BR: ["BVMF", "B3", "BRL", "America/Sao_Paulo"],
};
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.invalid");
    const send = (code, value, type = "application/json", headers = {}) => {
      res.writeHead(code, { "Content-Type": type, ...headers });
      res.end(typeof value === "string" ? value : JSON.stringify(value));
    };
    // @endpoint GET /time_series
    if (req.method !== "GET" || url.pathname !== "/time_series")
      return send(501, { error: "Unmodelled endpoint" });
    const q = url.searchParams;
    const expected = {
      apikey: "fixture-market-data-key",
      interval: "1day",
      order: "asc",
      outputsize: "31",
      adjust: "none",
      dp: "11",
      format: "JSON",
      start_date: "2026-10-01",
      end_date: "2026-10-02",
    };
    if (
      Object.entries(expected).some(([key, value]) => q.get(key) !== value) ||
      q.size !== 12
    )
      return send(400, { error: "Unexpected request contract" });
    const symbol = q.get("symbol");
    if (!/^FIX_[A-Z]+$/.test(symbol || ""))
      return send(400, { error: "Unknown synthetic symbol" });
    const scenario = symbol.slice(4);
    const venue = fixtures[scenario] || fixtures.US;
    if (q.get("mic_code") !== venue[0] || q.get("exchange") !== venue[1])
      return send(400, { error: "Unexpected venue mapping" });
    if (scenario === "RATE")
      return send(
        429,
        { message: "Do not expose provider details" },
        "application/json",
        { "Retry-After": "7" },
      );
    if (scenario === "ERROR")
      return send(200, {
        status: "error",
        code: 429,
        message: q.get("apikey"),
      });
    if (scenario === "DENIED") return send(403, { message: q.get("apikey") });
    if (scenario === "FAIL")
      return send(503, "<html>upstream failure</html>", "text/html");
    if (scenario === "HTML")
      return send(200, "<html>proxy login</html>", "text/html");
    if (scenario === "REDIRECT")
      return send(302, "", "text/plain", {
        Location: "http://127.0.0.1:9/must-not-follow",
      });
    if (scenario === "LARGE") return send(200, " ".repeat(262145));
    if (scenario === "CHUNKED") {
      res.writeHead(200, { "Content-Type": "application/json" });
      for (let i = 0; i < 18; i++) res.write(" ".repeat(16384));
      return res.end();
    }
    const value = {
      status: "ok",
      meta: {
        symbol,
        interval: "1day",
        mic_code: venue[0],
        exchange: venue[1],
        currency: venue[2],
        exchange_timezone: venue[3],
        type: "Common Stock",
      },
      values: [
        {
          datetime: "2026-10-01",
          open: "9007199254740993.12345678901",
          high: "9007199254740994.00000000001",
          low: "9007199254740992.1",
          close: "9007199254740993.12345678902",
          volume: "9007199254740993",
        },
        {
          datetime: "2026-10-02",
          open: "100.50000000000",
          high: "110",
          low: "90",
          close: "101",
          volume: "0",
        },
      ],
    };
    if (scenario === "IDENTITY") value.meta.mic_code = "XNYS";
    if (scenario === "CURRENCY") value.meta.currency = "GBP";
    if (scenario === "DATE") value.values[0].datetime = "2026-09-30";
    if (scenario === "DUPLICATE") value.values[1].datetime = "2026-10-01";
    if (scenario === "MALFORMED") return send(200, "{not-json");
    if (scenario === "SLOW") {
      const timer = setTimeout(() => send(200, value), 1200);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    return send(200, value);
  })
  .listen(process.env.PORT || 4500);
