export interface StatCardProps { label: string; value: string; delta?: string; valueColor?: string; }

/** Ported .stat card used across dashboards & the nutrition summary. */
export function StatCard({ label, value, delta, valueColor }: StatCardProps) {
  return (
    <div className="stat">
      <div className="lab">{label}</div>
      <div className="val" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}
