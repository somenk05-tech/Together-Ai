/** Indian rupee formatting, in one place — and out of the component file, where
 *  a second export breaks Fast Refresh. `en-IN` is what puts the comma at the
 *  lakh rather than the thousand. */

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
