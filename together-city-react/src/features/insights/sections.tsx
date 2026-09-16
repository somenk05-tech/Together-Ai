import type { ReactNode } from 'react';
import { useSection, type Access } from './api';
import {
  Bars, Columns, DataTable, Empty, Failed, InfoTip, LineChart, Meter, MetricCard, NotRealBadge, Section, Timeline, Trend, useNearScreen,
} from './parts';
import { DEFINITIONS } from './definitions';
import {
  compact, count, dateLabel, dayLabel, ERROR_LABEL, inr, ms, percent, percentFine, seconds, SOURCE_LABEL, timeLabel, RANGE_LABEL,
} from './format';
import type { RangeKey, SectionKey } from './types';

/**
 * ── THE SECTIONS OF /investor/analytics (owner, 16 Sep) ────────────────────
 *
 * Each reads one server section through api.ts, when it is near the screen,
 * and keeps its last answer on screen while the next one loads.
 */
export interface Ctx { range: RangeKey; access: Access | null; sample: boolean; founder: boolean; present: boolean }

function useLazy<K extends SectionKey>(key: K, ctx: Ctx) {
  const [ref, near] = useNearScreen<HTMLDivElement>();
  const q = useSection(key, ctx.range, ctx.access, { sample: ctx.sample, enabled: near });
  return { ref, q, sample: Boolean(q.data?.sample) };
}

function Body({ q, children }: { q: { isLoading: boolean; isError: boolean; data?: unknown; refetch: () => unknown; isFetching: boolean }; children: ReactNode }) {
  if (q.isError && !q.data) return <Failed onRetry={() => { void q.refetch(); }} />;
  if (!q.data) return <div className="ix-loading" aria-busy="true">Reading the city…</div>;
  return <div className={q.isFetching ? 'ix-stale' : undefined}>{children}</div>;
}

const vsOf = (range: RangeKey) => (range === 'all' ? undefined : `vs previous ${RANGE_LABEL[range]}`);

// ───────────────────────── snapshot, pulse, changes ─────────────────────────

