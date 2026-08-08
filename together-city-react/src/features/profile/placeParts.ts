/**
 * A reverse-geocoded address, split into the three boxes the profile keeps.
 *
 * The geo service answers with Nominatim's `display_name` — a comma-separated
 * run that goes roughly local → global and whose LENGTH varies wildly:
 *
 *   "Hiranandani Gardens, Powai, Mumbai, Mumbai Suburban, Maharashtra, 400076, India"
 *   "Jamshedpur, East Singhbhum, Jharkhand, 831001, India"
 *   "Reykjavík, Höfuðborgarsvæðið, Iceland"
 *
 * So it cannot be indexed from the front. It CAN be read from the back, where
 * the shape is stable: the last part is always the country, and the part
 * before it is the region — once the postcode is dropped, because a postcode
 * is a number sitting in a list of names and is the one segment that is
 * trivially identifiable.
 *
 * The city is the service's own `short` name when it has one, because that is
 * the label a human would use for the place, and the third-from-last segment
 * otherwise.
 *
 * NONE OF THIS HAS TO BE RIGHT. It fills three text boxes that stay editable,
 * beside a line that prints what was found so the citizen can see what the
 * machine thought and fix it. A parser that is usually right and always
 * visible beats one that is silently authoritative.
 */
export function splitPlace(label: string, short?: string): {
  city: string | null; state: string | null; country: string | null;
} {
  const parts = label
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    /* A postcode is the only segment that is not a place name. Dropped by
       shape rather than by position: they sit second-from-last in India and
       the UK, third-from-last in the US, and nowhere at all in Iceland. */
    .filter((p) => !/^[\d][\d\s-]*$/.test(p) && !/^[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}$/i.test(p));

  if (parts.length === 0) return { city: null, state: null, country: null };

  const country = parts[parts.length - 1] ?? null;
  const state = parts.length >= 2 ? parts[parts.length - 2] : null;
  const city = (short && short.trim()) || (parts.length >= 3 ? parts[parts.length - 3] : null);

  /* A one-segment answer is a country and nothing else — better to leave two
     boxes empty than to write the country into all three. */
  return {
    city: city && city !== country && city !== state ? city : null,
    state: state && state !== country ? state : null,
    country,
  };
}
