import { useMemo, useState, type MouseEvent as PointerMove } from 'react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { Fold, useDisclosure } from '@/components/ui/Fold';
import {
  useContentDetail, useContentOverview, useRefreshCounts,
  type Choices, type ContentRow, type DayPoint, type Detail, type Figure, type Filters, type GroupRow,
  type Overview, type PlatformRow, type PostRow, type RangeKey, type Stage, type SummaryKey,
} from './analytics.api';

/**
 * ── CONTENT ANALYTICS — EVERY FILM, EVERY PLATFORM (owner, 17 Sep) ──────────
 *
 * "Add this to the analytics dashboard": a Combined View of everything posted
 * on every connected platform, an audit table, one page per piece of content,
 * and the click-through funnel from a view to a registration.
 *
 * Owner's choices: public counts only (no insights permission), founder-only
 * on /dev, connected platforms only (YouTube, Instagram, Threads, Together TV).
 *
 * WHAT THIS PAGE MUST NOT DO is invent a number. A figure the platforms do not
 * give publicly is "—" with the reason beside it, never a 0; views across
 * platforms are called platform views, never people, because no platform says
 * who watched. The one de-duplicated count the city has is people who clicked
 * through, by browser, and it is labelled as exactly that. Styles live in
 * styles/content-analytics.css (prefix `ca-`).
 */

