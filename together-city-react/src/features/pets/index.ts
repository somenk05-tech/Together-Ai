/** The Pet District's public surface. Nothing outside this hub imports past it. */
export { petsRoutes, PETS_SIDEBAR } from './routes';
export { usePets } from './store';
export * from './types';
export { CATALOGUE } from './data/catalogue';
export { INGREDIENTS, NEVER_FEED } from './data/ingredients';
export { RECIPES, HOME_COOKED_WARNING } from './data/recipes';
export { COMPOSITION } from './data/composition';
export { BUNDLES } from './data/bundles';
export { EVIDENCE } from './data/evidence';
export { buildPlan } from './engine/plan';
export { energyFor, rer, treatAllowance, waterMl, mealsPerDay } from './engine/nutrition';
export { recommendFor } from './engine/recommend';
export { VET_DISCLAIMER } from './components/Disclaimer';
export { MAX_PET_PHOTOS, acceptPetPhotos } from './engine/photos';
export { PetPhotos } from './components/PetPhotos';
