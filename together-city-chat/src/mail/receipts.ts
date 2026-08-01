/**
 * Together City Mail — receipt formatters.
 * Pure functions: booking data in → { subject, body } out. Used by every hub so
 * confirmations (tickets, tables, trips, food) all land in the citizen's inbox
 * in one consistent house style. The city inbox becomes the receipt ledger.
 */

const inr = (n: number): string => '₹' + Math.round(n).toLocaleString('en-IN');
const rule = '────────────────────────────';
const foot = (code: string): string =>
  [rule, `Booking reference: ${code}`, `Kept in your Together City inbox as your receipt.`, ``, `— Together City`].join('\n');

export interface Receipt { subject: string; body: string }

export function tableReceipt(x: {
  restaurantName: string; area: string; date: string; time: string; partySize: number; guestName: string; code: string;
}): Receipt {
  return {
    subject: `📅 Table booked — ${x.restaurantName}`,
    body: [
      `Your table is reserved. We look forward to seeing you.`,
      ``, rule,
      `Restaurant  ${x.restaurantName}, ${x.area}`,
      `When        ${x.date} at ${x.time}`,
      `Guests      ${x.partySize}`,
      `Under       ${x.guestName}`,
      `Payment     Pay at the restaurant`,
      ``, foot(x.code),
    ].join('\n'),
  };
}

export function orderReceipt(x: {
  restaurantName: string; area: string; mode: string;
  items: { name: string; qty: number; lineInr: number }[];
  subtotalInr: number; packingInr: number; taxInr: number; totalInr: number; code: string;
}): Receipt {
  const items = x.items.map((l) => `  ${l.qty} × ${l.name}${' '.repeat(Math.max(1, 24 - l.name.length))}${inr(l.lineInr)}`);
  return {
    subject: `🧾 Order confirmed — ${x.restaurantName}`,
    body: [
      `Your ${x.mode === 'dinein' ? 'dine-in' : 'delivery'} order is confirmed.`,
      ``, rule,
      `${x.restaurantName}, ${x.area}`,
      ``,
      ...items,
      ``,
      `Subtotal   ${inr(x.subtotalInr)}`,
      ...(x.packingInr ? [`Packing    ${inr(x.packingInr)}`] : []),
      `GST (5%)   ${inr(x.taxInr)}`,
      `Total      ${inr(x.totalInr)}`,
      ``, foot(x.code),
    ].join('\n'),
  };
}

export function packageReceipt(x: {
  title: string; destination: string; nights: number; days: number; tier: string; pax: number; totalInr: number; code: string; startDate?: string | null;
}): Receipt {
  return {
    subject: `🧳 Trip booked — ${x.title}`,
    body: [
      `Your trip is booked. Pack your bags!`,
      ``, rule,
      `Package     ${x.title}`,
      `Destination ${x.destination}`,
      `Duration    ${x.nights}N / ${x.days}D`,
      ...(x.startDate ? [`Starts      ${x.startDate}`] : []),
      `Package     ${x.tier}`,
      `Travellers  ${x.pax}`,
      `Paid        ${inr(x.totalInr)}`,
      ``, foot(x.code),
    ].join('\n'),
  };
}

export function flightReceipt(x: {
  from: string; to: string; airline: string; flightNo: string; departTime: string; arriveTime: string;
  durationLabel: string; stopLabel: string; cabin: string; date: string; pax: number; totalInr: number; code: string;
}): Receipt {
  return {
    subject: `✈️ Flight booked — ${x.from} → ${x.to}`,
    body: [
      `Your flight is booked. Have a great trip.`,
      ``, rule,
      `Route       ${x.from} → ${x.to}`,
      `Airline     ${x.airline} ${x.flightNo}`,
      `Date        ${x.date}`,
      `Depart      ${x.departTime}   Arrive ${x.arriveTime}`,
      `Duration    ${x.durationLabel} · ${x.stopLabel}`,
      `Cabin       ${x.cabin}`,
      `Passengers  ${x.pax}`,
      `Paid        ${inr(x.totalInr)}`,
      ``, foot(x.code),
    ].join('\n'),
  };
}
