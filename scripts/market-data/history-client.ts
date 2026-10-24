import {
  authorizedHistoryPlan,
  normalizeDailyHistory,
  HistoryFault,
} from "../../packages/domain/src/provider-history";

export async function fetchDailyHistory(
  input: unknown,
  authorization: unknown,
  options: {
    apiKey: string;
    now?: string;
    fixtureBaseUrl?: string;
    timeoutMs?: number;
  },
) {
  const now = options.now || new Date().toISOString();
  const plan = authorizedHistoryPlan(input, authorization, now);
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(options.apiKey))
    throw new HistoryFault("CONFIGURATION");
  let base =
    plan.provider === "twelvedata"
      ? "https://api.twelvedata.com"
      : "https://eodhd.com";
  if (options.fixtureBaseUrl) {
    try {
      const fixture = new URL(options.fixtureBaseUrl);
      const route = plan.provider === "twelvedata" ? "/twelve" : "/eodhd";
      if (
        process.env.NODE_ENV === "production" ||
        options.apiKey !== "fixture-market-data-key" ||
        fixture.protocol !== "http:" ||
        fixture.hostname !== "127.0.0.1" ||
        !fixture.port ||
        fixture.username ||
        fixture.password ||
        fixture.search ||
        fixture.hash ||
        fixture.pathname !== route
      )
        throw Error();
      base = fixture.href;
    } catch {
      throw new HistoryFault("CONFIGURATION");
    }
  }
  const timeout = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeout) || timeout < 50 || timeout > 10000)
    throw new HistoryFault("CONFIGURATION");
  const url = new URL(
    base +
      (plan.provider === "twelvedata"
        ? "/time_series"
        : `/api/eod/${encodeURIComponent(plan.symbol)}`),
  );
  const params =
    plan.provider === "twelvedata"
      ? {
          symbol: plan.symbol,
          mic_code: plan.mic,
          exchange: plan.providerExchange,
          interval: "1day",
          start_date: plan.from,
          end_date: plan.to,
          order: "asc",
          outputsize: "31",
          adjust: "none",
          dp: "11",
          format: "JSON",
          apikey: options.apiKey,
        }
      : {
          from: plan.from,
          to: plan.to,
          period: "d",
          order: "a",
          fmt: "csv",
          api_token: options.apiKey,
        };
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) url.searchParams.set(key, value);
  const signal = AbortSignal.timeout(timeout);
  let response: Response | undefined;
  try {
    response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: {
        Accept:
          plan.provider === "twelvedata" ? "application/json" : "text/csv",
      },
    });
    const retry = Number(response.headers.get("retry-after"));
    const retryAfter =
      Number.isInteger(retry) && retry > 0 ? Math.min(3600, retry) : 60;
    if (response.status === 429)
      throw new HistoryFault("THROTTLED", retryAfter);
    if ([401, 403].includes(response.status)) throw new HistoryFault("DENIED");
    if (!response.ok) throw new HistoryFault("UPSTREAM_FAILURE");
    if (Number(response.headers.get("content-length")) > 262144)
      throw new HistoryFault("TOO_LARGE");
    const contentType = response.headers.get("content-type") || "";
    const json = /^application\/json\b/i.test(contentType);
    if (
      !json &&
      !(
        plan.provider === "eodhd" && /^text\/(?:csv|plain)\b/i.test(contentType)
      )
    )
      throw new HistoryFault("INVALID_DATA");
    if (!response.body) throw new HistoryFault("INVALID_DATA");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 262144) throw new HistoryFault("TOO_LARGE");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    if (json) {
      let value;
      try {
        value = JSON.parse(body);
      } catch {
        throw new HistoryFault("INVALID_DATA");
      }
      if (value?.status === "error" || value?.error) {
        if (value.code === 429) throw new HistoryFault("THROTTLED", retryAfter);
        throw new HistoryFault(
          [401, 403].includes(value.code) ? "DENIED" : "UPSTREAM_FAILURE",
        );
      }
      if (plan.provider === "eodhd") throw new HistoryFault("INVALID_DATA");
    }
    const observedAt = options.now || new Date().toISOString();
    authorizedHistoryPlan(plan, authorization, observedAt);
    return normalizeDailyHistory(plan, body, observedAt);
  } catch (error) {
    if (error instanceof HistoryFault) throw error;
    throw new HistoryFault(signal.aborted ? "TIMEOUT" : "TRANSPORT");
  } finally {
    if (response?.body && !response.body.locked)
      await response.body.cancel().catch(() => {});
  }
}
