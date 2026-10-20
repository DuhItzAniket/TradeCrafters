"use client";
import { useState } from "react";
import type { TrainingChart } from "@tradecrafters/database/workbench";
export function timeIn(at: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}
export function ScenarioChart({ data }: { data: TrainingChart }) {
  const [minutes, setMinutes] = useState<15 | 60>(60),
    [table, setTable] = useState(false),
    [inspect, setInspect] = useState<number | null>(null);
  const points = data.points.filter(
    (p) => Date.parse(p.at) >= Date.parse(data.marketAt) - minutes * 60000,
  );
  if (!points.length)
    return (
      <div className="chart-empty">
        <h3>No permitted chart points.</h3>
        <p>
          Calendar coverage or display permission is unavailable for this
          exercise.
        </p>
      </div>
    );
  const index = Math.min(inspect ?? points.length - 1, points.length - 1),
    selected = points[index];
  // Floating point is confined to SVG coordinates and axis labels, never order calculations.
  const prices = points.map((p) => Number(p.price)),
    min = Math.min(...prices),
    max = Math.max(...prices),
    pad = Math.max((max - min) * 0.2, max * 0.001),
    low = min - pad,
    high = max + pad;
  const first = Date.parse(points[0].at),
    last = Date.parse(points.at(-1)!.at);
  const x = (at: string) =>
    20 + ((Date.parse(at) - first) / Math.max(1, last - first)) * 960;
  const y = (price: string) =>
    15 + ((high - Number(price)) / (high - low)) * 270;
  const path = points
    .map(
      (p, i) =>
        `${i === 0 || Date.parse(p.at) - Date.parse(points[i - 1].at) > 60000 ? "M" : "L"}${x(p.at).toFixed(2)},${y(p.price).toFixed(2)}`,
    )
    .join(" ");
  const decimals = data.rules?.quoteDecimals ?? 2;
  return (
    <>
      <div className="chart-toolbar">
        <div role="group" aria-label="Training chart window">
          <button
            aria-pressed={minutes === 15}
            onClick={() => {
              setMinutes(15);
              setInspect(null);
            }}
          >
            15m
          </button>
          <button
            aria-pressed={minutes === 60}
            onClick={() => {
              setMinutes(60);
              setInspect(null);
            }}
          >
            Up to 1h
          </button>
        </div>
        <div role="group" aria-label="Chart presentation">
          <button aria-pressed={!table} onClick={() => setTable(false)}>
            Chart
          </button>
          <button aria-pressed={table} onClick={() => setTable(true)}>
            Data table
          </button>
        </div>
      </div>
      <div className="chart-inspection">
        <strong>
          {selected.price} <small>{data.quoteUnit}</small>
        </strong>
        <span>
          {timeIn(selected.at, data.timezone)} · {data.timezone}
        </span>
      </div>
      {table ? (
        <div
          className="chart-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Training price data, scroll for all rows"
        >
          <table className="chart-table">
            <caption>
              Authored prices through 10:15, 20 October 2026. {data.quoteUnit};{" "}
              {data.timezone}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Venue time</th>
                <th scope="col">UTC instant</th>
                <th scope="col">Price ({data.quoteUnit})</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.at}>
                  <th scope="row">{timeIn(p.at, data.timezone)}</th>
                  <td>{p.at.slice(11, 19)} UTC</td>
                  <td>{p.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="training-chart">
          <div className="chart-plot">
            <svg
              viewBox="0 0 1000 300"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Project-authored ${data.quoteUnit} price illustration. ${points.length} points through 10:15 local. Use the time slider or data table for exact values.`}
              onPointerMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect(),
                  target =
                    first +
                    Math.max(
                      0,
                      Math.min(
                        1,
                        (((event.clientX - bounds.left) / bounds.width) * 1000 -
                          20) /
                          960,
                      ),
                    ) *
                      (last - first);
                const nearest = points.reduce(
                  (best, p, i) =>
                    Math.abs(Date.parse(p.at) - target) <
                    Math.abs(Date.parse(points[best].at) - target)
                      ? i
                      : best,
                  0,
                );
                setInspect(nearest);
              }}
              onPointerLeave={() => setInspect(null)}
            >
              {[15, 82.5, 150, 217.5, 285].map((v) => (
                <line
                  key={v}
                  x1="0"
                  x2="1000"
                  y1={v}
                  y2={v}
                  className="plot-grid"
                />
              ))}
              <path d={path} className="plot-line" />
              <line
                x1={x(selected.at)}
                x2={x(selected.at)}
                y1="0"
                y2="300"
                className="plot-crosshair"
              />
              <circle
                cx={x(selected.at)}
                cy={y(selected.price)}
                r="4"
                className="plot-point"
              />
            </svg>
            <div className="chart-axis" aria-hidden="true">
              <span>{high.toFixed(decimals)}</span>
              <span>{((high + low) / 2).toFixed(decimals)}</span>
              <span>{low.toFixed(decimals)}</span>
            </div>
          </div>
          <div className="chart-times" aria-hidden="true">
            <span>{timeIn(points[0].at, data.timezone)}</span>
            <span>
              {timeIn(points[Math.floor(points.length / 2)].at, data.timezone)}
            </span>
            <span>{timeIn(points.at(-1)!.at, data.timezone)}</span>
          </div>
          <label className="chart-slider">
            <span>Inspect training time</span>
            <input
              type="range"
              min={0}
              max={points.length - 1}
              value={index}
              aria-valuetext={`${timeIn(selected.at, data.timezone)}, ${selected.price} ${data.quoteUnit}, authored training price`}
              onChange={(e) => setInspect(Number(e.target.value))}
            />
          </label>
          <figcaption>
            Project-authored illustration · continuous-session minutes only ·
            ends at the fixed training reference. Moving the cursor never
            selects an order price.
          </figcaption>
        </figure>
      )}
    </>
  );
}
