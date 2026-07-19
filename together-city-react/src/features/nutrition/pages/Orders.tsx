import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

/** My Orders — in-app grocery ordering & delivery are not live yet. */
export function Orders() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · My Orders</div>
      <h1 style={{ fontSize: 26, marginBottom: 8 }}>Deliveries &amp; orders</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '0 0 18px' }}>
        Your grocery deliveries and order history will live here.
      </p>

      <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>📦</div>
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Ordering &amp; delivery — coming soon</h2>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: 440, margin: '0 auto 18px' }}>
          For now you can generate a grocery list from any meal plan or recipe. In-app ordering,
          per-day fresh deliveries and wallet payments arrive soon.
        </p>
        <Link to="/nutrition/grocery"><Button variant="accent">View your grocery list →</Button></Link>
      </div>
    </div>
  );
}
