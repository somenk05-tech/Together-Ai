import { Link } from 'react-router-dom';
export function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h1>Page not found</h1>
      <p className="muted" style={{ marginTop: 8 }}>That corner of the city doesn't exist yet.</p>
      <Link to="/" className="btn btn-accent" style={{ marginTop: 20 }}>Back to the city</Link>
    </div>
  );
}
