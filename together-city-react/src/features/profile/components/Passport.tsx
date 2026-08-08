import { Link } from 'react-router-dom';
import { hubCode, tiltOf, type VisaPage } from '../passport';

/* The passport's two drawn pieces. Its pure parts — the codes, the stamp
   angle, the code band and the page list — live in ../passport.ts, so this
   file exports components and nothing else. */

/* ── The data page's field ──────────────────────────────────────────────── */

/**
 * One field on the data page.
 *
 * AN UNFILLED FIELD IS A RULED LINE, not the words "not set". This is the one
 * place the metaphor does real work rather than decoration: a blank line in a
 * document reads as somewhere to go and write, where grey italics reading
 * "none" read as a fact about the person. The line is a link to the form that
 * fills it.
 */
export function Field({ label, value, fill, big, span }: {
  label: string; value?: string | null; fill?: string; big?: boolean; span?: 'wide' | 'half';
}) {
  return (
    <div className={span ? `pfield ${span}` : 'pfield'}>
      <span>{label}</span>
      {value
        ? <b className={big ? 'big' : undefined}>{value}</b>
        : fill
          ? <Link className="blank" to={fill} aria-label={`Add your ${label.toLowerCase()}`} />
          : <i className="blank" aria-hidden="true" />}
    </div>
  );
}

/* ── A visa page ────────────────────────────────────────────────────────── */

export function Visa({ page }: { page: VisaPage }) {
  const issued = Boolean(page.summary);
  return (
    <Link to={page.href} className="pvisa" style={{ ['--tilt' as string]: tiltOf(page.hub) }}>
      <div className="phead">
        <span className="pcode">{hubCode(page.hub)}</span>
        <b>{page.label}</b>
      </div>

      {issued
        ? <p className="psum">{page.summary}</p>
        : <p className="pnone">No entries yet. Open the hub once and this page fills itself.</p>}

      {/* Short enough to fit a 66px disc at every zoom. "TOGETHER CITY" set
          round a stamp this size is four wrapped lines of nothing. */}
      <span className={issued ? 'pstamp' : 'pstamp waiting'} aria-hidden="true">
        {issued ? <><b>{page.complete ? 'VALID' : 'ISSUED'}</b>TC</> : <>No<b>ENTRY</b></>}
      </span>

      <div className="pfoot">
        <span>{page.percent != null ? `Complete ${page.percent}%` : 'No record'}</span>
        <span>Enter →</span>
      </div>
    </Link>
  );
}

