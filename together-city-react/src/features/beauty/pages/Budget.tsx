import { BudgetPanel } from '../components/BudgetPanel';
import { useBeautyProfile } from '../api';

/**
 * Step two of three: profile, budget, routine.
 *
 * The page is almost nothing — the panel is shared with the profile, where the
 * same controls appear inline under the assessment. This exists because the
 * sidebar needs somewhere to point and because somebody coming back to change
 * a number should not have to walk through their own assessment to reach it.
 */
export function Budget() {
  const profile = useBeautyProfile();
  // The two priorities the assessment actually flagged, so the page can say
  // what the money is for. Not the whole analysis — this is a budget screen.
  const priorities = (profile.data?.analysis?.skin.readings ?? [])
    .filter((r) => r.level !== 'good')
    .slice(0, 2)
    .map((r) => r.label);

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="eyebrow">Beauty Hub · Budget</div>
      <BudgetPanel priorities={priorities} />
    </div>
  );
}
