/**
 * THE LINE THAT HAS TO BE THERE.
 *
 * It appears under every generated plan, every recipe and every product page
 * that touches health. It is a component rather than a paragraph typed nineteen
 * times because the version on the page the lawyer reads must be the version on
 * the page nobody remembered to update.
 */

export const VET_DISCLAIMER =
  'This plan is for general informational purposes and is not a substitute for veterinary advice. Consult a veterinarian before making significant dietary changes, especially for puppies, kittens, senior pets, pets with medical conditions, allergies or special dietary needs.';

export function Disclaimer({ text = VET_DISCLAIMER, tight = false }: { text?: string; tight?: boolean }) {
  return (
    <p
      style={{
        margin: 0, padding: tight ? '10px 12px' : '14px 16px', borderRadius: 'var(--r-2)',
        background: 'var(--wash)', border: '1px solid var(--line)',
        fontSize: 12, lineHeight: 1.6, color: 'var(--ink-soft)',
      }}
    >
      <strong style={{ display: 'block', fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: 4, color: 'var(--muted)' }}>
        Important
      </strong>
      {text}
    </p>
  );
}
