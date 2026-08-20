/**
 * Which drawn silhouette a category falls back to.
 *
 * Its own file because `PackShot.tsx` exports a component, and a module that
 * exports both a component and a constant breaks React Fast Refresh — which
 * this repo's lint enforces rather than suggests.
 */

import type { ProductCategory } from '../types';

export type PackShape = 'bag' | 'tin' | 'bottle' | 'soft';

export const SHAPE_FOR: Record<ProductCategory, PackShape> = {
  food: 'bag', 'vet-diet': 'bag', litter: 'bag', treats: 'bag',
  home: 'tin', training: 'tin',
  toys: 'soft', walk: 'soft', fashion: 'soft',
  grooming: 'bottle', wellness: 'bottle', cleaning: 'bottle',
};
