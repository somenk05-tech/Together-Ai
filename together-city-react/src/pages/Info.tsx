import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';

type Slug = 'privacy' | 'terms' | 'about' | 'help' | 'contact';

interface Doc { title: string; lede: string; sections: { h: string; p: string[] }[] }

const DOCS: Record<Slug, Doc> = {
  privacy: {
    title: 'Privacy Policy',
    lede: 'Plain-language summary of what Together City collects, why, and the control you keep. This is a product summary, not a substitute for legal counsel.',
    sections: [
      { h: 'What we collect', p: [
        'Account basics you give us (handle, name, email, optional phone) and the content you create — posts, messages, plans, saved items.',
        'Sensitive information only when you choose to add it to a specific hub: health records and blood tests (Medical), birth details (Astrology), dating preferences (Dating), financial activity (Financial), and family relationships (Family).',
      ] },
      { h: 'Why we use it', p: [
        'To run the features you asked for and to personalize them — meal plans from your goals, health insights from your labs, guidance from your birth details.',
        'We do not sell your personal data, and we do not use your private hub data to target you with third-party ads.',
      ] },
      { h: 'Who can see it', p: [
        'By default, your sensitive hub data is private to you. Sharing only happens when you turn it on — for example, allowing another hub to read your biomarkers, or making parts of a dating profile public to matches.',
        'Family sharing shows only what you grant to the specific members you choose.',
      ] },
      { h: 'Your control', p: [
        'You can review and change every sharing permission in Settings → Privacy & Permissions. Turning a permission off takes effect immediately.',
        'You can export or delete your data. Deleting your account removes your personal records from active systems.',
      ] },
    ],
  },
  terms: {
    title: 'Terms of Service',
    lede: 'The basics of using Together City. By creating an account you agree to these terms.',
    sections: [
      { h: 'Using the city', p: [
        'You must be at least 18 to use Together City. Keep your account secure and don\'t share your password.',
        'Use the platform lawfully and respectfully. Don\'t harass others, impersonate people, or post illegal content.',
      ] },
      { h: 'Health, financial & guidance features', p: [
        'Medical, Fitness and Nutrition insights are for information and personalization only — they are not medical advice or a diagnosis. Always consult a qualified professional.',
        'Financial features help you organize money; they are not personalized investment or financial advice. Astrology content is offered as reflective guidance, not prediction.',
      ] },
      { h: 'Content & availability', p: [
        'You own the content you create. You grant us the permissions needed to operate and display it within the features you use.',
        'We improve the product continuously, so features may change. We aim for reliable service but can\'t guarantee uninterrupted availability.',
      ] },
    ],
  },
  about: {
    title: 'About Together City',
    lede: "One city for your whole life. Everything personalized.",
    sections: [
      { h: 'One city, every part of life', p: [
        'Together City brings the parts of daily life — health, food, money, travel, dating, entertainment, work and more — into one connected place, personalized to you.',
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
    lede: 'We\'d love to hear from you.',
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
      <p className="muted" style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 26 }}>{doc.lede}</p>
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