export function Snapshot({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('overview', ctx);
  const s = q.data?.snapshot;
  return (
    <div ref={ref}>
      <Section id="snapshot" title="Investor snapshot" sample={sample}
        sub="The city in ten seconds: how many, how fast, how active, whether they return, what they use, what it costs, whether they pay.">
        <Body q={q}>
          {s && (
            <div className="ix-grid ix-grid-4">
              <MetricCard label="City members" metric={s.members} show={count} info={DEFINITIONS.members} vs={vsOf(ctx.range)} sample={sample} />
              <MetricCard label="New members" metric={s.newMembers} show={count} info={DEFINITIONS.newMembers} vs={vsOf(ctx.range)} sample={sample} />
              <MetricCard label="Active this week" metric={s.activeWeek} show={count} info={DEFINITIONS.activeWeek} vs="vs the week before" sample={sample} />
              <MetricCard label="D7 retention" metric={s.d7Retention} show={percent} info={DEFINITIONS.d7} sample={sample} />
              <MetricCard label="Systems per member" metric={s.systemsPerMember} show={(n) => (n === null ? '—' : `${n} / 8`)} info={DEFINITIONS.depth} sample={sample} />
              <MetricCard label="City Assistant users" metric={s.aiUsers} show={count} info={DEFINITIONS.aiUsers} vs={vsOf(ctx.range)} sample={sample} />
              <MetricCard label="AI cost" metric={s.aiCost} show={inr} info={DEFINITIONS.aiCost} vs={vsOf(ctx.range)} sample={sample} />
              <MetricCard label="Paying members" metric={s.paying} show={count} info={DEFINITIONS.paying} sample={sample} />
            </div>
          )}
        </Body>
      </Section>
    </div>
  );
}

export function Pulse({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('overview', ctx);
  const p = q.data?.pulse;
  const vs = vsOf(ctx.range);
  return (
    <div ref={ref}>
      <Section id="pulse" title="Live city pulse" sample={sample}
        sub="Real-time view of Together City's growth, engagement and activity.">
        <Body q={q}>
          {p && (
            <div className={`ix-grid ix-grid-4${ctx.present ? ' ix-present-grid' : ''}`}>
              <MetricCard big label="City members" metric={p.members} show={count} info={DEFINITIONS.members} vs={vs} sample={sample} />
              <MetricCard big label="Active today" metric={p.activeToday} show={count} info={DEFINITIONS.activeToday} vs="vs yesterday" sample={sample} />
              <MetricCard big label="Active this week" metric={p.activeWeek} show={count} info={DEFINITIONS.activeWeek} vs="vs the week before" sample={sample} />
              <MetricCard big label="Active this month" metric={p.activeMonth} show={count} info={DEFINITIONS.activeMonth} vs="vs the 30 days before" sample={sample} />
              {!ctx.present && <>
                <MetricCard label="New members" metric={p.newMembers} show={count} info={DEFINITIONS.newMembers} vs={vs} sample={sample} />
                <MetricCard label="Growth rate" metric={p.growthRate} show={percent} info={DEFINITIONS.growthRate} sample={sample} />
                <MetricCard label="D7 retention" metric={p.d7Retention} show={percent} info={DEFINITIONS.d7} sample={sample} />
                <MetricCard label="Avg time / active day" metric={p.avgSession} show={seconds} info={DEFINITIONS.session} vs={vs} sample={sample} />
              </>}
            </div>
          )}
        </Body>
      </Section>
    </div>
  );
}

export function WhatChanged({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('overview', ctx);
  const rows = q.data?.changes ?? [];
  const any = rows.some((r) => r.change.pct !== null);
  return (
    <div ref={ref}>
      <Section id="changed" title="What changed" sample={sample}
        sub={ctx.range === 'all' ? 'Pick a window to compare it with the one before.' : `The last ${RANGE_LABEL[ctx.range]} against the ${RANGE_LABEL[ctx.range]} before.`}>
        <Body q={q}>
          {ctx.range === 'all' || !any
            ? <Empty title="No meaningful trend yet">Not enough data to establish a meaningful trend. A change is shown once either side has at least five.</Empty>
            : (
              <ul className="ix-changes">
                {rows.map((r) => (
                  <li key={r.key}><span className="ix-label">{r.label}</span><Trend change={r.change} kind={r.kind} /></li>
                ))}
              </ul>
            )}
        </Body>
      </Section>
    </div>
  );
}

// ───────────────────────── traction and funnel ─────────────────────────

export function Traction({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('overview', ctx);
  const g = q.data?.growth;
  const f = q.data?.funnel;
  const stage = (k: string) => f?.stages.find((s) => s.key === k);
  return (
    <div ref={ref}>
      <Section id="traction" title="Traction" sample={sample}
        sub={q.data?.from ? `${dayLabel(q.data.from)} – ${dayLabel(q.data.to)}` : 'Since the first member joined'}>
        <Body q={q}>
          {g && (
            <>
              <h3 className="ix-h3">Member growth <InfoTip text={DEFINITIONS.growth} /></h3>
              {g.points.length < 2
                ? <Empty>Once the city has two days of members, growth appears here.</Empty>
                : <LineChart label="City members" points={g.points.map((p) => ({ day: p.day, value: p.members }))} marks={g.milestones} />}
              <div className="ix-grid ix-grid-4 ix-gap-top">
                <Stat label="Activation rate" value={percent(rate(stage('activated')?.value, stage('members')?.value))} info={DEFINITIONS.activation} />
                <Stat label="Joined in window" value={count(stage('signups')?.value)} info={DEFINITIONS.newMembers} />
                <Stat label="Still members" value={count(stage('members')?.value)} info={DEFINITIONS.stillMembers} />
                <Stat label="Retained" value={count(stage('retained')?.value)} info={DEFINITIONS.retained} />
              </div>
            </>
          )}
        </Body>
      </Section>
    </div>
  );
}

const rate = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || a === undefined || !b ? null : Math.round((a / b) * 1000) / 10;

function Stat({ label, value, info }: { label: string; value: string; info: string }) {
  return (
    <div className="ix-stat">
      <div className="ix-card-top"><span className="ix-label">{label}</span><InfoTip text={info} /></div>
      <b>{value}</b>
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  visitors: 'Website visitors', signups: 'Sign-ups', members: 'City members', activated: 'Activated',
  weekly: 'Active this week', retained: 'Retained', paying: 'Paying',
};

export function Funnel({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('overview', ctx);
  const f = q.data?.funnel;
  const top = Math.max(1, ...(f?.stages.map((s) => s.value ?? 0) ?? [1]));
  return (
    <div ref={ref}>
      <Section id="journey" title="User journey" sample={sample}
        sub={f ? `Of the people who arrived in this window. Activated = used at least ${f.activation.minSystems} systems within ${f.activation.withinDays} days of joining.` : undefined}>
        <Body q={q}>
          {f && (
            <ol className="ix-funnel">
              {f.stages.map((s, i) => (
                <li key={s.key} className="ix-stage">
                  {i > 0 && (
                    <span className="ix-conv">{s.ofPrevious === null ? '' : `${percent(s.ofPrevious)} ↓`}</span>
                  )}
                  <div className="ix-stage-row">
                    <span className="ix-stage-n">{s.value === null ? '—' : count(s.value)}</span>
                    <span className="ix-label">{STAGE_LABEL[s.key] ?? s.key} <InfoTip text={DEFINITIONS[`stage_${s.key}` as keyof typeof DEFINITIONS] ?? ''} /></span>
                    {s.value === null ? <span className="ix-trend flat">{s.note}</span> : <Trend change={s.change} kind="pct" />}
                  </div>
                  <Meter share={s.value === null ? null : s.value / top} height={6} className="ix-stage-bar" />
                </li>
              ))}
            </ol>
          )}
        </Body>
      </Section>
    </div>
  );
}

// ───────────────────────── city activity ─────────────────────────

export function CityActivitySection({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('city', ctx);
  const c = q.data;
  return (
    <div ref={ref}>
      <Section id="activity" title="City activity" sample={sample}
        sub="What members do in each of the eight personal systems. Shown in the city's own order — not ranked.">
        <Body q={q}>
          {c && (c.activeMembers === 0
            ? <Empty>No member has used a system in this window yet.</Empty>
            : (
              <div className="ix-scroll">
                <table className="ix-table ix-systems">
                  <caption className="ix-vh">Use of each system in the window</caption>
                  <thead>
                    <tr>
                      <th scope="col">System</th>
                      <th scope="col">Members <InfoTip text={DEFINITIONS.systemUsers} /></th>
                      <th scope="col">Interactions <InfoTip text={DEFINITIONS.interactions} /></th>
                      <th scope="col">Per member</th>
                      <th scope="col">Last 7 days</th>
                      <th scope="col">Last 30 days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.systems.map((s) => (
                      <tr key={s.key}>
                        <th scope="row">{s.label}</th>
                        <td data-label="Members">{count(s.users)}</td>
                        <td data-label="Interactions">{count(s.interactions)}</td>
                        <td data-label="Per member">{s.perUser === null ? '—' : count(s.perUser)}</td>
                        <td data-label="Last 7 days"><Trend change={s.trend7} kind="pct" short /></td>
                        <td data-label="Last 30 days"><Trend change={s.trend30} kind="pct" short /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </Body>
      </Section>
    </div>
  );
}

export function Adoption({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('city', ctx);
  const c = q.data;
  return (
    <div ref={ref}>
      <Section id="adoption" title="Feature adoption" sample={sample}
        sub={c ? `Share of the ${count(c.activeMembers)} active members who used each system in the window.` : undefined}>
        <Body q={q}>
          {c && (c.activeMembers === 0
            ? <Empty>Adoption appears once members are active.</Empty>
            : <Bars label="Feature adoption" max={100} show={percent}
                rows={c.systems.map((s) => ({ key: s.key, label: s.label, value: s.adoption }))} />)}
        </Body>
      </Section>
    </div>
  );
}

export function Depth({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('city', ctx);
  const d = q.data?.depth;
  return (
    <div ref={ref}>
      <Section id="depth" title="Personal systems per member" sample={sample}
        sub="Is the city used as one feature, or as a personal platform? How many of the eight systems each active member used.">
        <Body q={q}>
          {d && (d.membersUsingASystem === 0
            ? <Empty>This appears once members have used a system.</Empty>
            : (
              <div className="ix-split">
                <div className="ix-hero">
                  <b>{d.average === null ? '—' : d.average}</b>
                  <span>/ {d.of} systems on average <InfoTip text={DEFINITIONS.depth} /></span>
                </div>
                <Columns label="Members by number of systems used" xLabel="Systems"
                  rows={Array.from({ length: d.of }, (_, i) => ({ x: String(i + 1), value: d.distribution.find((r) => r.systems === i + 1)?.members ?? 0 }))} />
              </div>
            ))}
        </Body>
      </Section>
    </div>
  );
}

export function Engagement({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('city', ctx);
  const e = q.data?.engagement;
  return (
    <div ref={ref}>
      <Section id="engagement" title="Engagement overview" sample={sample}>
        <Body q={q}>
          {e && (
            <div className="ix-grid ix-grid-3">
              <Stat label="Active days / member" value={count(e.activeDaysPerMember)} info={DEFINITIONS.activeDays} />
              <Stat label="Interactions / member" value={count(e.interactionsPerMember)} info={DEFINITIONS.interactions} />
              <Stat label="Assistant messages / member" value={count(e.aiPerMember)} info={DEFINITIONS.aiPerMember} />
              <Stat label="Chat messages / sender" value={count(e.messagesPerSender)} info={DEFINITIONS.messages} />
              <Stat label="Returning members" value={e.returning.of ? `${count(e.returning.members)} of ${count(e.returning.of)}` : '—'} info={DEFINITIONS.returning} />
              <Stat label="Chat messages sent" value={count(e.messages)} info={DEFINITIONS.messages} />
            </div>
          )}
        </Body>
      </Section>
    </div>
  );
}

// ───────────────────────── retention ─────────────────────────

const heat = (r: number | null) => (r === null ? 'na' : String(Math.min(5, Math.floor(r / 20))));

export function RetentionSection({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('retention', ctx);
  const r = q.data;
  const ready = r?.overall.some((c) => c.rate !== null);
  return (
    <div ref={ref}>
      <Section id="retention" title="Retention" sample={sample}
        sub="Of the members who joined in a week, the share who came back. Weeks start on Monday; a cell fills once every member in it is old enough.">
        <Body q={q}>
          {r && (!ready
            ? <Empty>Once more members have been here a week, retention and cohorts appear here.</Empty>
            : (
              <>
                <div className="ix-grid ix-grid-4">
                  {r.overall.map((c) => (
                    <div key={c.day} className="ix-stat">
                      <span className="ix-label">D{c.day} <InfoTip text={DEFINITIONS[`d${c.day}` as keyof typeof DEFINITIONS] ?? DEFINITIONS.d7} /></span>
                      <b>{percent(c.rate)}</b>
                      <span className="ix-sub">{c.members ? `${count(c.returned)} of ${count(c.members)}` : 'Not old enough yet'}</span>
                    </div>
                  ))}
                </div>
                <div className="ix-scroll ix-gap-top">
                  <table className="ix-table ix-cohorts">
                    <caption className="ix-vh">Retention by joining week</caption>
                    <thead><tr><th scope="col">Joined week of</th><th scope="col">Members</th>{r.definition.days.map((d) => <th key={d} scope="col">Day {d}</th>)}</tr></thead>
                    <tbody>
                      {r.cohorts.map((c) => (
                        <tr key={c.week}>
                          <th scope="row">{dayLabel(c.week)}</th>
                          <td>{count(c.size)}</td>
                          {c.cells.map((cell) => (
                            <td key={cell.day} className={`ix-heat h${heat(cell.rate)}`}
                              title={cell.rate === null ? 'Not old enough yet' : `${cell.returned} of ${cell.members} came back`}>
                              {cell.rate === null ? '·' : percent(cell.rate)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}
        </Body>
      </Section>
    </div>
  );
}

// ───────────────────────── AI ─────────────────────────

export function AiSection({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('ai', ctx);
  const a = q.data;
  return (
    <div ref={ref}>
      <Section id="ai" title="AI engine" sample={sample} sub="The City Assistant: how much it is used, and what it costs to run.">
        <Body q={q}>
          {a && (
            <>
              <div className="ix-grid ix-grid-3">
                <Stat label="Conversations" value={count(a.conversations)} info={DEFINITIONS.conversations} />
                <Stat label="Messages from members" value={count(a.messages)} info={DEFINITIONS.aiMessages} />
                <Stat label="Messages / member" value={count(a.perMember)} info={DEFINITIONS.aiPerMember} />
                <Stat label="Avg conversation" value={a.avgConversation === null ? '—' : `${count(a.avgConversation)} ${a.avgConversation === 1 ? 'message' : 'messages'}`} info={DEFINITIONS.avgConversation} />
                <Stat label="Continuation rate" value={percent(a.continuationRate)} info={DEFINITIONS.continuation} />
                <Stat label="Returning AI users" value={count(a.returningMembers)} info={DEFINITIONS.aiReturning} />
                <Stat label="AI requests" value={a.calls.available ? compact(a.calls.calls) : '—'} info={DEFINITIONS.aiCalls} />
                <Stat label="Failed AI calls"
                  value={a.failures.rate === null ? '—' : `${percent(a.failures.rate)} · ${count(a.failures.failed)}`} info={DEFINITIONS.aiFailures} />
                <Stat label="AI response (median / p95)"
                  value={a.latency.p50ms === null ? '—' : `${ms(a.latency.p50ms)} / ${ms(a.latency.p95ms)}`} info={DEFINITIONS.aiLatency} />
              </div>
              <p className="ix-note">
                {a.calls.available
                  ? `AI calls recorded from ${a.calls.since ? dateLabel(a.calls.since) : 'the next call'}.${a.latency.status === 'live' ? '' : ` ${a.latency.note}`}`
                  : a.latency.note}
              </p>
              {ctx.founder && a.failures.byKind.length > 0 && (
                <p className="ix-note">Failures: {a.failures.byKind.map((k) => `${ERROR_LABEL[k.kind] ?? k.kind} ${count(k.count)}`).join(' · ')}</p>
              )}
              <h3 className="ix-h3">AI economics <InfoTip text={DEFINITIONS.aiCost} /></h3>
              <div className="ix-grid ix-grid-3">
                <Stat label="AI cost in window" value={inr(a.economics.costInr)} info={DEFINITIONS.aiCost} />
                <Stat label="At this pace, a month" value={inr(a.economics.monthlyEstimate)} info={DEFINITIONS.aiMonthly} />
                <Stat label="Tokens used" value={a.calls.available ? compact((a.calls.tokensIn ?? 0) + (a.calls.tokensOut ?? 0)) : '—'} info={DEFINITIONS.tokens} />
                <Stat label="Cost / active member" value={inr(a.economics.costPerActiveMember)} info={DEFINITIONS.aiCost} />
                <Stat label="Cost / AI user" value={inr(a.economics.costPerAiUser)} info={DEFINITIONS.aiCostPerUser} />
                <Stat label="Cost / conversation" value={inr(a.economics.costPerConversation)} info={DEFINITIONS.aiCost} />
              </div>
              <p className="ix-note">{a.economics.note}</p>
              {ctx.founder && a.calls.byModel.length > 0 && (
                <DataTable caption="Calls by model" head={['Model', 'Calls', 'Failed', 'Tokens in', 'Tokens out', 'Cost']}
                  rows={a.calls.byModel.map((m) => [m.model, count(m.calls), count(m.failed), count(m.tokensIn), count(m.tokensOut), m.costInr === null ? 'rate not set' : inr(m.costInr)])} />
              )}
            </>
          )}
        </Body>
      </Section>
    </div>
  );
}

// ───────────────────────── reach ─────────────────────────

export function Acquisition({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('reach', ctx);
  const r = q.data;
  const since = r?.tracking.visitors ?? r?.tracking.origins;
  return (
    <div ref={ref}>
      <Section id="sources" title="Where members come from" sample={sample}
        sub={since ? `Quality, not just traffic. Sources are recorded from ${dateLabel(since)}.` : 'Quality, not just traffic. Sources are recorded from the day this dashboard went live.'}>
        <Body q={q}>
          {r && (
            <>
              <div className="ix-scroll">
                <table className="ix-table">
                  <caption className="ix-vh">Acquisition by source</caption>
                  <thead>
                    <tr><th scope="col">Source</th><th scope="col">Visitors</th><th scope="col">Sign-ups</th><th scope="col">Sign-up rate</th><th scope="col">Activated</th><th scope="col">Retained</th></tr>
                  </thead>
                  <tbody>
                    {r.acquisition.sources.map((s) => (
                      <tr key={s.key}>
                        <th scope="row">{SOURCE_LABEL[s.key] ?? s.key}</th>
                        <td>{count(s.visitors)}</td><td>{count(s.signups)}</td><td>{percent(s.signupRate)}</td>
                        <td>{count(s.activated)}</td><td>{count(s.retained)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(r.acquisition.untrackedSignups > 0 || r.acquisition.untrackedVisitors > 0) && (
                <p className="ix-note">
                  {count(r.acquisition.untrackedSignups)} members and {count(r.acquisition.untrackedVisitors)} visitors arrived before sources were recorded, and are not in the table.
                </p>
              )}
            </>
          )}
        </Body>
      </Section>
    </div>
  );
}

function Folded({ rows, hidden, label, min }: { rows: Array<{ label: string; count: number }>; hidden: number; label: string; min: number }) {
  if (!rows.length) return <Empty title="Too few to show">{`Groups under ${min} members are not shown, so nobody can be picked out.`}</Empty>;
  return (
    <>
      <Bars label={label} show={count} rows={rows.map((r) => ({ key: r.label, label: r.label, value: r.count }))} />
      {hidden > 0 && <p className="ix-note">{`${hidden} more in groups under ${min}, not shown.`}</p>}
    </>
  );
}

export function Reach({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('reach', ctx);
  const r = q.data;
  return (
    <div ref={ref}>
      <Section id="reach" title="City reach" sample={sample}
        sub={r ? `Where members live, as they told us. Groups under ${r.minGroup} are folded into Other.` : undefined}>
        <Body q={q}>
          {r && (
            <div className="ix-split">
              <div>
                <h3 className="ix-h3">India · {count(r.geography.indiaTotal)}</h3>
                <Folded label="Members by city" min={r.minGroup} {...r.geography.india} />
              </div>
              <div>
                <h3 className="ix-h3">Abroad · {count(r.geography.abroadTotal)}</h3>
                <Folded label="Members by country" min={r.minGroup} {...r.geography.abroad} />
                {r.geography.unknown > 0 && <p className="ix-note">{count(r.geography.unknown)} members have not said where they live.</p>}
              </div>
            </div>
          )}
        </Body>
      </Section>
    </div>
  );
}

export function Profile({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('reach', ctx);
  const r = q.data;
  return (
    <div ref={ref}>
      <Section id="profile" title="Member profile" sample={sample}
        sub="Aggregates only. No name, contact, health or dating detail is ever shown here.">
        <Body q={q}>
          {r && (
            <div className="ix-split">
              <div>
                <h3 className="ix-h3">Age <InfoTip text={DEFINITIONS.age} /></h3>
                <Folded label="Members by age" min={r.minGroup} {...r.demographics.ages} />
              </div>
              <div>
                <h3 className="ix-h3">Device of first visit</h3>
                <Folded label="Visitors by device" min={r.minGroup} {...r.demographics.devices} />
                <h3 className="ix-h3">Phone app installed</h3>
                <Folded label="Members by app" min={r.minGroup} {...r.demographics.apps} />
              </div>
            </div>
          )}
        </Body>
      </Section>
    </div>
  );
}

// ───────────────────────── money, health, live ─────────────────────────

export function Monetisation({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('money', ctx);
  const m = q.data;
  return (
    <div ref={ref}>
      <Section id="money" title="Monetisation" sample={sample} sub={m?.note}>
        <Body q={q}>
          {m && (
            <>
              <div className="ix-grid ix-grid-4">
                <MetricCard label="MRR" metric={m.mrr} show={inr} info={DEFINITIONS.mrr} sample={sample} />
                <MetricCard label="ARR" metric={m.arr} show={inr} info={DEFINITIONS.arr} sample={sample} />
                <MetricCard label="Paying members" metric={m.paying} show={count} info={DEFINITIONS.paying} sample={sample} />
                <MetricCard label="Free → paid" metric={m.conversion} show={percent} info={DEFINITIONS.conversion} sample={sample} />
                <MetricCard label="ARPU" metric={m.arpu} show={inr} info={DEFINITIONS.arpu} sample={sample} />
                <MetricCard label="CAC" metric={m.cac} show={inr} info={DEFINITIONS.cac} sample={sample} />
                <MetricCard label="LTV" metric={m.ltv} show={inr} info={DEFINITIONS.ltv} sample={sample} />
                <MetricCard label="Gross margin" metric={m.grossMargin} show={percent} info={DEFINITIONS.margin} sample={sample} />
              </div>
              <p className="ix-note">
                Ready for: {m.plans.map((p) => `${p.label} (${inr(p.priceInr)})`).join(', ')}.
                {' '}In-app test subscriptions booked with wallet credit: {count(m.intent.subscribers)} {m.intent.subscribers === 1 ? 'member' : 'members'} — a signal of intent, not revenue.
              </p>
            </>
          )}
        </Body>
      </Section>
    </div>
  );
}

const STATUS_WORD = { operational: 'Operational', degraded: 'Degraded', incident: 'Incident' } as const;

export function HealthSection({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('health', ctx);
  const h = q.data;
  return (
    <div ref={ref}>
      <Section id="health" title="Platform health" sample={sample}
        sub={h ? `Right now: this server, since it started ${dateLabel(h.since)} ${timeLabel(h.since)}. Across deploys: ${ctx.range === 'all' ? 'all time' : `the last ${RANGE_LABEL[ctx.range]}`}.` : undefined}>
        <Body q={q}>
          {h && (
            <>
              <p className={`ix-status ${h.status}`}><span className="ix-status-dot" aria-hidden /> {STATUS_WORD[h.status]}</p>
              <div className="ix-grid ix-grid-4">
                <Stat label="Up for" value={seconds(h.uptimeSeconds)} info={DEFINITIONS.uptime} />
                <Stat label="API success rate" value={percentFine(h.successRate)} info={DEFINITIONS.success} />
                <Stat label="Response time (median / p95)" value={h.p50ms === null ? '—' : `${h.p50ms} / ${h.p95ms} ms`} info={DEFINITIONS.latency} />
                <Stat label="Failed requests" value={count(h.failedRequests)} info={DEFINITIONS.failed} />
                <Stat label="Database" value={h.database.ok ? `OK · ${h.database.ms} ms` : 'Not answering'} info={DEFINITIONS.database} />
              </div>
              <h3 className="ix-h3">Last 24 hours</h3>
              <Timeline rows={h.timeline} />
              <h3 className="ix-h3">Across deploys · {RANGE_LABEL[ctx.range]}</h3>
              <div className="ix-grid ix-grid-3">
                <Stat label="Uptime" value={percentFine(h.uptime.percent)} info={DEFINITIONS.uptimeDeploys} />
                <Stat label="Downtime" value={h.uptime.downSeconds === null ? '—' : seconds(h.uptime.downSeconds)} info={DEFINITIONS.uptimeDeploys} />
                <Stat label="Deploys / starts"
                  value={h.uptime.deploys === null ? '—' : `${count(h.uptime.deploys)} / ${count(h.uptime.restarts)}`} info={DEFINITIONS.deploys} />
                <Stat label="Crash-free sessions" value={percentFine(h.crashFree.value)} info={DEFINITIONS.crashFree} />
                <Stat label="Sessions / crashed"
                  value={h.sessions.total === null ? '—' : `${count(h.sessions.total)} / ${count(h.sessions.crashed)}`} info={DEFINITIONS.crashFree} />
                <Stat label="Failed AI calls" value={percent(h.aiFailures.rate)} info={DEFINITIONS.aiFailures} />
              </div>
              <p className="ix-note">
                {[
                  h.uptime.since ? `Uptime recorded from ${dateLabel(h.uptime.since)}.` : 'Uptime is recorded from the next server start.',
                  h.sessions.since ? `Sessions recorded from ${dateLabel(h.sessions.since)}.` : 'Sessions are recorded from the next opening of the app.',
                  h.crashFree.value === null ? '' : (h.crashFree.note ?? ''),
                ].filter(Boolean).join(' ')}
              </p>
              {ctx.founder && h.sessions.byPlatform.length > 0 && (
                <DataTable caption="Sessions by platform" head={['Platform', 'Sessions', 'Crashed']}
                  rows={h.sessions.byPlatform.map((p) => [p.platform, count(p.sessions), count(p.crashed)])} />
              )}
              {h.notMeasured.length > 0 && <p className="ix-note">Not measured yet: {h.notMeasured.join('; ')}.</p>}
            </>
          )}
        </Body>
      </Section>
    </div>
  );
}

export function LiveFeed({ ctx }: { ctx: Ctx }) {
  const { ref, q, sample } = useLazy('live', ctx);
  const items = q.data?.items ?? [];
  return (
    <div ref={ref}>
      <Section id="live" title="Live city activity" sample={sample}
        sub="What happened lately — never who. The last three days.">
        <Body q={q}>
          {items.length === 0
            ? <Empty title="A quiet few days">Nothing has happened in the city in the last three days.</Empty>
            : (
              <ol className="ix-feed" aria-live="polite">
                {items.map((it, i) => (
                  <li key={`${it.at}-${i}`}>
                    <time dateTime={it.at}>{dayLabel(it.at.slice(0, 10))} · {timeLabel(it.at)}</time>
                    <span>{it.label}</span>
                  </li>
                ))}
              </ol>
            )}
          <NotRealBadge on={sample} />
        </Body>
      </Section>
    </div>
  );
}
