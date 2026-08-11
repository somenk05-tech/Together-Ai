import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useBeautyBag } from '../api';

/**
 * The bag, along the foot of every beauty surface that can add to it.
 *
 * ONE BAR, ONE BAG, ONE TOTAL. There were two before — the routine had its own
 * and the market had its own, each in a React state, each with its own checkout
 * button. A citizen could be looking at "3 items · ₹2,098" on one page and "10
 * items · ₹6,009" on the other and both were true, in the sense that neither
 * was. Following a link emptied whichever one they were not looking at.
 *
 * IT SITS AT THE FOOT OF THE PAGE, NOT ON TOP OF IT. It was `position: sticky`
 * with a heavy drop shadow, so on the routine sheet it rode up the screen
 * covering the very steps somebody was reading — the summary of what is in the
 * bag parked across the products they were deciding whether to put in it. A
 * running total is worth showing; it is not worth a permanent strip of the
 * viewport on a page whose whole job is a list you scroll.
 *
 * So it is the last block of the page. You reach it by getting to the end,
 * which is also when you have finished deciding.
 *
 * AND CHECKOUT IS A LINK, NOT A PAYMENT SHEET. It used to open the wallet
 * directly over whatever page you were on, which asks somebody to pay for a
 * list summarised in one grey line of running text. It goes to My Orders now —
 * the bag laid out properly, every line with its price, the total at the foot,
 * and the wallet there. Nothing is charged until that page.
 */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function BeautyBagBar() {
  const bag = useBeautyBag();
  const data = bag.data;
  if (!data || data.count === 0) return null;

  return (
    <div className="beauty-sheet" style={{
      marginTop: 22, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {data.count} item{data.count === 1 ? '' : 's'} · {rupees(data.totalInr)}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {data.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ')}
        </div>
        {/* A product that has left the catalogue is named as gone rather than
            quietly subtracted from a total somebody had already read. */}
        {data.removed > 0 && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
            {data.removed} item{data.removed === 1 ? ' is' : 's are'} no longer sold and {data.removed === 1 ? 'has' : 'have'} left your bag.
          </div>
        )}
      </div>
      <div style={{ marginLeft: 'auto' }}>
        <Link to="/beauty/orders">
          <Button variant="accent">Checkout · {rupees(data.totalInr)}</Button>
        </Link>
      </div>
    </div>
  );
}
