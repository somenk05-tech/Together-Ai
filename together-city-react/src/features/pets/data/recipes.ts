/**
 * ── COOK FOR MY PET ─────────────────────────────────────────────────────────
 *
 * Every recipe in this file is `complementary`. Not one of them is `complete`,
 * and the type allows `complete` only so that a vet-formulated recipe can be
 * added later and be visibly different from these.
 *
 * THAT IS NOT CAUTION-BY-DEFAULT, IT IS THE FINDING. Stockman et al. (JAVMA
 * 2013, UC Davis) evaluated 200 home-prepared maintenance recipes for dogs from
 * books, veterinary texts and websites: 95% were deficient in at least one
 * essential nutrient and 83% in multiple. Recipes written by board-certified
 * veterinary nutritionists were the ones that came closest. A recipe published
 * by a pet-commerce product and presented as a daily diet would, on that
 * evidence, be wrong far more often than it is right.
 *
 * So the promise this section makes is a smaller and a keepable one: real food,
 * safely prepared, correctly portioned, as a TOPPER or an occasional meal
 * alongside a complete diet — and a clear route to a veterinary nutritionist
 * for anyone who wants to cook full time.
 *
 * CATS ARE NOT SMALL DOGS, and the cat recipes say so loudly. Taurine,
 * arachidonic acid, preformed vitamin A and vitamin D cannot be assumed from
 * muscle meat and vegetables; a cat fed home-cooked food without formulated
 * supplementation can develop dilated cardiomyopathy and retinal degeneration.
 * Every cat recipe here is capped at topper level for that reason.
 *
 * `items[].food` keys into `composition.ts`, so the calorie figure on a recipe
 * card is computed from IFCT 2017 / USDA values rather than asserted.
 */

import type { Recipe } from '../types';

export const HOME_COOKED_WARNING =
  'Home-cooked food is complementary unless a board-certified veterinary nutritionist has formulated it for your pet. In a UC Davis study of 200 home-prepared dog recipes, 95% were deficient in at least one essential nutrient. Keep home food to 10–25% of daily calories alongside a complete and balanced diet, or ask your vet for a formulated plan.';

