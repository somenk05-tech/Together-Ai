import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';

type Slug = 'about' | 'help' | 'contact';

interface Doc { title: string; lede?: string; sections: { h: string; p: string[] }[] }

const DOCS: Record<Slug, Doc> = {
  about: {
    title: 'About Together City',
    lede: "One city for your whole life. Everything personalized.",
    sections: [
      { h: 'One city, every part of life', p: [
        'Together City brings the parts of daily life — health, food, money, travel, matchmaking, entertainment, work and more — into one connected place, personalized to you.',
        'A single identity carries across every hub, so your goals, preferences and context follow you instead of starting over in each app.',
      ] },
      { h: 'Built around your consent', p: [
        'Personalization only works when you trust it. Sensitive data stays private by default, sharing is opt-in, and you can change any permission at any time.',
      ] },
    ],
  },
  help: {
    title: 'Help & Support',
    lede: 'Quick answers and where to get more.',
    sections: [
      { h: 'Getting started', p: [
        'Pick a hub from the top navigation, or press ⌘K (Ctrl+K) anywhere to jump straight to a page or action.',
        'Add details in a hub to unlock personalization — for example a blood test in Medical, or birth details in Astrology.',
      ] },
      { h: 'Managing privacy', p: [
        'Every sharing permission lives in Settings → Privacy & Permissions. You can turn AI personalization, family sharing and integrations on or off individually.',
      ] },
      { h: 'Need a person?', p: [
        'Reach the team from the Contact page and we\'ll get back to you.',
      ] },
    ],
  },
  contact: {
    title: 'Contact',
    sections: [
      { h: 'Get in touch', p: [
        'Email: connect@togethercity.app',
        'For privacy or data requests, mention "Privacy" in your subject line so it reaches the right team.',
      ] },
    ],
  },
};

export function Info({ slug }: { slug: Slug }) {
  const doc = DOCS[slug];
  return (
    <div>
      <Breadcrumbs />
      <div className="eyebrow" style={{ marginTop: 10 }}>Together City</div>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>{doc.title}</h1>
      {doc.lede && <p className="muted" style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 26 }}>{doc.lede}</p>}
      {doc.sections.map((s) => (
        <section key={s.h} style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>{s.h}</h2>
          {s.p.map((p, i) => (
            <p key={i} style={{ fontSize: 15, lineHeight: 1.75, marginBottom: 8 }}>{p}</p>
          ))}
        </section>
      ))}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 28 }}>
        See also{' '}
        <Link to="/legal/privacy" style={{ color: 'var(--accent-ink)' }}>Privacy</Link>{' · '}
        <Link to="/legal/terms" style={{ color: 'var(--accent-ink)' }}>Terms</Link>{' · '}
        <Link to="/settings/privacy" style={{ color: 'var(--accent-ink)' }}>Privacy &amp; Permissions</Link>
      </p>
    </div>
  );
}
