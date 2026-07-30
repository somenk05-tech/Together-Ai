import { Link } from 'react-router-dom';
import { informalName } from '@/lib/salutation';
import { LABELS } from '@/config/labels';
import { useAuth } from '@/hooks/useAuth';
import { useFamily, headcount } from '../members';
import { FamilyDashboard } from '../components/FamilyDashboard';

interface FeatureCard { n: string; title: string; blurb: string; cta: string; to: string }
const FEATURES: FeatureCard[] = [
  { n: '01', title: 'Connect Family Members', blurb: 'Link Together IDs, manage roles & permissions.', cta: 'Connect →', to: '/family/connect' },
  { n: '02', title: 'Weekly Meal Planner', blurb: 'Seven days, portioned per member.', cta: 'Plan the week →', to: '/family/weekly' },
  { n: '03', title: 'Daily Meal Planner', blurb: "Today's plate for every member.", cta: 'See today →', to: '/family/daily' },
  { n: '04', title: LABELS.groceryLists, blurb: 'One combined list, no duplicates.', cta: 'Open the list →', to: '/family/grocery' },
  { n: '05', title: 'My Orders', blurb: 'Family-wide deliveries & spend.', cta: 'View orders →', to: '/family/orders' },
  { n: '06', title: 'Shared Pantry', blurb: 'One household pantry — staples everyone shares.', cta: 'Open pantry →', to: '/family/pantry' },
  { n: '07', title: 'Search by Ingredients', blurb: "Cook together from what's in the kitchen.", cta: 'Find recipes →', to: '/family/search' },
];

const featureCardStyle: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  padding: '20px 22px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 10,
};

/** Family Nutrition hub — gateway dashboard (family.html). One plan, portioned per member. */
export function Family() {
  const { user } = useAuth();
  const { state } = useFamily();
  const N = headcount(state);
  const youName = user?.name ?? 'You';
  const firstName = informalName(youName);

  return (
    <div>
      <div className="hero" style={{ marginBottom: 28, minHeight: 320 }}>
        <img className="bg" src="/assets/img/nutrition-hub--images--nutrition-homepage-image-family.webp" alt="" style={{ objectPosition: 'center 40%' }} />
        <div className="inner">
          <div className="eyebrow">Hub 03b · Family Nutrition</div>
          <h1 style={{ fontSize: 'clamp(28px,3.4vw,46px)' }}>Healthy choices for a happier family 🌿</h1>
          <p className="sub">One plan, portioned per member — one shared grocery list. Together City personalises meals for every person in the house.</p>
          <div style={{ marginTop: 24, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/family/weekly" className="btn btn-gold">Explore now</Link>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h2>Welcome back, {firstName} 👪</h2>
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: 4 }}>
          <Link to="/nutrition" style={{ padding: '9px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Individual</Link>
          <Link to="/family" style={{ padding: '9px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', background: 'var(--accent)', color: '#fff' }}>Family</Link>
        </div>
      </div>
      <p className="lede" style={{ marginBottom: 34 }}>
        One kitchen, personalised portions per member — add your family by Together City ID and every plan re-portions automatically. Currently cooking for {N} {N === 1 ? 'person' : 'people'}.
      </p>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2>Your Family</h2>
          <Link to="/family/connect" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13.5 }}>Manage members →</Link>
        </div>
        <FamilyDashboard />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }} className="tc-membergrid">
          {FEATURES.map((f) => (
            <Link key={f.n} to={f.to} style={featureCardStyle} className="lift">
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{f.n}</span>
              <h4>{f.title}</h4>
              <p className="meta muted" style={{ fontSize: 12.5 }}>{f.blurb}</p>
              <span style={{ marginTop: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{f.cta}</span>
            </Link>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card center">
            <div className="eyebrow" style={{ marginBottom: 4 }}>Family Health Score</div>
            <div className="ring" style={{ margin: '0 auto' }}>
              <svg width={120} height={120}>
                <circle className="bgc" cx={60} cy={60} r={54} />
                <circle className="fgc" cx={60} cy={60} r={54} style={{ strokeDashoffset: 339.3 * (1 - 0.76) }} />
              </svg>
              <div className="cent"><b>758</b><span>of 1000</span></div>
            </div>
          </div>
          <div className="card">
            <h4 style={{ marginBottom: 12 }}>Today's Summary</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="stat"><div className="lab">Water</div><div className="val" style={{ fontSize: 20 }}>21/30</div><div className="delta">glasses</div></div>
              <div className="stat"><div className="lab">Veggies</div><div className="val" style={{ fontSize: 20 }}>4/5</div><div className="delta">servings</div></div>
            </div>
            <div className="stat" style={{ marginTop: 12 }}><div className="lab">Activity</div><div className="val" style={{ fontSize: 20 }}>45/60</div><div className="delta">minutes, family average</div></div>
          </div>
          <div className="note">"A healthy family today, a stronger tomorrow."</div>
        </div>
      </div>

      <div className="trust">
        <span>◈ Personalised per Member</span><span>◈ One Shared Grocery List</span><span>◈ Consent-Gated Sharing</span><span>◈ Better, Together</span>
      </div>
    </div>
  );
}
