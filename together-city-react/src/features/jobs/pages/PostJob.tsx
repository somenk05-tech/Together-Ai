import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { usePostJob, useEditPosting, useMyPostings } from '../api';

const LEVELS: Array<'junior' | 'mid' | 'senior' | 'lead'> = ['junior', 'mid', 'senior', 'lead'];
const LEVEL_LABEL: Record<string, string> = { junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead / Principal' };

const SKILLS = ['javascript', 'typescript', 'react', 'node', 'nestjs', 'python', 'java', 'sql', 'nosql', 'aws', 'docker', 'kubernetes', 'graphql', 'ml', 'data', 'product', 'design', 'marketing', 'sales', 'devops', 'mobile', 'leadership', 'communication'];
const LABEL: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', react: 'React', node: 'Node.js', nestjs: 'NestJS', python: 'Python', java: 'Java', sql: 'SQL', nosql: 'NoSQL', aws: 'AWS', docker: 'Docker', kubernetes: 'Kubernetes', graphql: 'GraphQL', ml: 'Machine Learning', data: 'Data Analysis', product: 'Product', design: 'Design', marketing: 'Marketing', sales: 'Sales', devops: 'DevOps', mobile: 'Mobile', leadership: 'Leadership', communication: 'Communication' };

/** Post a Job — the employer side. Anyone can publish a listing to the city job board. */
export function PostJob() {
  const post = usePostJob();
  const edit = useEditPosting();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const postings = useMyPostings();
  const editing = editId ? postings.data?.find((p) => p.id === editId) : undefined;

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(true);
  const [minYears, setMinYears] = useState(3);
  const [salaryLpa, setSalaryLpa] = useState(30);
  const [blurb, setBlurb] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [seniority, setSeniority] = useState<'' | 'junior' | 'mid' | 'senior' | 'lead'>('');
  const [posted, setPosted] = useState(false);

  // Prefill when editing an existing posting.
  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title); setCompany(editing.company); setLocation(editing.location);
    setRemote(editing.remote); setMinYears(editing.minYears); setSalaryLpa(editing.salaryLpa);
    setBlurb(editing.blurb ?? ''); setSkills(editing.skills.map((s) => s.key));
    setSeniority((editing.seniority as 'junior' | 'mid' | 'senior' | 'lead') ?? '');
  }, [editing?.id]);

  const toggle = (k: string) => setSkills((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const valid = title.trim() && company.trim() && location.trim() && skills.length > 0;
  const busy = post.isPending || edit.isPending;

  const submit = () => {
    const input = { title: title.trim(), company: company.trim(), location: location.trim(), remote, skills, minYears, salaryLpa, blurb: blurb.trim() || undefined, seniority: seniority || undefined };
    if (editId) edit.mutate({ id: editId, input }, { onSuccess: () => navigate('/jobs/postings') });
    else post.mutate(input, { onSuccess: () => { setPosted(true); setTitle(''); setSkills([]); setBlurb(''); setSeniority(''); } });
  };

  const input = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' } as const;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Jobs · {editId ? 'Edit a Job' : 'Post a Job'}</div>
      <h1 style={{ fontSize: 26 }}>{editId ? 'Edit role' : 'Post a role'}</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Publish to the city job board — it instantly appears in candidates' matched roles, ranked by fit.
      </p>

      <div className="card" style={{ marginBottom: 14, display: 'grid', gap: 10 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role title (e.g. Senior Backend Engineer)" style={input} />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" style={input} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" style={{ ...input, flex: 1, minWidth: 140 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} /> Remote-friendly
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Min years <input type="number" min={0} max={30} value={minYears} onChange={(e) => setMinYears(Number(e.target.value))} style={{ ...input, width: 72 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Salary (₹ LPA) <input type="number" min={1} max={1000} value={salaryLpa} onChange={(e) => setSalaryLpa(Number(e.target.value))} style={{ ...input, width: 84 }} />
          </label>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Level <span className="muted" style={{ fontWeight: 400 }}>· defaults from min-years if unset</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {LEVELS.map((lv) => (
              <button key={lv} type="button" onClick={() => setSeniority((s) => (s === lv ? '' : lv))}
                style={{ cursor: 'pointer', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  border: `1.5px solid ${seniority === lv ? 'var(--accent)' : 'var(--line)'}`, background: seniority === lv ? 'var(--accent)' : 'transparent', color: seniority === lv ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
                {LEVEL_LABEL[lv]}
              </button>
            ))}
          </div>
        </div>
        <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={2} placeholder="One-line description (optional)" style={input} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Required skills <span className="muted" style={{ fontWeight: 400 }}>· pick the ones that matter</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {SKILLS.map((k) => (
            <button key={k} type="button" onClick={() => toggle(k)}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                border: `1.5px solid ${skills.includes(k) ? 'var(--accent)' : 'var(--line)'}`, background: skills.includes(k) ? 'var(--accent)' : 'transparent', color: skills.includes(k) ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
              {LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="accent" disabled={busy || !valid} onClick={submit}>
          {busy ? (editId ? 'Saving…' : 'Posting…') : (editId ? 'Save changes' : 'Publish role')}
        </Button>
        {editId && <Link to="/jobs/postings" style={{ fontSize: 13, color: 'var(--muted)' }}>Cancel</Link>}
        {(post.error || edit.error) && <span style={{ fontSize: 12.5, color: 'var(--danger-ink)' }}>Couldn't save — you may already have this posting.</span>}
        {posted && !editId && <span style={{ fontSize: 13, color: 'var(--accent-ink)', fontWeight: 700 }}>✓ Posted — <Link to="/jobs/postings" style={{ color: 'var(--accent-ink)' }}>view applicants</Link></span>}
      </div>
    </div>
  );
}
