export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, color: 'var(--muted)', justifyContent: 'center' }}>
      <span style={{ width: 18, height: 18, border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'tcspin .7s linear infinite' }} />
      {label}
      <style>{'@keyframes tcspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
