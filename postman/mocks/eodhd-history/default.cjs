// Project-authored synthetic CSV; the .US namespace is composite, not a MIC.
const http = require("node:http");
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.invalid");
    const send = (code, body, type = "text/csv") => {
      res.writeHead(code, { "Content-Type": type });
      res.end(body);
    };
    // @endpoint GET /api/eod/:symbol
    if (
      req.method !== "GET" ||
      !/^\/api\/eod\/FIX_[A-Z]+\.US$/.test(url.pathname)
    )
      return send(501, "Unmodelled endpoint", "text/plain");
    const q = url.searchParams;
    const expected = {
      api_token: "fixture-market-data-key",
      from: "2026-10-01",
      to: "2026-10-02",
      period: "d",
      order: "a",
      fmt: "csv",
    };
    if (
      q.size !== 6 ||
      Object.entries(expected).some(([key, value]) => q.get(key) !== value)
    )
      return send(400, "Unexpected request contract", "text/plain");
    if (url.pathname.includes("FIX_ERROR."))
      return send(
        200,
        JSON.stringify({ error: "fixture-market-data-key" }),
        "application/json",
      );
    if (url.pathname.includes("FIX_EMPTY.")) return send(200, "");
    const header = "Date,Open,High,Low,Close,Adjusted_close,Volume\n";
    const data =
      "2026-10-01,9007199254740993.12345678901,9007199254740994,9007199254740992,9007199254740993.12345678902,4503599627370496.56172839451,9007199254740993\n2026-10-02,100,110,90,101,50.5,0\n";
    return send(200, header + data);
  })
  .listen(process.env.PORT || 4500);
