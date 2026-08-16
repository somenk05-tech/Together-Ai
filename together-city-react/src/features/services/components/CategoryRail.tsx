import { useState } from 'react';
import { Chip } from '@/components/ui';
import type { CategoryGroup } from '../api';

/**
 * EIGHTEEN GROUPS, NINE AT A TIME, AND THE TRADES ONLY WHEN ASKED.
 *
 * There are a hundred and forty categories in this hub. A hundred and forty
 * chips is not a filter, it is a wall — and the page as it stood put fourteen
 * healthcare subcategories on screen before anybody had said they wanted
 * healthcare. Two levels, and the second one is earned.
 *
 * WHICH NINE IS DECIDED BY THE DATA, not by an editor. The groups are ordered
 * by how many businesses are actually listed under them, so the front row is
 * always where the city really is, and "More" holds the rest rather than hiding
 * them. Every chip carries its count, so an empty corner reads as "nobody here
 * yet" rather than as a filter that failed.
 */
const FRONT_ROW = 9;

export function CategoryRail({
  groups, counts, group, category, onGroup, onCategory,
}: {
  groups: CategoryGroup[];
  counts: Record<string, number>;
  group: string;
  category: string;
  onGroup: (g: string) => void;
  onCategory: (c: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const withCounts = groups
    .map((g) => ({ g, n: g.items.reduce((sum, c) => sum + (counts[c.key] ?? 0), 0) }))
    .sort((a, b) => b.n - a.n || a.g.group.localeCompare(b.g.group));

  // The chosen group is always in the front row, however empty it is —
  // a filter that scrolls itself out of sight when you use it is a filter
  // people press twice.
  const front = showAll ? withCounts : (() => {
    const head = withCounts.slice(0, FRONT_ROW);
    if (group && !head.some((x) => x.g.group === group)) {
      const chosen = withCounts.find((x) => x.g.group === group);
      if (chosen) return [...head.slice(0, FRONT_ROW - 1), chosen];
    }
    return head;
  })();

  const rest = withCounts.length - front.length;
  const items = groups.find((g) => g.group === group)?.items ?? [];

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <Chip selected={group === '' && category === ''} onClick={() => { onGroup(''); onCategory(''); }}>
          Everything
        </Chip>
        {front.map(({ g, n }) => (
          <Chip key={g.group} selected={group === g.group}
            onClick={() => { onGroup(group === g.group ? '' : g.group); onCategory(''); }}>
            {g.group}{n ? ` · ${n}` : ''}
          </Chip>
        ))}
        {!showAll && rest > 0 && (
          <Chip onClick={() => setShowAll(true)}>More · {rest}</Chip>
        )}
        {showAll && <Chip onClick={() => setShowAll(false)}>Fewer</Chip>}
      </div>

      {group && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', paddingLeft: 2 }}>
          <Chip selected={category === ''} onClick={() => onCategory('')}>All of {group.toLowerCase()}</Chip>
          {items.map((c) => (
            <Chip key={c.key} selected={category === c.key} onClick={() => onCategory(c.key)}>
              {c.label}{counts[c.key] ? ` · ${counts[c.key]}` : ''}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
