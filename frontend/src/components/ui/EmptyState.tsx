type EmptyStateProps = {
  title: string;
  description?: string;
  /** Decorative glyph, hidden from assistive technology. */
  symbol?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, symbol, action }: EmptyStateProps) {
  return (
    <div className="empty-learning-state">
      {symbol ? (
        <div className="machine-symbol" aria-hidden="true">
          {symbol}
        </div>
      ) : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