type View = 'overview' | 'combined' | 'audit' | 'videos' | 'posts' | 'campaigns' | 'platforms' | 'conversions';
const VIEWS: Array<[View, string]> = [
  ['overview', 'Overview'], ['combined', 'Combined view'], ['audit', 'Content audit'], ['videos', 'Videos'],
  ['posts', 'Posts'], ['campaigns', 'Campaigns'], ['platforms', 'Platforms'], ['conversions', 'Conversions'],
];
const RANGES: Array<[RangeKey, string]> = [
  ['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['6m', '6 months'], ['all', 'All time'], ['custom', 'Custom'],
];

const nf = new Intl.NumberFormat('en-IN');
const num = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : nf.format(v));
const pc = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${v}%`);
const day = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const when = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'never';
const say = (e: unknown, fallback: string): string => {
  const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(raw) ? raw.join(', ') : raw ?? fallback;
};
const PCT_KEYS: SummaryKey[] = ['engagementRate', 'ctr', 'completionRate'];
const show = (k: SummaryKey, v: number | null): string => (PCT_KEYS.includes(k) ? pc(v) : num(v));

/** "↑ 12.5% vs previous period" — or why there is nothing to compare. */
function Change({ f, all }: { f: Figure; all: boolean }) {
  if (f.value === null) return null;
  if (all) return <span className="ca-small">All time — no previous period</span>;
  if (f.change === null) return <span className="ca-small">No previous figure to compare</span>;
  const up = f.change >= 0;
  return (
    <span className={up ? 'ca-change ca-up' : 'ca-change ca-down'}>
      {up ? '↑' : '↓'} {Math.abs(f.change)}% vs previous period
    </span>
  );
}

/* ── FILTERS ───────────────────────────────────────────────────────────── */

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void;
}) {
  return (
    <label className="ca-field">
      <span className="ca-label">{label}</span>
      <select className="ca-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function FilterBar({ f, set, choices }: { f: Filters; set: (f: Filters) => void; choices: Choices | undefined }) {
  const patch = (p: Partial<Filters>) => set({ ...f, ...p });
  const c = choices;
  const channel = f.platform && f.topic ? `${f.platform}:${f.topic}` : '';
  const topicLabel = (k: string) => c?.topics.find((t) => t.key === k)?.label ?? k;
  const platformLabel = (k: string) => c?.platforms.find((p) => p.key === k)?.label ?? k;
  return (
    <div className="ca-filters">
      <div className="ca-seg" role="group" aria-label="Date range">
        {RANGES.map(([k, l]) => (
          <button key={k} type="button" className="ca-seg-btn" aria-pressed={f.range === k} onClick={() => patch({ range: k })}>{l}</button>
        ))}
      </div>
      {f.range === 'custom' && (
        <div className="ca-line">
          <label className="ca-field">
            <span className="ca-label">From</span>
            <input className="ca-input" type="date" value={f.from ?? ''} onChange={(e) => patch({ from: e.target.value })} />
          </label>
          <label className="ca-field">
            <span className="ca-label">To</span>
            <input className="ca-input" type="date" value={f.to ?? ''} onChange={(e) => patch({ to: e.target.value })} />
          </label>
        </div>
      )}
      <div className="ca-selects">
        <Select label="Platform" value={f.platform ?? ''} onChange={(v) => patch({ platform: v || undefined })}
          options={(c?.platforms ?? []).map((p) => [p.key, p.label])} />
        <Select label="Channel" value={channel}
          onChange={(v) => { const [platform, topic] = v ? v.split(':') : [undefined, undefined]; patch({ platform, topic }); }}
          options={(c?.channels ?? []).map((ch) => [`${ch.platform}:${ch.topic}`, `${platformLabel(ch.platform)} · ${ch.handle}`])} />
        <Select label="Content type" value={f.type ?? ''} onChange={(v) => patch({ type: v || undefined })}
          options={(c?.types ?? []).map((t) => [t, t])} />
        <Select label="Topic" value={f.topic ?? ''} onChange={(v) => patch({ topic: v || undefined })}
          options={(c?.topics ?? []).map((t) => [t.key, topicLabel(t.key)])} />
        <Select label="Series" value={f.series ?? ''} onChange={(v) => patch({ series: v || undefined })}
          options={(c?.series ?? []).map((s) => [s, s])} />
        <Select label="Episode" value={f.episode ?? ''} onChange={(v) => patch({ episode: v || undefined })}
          options={(c?.episodes ?? []).map((s) => [s, s])} />
        <Select label="Campaign" value={f.campaign ?? ''} onChange={(v) => patch({ campaign: v || undefined })}
          options={(c?.campaigns ?? []).map((s) => [s, s])} />
      </div>
      <label className="ca-check">
        <input type="checkbox" checked={f.published === 'period'}
          onChange={(e) => patch({ published: e.target.checked ? 'period' : 'all' })} />
        Only content published in this period
      </label>
    </div>
  );
}

/* ── THE SUMMARY ───────────────────────────────────────────────────────── */

const HERO: Array<[SummaryKey, string]> = [
  ['views', 'Platform views'], ['engagements', 'Engagements'], ['linkClicks', 'Link clicks'], ['uniqueClickers', 'People who clicked'],
  ['registrations', 'Registrations'], ['followersGained', 'Followers gained'], ['engagementRate', 'Engagement rate'], ['ctr', 'CTR'],
];
const ORDER: Array<[SummaryKey, string]> = [
  ['views', 'Total platform views'], ['uniqueReach', 'Estimated unique reach'], ['reach', 'Reach'], ['impressions', 'Impressions'],
  ['engagements', 'Engagements'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves'],
  ['clicks', 'Clicks'], ['linkClicks', 'Link clicks'], ['uniqueClickers', 'Unique people who clicked'], ['profileVisits', 'Profile visits'],
  ['followersGained', 'Followers gained'], ['avgWatchTime', 'Average watch time'], ['engagementRate', 'Engagement rate'],
  ['ctr', 'Click-through rate'], ['completionRate', 'Completion rate'], ['registrations', 'Registrations'], ['conversions', 'Conversions'],
];

function Executive({ o }: { o: Overview }) {
  const all = o.window.range === 'all';
  const views = o.summary.views;
  return (
    <section className="ca-section" aria-labelledby="ca-exec">
      <h3 id="ca-exec" className="ca-h">All content · {o.content.length} {o.content.length === 1 ? 'piece' : 'pieces'}</h3>
      <div className="ca-hero">
        {HERO.map(([k, label]) => (
          <div key={k} className="ca-hero-cell" title={o.summary[k].reason ?? o.summary[k].basis}>
            <span className="ca-hero-value">{show(k, o.summary[k].value)}</span>
            <span className="ca-hero-label">{label}</span>
          </div>
        ))}
      </div>
      <p className="ca-note">
        {views.value === null ? 'No platform has reported views for this period yet.' : <Change f={views} all={all} />}
      </p>
      <p className="ca-small">
        Platform views add up every platform’s own count, so one person who watched on YouTube and Instagram is two views.
        Nobody can say how many different people watched — the platforms do not share it. The one de-duplicated figure is
        people who clicked through ({num(o.summary.uniqueClickers.value)}), counted by browser.
      </p>
    </section>
  );
}

function Tile({ k, label, f, all }: { k: SummaryKey; label: string; f: Figure; all: boolean }) {
  return (
    <li className="ca-tile">
      <span className="ca-tile-label">{label}</span>
      <span className="ca-tile-value">{show(k, f.value)}</span>
      {f.value === null
        ? <span className="ca-small">{f.reason ?? 'Nothing measured yet.'}</span>
        : <><Change f={f} all={all} /><span className="ca-small">{f.basis}</span></>}
    </li>
  );
}

function Grid({ o }: { o: Overview }) {
  const all = o.window.range === 'all';
  return (
    <section className="ca-section" aria-labelledby="ca-grid">
      <h3 id="ca-grid" className="ca-h">Totals and averages</h3>
      <ul className="ca-tiles">
        {ORDER.map(([k, label]) => <Tile key={k} k={k} label={label} f={o.summary[k]} all={all} />)}
      </ul>
    </section>
  );
}

function BestWorst({ o, open }: { o: Overview; open: (id: string) => void }) {
  if (!o.best) return null;
  const one = (r: ContentRow & { by: 'views' | 'engagements' }, name: string) => (
    <Card className="ca-card">
      <span className="ca-label">{name} · by {r.by}</span>
      <button type="button" className="ca-rowlink" onClick={() => open(r.id)}>{r.title}</button>
      <span className="ca-small">{num(r.by === 'views' ? r.views : r.engagements)} {r.by} · {num(r.clicks)} link clicks · {day(r.createdAt)}</span>
    </Card>
  );
  return (
    <section className="ca-section" aria-labelledby="ca-bw">
      <h3 id="ca-bw" className="ca-h">Best and worst</h3>
      <div className="ca-cards">
        {one(o.best, 'Best')}
        {o.worst ? one(o.worst, 'Worst') : <p className="ca-small">One piece of content — nothing to compare it with.</p>}
      </div>
    </section>
  );
}

/** One creative, one Content ID — every platform it went to, and the combined line. */
function CrossPlatform({ rows, open }: { rows: ContentRow[]; open: (id: string) => void }) {
  return (
    <section className="ca-section" aria-labelledby="ca-cross">
      <h3 id="ca-cross" className="ca-h">By content, across platforms</h3>
      <div className="ca-cards">
        {rows.map((r) => (
          <Card key={r.id} className="ca-card">
            <button type="button" className="ca-rowlink" onClick={() => open(r.id)}>{r.title}</button>
            <span className="ca-small">Content ID {r.tag} · {day(r.createdAt)}{r.series ? ` · ${r.series}` : ''}{r.episode ? ` · ${r.episode}` : ''}</span>
            {r.platforms.map((p) => (
              <div key={p.channel} className="ca-split">
                <span>{p.label}</span>
                <span>{num(p.views)} views · {num(p.likes)} likes · {num(p.comments)} comments · {num(p.clicks)} clicks</span>
              </div>
            ))}
            <div className="ca-split ca-split-total">
              <span>Combined</span>
              <span>{num(r.views)} views · {num(r.engagements)} engagements · {num(r.clicks)} clicks · {num(r.registrations)} registrations</span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

type SortKey = 'views' | 'reach' | 'engagements' | 'ctr' | 'watchTime' | 'followers' | 'conversions' | 'createdAt';
const AUDIT_COLS: Array<[SortKey, string]> = [
  ['views', 'Views'], ['reach', 'Reach'], ['engagements', 'Engagement'], ['ctr', 'CTR'],
  ['watchTime', 'Watch time'], ['followers', 'Followers'], ['conversions', 'Conversions'],
];

function Audit({ rows, open }: { rows: ContentRow[]; open: (id: string) => void }) {
  const [by, setBy] = useState<SortKey>('views');
  const sorted = useMemo(() => {
    const val = (r: ContentRow): number => (by === 'createdAt' ? Date.parse(r.createdAt) : r[by] ?? -1);
    return [...rows].sort((a, b) => val(b) - val(a));
  }, [rows, by]);
  const head = (k: SortKey, label: string) => (
    <th scope="col" aria-sort={by === k ? 'descending' : 'none'}>
      <button type="button" className="ca-sort" onClick={() => setBy(k)}>{label}{by === k ? ' ↓' : ''}</button>
    </th>
  );
  return (
    <section className="ca-section" aria-labelledby="ca-audit">
      <h3 id="ca-audit" className="ca-h">Content audit</h3>
      <p className="ca-small">
        Reach, watch time, followers per post and conversions show “—”: the platforms give them only with insights, and nothing
        is on sale yet. Sorting by one of them keeps the list in its own order.
      </p>
      <div className="ca-scroll">
        <table className="ca-table">
          <thead>
            <tr>
              <th scope="col">Content</th>
              <th scope="col">Platforms</th>
              {head('createdAt', 'Date')}
              {AUDIT_COLS.map(([k, l]) => head(k, l))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="ca-tr">
                <th scope="row"><button type="button" className="ca-rowlink" onClick={() => open(r.id)}>{r.title}</button></th>
                <td>{r.platforms.map((p) => p.label).join(', ')}</td>
                <td>{day(r.createdAt)}</td>
                <td>{num(r.views)}</td>
                <td>—</td>
                <td>{num(r.engagements)}</td>
                <td>{pc(r.ctr)}</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── VIDEOS, POSTS, GROUPS, PLATFORMS ─────────────────────────────────── */

function Videos({ rows, open }: { rows: ContentRow[]; open: (id: string) => void }) {
  const videos = rows.filter((r) => r.kind === 'video');
  if (!videos.length) return <EmptyState title="No videos in this period" hint="Change the date range or the filters." />;
  return <CrossPlatform rows={videos} open={open} />;
}

function Posts({ rows, open }: { rows: PostRow[]; open: (id: string) => void }) {
  return (
    <section className="ca-section" aria-labelledby="ca-posts">
      <h3 id="ca-posts" className="ca-h">Posts · one row per platform</h3>
      <div className="ca-scroll">
        <table className="ca-table">
          <thead>
            <tr>
              <th scope="col">Content</th><th scope="col">Platform</th><th scope="col">Posted</th><th scope="col">Views</th>
              <th scope="col">Likes</th><th scope="col">Comments</th><th scope="col">Shares</th><th scope="col">Link clicks</th>
              <th scope="col">Registrations</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.contentId}-${r.channel}`} className="ca-tr">
                <th scope="row"><button type="button" className="ca-rowlink" onClick={() => open(r.contentId)}>{r.title}</button></th>
                <td>{r.url ? <a className="ca-out" href={r.url} target="_blank" rel="noreferrer">{r.label}</a> : r.label}</td>
                <td>{day(r.postedAt)}</td>
                <td>{num(r.views)}</td><td>{num(r.likes)}</td><td>{num(r.comments)}</td><td>{num(r.shares)}</td>
                <td>{num(r.clicks)}</td><td>{num(r.registrations)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Groups({ title, empty, rows }: { title: string; empty: string; rows: GroupRow[] }) {
  return (
    <section className="ca-section">
      <h3 className="ca-h">{title}</h3>
      {rows.length === 0 ? <p className="ca-small">{empty}</p> : (
        <div className="ca-scroll">
          <table className="ca-table">
            <thead>
              <tr>
                <th scope="col">Name</th><th scope="col">Content</th><th scope="col">Views</th>
                <th scope="col">Engagements</th><th scope="col">Link clicks</th><th scope="col">Registrations</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.name}>
                  <th scope="row">{g.name}</th><td>{num(g.contents)}</td><td>{num(g.views)}</td>
                  <td>{num(g.engagements)}</td><td>{num(g.clicks)}</td><td>{num(g.registrations)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Platforms({ rows }: { rows: PlatformRow[] }) {
  return (
    <section className="ca-section" aria-labelledby="ca-plat">
      <h3 id="ca-plat" className="ca-h">Platforms</h3>
      <div className="ca-scroll">
        <table className="ca-table">
          <thead>
            <tr>
              <th scope="col">Platform</th><th scope="col">Posts</th><th scope="col">Views</th><th scope="col">Likes</th>
              <th scope="col">Comments</th><th scope="col">Shares</th><th scope="col">Link clicks</th>
              <th scope="col">Registrations</th><th scope="col">Followers</th><th scope="col">Gained</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.channel}>
                <th scope="row">{p.label}<span className="ca-small ca-kv">{p.note}</span></th>
                <td>{num(p.posts)}</td><td>{num(p.views)}</td><td>{num(p.likes)}</td><td>{num(p.comments)}</td>
                <td>{num(p.shares)}</td><td>{num(p.clicks)}</td><td>{num(p.registrations)}</td>
                <td>{num(p.followers?.total)}</td><td>{num(p.followers?.gained)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── THE FUNNEL ────────────────────────────────────────────────────────── */

function StageCard({ s }: { s: Stage }) {
  const d = useDisclosure();
  const more = s.byPlatform.length > 0 || s.byDay.some((x) => (x.value ?? 0) > 0);
  return (
    <li className="ca-stage">
      {more ? (
        <button type="button" className="ca-stage-btn" {...d.faceProps}>
          <span className="ca-stage-value">{num(s.value)}</span>
          <span className="ca-stage-label">{s.label}</span>
          <span className="ca-small">{s.rate !== null ? `${s.rate}% of the stage before · ` : ''}{d.open ? 'Hide' : 'Show'} the breakdown</span>
        </button>
      ) : (
        <div className="ca-stage-btn">
          <span className="ca-stage-value">{num(s.value)}</span>
          <span className="ca-stage-label">{s.label}</span>
          {s.rate !== null && <span className="ca-small">{s.rate}% of the stage before</span>}
        </div>
      )}
      {s.reason && <span className="ca-small">{s.reason}</span>}
      {more && d.open && (
        <div {...d.panelProps} className="ca-kv">
          {s.byPlatform.map((p) => (
            <div key={p.channel} className="ca-split"><span>{p.label}</span><span>{num(p.value)}</span></div>
          ))}
          {s.byDay.some((x) => (x.value ?? 0) > 0) && (
            <Fold title="By day" meta={`${s.byDay.filter((x) => (x.value ?? 0) > 0).length} days with any`}>
              {s.byDay.filter((x) => (x.value ?? 0) > 0).map((x) => (
                <div key={x.day} className="ca-split"><span>{day(x.day)}</span><span>{num(x.value)}</span></div>
              ))}
            </Fold>
          )}
        </div>
      )}
    </li>
  );
}

function Funnel({ stages, lead }: { stages: Stage[]; lead: string }) {
  return (
    <section className="ca-section ca-funnel" aria-labelledby="ca-funnel">
      <h3 id="ca-funnel" className="ca-h">Click-through funnel</h3>
      <p className="ca-small">{lead}</p>
      <ol className="ca-stages">
        {stages.map((s) => <StageCard key={s.key} s={s} />)}
      </ol>
    </section>
  );
}

/* ── ONE MEASURE OVER TIME — a small multiple, one series, one axis ──── */

const W = 320;
const H = 96;
const PAD = 4;

function Line({ title, points }: { title: string; points: Array<{ day: string; value: number | null }> }) {
  const [at, setAt] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const x = (i: number) => (points.length <= 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (points.length - 1));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  let d = '';
  let pen = false;
  points.forEach((p, i) => {
    if (p.value === null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)} `;
    pen = true;
  });
  const measured = points.some((p) => p.value !== null);
  const hover = at !== null ? points[at] : null;
  const total = points.reduce((n, p) => n + (p.value ?? 0), 0);
  const move = (e: PointerMove<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - box.left) / box.width) * W;
    const i = points.length <= 1 ? 0 : Math.round(((rel - PAD) / (W - PAD * 2)) * (points.length - 1));
    setAt(Math.min(points.length - 1, Math.max(0, i)));
  };
  return (
    <figure className="ca-chart">
      <figcaption className="ca-chart-head">
        <span className="ca-tile-label">{title}</span>
        <span className="ca-small">
          {hover ? `${day(hover.day)}: ${num(hover.value)}` : measured ? `${num(total)} in the period · peak ${num(max)} a day` : 'Not measured'}
        </span>
      </figcaption>
      <svg className="ca-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${points.length} days, total ${num(total)}`}>
        <line className="ca-axis" x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} />
        {d && <path className="ca-plot" d={d} />}
        {hover && (
          <>
            <line className="ca-cross" x1={x(at as number)} x2={x(at as number)} y1={PAD} y2={H - PAD} />
            {hover.value !== null && <circle className="ca-dot" cx={x(at as number)} cy={y(hover.value)} r={4} />}
          </>
        )}
        <rect className="ca-hit" x={0} y={0} width={W} height={H} onMouseMove={move} onMouseLeave={() => setAt(null)} />
      </svg>
    </figure>
  );
}

function Timeline({ points }: { points: DayPoint[] }) {
  const pick = (k: 'views' | 'engagements' | 'clicks' | 'registrations') => points.map((p) => ({ day: p.day, value: p[k] }));
  return (
    <section className="ca-section" aria-labelledby="ca-time">
      <h3 id="ca-time" className="ca-h">Performance over time</h3>
      <div className="ca-charts">
        <Line title="Views a day" points={pick('views')} />
        <Line title="Engagements a day" points={pick('engagements')} />
        <Line title="Link clicks a day" points={pick('clicks')} />
        <Line title="Registrations a day" points={pick('registrations')} />
      </div>
      <Fold title="The same, as a table" meta={`${points.length} days`}>
        <div className="ca-scroll">
          <table className="ca-table">
            <thead>
              <tr><th scope="col">Day</th><th scope="col">Views</th><th scope="col">Engagements</th><th scope="col">Link clicks</th><th scope="col">Registrations</th></tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.day}><th scope="row">{day(p.day)}</th><td>{num(p.views)}</td><td>{num(p.engagements)}</td><td>{num(p.clicks)}</td><td>{num(p.registrations)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fold>
    </section>
  );
}

/* ── ONE PIECE OF CONTENT ──────────────────────────────────────────────── */

const WHY: Record<string, string> = {
  reach: 'insights', impressions: 'insights', saves: 'saves', profileVisits: 'insights', followers: 'followersPerPost',
  watchTime: 'insights', avgWatchDuration: 'insights', completion: 'insights', rewatch: 'insights', dropOff: 'insights',
  conversions: 'conversions',
};
const PERFORMANCE: Array<[string, string]> = [
  ['views', 'Platform views'], ['reach', 'Reach'], ['impressions', 'Impressions'], ['engagements', 'Engagements'],
  ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves'], ['clicks', 'Link clicks'],
  ['uniqueClicks', 'People who clicked'], ['ctr', 'CTR'], ['profileVisits', 'Profile visits'], ['followers', 'Followers gained'],
  ['watchTime', 'Watch time'], ['avgWatchDuration', 'Average watch duration'], ['completion', 'Completion rate'],
  ['rewatch', 'Rewatch rate'], ['dropOff', 'Drop-off'], ['registrations', 'Registrations'], ['conversions', 'Conversions'],
];

function DetailBody({ d }: { d: Detail }) {
  const c = d.content;
  return (
    <>
      <section className="ca-section">
        <h3 className="ca-title">{c.title}</h3>
        <p className="ca-small">
          Content ID {c.tag} · {c.kind} · {c.topic} · published {day(c.createdAt)}
          {c.series ? ` · ${c.series}` : ''}{c.episode ? ` · ${c.episode}` : ''}{c.campaign ? ` · ${c.campaign}` : ''}
        </p>
        <p className="ca-small">Its links land on <a className="ca-out" href={c.hub} target="_blank" rel="noreferrer">{c.hub}</a>, tagged {c.tag}.</p>
      </section>
      <section className="ca-section" aria-labelledby="ca-perf">
        <h3 id="ca-perf" className="ca-h">Performance · {d.window.range === 'all' ? 'all time' : `${day(d.window.from)} – ${day(d.window.to)}`}</h3>
        <ul className="ca-tiles">
          {PERFORMANCE.map(([k, label]) => {
            const v = d.totals[k] ?? null;
            const why = WHY[k] ? d.notMeasured[WHY[k]] : null;
            return (
              <li key={k} className="ca-tile">
                <span className="ca-tile-label">{label}</span>
                <span className="ca-tile-value">{k === 'ctr' ? pc(v) : num(v)}</span>
                {v === null && <span className="ca-small">{why ?? 'Nothing measured in this period yet.'}</span>}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="ca-section" aria-labelledby="ca-where">
        <h3 id="ca-where" className="ca-h">On each platform</h3>
        <div className="ca-scroll">
          <table className="ca-table">
            <thead>
              <tr>
                <th scope="col">Platform</th><th scope="col">Posted</th><th scope="col">Views</th><th scope="col">Likes</th>
                <th scope="col">Comments</th><th scope="col">Shares</th><th scope="col">Link clicks</th><th scope="col">CTR</th>
                <th scope="col">Registrations</th><th scope="col">Last read</th>
              </tr>
            </thead>
            <tbody>
              {d.platforms.map((p) => (
                <tr key={p.channel}>
                  <th scope="row">{p.url ? <a className="ca-out" href={p.url} target="_blank" rel="noreferrer">{p.label}</a> : p.label}</th>
                  <td>{day(p.postedAt)}</td><td>{num(p.views)}</td><td>{num(p.likes)}</td><td>{num(p.comments)}</td>
                  <td>{num(p.shares)}</td><td>{num(p.clicks)}</td><td>{pc(p.ctr)}</td><td>{num(p.registrations)}</td>
                  <td>{when(p.readAt)}</td>
                </tr>
              ))}
              <tr className="ca-split-total">
                <th scope="row">Combined</th><td>—</td><td>{num(d.totals.views)}</td><td>{num(d.totals.likes)}</td>
                <td>{num(d.totals.comments)}</td><td>{num(d.totals.shares)}</td><td>{num(d.totals.clicks)}</td>
                <td>{pc(d.totals.ctr)}</td><td>{num(d.totals.registrations)}</td><td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <Timeline points={d.timeline} />
      <Funnel stages={d.funnel} lead="From a view on a platform to a member of the city, for this content only. Open a stage for its split by platform and by day." />
    </>
  );
}

function DetailView({ password, id, f, back }: { password: string; id: string; f: Filters; back: () => void }) {
  const q = useContentDetail(password, id, f);
  return (
    <div className="ca-wrap">
      <nav className="ca-line" aria-label="Where you are">
        <Button variant="line" size="sm" onClick={back}>← Back to all content</Button>
        <span className="ca-small">Content analytics › Content audit › {q.data?.content.title ?? '…'}</span>
      </nav>
      {q.isLoading && <Spinner label="Reading this content…" />}
      {q.isError && <p className="ca-note ca-err">{say(q.error, 'Could not read this content.')}</p>}
      {q.data && <DetailBody d={q.data} />}
    </div>
  );
}

/* ── THE PAGE ──────────────────────────────────────────────────────────── */

const FUNNEL_LEAD =
  'Impressions → views → profile visits → link clicks → landing page → registration → conversion. Every link a post carries is '
  + 'tagged with its Content ID, so a click on togethercity.app is counted against the post it came from. Open a stage for its split.';

function Body({ view, o, open }: { view: View; o: Overview; open: (id: string) => void }) {
  if (!o.content.length && view !== 'platforms') {
    return <EmptyState title="Nothing posted in this period" hint="Change the date range or the filters, or publish from the Social tab." />;
  }
  switch (view) {
    case 'overview':
      return <><Executive o={o} /><BestWorst o={o} open={open} /><Funnel stages={o.funnel} lead={FUNNEL_LEAD} /></>;
    case 'combined':
      return <><Executive o={o} /><Grid o={o} /><BestWorst o={o} open={open} /><CrossPlatform rows={o.content} open={open} /><Audit rows={o.content} open={open} /></>;
    case 'audit':
      return <Audit rows={o.content} open={open} />;
    case 'videos':
      return <Videos rows={o.content} open={open} />;
    case 'posts':
      return <Posts rows={o.posts} open={open} />;
    case 'campaigns':
      return (
        <>
          <Groups title="Campaigns" rows={o.campaigns} empty="No upload in this period names a campaign. Add one on the Social tab when you publish." />
          <Groups title="Series" rows={o.series} empty="No upload in this period names a series." />
        </>
      );
    case 'platforms':
      return <Platforms rows={o.platforms} />;
    case 'conversions':
      return <><Funnel stages={o.funnel} lead={FUNNEL_LEAD} /><Grid o={o} /></>;
  }
}

export function DevContentAnalytics({ password }: { password: string }) {
  const [view, setView] = useState<View>('overview');
  const [filters, setFilters] = useState<Filters>({ range: '30d', published: 'all' });
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useContentOverview(password, filters);
  const refresh = useRefreshCounts(password);
  const o = q.data;

  if (openId) return <DetailView password={password} id={openId} f={filters} back={() => setOpenId(null)} />;

  const r = refresh.data;
  return (
    <div className="ca-wrap">
      <section className="ca-section">
        <p className="ca-lead">
          Every upload from the Social tab, on every connected platform — YouTube, Instagram, Threads and Together TV. Counts are the
          platforms’ public ones, read every three hours; a “—” is a number the platform does not give publicly, with the reason beside it.
        </p>
        <div className="ca-line">
          <Button variant="line" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? 'Reading counts…' : 'Refresh counts'}
          </Button>
          <span className="ca-small">Counts last read {when(o?.measuredAt ?? null)}</span>
          {r && (
            <span className="ca-small">
              {r.skipped ?? `Read ${r.read} ${r.read === 1 ? 'count' : 'counts'}.`}
              {r.failed.length > 0 && ` ${r.failed.length} failed: ${r.failed.map((x) => `${x.channel} ${x.topic}`).join(', ')}.`}
            </span>
          )}
          {refresh.isError && <span className="ca-small ca-err">{say(refresh.error, 'Could not read the counts.')}</span>}
        </div>
      </section>
      <nav className="ca-nav" aria-label="Analytics views">
        {VIEWS.map(([k, l]) => (
          <button key={k} type="button" className="ca-nav-btn" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>
        ))}
      </nav>
      <FilterBar f={filters} set={setFilters} choices={o?.choices} />
      {q.isLoading && <Spinner label="Reading the numbers…" />}
      {q.isError && <p className="ca-note ca-err">{say(q.error, 'Could not read the analytics.')}</p>}
      {o && (
        <>
          <p className="ca-small">
            {o.window.range === 'all' ? 'All time' : `${day(o.window.from)} – ${day(o.window.to)}`}
            {o.window.prevFrom ? ` · compared with ${day(o.window.prevFrom)} – ${day(o.window.prevTo)}` : ''}
          </p>
          <Body view={view} o={o} open={setOpenId} />
        </>
      )}
    </div>
  );
}
