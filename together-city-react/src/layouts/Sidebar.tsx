import { NavLink, useNavigate } from 'react-router-dom';
import type { HubConfig } from '@/config/hubs';
import { useUiStore } from '@/store/ui.store';

const PersonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </svg>
);
const PeopleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c0-3.4 3-5.2 6.5-5.2s6.5 1.8 6.5 5.2" /><path d="M16 5.2A3.4 3.4 0 0 1 16 12" /><path d="M17.5 14.9c2.7.5 4 2.3 4 5.1" />
  </svg>
);

/** Hub sidebar — back link + (nutrition/family) mode tabs + menu. */
export function Sidebar({ hub }: { hub: HubConfig }) {
  const navigate = useNavigate();
  const open = useUiStore((s) => s.sidebarOpen);
  const toggle = useUiStore((s) => s.toggleSidebar);

  // Nutrition and Family Nutrition are the two modes of one experience.
  const showModeTabs = hub.key === 'nutrition' || hub.key === 'family';
  const modeTab = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    padding: '13px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 16, fontWeight: 600, marginBottom: 4,
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--ink)',
  });

  return (
    <aside className={`tc-side${open ? ' open' : ''}`} data-side={hub.key}>
      <button className="back" onClick={() => navigate(-1)}>← Back</button>
      <div className="hubname">{hub.key === 'family' ? 'Nutrition Hub' : hub.name}</div>
      <div className="hubtag">{hub.key === 'family' ? 'Eat healthy, live better' : hub.tag}</div>

      {showModeTabs && (
        <div style={{ borderTop: '1px solid var(--line)', margin: '14px 0', paddingTop: 14 }}>
          <button type="button" style={modeTab(hub.key === 'nutrition')} onClick={() => { navigate('/nutrition/blood'); toggle(false); }}>
            <PersonIcon /> Individual
          </button>
          <button type="button" style={modeTab(hub.key === 'family')} onClick={() => { navigate('/family'); toggle(false); }}>
            <PeopleIcon /> Family
          </button>
        </div>
      )}

      <nav className="side-menu">
        {hub.items.map((it) => (
          <NavLink key={it.path} to={it.path} onClick={() => toggle(false)}
            className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <span className="n">{it.index}</span>
            <span><span className="l">{it.label}</span><span className="s">{it.sub}</span></span>
          </NavLink>
        ))}
      </nav>
      <div className="helpcard"><b>Need help?</b>Talk to our concierge, any hour of the city.<br /><a href="/chats">Contact support →</a></div>
    </aside>
  );
}
