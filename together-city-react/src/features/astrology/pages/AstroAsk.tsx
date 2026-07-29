import { useState } from 'react';
import { Button, Card, EmptyState, Spinner, Tag } from '@/components/ui';
import { useAskAstrologer, useAstroProfile, useAstroQuestions } from '../hooks';
import { AstroHeader, NeedsProfileCard } from '../shared';

const TOPICS = [
  'Career', 'Marriage', 'Relationships', 'Business', 'Investments', 'Education',
  'Children', 'Foreign Travel', 'Property', 'Health', 'Spiritual Growth',
];
const PRICE = 75;

/** Tab 03 — Ask the Astrologer. ₹75 per question, charged to the city wallet;
 *  every consultation is saved under My Questions. */
export function AstroAsk() {
  const profile = useAstroProfile();
  const questions = useAstroQuestions();
  const ask = useAskAstrologer();
  const [topic, setTopic] = useState('Career');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    ask.mutate({ topic, question: question.trim() }, {
      onSuccess: (res) => { setQuestion(''); setOpenId(res.id); },
      onError: (e) => {
        const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(' ') : msg ?? 'Something went wrong — you have not been charged.');
      },
    });
  };

  const needsProfile = profile.data && !profile.data.complete;

  return (
    <div>
      <AstroHeader title="Ask the Astrologer" lede={`A private consultation read against your own birth chart — ₹${PRICE} per question, saved forever under My Questions.`} />
      {profile.isLoading && <Spinner label="Loading…" />}
      {needsProfile && <NeedsProfileCard />}
      {profile.data?.complete && (
        <>
          <Card className="rise" style={{ padding: '24px 26px', marginBottom: 20 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 4 }}>Ask About Your Life</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Your chart — Sun {profile.data.profile?.chart.sunSign}, Moon {profile.data.profile?.chart.moonSign}
              {profile.data.profile?.chart.ascendant ? `, ${profile.data.profile.chart.ascendant} rising` : ''} — is applied automatically.
            </p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              {TOPICS.map((t) => (
                <button key={t} type="button" onClick={() => setTopic(t)}
                  style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px',
                    borderRadius: 999, border: `1.5px solid ${topic === t ? 'var(--accent)' : 'var(--line)'}`,
                    background: topic === t ? 'var(--accent-soft)' : 'var(--card)',
                    color: topic === t ? 'var(--accent)' : 'var(--ink)' }}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4}
              placeholder={`Ask anything about your ${topic.toLowerCase()} — the more specific, the sharper the reading. (10–600 characters)`}
              style={{ width: '100%', resize: 'vertical', padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--line)',
                background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6 }} />
            {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <Button variant="accent" disabled={question.trim().length < 10 || ask.isPending} onClick={submit}>
                {ask.isPending ? 'Consulting the chart…' : `Pay ₹${PRICE} & Ask`}
              </Button>
              <span className="muted" style={{ fontSize: 12 }}>Charged to your city wallet · the full reading is saved to My Questions.</span>
            </div>
          </Card>

          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, margin: '0 0 12px' }}>My Questions</h3>
          {questions.isLoading && <Spinner />}
          {questions.data?.length === 0 && (
            <EmptyState icon="🪐" title="No consultations yet" hint="Your first paid question and its full answer will be saved here." />
          )}
          {(questions.data ?? []).map((q) => (
            <Card key={q.id} style={{ padding: '16px 20px', marginBottom: 12 }}>
              <button type="button" onClick={() => setOpenId(openId === q.id ? null : q.id)}
                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <Tag>{q.topic}</Tag>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: '8px 0 2px' }}>{q.question}</p>
                    <p className="muted" style={{ fontSize: 11.5 }}>
                      {new Date(q.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ₹{q.priceInr}
                    </p>
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: 18 }}>{openId === q.id ? '▾' : '▸'}</span>
                </div>
              </button>
              {openId === q.id && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  {q.answer.split('\n\n').map((p, i) => (
                    <p key={i} style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 10 }}>{p}</p>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
