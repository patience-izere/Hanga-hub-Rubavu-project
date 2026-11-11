import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getInstructorActivity } from "../../api/instructor";
import { QueryBoundary } from "../ui/QueryBoundary";
import "../../styles/chart.css";
import "../../styles/tables.css";

type Range = "7" | "30" | "90" | "custom";

const RANGES: Array<{ value: Range; label: string }> = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "This term (90 days)" },
  { value: "custom", label: "Custom dates" },
];

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDay(date);
}

const HEIGHT = 160;

/**
 * Attempts finished per day: one series, one hue, so the title names it and no legend is needed.
 * Every bar has a tooltip, and the same numbers are available as a table.
 */
export function CompletionChart() {
  const [range, setRange] = useState<Range>("30");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(isoDay(new Date()));
  const query =
    range === "custom"
      ? { from, to }
      : { from: daysAgo(Number(range) - 1), to: isoDay(new Date()) };
  const activity = useQuery({
    queryKey: ["instructor", "activity", query],
    queryFn: () => getInstructorActivity(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="admin-panel completion-chart" aria-labelledby="completion-chart-title">
      <div className="completion-chart-head">
        <div>
          <h2 id="completion-chart-title">Attempts completed per day</h2>
          <p className="field-note">Scored attempts only; practice runs are not counted.</p>
        </div>
        <div className="completion-chart-filters">
          <label>
            <span className="sr-only">Date range</span>
            <select value={range} onChange={(event) => setRange(event.target.value as Range)}>
              {RANGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {range === "custom" ? (
            <>
              <label>
                From
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>
      </div>
      <QueryBoundary query={activity} loading="Loading activity…">
        {(data) => <Bars days={data.days} />}
      </QueryBoundary>
    </section>
  );
}

function Bars({ days }: { days: Array<{ date: string; started: number; completed: number }> }) {
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...days.map((day) => day.completed)), [days]);
  const total = days.reduce((sum, day) => sum + day.completed, 0);
  const width = Math.max(days.length * 14, 280);
  const slot = width / days.length;
  const barWidth = Math.max(3, Math.min(18, slot - 2));
  const label = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const shown = active === null ? null : days[active];

  return (
    <>
      <p className="completion-chart-total">
        <strong>{total.toLocaleString()}</strong> completed between {label(days[0].date)} and{" "}
        {label(days[days.length - 1].date)}
        {shown ? (
          <span className="completion-chart-tip" aria-live="polite">
            {label(shown.date)}: {shown.completed} completed, {shown.started} started
          </span>
        ) : null}
      </p>
      {total === 0 ? (
        <p className="field-note completion-chart-empty">
          No scored attempt was completed in these dates. Assign a lesson, or choose a longer range.
        </p>
      ) : (
        <div className="completion-chart-plot">
          <svg
            viewBox={`0 0 ${width} ${HEIGHT + 22}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Bar chart: ${total} attempts completed over ${days.length} days. The table below lists each day.`}
            onMouseLeave={() => setActive(null)}
          >
            <line x1={0} x2={width} y1={HEIGHT} y2={HEIGHT} className="completion-chart-axis" />
            {days.map((day, index) => {
              const height = (day.completed / max) * (HEIGHT - 8);
              const x = index * slot + (slot - barWidth) / 2;
              return (
                <g key={day.date} onMouseEnter={() => setActive(index)}>
                  {/* A hit area taller and wider than the bar itself. */}
                  <rect x={index * slot} y={0} width={slot} height={HEIGHT} fill="transparent" />
                  {day.completed > 0 ? (
                    <path
                      className={active === index ? "completion-bar is-active" : "completion-bar"}
                      d={`M${x},${HEIGHT} V${HEIGHT - height + Math.min(4, height)} q0,-${Math.min(4, height)} ${Math.min(4, barWidth / 2)},-${Math.min(4, height)} H${x + barWidth - Math.min(4, barWidth / 2)} q${Math.min(4, barWidth / 2)},0 ${Math.min(4, barWidth / 2)},${Math.min(4, height)} V${HEIGHT} Z`}
                    />
                  ) : null}
                  <title>
                    {label(day.date)}: {day.completed} completed, {day.started} started
                  </title>
                </g>
              );
            })}
          </svg>
          <div className="completion-chart-scale" aria-hidden="true">
            <span>{label(days[0].date)}</span>
            <span>max {max} a day</span>
            <span>{label(days[days.length - 1].date)}</span>
          </div>
        </div>
      )}
      <details className="completion-chart-table">
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Started</th>
                <th scope="col">Completed</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{label(day.date)}</th>
                  <td>{day.started}</td>
                  <td>{day.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
