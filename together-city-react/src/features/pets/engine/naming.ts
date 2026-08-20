/**
 * THE BRAND, ONCE.
 *
 * Retail listings write the brand into the product name — "Royal Canin Maxi
 * Adult Dog Dry Food" — and every surface that also draws the brand above the
 * name printed it twice. On the meal card it was worse than untidy: the meal
 * read "Royal Canin Royal Canin Maxi Adult Dog Dry Food", which looks like a
 * data error, and a plan that looks like a data error does not get followed.
 */

import type { Product } from '../types';

/** The product name with a leading brand stripped, for use beside a brand line. */
export function shortName(product: Product): string {
  const brand = product.brand.trim().toLowerCase();
  const name = product.name.trim();
  if (!brand || brand === 'data not verified') return name;
  const lower = name.toLowerCase();
  if (lower.startsWith(brand)) {
    const rest = name.slice(product.brand.length).replace(/^[\s\-–—:·|]+/, '');
    return rest || name;
  }
  return name;
}

/** Brand and name together, with no repetition, for a single line of text. */
export function fullName(product: Product): string {
  const short = shortName(product);
  const lower = product.name.trim().toLowerCase();
  return lower.startsWith(product.brand.trim().toLowerCase())
    ? product.name.trim()
    : `${product.brand} ${short}`.trim();
}
