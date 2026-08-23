type MetricTileProps = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  /** Draws attention when the value represents something needing action, such as safety errors. */
  alert?: boolean;
};

export function MetricTile({ label, value, detail, alert = false }: MetricTileProps) {
  return (
    <article className={alert ? "metric-alert" : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="metric-grid">{children}</div>;
}
