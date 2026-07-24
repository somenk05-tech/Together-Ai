import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { computeNutrients } from './ingredient-nutrients';

// Temporary analysis: top unresolved ingredient names by frequency across the dataset.
describe('nutrient coverage analysis', () => {
  it('lists top unresolved ingredients', () => {
    const gz = join(__dirname, 'data', 'recipes.dataset.json.gz');
    const rows = JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8')) as Array<{ ingredients?: Array<{ name: string }> }>;
    const freq = new Map<string, number>();
    let total = 0, resolved = 0;
    for (const r of rows) {
      for (const i of r.ingredients ?? []) {
        total++;
        const ok = computeNutrients([{ name: i.name, grams: 100 }]).complete;
        if (ok) resolved++;
        else freq.set(i.name.toLowerCase().trim(), (freq.get(i.name.toLowerCase().trim()) ?? 0) + 1);
      }
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
    // eslint-disable-next-line no-console
    console.log(`\nINGREDIENT ROWS: ${total}  RESOLVED: ${resolved} (${(100 * resolved / total).toFixed(1)}%)\nTOP UNRESOLVED:\n` + top.map(([n, c]) => `${c}\t${n}`).join('\n'));
    expect(total).toBeGreaterThan(0);
  });
});
