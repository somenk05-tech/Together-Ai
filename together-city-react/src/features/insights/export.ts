import { RANGE_LABEL, SOURCE_LABEL } from './format';
import type { AiEngine, CityActivity, Health, Metric, Money, Overview, RangeKey, Reach, Retention } from './types';

/**
 * EXPORT — every number on the page as one CSV (owner, 16 Sep). Blank cells
 * are numbers the city could not measure; a sample export says so in its
 * first line and its file name.
 */
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(d: {
  range: RangeKey; overview: Overview; city: CityActivity; retention: Retention; reach: Reach; ai: AiEngine; money: Money; health: Health; sample: boolean;
}): void {
  const rows: unknown[][] = [
    [d.sample ? 'SAMPLE DATA — not Together City numbers' : 'Together City — product intelligence', `Window: ${RANGE_LABEL[d.range]}`, `Exported ${new Date().toISOString()}`],
    ['section', 'metric', 'value', 'previous', 'change', 'note'],
  ];
  const metric = (section: string, name: string, m: Metric) =>
    rows.push([section, name, m.value, m.previous, m.change.pct, m.note ?? m.change.note ?? '']);
  for (const [k, m] of Object.entries(d.overview.pulse)) metric('pulse', k, m);
  for (const s of d.overview.funnel.stages) rows.push(['journey', s.key, s.value, '', s.change.pct, s.ofPrevious === null ? s.note ?? '' : `${s.ofPrevious}% of previous stage`]);
  for (const p of d.overview.growth.points) rows.push(['growth', p.day, p.members, '', '', `${p.joined} joined`]);
  for (const s of d.city.systems) rows.push(['systems', s.label, s.users, '', s.trend30.pct, `${s.interactions} interactions; adoption ${s.adoption ?? ''}%`]);
  rows.push(['systems', 'average systems per member', d.city.depth.average, '', '', `of ${d.city.depth.of}`]);
  for (const c of d.retention.overall) rows.push(['retention', `D${c.day}`, c.rate, '', '', `${c.returned} of ${c.members}`]);
  for (const c of d.retention.cohorts) for (const x of c.cells) rows.push(['cohort', `${c.week} D${x.day}`, x.rate, '', '', `${c.size} joined`]);
  for (const s of d.reach.acquisition.sources) rows.push(['sources', SOURCE_LABEL[s.key] ?? s.key, s.signups, '', '', `${s.visitors} visitors; ${s.activated} activated; ${s.retained} retained`]);
  for (const r of d.reach.geography.india.rows) rows.push(['reach', r.label, r.count, '', '', 'India']);
  for (const r of d.reach.geography.abroad.rows) rows.push(['reach', r.label, r.count, '', '', 'abroad']);
  rows.push(['ai', 'conversations', d.ai.conversations, '', '', ''], ['ai', 'messages', d.ai.messages, '', '', ''], ['ai', 'members', d.ai.members, '', '', '']);
  rows.push(
    ['ai', 'calls', d.ai.calls.calls, '', '', d.ai.calls.available ? '' : d.ai.latency.note],
    ['ai', 'failed calls %', d.ai.failures.rate, '', '', d.ai.failures.note],
    ['ai', 'response ms (median)', d.ai.latency.p50ms, '', '', ''],
    ['ai', 'response ms (p95)', d.ai.latency.p95ms, '', '', ''],
    ['ai', 'cost INR', d.ai.economics.costInr, '', '', d.ai.economics.note],
    ['ai', 'cost per active member INR', d.ai.economics.costPerActiveMember, '', '', ''],
    ['ai', 'cost per AI user INR', d.ai.economics.costPerAiUser, '', '', ''],
    ['ai', 'cost per conversation INR', d.ai.economics.costPerConversation, '', '', ''],
    ['ai', 'monthly at this pace INR', d.ai.economics.monthlyEstimate, '', '', ''],
  );
  rows.push(
    ['health', 'uptime across deploys %', d.health.uptime.percent, '', '', d.health.uptime.since ? `recorded from ${d.health.uptime.since}` : 'not recorded yet'],
    ['health', 'downtime seconds', d.health.uptime.downSeconds, '', '', ''],
    ['health', 'deploys', d.health.uptime.deploys, '', '', `${d.health.uptime.restarts ?? ''} server starts`],
  );
  metric('health', 'crash-free sessions %', d.health.crashFree);
  rows.push(['health', 'sessions', d.health.sessions.total, '', '', `${d.health.sessions.crashed ?? ''} crashed`]);
  rows.push(['money', 'monetised', d.money.monetised ? 'yes' : 'no', '', '', d.money.note]);
  const csv = rows.map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `together-city-${d.sample ? 'SAMPLE-' : ''}${d.range}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