export const RECIPES: Recipe[] = [
  {
    id: 'chicken-rice-bowl',
    name: 'Chicken & Rice Bowl',
    species: 'dog',
    kind: 'complementary',
    summary: 'The bowl every Indian pet parent already makes, portioned properly and cooked without the things that make it unsafe.',
    items: [
      { food: 'chicken-breast', label: 'Chicken breast, skinless, boneless', share: 0.4 },
      { food: 'rice-white-cooked', label: 'White rice, cooked plain', share: 0.4 },
      { food: 'carrot', label: 'Carrot, diced', share: 0.1 },
      { food: 'green-beans', label: 'French beans, chopped', share: 0.1 },
    ],
    method: [
      'Boil the chicken in plain water until cooked through. No salt, no oil, no masala.',
      'Cook the rice separately in plain water until soft.',
      'Steam or boil the carrot and beans until they yield to a fork.',
      'Debone completely — run your fingers through it twice — and shred.',
      'Mix, cool to room temperature, and serve. Refrigerate leftovers for up to 48 hours.',
    ],
    suitableFor: ['Adult dogs', 'Recovery from an upset stomach', 'Fussy eaters as a topper'],
    notFor: ['Chicken-allergic dogs', 'Pancreatitis-prone dogs without vet advice', 'As a sole long-term diet'],
    supplementNote: 'No added calcium source. Fed as more than a topper this bowl runs short on calcium, and a growing puppy needs a formulated calcium:phosphorus ratio — ask your vet before it becomes the main meal.',
    prepMinutes: 25,
    tags: ['bland', 'high-protein', 'everyday'],
  },
  {
    id: 'chicken-pumpkin-bowl',
    name: 'Chicken & Pumpkin Bowl',
    species: 'dog',
    kind: 'complementary',
    summary: 'Pumpkin adds soluble fibre, which is why vets reach for it when stools are loose.',
    items: [
      { food: 'chicken-thigh', label: 'Chicken thigh, skinless', share: 0.35 },
      { food: 'pumpkin', label: 'Pumpkin, deseeded and peeled', share: 0.3 },
      { food: 'rice-white-cooked', label: 'White rice, cooked plain', share: 0.3 },
      { food: 'coconut-oil', label: 'Coconut oil', share: 0.05 },
    ],
    method: [
      'Boil the chicken thigh plain; remove every bone.',
      'Steam the pumpkin until it mashes under a spoon.',
      'Combine with plain cooked rice and a small amount of coconut oil.',
      'Cool fully before serving.',
    ],
    suitableFor: ['Adult dogs', 'Loose stools', 'Dogs who need a little more fat'],
    notFor: ['Dogs on a fat-restricted diet', 'Puppies as a main meal'],
    supplementNote: 'Fibre-forward and calcium-poor. Topper level only unless your vet has formulated the rest of the day around it.',
    prepMinutes: 30,
    tags: ['digestive', 'fibre', 'topper'],
  },
  {
    id: 'egg-rice-bowl',
    name: 'Egg & Rice Bowl',
    species: 'dog',
    kind: 'complementary',
    summary: 'Cheap, fast, and a complete protein — the bowl for a morning when there is no time.',
    items: [
      { food: 'whole-egg', label: 'Egg, hard-boiled', share: 0.3 },
      { food: 'rice-white-cooked', label: 'White rice, cooked plain', share: 0.5 },
      { food: 'green-peas', label: 'Green peas, boiled', share: 0.2 },
    ],
    method: [
      'Hard-boil the eggs. Cooked, never raw — raw egg white binds biotin and carries a salmonella risk.',
      'Chop shell-free egg into the plain rice.',
      'Fold in boiled peas and cool.',
    ],
    suitableFor: ['Adult dogs', 'Vegetarian households that will use egg', 'Quick weekday topper'],
    notFor: ['Egg-allergic dogs', 'Dogs on a low-protein renal diet'],
    supplementNote: 'Egg is one of the more common protein allergens in dogs. Introduce it on its own for three days before it joins a mixed bowl.',
    prepMinutes: 15,
    tags: ['quick', 'budget', 'vegetarian-friendly'],
  },
  {
    id: 'fish-rice-bowl',
    name: 'Fish & Rice Bowl',
    species: 'dog',
    kind: 'complementary',
    summary: 'Rohu, pomfret or sardine — Indian fish, boned with the care that deserves.',
    items: [
      { food: 'rohu-fish', label: 'Rohu, cleaned', share: 0.35 },
      { food: 'rice-white-cooked', label: 'White rice, cooked plain', share: 0.45 },
      { food: 'pumpkin', label: 'Pumpkin, steamed', share: 0.2 },
    ],
    method: [
      'Steam or boil the fish plain until it flakes.',
      'Flake it by hand and check every flake for bones. Fish bones are thin, sharp and easy to miss.',
      'Mix with plain rice and steamed pumpkin, and cool.',
    ],
    suitableFor: ['Adult dogs', 'Skin and coat support', 'Dogs who react to chicken'],
    notFor: ['Dogs with a fish allergy', 'Any dog if you cannot fully debone it'],
    supplementNote: 'Keep to twice a week. Do not build a diet on predatory fish — mercury accumulates, and thiaminase in some raw fish destroys thiamine. Cook it.',
    prepMinutes: 25,
    tags: ['omega-3', 'coat', 'novel-protein'],
  },
  {
    id: 'paneer-veg-bowl',
    name: 'Paneer & Vegetable Bowl',
    species: 'dog',
    kind: 'complementary',
    summary: 'For vegetarian households — a topper, and honestly labelled as one.',
    items: [
      { food: 'paneer', label: 'Paneer, plain and unsalted', share: 0.25 },
      { food: 'rice-white-cooked', label: 'White rice, cooked plain', share: 0.4 },
      { food: 'carrot', label: 'Carrot, steamed', share: 0.15 },
      { food: 'green-beans', label: 'French beans, steamed', share: 0.1 },
      { food: 'moong-dal', label: 'Moong dal, well cooked', share: 0.1 },
    ],
    method: [
      'Use plain unsalted paneer — shop paneer is often salted, which this bowl cannot carry.',
      'Cook the moong dal until it collapses; undercooked dal is hard on a dog’s gut.',
      'Steam the vegetables, combine with plain rice, and cool.',
    ],
    suitableFor: ['Adult dogs in vegetarian homes', 'Occasional variety'],
    notFor: ['Dairy-intolerant dogs', 'Cats — never', 'Puppies as a main meal'],
    supplementNote: 'Dogs are omnivores and can digest a vegetarian meal, but a vegetarian DIET needs formulation — amino acid balance, taurine, B12 and iron all have to be deliberately supplied. Topper level, or a vet-formulated plan.',
    prepMinutes: 30,
    tags: ['vegetarian', 'topper', 'dairy'],
  },
  {
    id: 'sweet-potato-chicken',
    name: 'Sweet Potato & Chicken',
    species: 'dog',
    kind: 'complementary',
    summary: 'Slower-release carbohydrate than rice, and most dogs find it more interesting.',
    items: [
      { food: 'chicken-breast', label: 'Chicken breast, boiled', share: 0.4 },
      { food: 'sweet-potato', label: 'Sweet potato, boiled and mashed', share: 0.45 },
      { food: 'spinach', label: 'Palak, blanched and finely chopped', share: 0.15 },
    ],
    method: [
      'Boil the sweet potato with the skin off until soft; mash roughly.',
      'Boil and shred the chicken, checking for bones.',
      'Blanch the palak briefly and chop it small — whole leaves pass through undigested.',
      'Mix and cool.',
    ],
    suitableFor: ['Active adult dogs', 'Dogs who bore of rice'],
    notFor: ['Dogs with calcium oxalate stones — spinach is high in oxalate', 'Diabetic dogs without vet advice'],
    supplementNote: 'Spinach is capped low here on purpose. It is nutritious and it is also oxalate-rich, which matters for any dog with a stone history.',
    prepMinutes: 35,
    tags: ['energy', 'variety'],
  },
  {
    id: 'oats-banana-breakfast',
    name: 'Oats & Banana Breakfast',
    species: 'dog',
    kind: 'complementary',
    summary: 'A soft breakfast for a senior dog, or a gentle morning after a rough night.',
    items: [
      { food: 'oats-raw', label: 'Oats, cooked in water', share: 0.5 },
      { food: 'banana', label: 'Banana, ripe, mashed', share: 0.2 },
      { food: 'curd-dahi', label: 'Plain curd, unsweetened', share: 0.3 },
    ],
    method: [
      'Cook the oats in plain water — never milk, and never with sugar or jaggery.',
      'Cool completely, then fold in mashed banana and plain curd.',
      'Serve small. This is a breakfast, not a bowl to fill.',
    ],
    suitableFor: ['Senior dogs', 'Soft-food days', 'Dogs who tolerate dairy'],
    notFor: ['Lactose-intolerant dogs', 'Diabetic dogs — banana is sugar', 'Grain-sensitive dogs'],
    supplementNote: 'Banana is a treat-level ingredient because of its sugar. Keep the whole bowl inside the 10% treat budget unless it is replacing a meal on vet advice.',
    prepMinutes: 15,
    tags: ['senior', 'soft', 'breakfast'],
  },
  {
    id: 'bone-broth-topper',
    name: 'Chicken Bone Broth Topper',
    species: 'both',
    kind: 'complementary',
    summary: 'The thing to pour over dry food when a pet has stopped being interested in it.',
    items: [
      { food: 'chicken-bone-broth-stock', label: 'Home chicken broth, unsalted', share: 1 },
    ],
    method: [
      'Simmer chicken bones in plain water for several hours. No onion, no garlic, no salt, no stock cube — every one of those is a hazard here.',
      'Strain thoroughly and discard every bone. Cooked bones splinter and must never reach the bowl.',
      'Skim the fat once cooled. Refrigerate up to 3 days, freeze in ice-cube trays beyond that.',
    ],
    suitableFor: ['Dogs and cats', 'Fussy eaters', 'Encouraging fluid intake'],
    notFor: ['Pets on fat-restricted diets if not skimmed', 'Any broth made with onion or garlic — that is a poisoning, not a meal'],
    supplementNote: 'Shop stock cubes and packaged broths are usually salted and very often contain onion or garlic powder. This recipe only works made at home.',
    prepMinutes: 180,
    tags: ['topper', 'hydration', 'fussy-eater'],
  },
  {
    id: 'cat-chicken-topper',
    name: 'Chicken Topper for Cats',
    species: 'cat',
    kind: 'complementary',
    summary: 'Plain cooked chicken, at topper level. For cats this is a supplement to a complete diet and cannot be anything else.',
    items: [
      { food: 'chicken-breast', label: 'Chicken breast, boiled and shredded', share: 0.8 },
      { food: 'chicken-liver', label: 'Chicken liver, boiled', share: 0.2 },
    ],
    method: [
      'Boil both plain — no salt, no oil, no onion, no garlic.',
      'Shred finely; cats eat small pieces and swallow large ones whole.',
      'Serve at room temperature. Cats reject food straight from the fridge.',
    ],
    suitableFor: ['Adult cats as a topper', 'Tempting a cat who has gone off food'],
    notFor: ['As a meal replacement', 'Kittens as a main diet', 'Cats with liver or copper conditions'],
    supplementNote: 'Liver is capped at a fifth of the bowl. It is the best natural source of preformed vitamin A and taurine here, and too much vitamin A causes skeletal disease in cats. This is a topper — keep it inside 10% of daily calories.',
    prepMinutes: 20,
    tags: ['cat', 'topper', 'taurine'],
  },
  {
    id: 'cat-fish-topper',
    name: 'Fish Topper for Cats',
    species: 'cat',
    kind: 'complementary',
    summary: 'A small amount of cooked fish, twice a week at most.',
    items: [
      { food: 'rohu-fish', label: 'Rohu or pomfret, steamed', share: 1 },
    ],
    method: [
      'Steam plain until it flakes; never fry, never season.',
      'Check obsessively for bones. A cat will swallow a fish bone.',
      'Serve a tablespoon at a time, on top of the usual food.',
    ],
    suitableFor: ['Adult cats as an occasional topper'],
    notFor: ['Daily feeding', 'Cats with urinary conditions unless the vet approves', 'Raw fish — thiaminase destroys thiamine'],
    supplementNote: 'Fish-only feeding is a known route to thiamine deficiency and, with oily fish, to steatitis. Twice a week, cooked, as a topper.',
    prepMinutes: 15,
    tags: ['cat', 'topper', 'occasional'],
  },
  {
    id: 'cat-egg-topper',
    name: 'Scrambled Egg for Cats',
    species: 'cat',
    kind: 'complementary',
    summary: 'A teaspoon of plain scrambled egg — a treat a cat will usually accept when nothing else works.',
    items: [
      { food: 'whole-egg', label: 'Egg, scrambled dry with no oil or butter', share: 1 },
    ],
    method: [
      'Scramble in a non-stick pan with no oil, butter, salt or milk.',
      'Cook until fully set — raw egg white binds biotin.',
      'Cool and serve about a teaspoon.',
    ],
    suitableFor: ['Adult cats', 'Hiding medication with vet approval'],
    notFor: ['Egg-allergic cats', 'Daily feeding'],
    supplementNote: 'Treat-level only. Two teaspoons a day is already most of a small cat’s 10% treat budget.',
    prepMinutes: 10,
    tags: ['cat', 'treat', 'quick'],
  },
  {
    id: 'pumpkin-rice-vegetarian',
    name: 'Pumpkin & Rice',
    species: 'dog',
    kind: 'complementary',
    summary: 'The gentlest bowl in the section — for the day after an upset stomach, on vet advice.',
    items: [
      { food: 'pumpkin', label: 'Pumpkin, steamed and mashed', share: 0.4 },
      { food: 'rice-white-cooked', label: 'White rice, cooked soft', share: 0.6 },
    ],
    method: [
      'Cook the rice softer than usual, with extra water.',
      'Steam and mash the pumpkin, and combine.',
      'Serve small amounts often rather than one large bowl.',
    ],
    suitableFor: ['Short-term bland feeding on vet advice', 'Loose stools'],
    notFor: ['More than a few days without veterinary review', 'Puppies, who cannot afford the calorie gap'],
    supplementNote: 'This bowl has almost no protein and no calcium. It is a two-or-three-day bridge, not food. If your pet needs it for longer than that, they need a vet.',
    prepMinutes: 20,
    tags: ['bland', 'recovery', 'vegetarian'],
  },
  {
    id: 'ragi-chicken-bowl',
    name: 'Ragi & Chicken Bowl',
    species: 'dog',
    kind: 'complementary',
    summary: 'Finger millet instead of rice — a South Indian staple that suits dogs who do better off rice.',
    items: [
      { food: 'ragi-finger-millet', label: 'Ragi, cooked as a soft porridge', share: 0.4 },
      { food: 'chicken-breast', label: 'Chicken breast, boiled and shredded', share: 0.4 },
      { food: 'carrot', label: 'Carrot, steamed and diced', share: 0.2 },
    ],
    method: [
      'Cook ragi flour into a soft plain porridge with water only.',
      'Cool it fully — ragi holds heat far longer than it looks.',
      'Fold in shredded boiled chicken and steamed carrot.',
    ],
    suitableFor: ['Adult dogs', 'Rice-sensitive dogs', 'Higher-calcium grain preference'],
    notFor: ['Dogs with grain sensitivity', 'Puppies as a main meal'],
    supplementNote: 'Ragi is comparatively calcium-rich for a grain, which does not make this bowl calcium-adequate. Topper level.',
    prepMinutes: 30,
    tags: ['regional', 'grain', 'variety'],
  },
  {
    id: 'curd-rice-summer',
    name: 'Curd Rice, Pet Version',
    species: 'dog',
    kind: 'complementary',
    summary: 'For a Chennai or Hyderabad summer — plain, cool, and unsalted.',
    items: [
      { food: 'rice-white-cooked', label: 'White rice, cooked and cooled', share: 0.7 },
      { food: 'curd-dahi', label: 'Plain curd, unsweetened, unsalted', share: 0.3 },
    ],
    method: [
      'Cook rice plain and cool it completely.',
      'Fold in plain curd. No salt, no tempering, no curry leaves, no mustard seed — and never any hing, which is usually cut with onion or garlic.',
      'Serve at room temperature, not chilled.',
    ],
    suitableFor: ['Adult dogs who tolerate dairy', 'Hot weather', 'A light evening bowl'],
    notFor: ['Lactose-intolerant dogs — very common', 'Any curd rice made the way people eat it'],
    supplementNote: 'Introduce a spoon and wait a day. Loose stools mean your dog is one of the many who cannot process lactose, and that is the end of this recipe for them.',
    prepMinutes: 15,
    tags: ['summer', 'dairy', 'light'],
  },
];
