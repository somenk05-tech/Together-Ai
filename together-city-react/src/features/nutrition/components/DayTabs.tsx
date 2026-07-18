export function DayTabs({ days, current, onSelect }: { days: string[]; current: number; onSelect: (i: number) => void }) {
  return (
    <div style={{ position: 'sticky', top: 'calc(var(--header-h) + 8px)', zIndex: 20, display: 'flex', gap: 6, flexWrap: 'wrap', background: 'var(--paper)', padding: '10px 0 12px', marginBottom: 6 }}>
      {days.map((d, i) => (
        <button key={d} type="button" onClick={() => onSelect(i)}
          className="pill" data-active={i === current}
          style={i === current ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', fontWeight: 700 } : undefined}>
          {d.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}
