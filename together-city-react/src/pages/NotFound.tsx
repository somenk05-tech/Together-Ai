import { Link } from 'react-router-dom';
export function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h1>Page not found</h1>
      <p className="muted" style={{ marginTop: 8 }}>That corner of the city doesn't exist yet.</p>
      <div className="nf-actions" style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/" className="btn btn-accent">Back to the city</Link>
        <Link to="/dashboard" className="btn">Your dashboard</Link>
        <Link to="/help" className="btn">Help</Link>
      </div>
    </div>
  );
}
