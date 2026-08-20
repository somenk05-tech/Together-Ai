/**
 * THE INGREDIENT DESK — 51 Indian household foods, and 32 that are never fed.
 *
 * Every verdict on this page was taken from a veterinary source that was
 * actually read: the Merck Veterinary Manual, ASPCA Animal Poison Control,
 * VCA Animal Hospitals, Pet Poison Helpline, the AVMA, Cornell's Feline Health
 * Center and vet-reviewed PetMD. `sources` on each record is the list of pages
 * that support it, and there is no record without one.
 *
 * WHERE THE SOURCES DISAGREE, THE RECORD SAYS SO rather than picking a winner —
 * avocado and raw-versus-cooked bones are both live disagreements in the
 * literature and both are written up that way.
 *
 * TWO ENTRIES ARE HERE BECAUSE THE KITCHEN IS INDIAN and no international
 * list carries them: tamarind (imli) shares grape toxicity's tartaric acid and
 * is in sambar, rasam, chutney and pani puri water; and sambar onion is an
 * onion. That is the difference between a translated list and a local one.
 *
 * GENERATED FILE.
 */
import type { Ingredient, ToxicFood } from '../types';

export const INGREDIENTS: Ingredient[] = [
 {
  "name": "Almonds",
  "indianName": "Badam",
  "dog": "LIMIT",
  "cat": "AVOID",
  "dogReason": "PetMD says almonds are not toxic but are risky for dogs because their size and shape make them a choking hazard, and ASPCA notes almonds are high in oils and fats that can cause vomiting, diarrhoea and potentially pancreatitis.",
  "catReason": "PetMD's cat guidance lists nuts - especially macadamia and walnuts - among foods to avoid for cats, and a whole almond in a cat-sized airway or gut is a serious obstruction risk with no offsetting benefit.",
  "preparation": "If given at all: plain, unsalted, unflavoured, and ground or finely chopped - never whole. No salted, masala or chocolate-coated badam.",
  "portion": "Minimal - within the 10% treat ceiling. No allowlisted source gives an almond count: DATA NOT VERIFIED.",
  "frequency": "Occasional at most; better skipped entirely.",
  "risks": [
   "Choking and oesophageal/intestinal obstruction due to size and shape",
   "Pancreatitis and GI upset from high fat (ASPCA)",
   "Sodium in salted nuts",
   "Mouldy nuts are toxic (PetMD)"
  ],
  "allergen": null,
  "rawCooked": "Neither raw nor roasted almonds are recommended whole; the hazard is mechanical and fat-related.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Apple",
  "indianName": "Seb",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD lists apple as safe for dogs - low in calories with vitamins A and C, fibre, potassium and antioxidants - provided seeds and stems are removed because apple seeds contain cyanide.",
  "catReason": "Apple is not on PetMD's list of recommended cat treats and cats gain little from fruit, so at most a tiny deseeded piece as an occasional novelty.",
  "preparation": "Washed, cored, all seeds and stem removed, skin optional, cut into small cubes. No sugar, salt or chaat masala.",
  "portion": "Treat-level: under 10% of daily calories - a few small cubes for a dog, a single small piece for a cat.",
  "frequency": "A few times a week for dogs; occasional for cats.",
  "risks": [
   "Apple seeds contain cyanide - always remove them",
   "Core and stem - choking and obstruction",
   "Sugar content - limit in diabetic or overweight animals"
  ],
  "allergen": false,
  "rawCooked": "Raw is fine; seeds and core must be removed either way.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Banana",
  "indianName": "Kela",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD lists banana as safe for dogs - high in fibre, potassium and vitamins B6 and C - but says to feed it sparingly because it is higher in sugar than many other fruits, and to remove the peel because it is difficult to digest.",
  "catReason": "PetMD says a cat can have banana but caps it at one 1/4-inch slice per week and warns it is high in carbohydrates and sugars and should be avoided in diabetic cats or those with intestinal disorders.",
  "preparation": "Peeled, fresh or frozen, cut into small slices. Peel discarded. No sugar or honey.",
  "portion": "Cats (PetMD): one 1/4-inch slice per week. Dogs: a few small slices, within the 10% treat ceiling.",
  "frequency": "Occasional - once a week for cats; a few times a week at most for dogs.",
  "risks": [
   "High sugar - unsuitable for diabetic or overweight animals",
   "Peel is difficult to digest and is an obstruction risk",
   "Constipation or GI upset if over-fed"
  ],
  "allergen": false,
  "rawCooked": "Raw only; no cooked preparation is needed or recommended.",
  "sources": [
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat"
  ]
 },
 {
  "name": "Beetroot",
  "indianName": "Chukandar",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says beets are safe for dogs and are used in commercial dog foods, but they contain oxalic acid that can cause crystals and stones in the urinary tract, are high in sugar, and raw beets pose a choking risk.",
  "catReason": "No allowlisted feline source recommends beetroot, and the oxalate and sugar concerns that limit it in dogs apply at least as strongly to a cat's much smaller body size.",
  "preparation": "Peeled, boiled or steamed until soft, plain and unseasoned, cut into small pieces. Never pickled beets (sugar and onion) and never beet juice.",
  "portion": "Dogs (PetMD): 1-2 tsp for 2-20 lb, up to 2-4 tbsp for 51-90 lb, up to 5 tbsp for 91+ lb. Cats: teaspoon-scale at most.",
  "frequency": "2-3 times a week, not daily (PetMD).",
  "risks": [
   "Oxalic acid - urinary crystals and stones; avoid in animals prone to oxalate stones",
   "High natural sugar and carbohydrate",
   "Raw beet - choking hazard",
   "Acidity - GI upset",
   "Harmless pink staining of urine and stool"
  ],
  "allergen": false,
  "rawCooked": "Cooked only. PetMD: raw beets pose choking risks.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-beets"
  ]
 },
 {
  "name": "Bone broth (home-made, strained)",
  "indianName": "Yakhni / haddi shorba",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "A plain broth simmered from bones and strained clear of every bone fragment carries no documented toxicity, but the version cooked in most Indian kitchens contains onion, garlic and salt - all of which are documented hazards - and no allowlisted veterinary source publishes a bone-broth-specific benefit claim.",
  "catReason": "Same reasoning: acceptable only if it is genuinely plain and bone-free, because Merck records cats as the species most susceptible to Allium toxicosis and Pet Poison Helpline documents salt poisoning.",
  "preparation": "Simmer bones in water alone. Absolutely no onion, garlic, ginger-garlic paste, salt, stock cubes, masala or tadka. Strain through a fine sieve so that no bone fragment remains. Skim the fat off after chilling. Never use shop-bought stock cubes or packaged broth.",
  "portion": "Treat-level topper: under 10% of daily calories - a few tablespoons poured over food. No allowlisted source gives a bone broth volume: DATA NOT VERIFIED.",
  "frequency": "Occasional to a few times a week.",
  "risks": [
   "Onion and garlic in almost every traditional yakhni recipe - haemolytic anaemia, cats most susceptible",
   "Salt / sodium ion poisoning from stock cubes or seasoned broth",
   "Any bone fragment left in the liquid - choking, perforation, obstruction",
   "High skimmed-fat content - pancreatitis risk",
   "Claimed joint/gut benefits of bone broth: DATA NOT VERIFIED - no allowlisted veterinary source substantiates them"
  ],
  "allergen": null,
  "rawCooked": "Fully cooked and strained; the bones themselves must never be served.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals",
   "https://www.petpoisonhelpline.com/poison/salt/",
   "https://vcahospitals.com/know-your-pet/why-bones-are-not-safe-for-dogs",
   "https://vcahospitals.com/know-your-pet/dog-treats"
  ]
 },
 {
  "name": "Brown rice",
  "indianName": "Bhura chawal",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD says brown rice is safe for dogs and better for weight management because of its higher fibre and lower glycemic index, but it is harder to digest than white rice and is not the right choice during diarrhoea.",
  "catReason": "As an obligate carnivore a cat gains little from a high-fibre grain, and its extra fibre makes GI upset more likely than with white rice.",
  "preparation": "Boiled plain and cooked soft (brown rice needs longer cooking), no salt, oil or spices.",
  "portion": "Same PetMD size chart as white rice, within the 10% treat ceiling. Cats: teaspoon-scale at most.",
  "frequency": "2-3 times a week as a treat.",
  "risks": [
   "Harder to digest than white rice - not suitable for a bland diarrhoea diet",
   "Gas and loose stool if introduced in large amounts",
   "Nutritional dilution if it displaces complete food"
  ],
  "allergen": false,
  "rawCooked": "Always cooked and soft.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-rice",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat"
  ]
 },
 {
  "name": "Carrot",
  "indianName": "Gajar",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD lists carrots as safe and popular for dogs - high in fibre, low in calories and a source of beta-carotene - but says they must be given in moderation because they are high in sugar.",
  "catReason": "Carrots are not among the vegetables PetMD lists as recommended for cats, and cats derive little from plant material, so only a tiny cooked piece as an occasional novelty.",
  "preparation": "Washed, peeled and cut to a size that cannot be swallowed whole; raw sticks are fine for dogs who chew properly, steamed/boiled plain is safer for small dogs and cats. No salt, oil or masala.",
  "portion": "Treat-level: under 10% of daily calories.",
  "frequency": "Daily in small amounts is acceptable for dogs; occasional for cats.",
  "risks": [
   "Choking or obstruction if a whole carrot or large chunk is swallowed",
   "Sugar content - moderation required, relevant for diabetic and overweight animals"
  ],
  "allergen": false,
  "rawCooked": "Both raw and cooked are acceptable for dogs; cooked/softened is safer for cats and small dogs.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Cashew",
  "indianName": "Kaju",
  "dog": "LIMIT",
  "cat": "AVOID",
  "dogReason": "PetMD says cashews are generally safe for dogs but are high in fat and a potential pancreatitis trigger, so only minimal amounts.",
  "catReason": "PetMD's cat guidance lists nuts among foods to avoid for cats; there is no benefit and the fat load and choking risk are real.",
  "preparation": "Plain, unsalted, unroasted-in-oil, no masala or honey coating; broken into small pieces. Never raw unprocessed cashew (which contains urushiol-type irritants) - only the ordinary food-grade kaju sold for eating.",
  "portion": "Minimal amounts only, within the 10% treat ceiling. No allowlisted source gives a cashew count: DATA NOT VERIFIED.",
  "frequency": "Occasional.",
  "risks": [
   "Pancreatitis and GI upset from high fat",
   "Choking / obstruction",
   "Sodium in salted kaju",
   "Mouldy nuts are toxic"
  ],
  "allergen": null,
  "rawCooked": "Use ordinary food-grade cashews only.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Chana dal / chickpeas",
  "indianName": "Chana dal / kabuli chana / Bengal gram",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD names garbanzo beans (chickpeas) among the beans that are safe for dogs when plain and thoroughly cooked, but warns of flatulence, of very high sodium in canned versions, and that dried beans must be soaked overnight and cooked through.",
  "catReason": "Same as moong dal - little usable nutrition for an obligate carnivore and the same gas and GI-upset concerns, so a teaspoon at most.",
  "preparation": "Soaked overnight and boiled until completely soft, plain, no salt, oil, spices, onion or garlic. Never chana masala, chole or roasted salted chana.",
  "portion": "About 1 teaspoon for small dogs up to about 1/2 cup for large dogs, inside the 10% ceiling. Cats: a teaspoon at most.",
  "frequency": "A few times a week at most.",
  "risks": [
   "Flatulence and GI upset",
   "Very high sodium in canned chickpeas - a problem for dogs with heart disease",
   "Undercooked legumes cause diarrhoea",
   "Masala preparations contain onion, garlic, salt and chilli"
  ],
  "allergen": null,
  "rawCooked": "Soak overnight and cook thoroughly; never feed dry or undercooked.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-beans",
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals"
  ]
 },
 {
  "name": "Chicken bones - cooked",
  "indianName": "Pakki hui murgi ki haddi",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "VCA states plainly that bones are not safe for dogs, listing broken teeth, pierced tongue/cheek/soft palate, windpipe and oesophageal obstruction, stomach and intestinal perforation, and blockage requiring emergency surgery; cooked bones splinter most readily.",
  "catReason": "PetMD states chicken bones must never be fed to cats - they are choking hazards, can splinter and cause internal damage, and may block the intestinal tract.",
  "preparation": "Never feed. Debone every piece of chicken before it goes anywhere near a pet, and keep bones out of reachable bins.",
  "portion": "None. Zero is the only safe amount.",
  "frequency": "Never.",
  "risks": [
   "Choking and airway obstruction",
   "Broken teeth",
   "Mouth, tongue, cheek and soft palate lacerations",
   "Gastric and intestinal perforation - potentially fatal peritonitis",
   "Gastric or intestinal obstruction requiring surgery",
   "Constipation and rectal bleeding from bone fragments"
  ],
  "allergen": false,
  "rawCooked": "Cooked bones are the more brittle and splinter-prone form; VCA advises against bones generally and notes it is a myth that dogs need to chew bones.",
  "sources": [
   "https://vcahospitals.com/know-your-pet/why-bones-are-not-safe-for-dogs",
   "https://www.petmd.com/cat/nutrition/can-cats-eat-chicken",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets"
  ]
 },
 {
  "name": "Chicken bones - raw",
  "indianName": "Kachchi murgi ki haddi",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "VCA lists the same seven mechanical dangers for bones and adds that raw bones can be contaminated with E. coli, Salmonella and Listeria - a risk to the pet and to the humans in the household; ASPCA also warns raw bones can cause injury or obstruction requiring surgery.",
  "catReason": "PetMD says chicken bones must never be fed to cats at all, and AVMA discourages raw animal-source protein for cats on pathogen grounds.",
  "preparation": "Never feed. Some raw-feeding advocates claim raw bones are safe because they are less brittle; VCA does not accept this and lists mechanical injury risks for bones in general, plus pathogen contamination specific to raw bones. Where sources differ, the veterinary consensus cited here is not to feed bones at all.",
  "portion": "None.",
  "frequency": "Never.",
  "risks": [
   "Salmonella, E. coli and Listeria contamination - zoonotic risk to the household, especially immunocompromised people",
   "Broken teeth and oral lacerations",
   "Choking and airway obstruction",
   "Gastric and intestinal perforation and obstruction"
  ],
  "allergen": false,
  "rawCooked": "Sources disagree on relative splinter risk between raw and cooked bones, but VCA, ASPCA and AVMA all advise against feeding bones and against raw animal-source protein; this dataset follows that.",
  "sources": [
   "https://vcahospitals.com/know-your-pet/why-bones-are-not-safe-for-dogs",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets",
   "https://www.petmd.com/cat/nutrition/can-cats-eat-chicken"
  ]
 },
 {
  "name": "Chicken breast",
  "indianName": "Murgi ka seena / chicken breast",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "Plain cooked, skinless, boneless chicken breast is a lean high-quality protein that veterinary sources treat as an appropriate topper or treat for dogs.",
  "catReason": "Cats are obligate carnivores and thoroughly cooked plain chicken is explicitly listed by PetMD as a safe daily-size treat for cats.",
  "preparation": "Boiled or baked, skin removed, completely deboned, no salt, no oil, no masala, no onion or garlic; cool and cut into bite-size pieces.",
  "portion": "Treat-level: keep all treats and toppers under 10% of daily calories. PetMD gives cats up to 2 tablespoons/day (2 teaspoons for kittens under 6 months).",
  "frequency": "Daily as part of meals is acceptable if the rest of the diet is complete and balanced; otherwise treat-level only.",
  "risks": [
   "Salmonella and Campylobacter if raw or undercooked",
   "Nutritional imbalance if fed as a large share of the diet (chicken alone is not complete and balanced)",
   "Bone splinter, choking and GI obstruction if bones are left in"
  ],
  "allergen": true,
  "rawCooked": "Cook fully. AVMA discourages feeding any raw or undercooked animal-source protein to dogs and cats; PetMD notes Salmonella and Campylobacter are found in raw chicken and can be passed to the household.",
  "sources": [
   "https://www.petmd.com/cat/nutrition/can-cats-eat-chicken",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets",
   "https://vcahospitals.com/know-your-pet/dog-treats",
   "https://vcahospitals.com/know-your-pet/food-allergies-in-dogs"
  ]
 },
 {
  "name": "Chicken liver",
  "indianName": "Kaleji (murgi)",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "Liver is nutrient-dense and palatable but is extremely high in vitamin A, and VCA documents vitamin A poisoning in pets fed liver over weeks to months.",
  "catReason": "VCA states vitamin A poisoning most commonly occurs when pets are fed raw liver over weeks to months and that cats are more susceptible to vitamin A poisoning than dogs.",
  "preparation": "Boiled or lightly cooked plain, no salt, oil, onion, garlic or masala; chop small and use as a topper, not a meal.",
  "portion": "Small treat-level amounts only, well within the 10%-of-calories treat ceiling. No veterinary source gives a specific safe gram limit for liver: DATA NOT VERIFIED.",
  "frequency": "Occasional - roughly once or twice a week at most; do not feed daily over weeks to months.",
  "risks": [
   "Hypervitaminosis A (vitamin A toxicosis) with chronic feeding - skeletal pain, poor coat, weakness, constipation",
   "Copper accumulation is not documented on the cited sources: DATA NOT VERIFIED",
   "Bacterial contamination if raw",
   "Loose stools if fed in large amounts"
  ],
  "allergen": true,
  "rawCooked": "Cook it. VCA specifically ties vitamin A poisoning to raw liver feeding, and AVMA discourages raw animal-source protein.",
  "sources": [
   "https://vcahospitals.com/know-your-pet/vitamin-a-toxicosis-in-cats",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets",
   "https://vcahospitals.com/know-your-pet/dog-treats"
  ]
 },
 {
  "name": "Chicken thigh",
  "indianName": "Murgi ki jaangh / chicken leg meat",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "Same protein benefit as breast but a fattier cut, and veterinary sources link high-fat foods to gastrointestinal upset and pancreatitis in susceptible dogs.",
  "catReason": "Safe cooked and deboned, but PetMD advises trimming extra fat off meat for cats and keeping meat treats small to avoid nutritional imbalance.",
  "preparation": "Boiled or baked, skin off, visible fat trimmed, fully deboned, no salt, oil or spices.",
  "portion": "Treat-level: under 10% of daily calories; smaller portions than breast because of higher fat.",
  "frequency": "2-3 times a week; avoid entirely in dogs or cats with a history of pancreatitis unless a vet approves.",
  "risks": [
   "Pancreatitis and GI upset from higher fat content",
   "Salmonella and Campylobacter if raw",
   "Bone and skin choking or obstruction risk"
  ],
  "allergen": true,
  "rawCooked": "Cook fully; AVMA discourages raw or undercooked animal-source protein for dogs and cats.",
  "sources": [
   "https://www.petmd.com/cat/nutrition/can-cats-eat-chicken",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-butter",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets"
  ]
 },
 {
  "name": "Coconut",
  "indianName": "Nariyal",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says coconut meat is safe for dogs in small amounts but coconut milk should be avoided because its high fat content carries a pancreatitis risk, and the husk is a choking and intestinal blockage hazard.",
  "catReason": "PetMD's cat guidance lists coconut milk among foods to avoid for cats, and ASPCA notes coconut flesh and milk contain oils that may cause stomach upset, loose stools and diarrhoea.",
  "preparation": "Fresh white coconut meat only, finely grated or in tiny pieces; husk and hard shell completely discarded. No coconut milk, no coconut chutney (contains salt, green chilli and often garlic), no sweetened desiccated coconut.",
  "portion": "Dogs (PetMD): 1/8 tsp daily for 2-20 lb, 1/2 tsp daily for 21-50 lb, 1-1.5 tsp daily for 51+ lb; never more than 10% of daily calories. Cats: avoid, or a trace amount at most.",
  "frequency": "Occasional.",
  "risks": [
   "High saturated fat - stomach upset and pancreatitis risk (coconut milk in particular)",
   "Husk and shell - choking and intestinal blockage",
   "Diarrhoea and loose stools (ASPCA)",
   "Coconut water may contain added xylitol - always check the label"
  ],
  "allergen": false,
  "rawCooked": "Fresh raw meat is what the sources describe; the risk profile is the fat and the husk, not the cooking state.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-coconut",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Coriander leaves",
  "indianName": "Hara dhania / kothmir / cilantro",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD states cilantro is not toxic for dogs and gives specific daily amounts, warning only that too much can cause diarrhoea or vomiting.",
  "catReason": "The PetMD cilantro article addresses dogs only and gives no feline guidance, so a trace garnish amount at most and only if the cat wants it.",
  "preparation": "Washed thoroughly to remove dirt and pesticide, chopped fine and mixed into food. Never as part of a chutney - coriander chutney almost always contains garlic, green chilli and salt.",
  "portion": "Dogs (PetMD): 1/4 tsp daily for 2-20 lb, 1/2 tsp for 21-30 lb, 1 tsp for 31-50 lb, up to 1.5 tsp for 51-90 lb, 2 tsp or less for 91+ lb. Cats: DATA NOT VERIFIED.",
  "frequency": "Daily in the stated small amounts is acceptable for dogs.",
  "risks": [
   "GI upset - diarrhoea or vomiting if too much is given",
   "Coriander chutney and cilantro-lime rice typically contain onion or garlic, which are toxic"
  ],
  "allergen": false,
  "rawCooked": "Fresh washed leaves are what the source describes.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-cilantro",
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals"
  ]
 },
 {
  "name": "Cottage cheese",
  "indianName": "Cottage cheese (closest Indian equivalent: fresh unsalted chenna)",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD names cottage cheese as one of the safest cheeses for dogs because it is high in protein and comparatively tolerable, but the general lactose, fat and sodium cautions for cheese still apply.",
  "catReason": "Cornell notes many cats are lactose-intolerant and can develop GI problems from dairy, so cottage cheese is at most a pea-sized occasional treat or a pill vehicle.",
  "preparation": "Plain, low-fat, low-salt cottage cheese with no added cream, herbs, garlic, onion or chives.",
  "portion": "Dogs (PetMD cheese chart): 1-2 pea-sized pieces for 2-10 lb up to 7-8 cubes for 91+ lb, inside the 10% ceiling. Cats: pea-sized.",
  "frequency": "A few times a week at most.",
  "risks": [
   "Lactose intolerance - diarrhoea, bloating, vomiting",
   "Sodium content in commercial cottage cheese",
   "Fat contributing to weight gain and pancreatitis",
   "Dairy is a common canine food allergen",
   "Chive- or garlic-flavoured varieties are toxic"
  ],
  "allergen": true,
  "rawCooked": "Pasteurised product only; AVMA discourages raw/unpasteurised dairy.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-cheese",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat",
   "https://vcahospitals.com/know-your-pet/food-allergies-in-dogs",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets"
  ]
 },
 {
  "name": "Cucumber",
  "indianName": "Kheera / kakdi",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists cucumber as safe for all dogs - about 96% water, low in calories and sugar, and a source of potassium, magnesium and vitamins C and K.",
  "catReason": "Cucumber appears in PetMD's safe hydrating produce guidance and carries no documented toxicity for cats; served in small plain pieces it is a low-risk treat.",
  "preparation": "Washed, peeled if waxed, seeds removed for small animals, cut into small pieces; raw is fine. No salt, chaat masala, nimbu or achar.",
  "portion": "Treat-level: under 10% of daily calories.",
  "frequency": "Daily in small amounts is acceptable.",
  "risks": [
   "Choking if pieces are too large",
   "Mild GI upset if over-fed"
  ],
  "allergen": false,
  "rawCooked": "Raw is fine and is what the sources describe.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat",
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat"
  ]
 },
 {
  "name": "Curd / yoghurt",
  "indianName": "Dahi / curd",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says small amounts of plain yoghurt as an occasional treat are acceptable, but pets lack sufficient lactase and dairy can cause diarrhoea and digestive upset, and yoghurt should not be relied on as a probiotic or calcium source.",
  "catReason": "Cornell states many cats are lactose-intolerant and can develop gastrointestinal problems if fed dairy; PetMD's cat list places yoghurt among dairy products to avoid, though fermented dairy is better tolerated than milk because fermentation breaks down some lactose.",
  "preparation": "Plain, unsweetened, full-fat or low-fat curd with no sugar, jaggery, honey, fruit, salt or artificial sweetener; never any sugar-free/'diet' yoghurt, which may contain xylitol.",
  "portion": "A teaspoon to a tablespoon as an occasional topper depending on body size, inside the 10% treat ceiling. No veterinary source gives a species-specific gram limit for curd: DATA NOT VERIFIED.",
  "frequency": "Occasional. Stop immediately if there is any loose stool, gas or vomiting.",
  "risks": [
   "Lactose intolerance - intestinal cramps, gas and diarrhoea (cats more susceptible than dogs)",
   "Xylitol in sugar-free yoghurts - potentially fatal to dogs",
   "Added sugar - obesity, dental disease",
   "Dairy is one of the most common canine food allergens (VCA)"
  ],
  "allergen": true,
  "rawCooked": "Fermented dairy is better tolerated than fresh milk; unpasteurised/raw dairy is discouraged by AVMA on pathogen grounds.",
  "sources": [
   "https://www.petmd.com/cat/conditions/digestive/truth-about-dairy-products-and-pets",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat",
   "https://vcahospitals.com/know-your-pet/food-allergies-in-dogs",
   "https://www.merckvetmanual.com/toxicology/food-hazards/xylitol-toxicosis-in-dogs"
  ]
 },
 {
  "name": "Eggs",
  "indianName": "Anda",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD states dogs can safely eat plain cooked eggs in moderation - boiled, scrambled or poached with no butter or oil - and that cooking removes both the salmonella and the avidin risk.",
  "catReason": "PetMD states cats can safely eat cooked eggs, with cooked egg white preferred because the yolk is high in fat and can cause GI upset or pancreatitis.",
  "preparation": "Boiled or scrambled in a dry pan, completely plain - no butter, ghee, oil, salt, pepper or onion.",
  "portion": "Dogs (PetMD): 1/4 egg for 2-10 lb, 1/2 egg for 11-20 lb, 1 egg for 21-50 lb, 1.5 eggs for 51-90 lb, 2 eggs for 91+ lb. Cats: about 1 tablespoon of cooked egg white. All within the 10% treat ceiling.",
  "frequency": "1-2 times a week (PetMD's stated frequency for dogs); occasional supplement for cats.",
  "risks": [
   "Salmonella from raw egg",
   "Avidin in raw egg white binds biotin and interferes with absorption when fed regularly",
   "Pancreatitis risk from yolk fat in predisposed animals",
   "Egg allergy (chicken egg is a listed common canine food allergen)"
  ],
  "allergen": true,
  "rawCooked": "Always cooked. ASPCA and PetMD both flag raw eggs for salmonella and for the avidin/biotin interference; cooking neutralises both.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-eggs",
   "https://www.petmd.com/cat/nutrition/can-cats-eat-eggs",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://vcahospitals.com/know-your-pet/food-allergies-in-dogs"
  ]
 },
 {
  "name": "Fish bones",
  "indianName": "Machhli ki kaante",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "PetMD instructs that all bones, fins, heads and scales must be removed from fish before feeding a dog, to prevent choking and intestinal damage.",
  "catReason": "PetMD's cat guidance says fish must be thoroughly cooked with the skin and bones removed, and its chicken guidance makes the same point about bones causing choking, splintering and intestinal blockage.",
  "preparation": "Never feed. Fillet and hand-check every piece of fish - fine intramuscular bones in rohu and similar carp are easy to miss.",
  "portion": "None.",
  "frequency": "Never.",
  "risks": [
   "Choking and airway obstruction",
   "Penetration of the mouth, pharynx, oesophagus, stomach or intestine",
   "Intestinal obstruction"
  ],
  "allergen": false,
  "rawCooked": "Neither raw nor cooked fish bones should be fed.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-fish",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.petmd.com/cat/nutrition/can-cats-eat-chicken"
  ]
 },
 {
  "name": "Ghee",
  "indianName": "Ghee / clarified butter",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "PetMD says butter is best avoided altogether for dogs because eating butter can cause serious problems including pancreatitis, and notes one tablespoon contains about 12 g of fat - roughly the entire daily fat requirement of a 30 lb dog.",
  "catReason": "The same pure-fat calorie load applies, and PetMD warns that fatty foods increase pancreatitis risk in cats; PetMD's cat feeding guidance also says to avoid butter and oils on any food given to cats.",
  "preparation": "Not recommended. Cook meat and vegetables for pets in plain water with no ghee, butter or oil at all.",
  "portion": "None recommended. PetMD notes even a tablespoon or two can trigger severe stomach issues and pancreatitis in small dogs.",
  "frequency": "Not recommended.",
  "risks": [
   "Pancreatitis - the single biggest documented risk",
   "Obesity from extreme calorie density",
   "GI upset lasting up to four days after a fatty meal (PetMD)",
   "Residual dairy solids may still upset lactose-intolerant animals"
  ],
  "allergen": null,
  "rawCooked": "Not applicable - the risk is the fat itself, in any form.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-butter",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Green beans",
  "indianName": "Farasbi / French beans / hari phali",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists green beans as safe and generally well-liked by dogs, low in calories but filling, and a source of vitamins A, B6, C and K plus protein, iron, calcium and fibre.",
  "catReason": "PetMD lists plain cooked beans among safe legume options and green beans are in its safe vegetable list; served plain and soft they are a low-risk occasional cat treat.",
  "preparation": "Washed, trimmed, steamed or boiled plain and cut small; no salt, oil, hing or masala. Plain unsalted canned beans are acceptable per PetMD.",
  "portion": "Treat-level: under 10% of daily calories.",
  "frequency": "Daily in small amounts for dogs; occasional for cats.",
  "risks": [
   "Flatulence and loose stool if fed in quantity",
   "High sodium if canned in brine",
   "Choking if pieces are too large"
  ],
  "allergen": false,
  "rawCooked": "Cooked is easier to digest; PetMD accepts plain unsalted canned green beans.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-beans"
  ]
 },
 {
  "name": "Jaggery",
  "indianName": "Gur / gud",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "Jaggery is unrefined cane sugar and no allowlisted veterinary source treats it as different from sugar; PetMD's ruling that dogs should not eat sugar, and that brown and processed sugars should be avoided, applies directly.",
  "catReason": "Same as sugar - no dietary need in an obligate carnivore, and the same obesity, diabetes and dental risks.",
  "preparation": "Do not add jaggery to any pet food or treat.",
  "portion": "None. No jaggery-specific veterinary guidance exists: DATA NOT VERIFIED.",
  "frequency": "Never.",
  "risks": [
   "Obesity, diabetes, dental disease and GI upset (as for any sugar)",
   "Jaggery-containing sweets frequently also contain raisins, nuts, chocolate or milk - several of which are separately dangerous"
  ],
  "allergen": false,
  "rawCooked": "Not applicable.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-sugar"
  ]
 },
 {
  "name": "Liver (mutton / goat liver)",
  "indianName": "Kaleji",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "Liver is highly palatable and nutrient-dense but VCA documents that vitamin A poisoning most commonly occurs in pets fed liver over several weeks to months, producing poor coat, weakness, weight loss, constipation and painful excessive bone growth.",
  "catReason": "VCA states explicitly that cats are more susceptible to vitamin A poisoning than dogs, and links it directly to feeding raw liver over weeks to months.",
  "preparation": "Boiled or lightly cooked plain, no salt, oil, onion, garlic or masala; chopped small and used as a topper only.",
  "portion": "Small treat-level amounts, well within the 10%-of-calories ceiling, and not on consecutive days. No allowlisted source gives a safe gram limit for liver: DATA NOT VERIFIED.",
  "frequency": "Occasional - once or twice a week at most; never as a daily staple over weeks to months.",
  "risks": [
   "Hypervitaminosis A - skeletal changes, painful or limited movement, poor coat, gum inflammation and loose teeth in kittens",
   "Bacterial pathogens if raw",
   "Loose stools if over-fed"
  ],
  "allergen": true,
  "rawCooked": "Cook it - VCA ties vitamin A poisoning specifically to raw liver, and AVMA discourages raw animal-source protein for both species.",
  "sources": [
   "https://vcahospitals.com/know-your-pet/vitamin-a-toxicosis-in-cats",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets"
  ]
 },
 {
  "name": "Milk (cow/buffalo)",
  "indianName": "Doodh",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "ASPCA states pets do not have significant amounts of lactase and that milk and other dairy can cause diarrhoea or other digestive upset, and there is no nutritional need for cow's milk in a dog on a complete diet.",
  "catReason": "Cornell explicitly says many cats are lactose-intolerant and can develop gastrointestinal problems if fed dairy products, so milk is not recommended as a treat - the classic 'saucer of milk for the cat' is a myth.",
  "preparation": "Not recommended in any preparation. If a vet has approved a dairy treat, PetMD notes goat milk is easier to digest and fermented dairy is better tolerated than plain cow's milk.",
  "portion": "Not recommended. No safe portion is given by any allowlisted source: DATA NOT VERIFIED.",
  "frequency": "Not recommended.",
  "risks": [
   "Lactose intolerance - intestinal cramps and diarrhoea",
   "Dairy is among the most common canine food allergens (VCA)",
   "Raw/unpasteurised milk - pathogen risk, discouraged by AVMA",
   "Calorie load and fat contributing to obesity"
  ],
  "allergen": true,
  "rawCooked": "Neither raw nor boiled milk is recommended; boiling does not remove lactose. AVMA discourages raw milk specifically.",
  "sources": [
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/conditions/digestive/truth-about-dairy-products-and-pets",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets"
  ]
 },
 {
  "name": "Moong dal",
  "indianName": "Moong dal / green gram",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says most beans are safe for dogs when plain and thoroughly cooked and are a source of protein, fibre, vitamins and minerals, but they cause flatulence in quantity and must never carry salt, spices, oil, garlic or onion.",
  "catReason": "Legumes offer an obligate carnivore little usable nutrition (Cornell), and the gas and GI-upset concerns apply, so a teaspoon of plain boiled dal at most as a filler.",
  "preparation": "Soaked and boiled soft in plain water only - no salt, haldi tadka, hing, jeera, ghee, onion or garlic. Cool before serving.",
  "portion": "Dogs (PetMD general bean guidance): about 1 teaspoon mixed in for small dogs, up to about 1/2 cup for large dogs, inside the 10% ceiling. Cats: a teaspoon at most.",
  "frequency": "A few times a week at most.",
  "risks": [
   "Flatulence and GI upset in quantity",
   "Undercooked legumes cause upset stomach or diarrhoea",
   "Tadka ingredients - salt, ghee, onion, garlic, chilli - are the real hazard in a typical Indian dal"
  ],
  "allergen": null,
  "rawCooked": "Must be soaked and cooked thoroughly; PetMD notes undercooked beans cause GI upset and that raw kidney beans in particular are toxic.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-beans",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat",
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals"
  ]
 },
 {
  "name": "Mutton / lamb / goat meat",
  "indianName": "Mutton / bakre ka gosht",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD describes lamb as a safe protein for dogs and a useful alternative for dogs sensitive to beef or chicken, provided it is plain and cooked.",
  "catReason": "Lamb is one of the standard protein sources used in cat food per Cornell, and plain cooked lean red meat with fat trimmed and bones removed is listed by PetMD as an appropriate cat treat.",
  "preparation": "Boiled or pressure-cooked plain, all visible fat trimmed, fully deboned, no salt, oil, onion, garlic or garam masala.",
  "portion": "Treat-level: under 10% of daily calories; PetMD suggests roughly a 1-inch cube of cooked meat as a cat serving.",
  "frequency": "2-3 times a week, or daily in small amounts as part of a complete diet.",
  "risks": [
   "Pancreatitis and GI upset if fatty cuts or curry fat are included",
   "Bacterial pathogens if raw or undercooked",
   "Bone splintering and obstruction if bones are fed"
  ],
  "allergen": true,
  "rawCooked": "Cook fully; AVMA discourages raw or undercooked animal-source protein for dogs and cats.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/healthy-foods-checklist-lamb-dogs",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/food-allergies",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets"
  ]
 },
 {
  "name": "Oats",
  "indianName": "Jai / oats",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD states plain cooked oatmeal is safe for dogs in moderation and provides fibre, vitamins and minerals that support skin and coat.",
  "catReason": "No cited feline source lists oats among recommended cat foods, and Cornell stresses cats depend on nutrients found only in animal products, so oats are at best a tiny occasional filler.",
  "preparation": "Cooked with water, never milk; completely plain - no sugar, salt, jaggery, honey, dried fruit, raisins or flavoured instant sachets. Cool before serving. Never feed uncooked oats.",
  "portion": "Dogs (PetMD, twice weekly): 1 tsp-1 tbsp for 2-20 lb, 1-2 tbsp for 21-30 lb, up to 1/4 cup for 31-50 lb, up to 1/2 cup for 51-90 lb, up to 2/3 cup for 91+ lb. All within the 10% treat ceiling.",
  "frequency": "About twice a week.",
  "risks": [
   "Flavoured or sugar-free instant oats may contain xylitol - a serious dog poison",
   "Raisins in muesli/flavoured oats are potentially fatal to dogs",
   "Uncooked oats are hard to digest and cause stomach upset",
   "Chocolate in flavoured varieties"
  ],
  "allergen": false,
  "rawCooked": "Cook it. PetMD explicitly warns that raw oatmeal is difficult to digest and may cause stomach upset.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-oatmeal",
   "https://www.merckvetmanual.com/toxicology/food-hazards/xylitol-toxicosis-in-dogs",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat"
  ]
 },
 {
  "name": "Paneer",
  "indianName": "Paneer",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says dogs can eat cheese in moderation and names cottage cheese and part-skim mozzarella - the closest analogues to fresh paneer - among the safest choices, but warns that most dogs are lactose intolerant and that high-fat, high-sodium cheese can worsen pancreatitis and cause weight gain.",
  "catReason": "Cornell notes many cats are lactose-intolerant and can develop GI problems from dairy; PetMD allows small pieces of cheese for hiding medication but does not recommend it as a routine treat.",
  "preparation": "Plain fresh unsalted paneer only, cut into small cubes; never fried, never in gravy (paneer curries contain onion, garlic, salt, cream and chilli - all unsuitable or toxic).",
  "portion": "Dogs (PetMD cheese chart): 1-2 pea-sized pieces for 2-10 lb, 1-2 cubes for 11-20 lb, 3-4 cubes for 21-50 lb, 5-6 cubes for 51-90 lb, 7-8 cubes for 91+ lb, inside the 10% ceiling. Cats: a pea-sized piece at most.",
  "frequency": "A few times per week at most (PetMD); occasional for cats.",
  "risks": [
   "Lactose intolerance - diarrhoea, bloating, vomiting",
   "High fat - weight gain and pancreatitis",
   "Sodium in salted/commercial paneer",
   "Dairy is a common canine food allergen",
   "Onion and garlic in any paneer gravy - genuinely toxic"
  ],
  "allergen": true,
  "rawCooked": "Fresh plain paneer is acceptable; avoid fried or gravy preparations entirely.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-cheese",
   "https://www.petmd.com/cat/conditions/digestive/truth-about-dairy-products-and-pets",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat",
   "https://vcahospitals.com/know-your-pet/food-allergies-in-dogs"
  ]
 },
 {
  "name": "Papaya",
  "indianName": "Papita",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD states papaya is safe for dogs and a healthy treat when fed in moderation, provided the seeds and skin are removed because they are hard to digest and cause stomach upset.",
  "catReason": "No allowlisted feline source recommends papaya; with no documented benefit for an obligate carnivore, it is at most a tiny deseeded, deskinned piece as a novelty.",
  "preparation": "Ripe flesh only; skin and every black seed removed; cut into small pieces to prevent choking. Unripe/green papaya and papaya leaves are not covered by any allowlisted source and should not be fed.",
  "portion": "Dogs (PetMD): less than 1/2 tsp for up to 20 lb, about 1 tsp for 21-30 lb, 1-2 tbsp for 31-50 lb, about 2 tbsp for 51-90 lb, no more than 1/4 cup for 91+ lb; introduce with one or two small bites. Cats: a trace amount at most.",
  "frequency": "Occasional treat only - PetMD warns the high fibre content risks loose stools or diarrhoea.",
  "risks": [
   "Seeds and skin - choking and GI obstruction (PetMD's general fruit rule: remove leaves, stems, seeds, pits and rinds)",
   "High sugar - GI upset, unsuitable for diabetic animals",
   "Unripe/green papaya: DATA NOT VERIFIED - not addressed by any allowlisted veterinary source"
  ],
  "allergen": false,
  "rawCooked": "Ripe raw flesh only.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-papaya",
   "https://vcahospitals.com/know-your-pet/dog-treats"
  ]
 },
 {
  "name": "Peanut butter",
  "indianName": "Peanut butter / moongphali makhan",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says peanuts and peanut butter are generally safe for dogs if unsalted and shelled, but they are high in fat and calories and can cause pancreatitis in sensitive dogs - and critically, some nut butters contain xylitol, which Merck documents as causing hypoglycaemia above ~100 mg/kg and hepatic necrosis above ~500 mg/kg in dogs.",
  "catReason": "PetMD's cat guidance lists nuts among foods to avoid for cats, and the high fat load offers an obligate carnivore no benefit - so at most a lick-sized amount of a verified xylitol-free product.",
  "preparation": "READ THE LABEL EVERY TIME. Use only plain, unsalted, unsweetened peanut butter with no xylitol, birch sugar, or any sugar alcohol; no chocolate, no added oil.",
  "portion": "Treat-level: under 10% of daily calories - a small smear, not spoonfuls. No allowlisted source gives a peanut butter gram limit: DATA NOT VERIFIED.",
  "frequency": "Occasional.",
  "risks": [
   "XYLITOL in sugar-free varieties - hypoglycaemia and liver failure in dogs; this is the number one risk",
   "Pancreatitis from high fat",
   "Obesity",
   "Sodium in salted varieties",
   "Aflatoxin from mouldy nuts (PetMD: moulded nuts are toxic)"
  ],
  "allergen": null,
  "rawCooked": "Not applicable; the risk is the additives, not the cooking state.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts",
   "https://www.merckvetmanual.com/toxicology/food-hazards/xylitol-toxicosis-in-dogs",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Peas",
  "indianName": "Matar",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists peas as safe for dogs and a good source of vitamins A, C and K, iron and potassium, noting only that they can cause gas.",
  "catReason": "PetMD lists plain steamed, boiled or baked peas as safe for cats with no salt or butter, and gives a specific serving size.",
  "preparation": "Fresh or frozen green peas, steamed or boiled until soft, completely plain - no salt, butter, ghee or masala.",
  "portion": "Cats (PetMD): three or four peas, once or twice per week. Dogs: treat-level, under 10% of daily calories.",
  "frequency": "1-2 times a week for cats; a few times a week for dogs.",
  "risks": [
   "Flatulence and GI upset - PetMD advises watching for vomiting or diarrhoea in cats",
   "High sodium if canned"
  ],
  "allergen": false,
  "rawCooked": "Cooked is preferred and is what the cited sources specify.",
  "sources": [
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat"
  ]
 },
 {
  "name": "Pomfret",
  "indianName": "Pomfret / paplet / chandi machhli",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "A small, non-predatory marine fish; PetMD's guidance is that smaller, younger fish, thoroughly cooked and fully deboned, are safe for dogs.",
  "catReason": "Thoroughly cooked fish with skin and bones removed is listed by PetMD as a safe feline treat.",
  "preparation": "Steamed or boiled plain, fully cooked, completely deboned and skinned; no salt, oil or masala.",
  "portion": "Treat-level: under 10% of daily calories; roughly a 1-inch cube for a cat, PetMD's square-per-size chart for dogs.",
  "frequency": "Several times a week for dogs; occasional to a few times a week for cats.",
  "risks": [
   "Bones - choking and GI perforation",
   "Thiaminase in raw fish",
   "Parasites and bacteria if raw"
  ],
  "allergen": true,
  "rawCooked": "Cook fully; never raw.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-fish",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://vcahospitals.com/know-your-pet/thiamine"
  ]
 },
 {
  "name": "Potato",
  "indianName": "Aloo",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says plain cooked potato without butter, salt or seasoning is generally safe for dogs, but raw potato must never be fed and any green parts must be removed because they contain solanine.",
  "catReason": "Cats have no need for a starchy vegetable and the same solanine and raw-potato restrictions apply, so at most a teaspoon of plain cooked potato occasionally.",
  "preparation": "Peeled, all green skin and sprouts (aankh) discarded, boiled or baked plain, mashed with nothing added - no salt, butter, ghee, onion, garlic or jeera. Never fried.",
  "portion": "Treat-level: under 10% of daily calories.",
  "frequency": "Occasional.",
  "risks": [
   "Solanine in raw, green or sprouted potato and in potato plant leaves - vomiting, diarrhoea, lethargy",
   "High glycemic carbohydrate load - avoid in diabetic dogs unless vet-approved",
   "Fried potato: high fat, pancreatitis risk"
  ],
  "allergen": false,
  "rawCooked": "Cooked only, never raw. Green skin and sprouts must be cut away before cooking.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-potatoes",
   "https://www.petpoisonhelpline.com/poison/tomato-plant/"
  ]
 },
 {
  "name": "Pumpkin",
  "indianName": "Kaddu / sitaphal / bhopla",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists pumpkin as safe for dogs, high in fibre, and helpful for regulating digestion and preventing constipation.",
  "catReason": "PetMD recommends plain pureed pumpkin with no added spices for cats to help with both diarrhoea and constipation, but warns raw pumpkin must never be fed because it is hard to digest and can cause an obstruction.",
  "preparation": "Cooked and pureed, or plain canned pumpkin puree with no additives; absolutely no pumpkin-pie spice mix (it contains nutmeg). Never raw for cats.",
  "portion": "Cats (PetMD): about 1 tablespoon of puree a few times a week. Dogs: treat-level, under 10% of daily calories.",
  "frequency": "A few times a week; can be daily in small amounts if a vet has recommended it for stool quality.",
  "risks": [
   "Raw pumpkin - GI obstruction in cats (PetMD)",
   "Spiced pumpkin mixes contain nutmeg, which PetMD lists among toxic ingredients to keep away from dogs",
   "Loose stool if over-fed"
  ],
  "allergen": false,
  "rawCooked": "Cooked or canned puree only. PetMD: never feed a cat raw pumpkin.",
  "sources": [
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-bread"
  ]
 },
 {
  "name": "Ragi (finger millet)",
  "indianName": "Ragi / nachni / mandua",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "No source on the authoritative veterinary allowlist has a page specific to ragi; the general grain guidance (plain, fully cooked, unsweetened, treat-level, no added salt or fat) is what applies, so it is classed LIMIT rather than SAFE for lack of a direct source.",
  "catReason": "No authoritative veterinary source addresses ragi for cats, and Cornell stresses cats depend on nutrients found only in animal products, so a grain porridge has no dietary role beyond a tiny occasional filler.",
  "preparation": "Cooked as a plain thin porridge in water only - no milk, sugar, jaggery, salt or ghee; cooled fully.",
  "portion": "Treat-level: under 10% of daily calories. No veterinary source gives a ragi-specific portion: DATA NOT VERIFIED.",
  "frequency": "Occasional.",
  "risks": [
   "Nutritional dilution if it displaces complete and balanced food",
   "Added jaggery, sugar or milk in the usual Indian preparation",
   "Ragi-specific risks in dogs and cats: DATA NOT VERIFIED - no allowlisted veterinary source covers this grain"
  ],
  "allergen": null,
  "rawCooked": "Must be fully cooked as a porridge; uncooked flour is not appropriate.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-oatmeal",
   "https://vcahospitals.com/know-your-pet/dog-treats",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat"
  ]
 },
 {
  "name": "Rohu (freshwater carp)",
  "indianName": "Rohu / rui",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists smaller, younger fish as safe for dogs when cooked through with all bones, fins, head and scales removed.",
  "catReason": "PetMD lists thoroughly cooked fish with skin and bones removed as a safe treat for cats.",
  "preparation": "Steamed or boiled plain until fully cooked; remove every bone, fin, head and scale; no salt, mustard oil, or masala.",
  "portion": "Treat-level: under 10% of daily calories. PetMD sizing: about one 1-inch x 1/4-inch square of fish for a 2-20 lb dog; about a 1-inch cube for a cat.",
  "frequency": "Several times a week is acceptable per PetMD for dogs; for cats keep fish an occasional-to-few-times-weekly treat, not a staple.",
  "risks": [
   "Fine intramuscular bones - choking, oral and GI perforation",
   "Thiaminase in raw fish degrades thiamine (VCA); cooking destroys thiaminases",
   "Parasites and bacteria if raw"
  ],
  "allergen": true,
  "rawCooked": "Never feed raw. PetMD says never feed raw fish to dogs because of parasites and bacteria; VCA notes raw fish contains thiaminases that degrade thiamine and that cooking destroys them.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-fish",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://vcahospitals.com/know-your-pet/thiamine"
  ]
 },
 {
  "name": "Salmon",
  "indianName": "Salmon (imported/farmed; not a traditional Indian fish)",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists salmon among the safe fish for dogs when cooked thoroughly and fully deboned, but raw or undercooked salmon can cause salmon poisoning disease, which is usually fatal in untreated dogs.",
  "catReason": "Cooked, deboned oily fish is listed by PetMD as a safe cat treat, and VCA notes cats do not appear to develop salmon poisoning disease.",
  "preparation": "Baked, steamed or poached until fully cooked; skin and all pin bones removed; no salt, butter, oil, garlic or onion.",
  "portion": "Treat-level: under 10% of daily calories; PetMD's per-size square chart for dogs, roughly a 1-inch cube for cats.",
  "frequency": "Several times a week for dogs; occasional to a few times a week for cats.",
  "risks": [
   "Salmon poisoning disease in dogs from raw/undercooked salmonid fish (Pacific Northwest); untreated, most dogs die within two weeks",
   "Thiaminase in raw fish",
   "Bones - choking and perforation",
   "High fat - pancreatitis risk in susceptible dogs"
  ],
  "allergen": true,
  "rawCooked": "Must be cooked. VCA: salmon poisoning is caused by eating raw or undercooked fish carrying an infected fluke; cats do not appear to develop it, but AVMA still discourages raw fish for both species.",
  "sources": [
   "https://vcahospitals.com/know-your-pet/salmon-poisoning",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-fish",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets"
  ]
 },
 {
  "name": "Salt",
  "indianName": "Namak",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "ASPCA states large amounts of salt can produce excessive thirst and urination and even sodium ion poisoning, with signs including vomiting, diarrhoea, depression, tremors, seizures and death.",
  "catReason": "The same sodium ion poisoning applies; Pet Poison Helpline documents vomiting, diarrhoea, stumbling gait, disorientation, tremor, seizure, collapse and death from salt overdose, and cats' small body size means a smaller absolute amount causes harm.",
  "preparation": "Do not add any salt to pet food. Cook all pet portions before the family's salt goes in.",
  "portion": "None. No allowlisted source gives a safe added-salt amount for dogs or cats: DATA NOT VERIFIED.",
  "frequency": "Never as an added ingredient.",
  "risks": [
   "Sodium ion poisoning / hypernatremia - tremors, seizures, collapse, death",
   "Abnormal blood electrolytes, excessive thirst and urination",
   "Worsens heart and kidney disease"
  ],
  "allergen": false,
  "rawCooked": "Not applicable. Pet Poison Helpline additionally warns that salt or salt water must never be used to induce vomiting in an animal.",
  "sources": [
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petpoisonhelpline.com/poison/salt/"
  ]
 },
 {
  "name": "Sardine",
  "indianName": "Mathi / tarli / pedvey",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD names sardines as acceptable for dogs when properly prepared and responsibly sourced; they are small and low on the food chain so mercury exposure is lower than large predatory fish.",
  "catReason": "PetMD notes oily fish provide omega-3 fatty acids beneficial for cats with arthritis and kidney disease, fed as a small cooked treat.",
  "preparation": "Cooked plain, or canned in water with no added salt; drain thoroughly, remove any large bones; never in oil, brine, tomato sauce or masala.",
  "portion": "Treat-level: under 10% of daily calories; small pieces only because of high fat and calorie density.",
  "frequency": "A few times a week at most.",
  "risks": [
   "High sodium if canned in brine (salt toxicity per Pet Poison Helpline)",
   "High fat - GI upset and pancreatitis risk",
   "Thiaminase if raw",
   "Small bones - choking risk"
  ],
  "allergen": true,
  "rawCooked": "Cooked or water-packed canned only; never raw.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-fish",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.petpoisonhelpline.com/poison/salt/"
  ]
 },
 {
  "name": "Sesame seeds",
  "indianName": "Til",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "No allowlisted veterinary source has a page specific to sesame; it falls under PetMD's general seed and nut guidance, where the documented concerns are high fat content, pancreatitis risk and calorie density, so it is classed LIMIT for lack of a direct source.",
  "catReason": "No allowlisted feline source addresses sesame, and PetMD's cat guidance advises avoiding nuts generally, so a trace amount at most.",
  "preparation": "Plain, unsalted, unsweetened seeds sprinkled in tiny amounts. Never til laddoo, gajak, chikki or revdi - those are sugar or jaggery based.",
  "portion": "A pinch at most, within the 10% treat ceiling. No allowlisted source gives a sesame portion: DATA NOT VERIFIED.",
  "frequency": "Occasional.",
  "risks": [
   "High fat - GI upset and pancreatitis risk (general nut/seed guidance)",
   "Sugar or jaggery in every traditional til sweet",
   "Sesame-specific risks in dogs and cats: DATA NOT VERIFIED"
  ],
  "allergen": null,
  "rawCooked": "Plain roasted or raw seeds are equivalent for risk; the concern is fat and the sugar in til sweets.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://vcahospitals.com/know-your-pet/dog-treats"
  ]
 },
 {
  "name": "Spinach",
  "indianName": "Palak",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says spinach is safe only in small amounts for healthy dogs because it contains oxalates that can lead to kidney and bladder stones in susceptible dogs, and isothiocyanates that can cause severe gastric irritation in large amounts.",
  "catReason": "The same oxalate concern applies and no allowlisted feline source recommends spinach; Pet Poison Helpline documents that soluble oxalates bind calcium and can cause kidney damage, so avoid it entirely in any cat with a history of urinary crystals or kidney disease.",
  "preparation": "Washed thoroughly, steamed or boiled plain and finely chopped; no salt, oil, garlic or onion (palak is almost always cooked with both in Indian kitchens - those versions are unsafe).",
  "portion": "Small amounts only, well inside the 10% treat ceiling. No veterinary source gives a safe gram limit for spinach: DATA NOT VERIFIED.",
  "frequency": "Occasional. Avoid entirely in animals with a history of calcium oxalate stones or kidney disease.",
  "risks": [
   "Oxalates - kidney and bladder stones in susceptible animals",
   "Isothiocyanates - severe gastric irritation in large amounts",
   "Onion and garlic in typical Indian palak preparations - these are the real danger"
  ],
  "allergen": false,
  "rawCooked": "Either is described as safe in small quantities; cooked and chopped is easier to digest. The oxalate risk is unchanged by cooking.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat",
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals"
  ]
 },
 {
  "name": "Sugar",
  "indianName": "Cheeni / shakkar",
  "dog": "AVOID",
  "cat": "AVOID",
  "dogReason": "PetMD states dogs should not eat sugar - regular consumption leads to obesity, diabetes, dental problems and GI upset - and that only naturally occurring sugar from dog-safe fruit and vegetables is acceptable.",
  "catReason": "Cats are obligate carnivores with no dietary requirement for sugar, and the same obesity, diabetes and dental consequences apply; PetMD's cat guidance repeatedly cautions on sugar content even in fruit.",
  "preparation": "Do not add sugar to anything a pet eats.",
  "portion": "None. No safe added-sugar amount is given by any allowlisted source: DATA NOT VERIFIED.",
  "frequency": "Never as an added ingredient.",
  "risks": [
   "Obesity and diabetes mellitus",
   "Dental disease",
   "GI upset, gas, bloating, vomiting and diarrhoea",
   "Sugar-free substitutes are far worse - xylitol is potentially fatal to dogs"
  ],
  "allergen": false,
  "rawCooked": "Not applicable.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-sugar",
   "https://www.merckvetmanual.com/toxicology/food-hazards/xylitol-toxicosis-in-dogs"
  ]
 },
 {
  "name": "Sweet potato",
  "indianName": "Shakarkandi / ratalu",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists sweet potato as safe for dogs, high in fibre and a good source of vitamin A, but stresses it must be cooked before feeding.",
  "catReason": "PetMD lists cooked sweet potato as a safe cat food topper, high in fibre, potassium and vitamins A and C.",
  "preparation": "Peeled, boiled or baked until soft, mashed or cubed; no salt, ghee, butter, sugar or masala. Never raw.",
  "portion": "Cats (PetMD): less than 1 tablespoon. Dogs: treat-level, under 10% of daily calories.",
  "frequency": "2-3 times a week.",
  "risks": [
   "Raw sweet potato is hard to digest and a choking/obstruction risk",
   "High carbohydrate load - limit in diabetic or overweight animals"
  ],
  "allergen": false,
  "rawCooked": "Must be cooked. PetMD: sweet potatoes must be cooked before you give them to your dog.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Tofu",
  "indianName": "Tofu / soy paneer",
  "dog": "LIMIT",
  "cat": "AVOID",
  "dogReason": "PetMD says tofu is non-toxic to dogs when plain and cooked, but it does not contain enough protein to be a primary ingredient, its phytoestrogens can affect hormonal balance in large amounts, and it can cause excessive gas and increase the risk of bloat and GDV.",
  "catReason": "Cats are obligate carnivores that rely on nutrients found only in animal products (Cornell), so a plant protein cannot meet their needs; soy is also a recognised allergen and PetMD flags the gas/bloat problem.",
  "preparation": "Plain firm tofu, cooked, with no sauce, soy sauce, salt, oil, onion or garlic; cut into small cubes.",
  "portion": "Dogs (PetMD): a 1-inch cube per 10 lb of body weight, and still inside the 10% treat ceiling. Cats: not recommended.",
  "frequency": "Occasional for dogs; not recommended for cats.",
  "risks": [
   "Gas and increased risk of bloat / gastric dilatation-volvulus (GDV) - retching without producing anything is a life-threatening emergency",
   "Phytoestrogens affecting hormonal balance, especially in young or breeding dogs",
   "Soy is a common canine food allergen (VCA)",
   "Inadequate as a protein source for cats"
  ],
  "allergen": true,
  "rawCooked": "Cooked and plain only.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-tofu",
   "https://vcahospitals.com/know-your-pet/food-allergies-in-dogs",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat"
  ]
 },
 {
  "name": "Tuna",
  "indianName": "Choora / kera (tuna)",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says light canned tuna is acceptable for dogs but albacore and other large predatory fish should be avoided because they accumulate dangerous mercury levels.",
  "catReason": "PetMD states tuna is very high in mercury (especially albacore), that cats fed a lot of tuna can develop mercury toxicity, and that tuna lacks vitamin E which can lead to steatitis and myopathy.",
  "preparation": "Plain cooked human-grade tuna, or canned light tuna packed in water with no salt or seasoning; drain well. Avoid albacore. Avoid tuna in oil or brine.",
  "portion": "Cats: PetMD gives a hard limit of no more than 1 tablespoon of plain cooked/water-packed tuna once a week, and no tuna at all for kittens under 1 year. Dogs: treat-level, under 10% of daily calories.",
  "frequency": "Occasional only - once a week maximum for cats.",
  "risks": [
   "Mercury accumulation and mercury toxicity",
   "Steatitis (yellow fat disease) and myopathy in cats from vitamin E deficiency on a tuna-heavy diet",
   "Obesity from high calorie density",
   "Fish allergy",
   "Sodium load if brine-packed"
  ],
  "allergen": true,
  "rawCooked": "Cooked or water-packed canned only. Raw tuna carries the same parasite, bacterial and thiaminase concerns as other raw fish.",
  "sources": [
   "https://www.petmd.com/cat/nutrition/can-cats-eat-tuna",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-fish",
   "https://vcahospitals.com/know-your-pet/thiamine"
  ]
 },
 {
  "name": "Turmeric",
  "indianName": "Haldi",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD's vet-reviewed botanicals article describes turmeric/curcumin as a usable anti-inflammatory antioxidant in dogs but warns that high doses can act as a blood thinner and cause stomach upset, and says to consult a vet before use.",
  "catReason": "The same PetMD article addresses dogs only and gives no feline dose, so turmeric in cats is unsupported by the allowlisted sources - use only if a veterinarian directs it.",
  "preparation": "A pinch of plain turmeric powder stirred into food; never as part of a masala, curry or 'golden milk' (which adds milk, ghee, salt and often pepper and jaggery).",
  "portion": "Dogs (PetMD, quoting Dr. Morgan): approximately 15-20 mg per pound of body weight, roughly 1/8 to 1/4 teaspoon daily per 10 lb of body weight. Cats: DATA NOT VERIFIED - no feline dose is published in the allowlisted sources.",
  "frequency": "Daily dosing is what the cited article describes for dogs, under veterinary guidance.",
  "risks": [
   "Blood-thinning effect at high doses - a real concern before surgery or with anticoagulants",
   "Gastrointestinal upset",
   "Grocery-store turmeric gives an inconsistent dose compared with a standardised curcumin supplement"
  ],
  "allergen": false,
  "rawCooked": "Powdered turmeric mixed into food is what the source describes; raw haldi root is not addressed.",
  "sources": [
   "https://www.petmd.com/dog/wellness/4-herbs-joint-pain-and-inflammation-pets"
  ]
 },
 {
  "name": "Watermelon",
  "indianName": "Tarbooz",
  "dog": "SAFE",
  "cat": "SAFE",
  "dogReason": "PetMD lists watermelon as safe and hydrating for dogs, containing vitamins A, B6 and C and potassium, provided the seeds and rind are completely removed because they are choking hazards.",
  "catReason": "PetMD lists watermelon as safe for cats when seeds and rind are completely removed, cautioning only about its sugar content.",
  "preparation": "Seedless flesh only - every seed and all rind removed; cut into small cubes. Serve chilled, plain, with no salt or chaat masala.",
  "portion": "Cats (PetMD): a 1/2-inch cube once or twice per week. Dogs: small pieces, within the 10% treat ceiling.",
  "frequency": "1-2 times a week for cats; a few times a week for dogs in hot weather.",
  "risks": [
   "Seeds and rind - choking and intestinal obstruction",
   "Sugar content",
   "Loose stool if over-fed"
  ],
  "allergen": false,
  "rawCooked": "Raw only.",
  "sources": [
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat",
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat"
  ]
 },
 {
  "name": "Wheat / roti / chapati",
  "indianName": "Gehun / roti / chapati / phulka",
  "dog": "LIMIT",
  "cat": "LIMIT",
  "dogReason": "PetMD says plain cooked wheat bread is safe for dogs in small amounts unless they have a grain allergy, but it adds little nutrition and regular feeding can lead to obesity or diabetes; wheat gluten is also a listed common canine food allergen per VCA.",
  "catReason": "Cornell lists wheat among the carbohydrate sources in cat food that can trigger allergies, and cats have no dietary need for grain, so plain roti is at most an occasional filler.",
  "preparation": "Plain roti made with only atta and water - no ghee, butter, oil, salt, sugar, ajwain or achar. Tear into small pieces. Never feed raw atta dough.",
  "portion": "Treat-level: a small torn piece, well within the 10%-of-daily-calories treat ceiling. No veterinary source gives a gram limit for roti: DATA NOT VERIFIED.",
  "frequency": "Occasional.",
  "risks": [
   "Wheat gluten is one of the most common canine food allergens (VCA)",
   "Obesity and diabetes with regular feeding - minimal nutritional value",
   "Raw yeast/fermented dough (e.g. naan, kulcha, bhatura dough) is a life-threatening emergency - gastric bloat, GDV and ethanol poisoning",
   "Ghee, salt, garlic or onion in prepared rotis and parathas"
  ],
  "allergen": true,
  "rawCooked": "Cooked only. Raw yeasted dough is an emergency; unleavened raw atta dough is also not appropriate.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-bread",
   "https://vcahospitals.com/know-your-pet/food-allergies-in-dogs",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/food-allergies",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets"
  ]
 },
 {
  "name": "White rice",
  "indianName": "Safed chawal",
  "dog": "SAFE",
  "cat": "LIMIT",
  "dogReason": "PetMD notes plain cooked white rice is often recommended by veterinarians as a bland food for dogs with gastrointestinal upset, but it is high glycemic so it should not be a daily treat for diabetic or obese dogs.",
  "catReason": "Cats are obligate carnivores that rely on nutrients found only in animal products (Cornell), so plain cooked rice is at most a small filler, never a meaningful part of the diet.",
  "preparation": "Boiled plain in water, fully cooked and soft, no salt, ghee, tadka, onion or garlic; cool before serving.",
  "portion": "Dogs (PetMD, as a treat 2-3 times weekly): 1-2 tbsp extra-small, 2-3 tbsp small, 1/4 cup medium, 1/3 cup large, 1/2 cup extra-large. For bland-diet use a 2:1 rice-to-lean-protein ratio. Cats: a teaspoon-scale amount at most.",
  "frequency": "2-3 times a week as a treat, or short-term daily under veterinary direction for GI upset.",
  "risks": [
   "High glycemic index - unsuitable as a routine treat for diabetic or obese dogs",
   "Calorie dilution and nutritional imbalance if it displaces complete food",
   "Arsenic content is not addressed by the cited veterinary sources: DATA NOT VERIFIED"
  ],
  "allergen": false,
  "rawCooked": "Always cooked and soft. Uncooked rice is not digestible.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-rice",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat"
  ]
 }
];

export const NEVER_FEED: ToxicFood[] = [
 {
  "name": "Alcohol (beer, wine, spirits, liquor-filled chocolates, fermenting dough)",
  "affects": "Both",
  "severity": "FATAL",
  "dose": null,
  "mechanism": "Ethanol is rapidly absorbed and depresses the central nervous system and respiration; it also irritates the digestive tract and can cause hypoglycaemia and hypothermia.",
  "symptoms": [
   "Vomiting and diarrhoea",
   "Lethargy, disorientation, incoordination (ataxia)",
   "Depression",
   "Difficulty breathing / slowed breathing",
   "Tremors",
   "Hypothermia and hypoglycaemia",
   "Seizures, coma, death"
  ],
  "onset": "Signs appear rapidly after ingestion because ethanol is absorbed quickly (ASPCA, Pet Poison Helpline). A precise time window: DATA NOT VERIFIED.",
  "whatToDo": "Emergency vet immediately; do not induce vomiting - an intoxicated animal can aspirate.",
  "speciesNote": "PetMD notes cats do not have to drink much alcohol to develop clinical signs. Note the Indian-specific route: unbaked/fermenting dough and homemade fermented preparations generate ethanol in the stomach.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/alcohol/",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Chocolate (including cocoa powder, baking chocolate, dark, milk)",
  "affects": "Both",
  "severity": "FATAL",
  "dose": "Merck (dogs, methylxanthines): mild signs - vomiting, diarrhoea - at 20 mg/kg; cardiotoxic effects at 40-50 mg/kg; seizures at 60 mg/kg or more; LD50 for caffeine and theobromine 100-200 mg/kg. Merck also states approximately 62 g/kg of milk chocolate (1 oz per lb of body weight) is a potentially fatal dose in dogs. Methylxanthine content: cocoa powder 28.5 mg/g, baker's chocolate 15.5 mg/g, dark chocolate 5.3-5.6 mg/g, milk chocolate 2.3 mg/g, white chocolate 0.04 mg/g. Feline dose: DATA NOT VERIFIED.",
  "mechanism": "Theobromine and caffeine are methylxanthines that block adenosine receptors and inhibit phosphodiesterase, over-stimulating the central nervous system and heart.",
  "symptoms": [
   "Vomiting and diarrhoea",
   "Restlessness and hyperactivity",
   "Excessive thirst and urination",
   "Panting",
   "Tremors",
   "Tachycardia and cardiac arrhythmias",
   "Hyperthermia",
   "Seizures",
   "Coma and death"
  ],
  "onset": "Signs usually occur within 6-12 hours of ingestion and can persist up to 72 hours in severe cases (Merck).",
  "whatToDo": "Emergency vet immediately with the wrapper and an estimate of the amount and type; do not induce vomiting at home unless a veterinarian or poison control explicitly instructs you to.",
  "speciesNote": "Reported doses are for dogs; dogs are the species most commonly poisoned because they seek chocolate out. Cats are also susceptible to methylxanthines (PetMD lists chocolate among toxic foods for cats) but no feline mg/kg threshold is published in the sources reviewed. Darker product = far more toxin per gram; white chocolate is negligible.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/chocolate-toxicosis-in-animals",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Grapes and raisins (also tamarind and cream of tartar)",
  "affects": "Both",
  "severity": "FATAL",
  "dose": "Merck: more than one grape or raisin per 4.5 kg (10 lb) of body weight may contain enough tartaric acid to pose a risk of renal effects in dogs. Feline dose: DATA NOT VERIFIED.",
  "mechanism": "Tartaric acid accumulates in canine proximal renal tubular cells because dogs lack the organic acid transporters other species have, causing acute kidney injury.",
  "symptoms": [
   "Vomiting or diarrhoea (first)",
   "Lethargy",
   "Loss of appetite",
   "Abdominal discomfort",
   "Weakness and dehydration",
   "Increased thirst, then reduced urine production",
   "Tremors",
   "Acute kidney failure"
  ],
  "onset": "GI signs typically within 6-12 hours; kidney dysfunction develops within 24-72 hours and can progress to critical levels within 24-48 hours (Merck).",
  "whatToDo": "Emergency vet immediately - IV fluids for at least 48 hours are the mainstay and outcome depends on how fast treatment starts; do not wait for symptoms.",
  "speciesNote": "Merck notes anecdotal reports of feline susceptibility but no published case studies of cats developing renal failure; PetMD's feline toxic-food page nonetheless says even a tiny amount warrants immediate veterinary contact for cats. Highly relevant in India: the same tartaric acid is in tamarind (imli) and cream of tartar, and raisins (kishmish) are in kheer, halwa, laddoo and many mithai.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/grape-raisin-and-tamarind-vitis-spp-tamarindus-spp-toxicosis-in-dogs",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets"
  ]
 },
 {
  "name": "Hops (Humulus lupulus - home-brewing hops, spent hops)",
  "affects": "Dog",
  "severity": "FATAL",
  "dose": null,
  "mechanism": "Not fully established; Pet Poison Helpline suggests the toxicity may relate to nitrogenous constituents within the plant. Clinically it produces a malignant hyperthermia-like syndrome.",
  "symptoms": [
   "Rapid-onset, life-threatening high fever",
   "Panting",
   "Accelerated heart rate",
   "Vomiting",
   "Seizures",
   "Death"
  ],
  "onset": "Rapid onset per Pet Poison Helpline; a precise interval is DATA NOT VERIFIED.",
  "whatToDo": "Emergency vet immediately - active cooling and supportive care are needed; this can kill within hours.",
  "speciesNote": "The Pet Poison Helpline page addresses dogs; feline data is DATA NOT VERIFIED. Predisposed breeds named: Greyhounds, Labrador Retrievers, Saint Bernards, Pointer breeds, Dobermans, Border Collies and American Cocker Spaniels, though any breed or mixed-breed can be affected. Relevant with the growth of home-brewing in Indian cities.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/hops/"
  ]
 },
 {
  "name": "Lilies (Lilium and Hemerocallis species - Easter, Madonna, Oriental, Stargazer, Tiger, Day lily)",
  "affects": "Cat",
  "severity": "FATAL",
  "dose": "No safe amount. Pet Poison Helpline states any amount of leaf, stem, flower, pollen, vase water or rhizome causes toxicity in cats. A numeric threshold: DATA NOT VERIFIED.",
  "mechanism": "DATA NOT VERIFIED - Pet Poison Helpline does not state the biochemical mechanism; clinically it produces acute renal tubular necrosis.",
  "symptoms": [
   "Vomiting",
   "Abdominal pain",
   "Dehydration",
   "Acute kidney failure"
  ],
  "onset": null,
  "whatToDo": "Emergency vet IMMEDIATELY on any suspected exposure, including grooming pollen off the coat or drinking vase water - do not wait for symptoms, because by the time a cat is sick the kidneys may already be failing.",
  "speciesNote": "This is a cat-specific catastrophe. Pet Poison Helpline's page addresses cats only and provides no dog information. Even brushing against the flower and later grooming the pollen off the fur is a documented exposure route. Practical rule for an Indian pet household: no true lilies in the house, in bouquets, or in poojas where a cat lives.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/lilies/",
   "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/lily"
  ]
 },
 {
  "name": "Raw yeast dough (bread dough, naan/kulcha/bhatura dough, pizza dough)",
  "affects": "Both",
  "severity": "FATAL",
  "dose": null,
  "mechanism": "Two simultaneous problems: the dough rises in the warm stomach causing gas accumulation, distension and potentially gastric dilatation and volvulus, and the fermenting yeast produces ethanol that is rapidly absorbed, causing alcohol poisoning.",
  "symptoms": [
   "Unproductive retching / attempts to vomit",
   "Distended, painful abdomen",
   "Depression, disorientation, weakness",
   "Tremors",
   "Severe depression, dangerously low body temperature",
   "Seizures, coma"
  ],
  "onset": "Merck: early signs appear quickly after ingestion. A precise interval: DATA NOT VERIFIED.",
  "whatToDo": "Emergency vet immediately - this can become gastric dilatation-volvulus, which is life-threatening; do not induce vomiting at home.",
  "speciesNote": "Merck lists all species as susceptible, especially dogs. PetMD's feline toxic-foods page lists raw dough for cats too. Unproductive retching with a swollen belly is a surgical emergency in a dog.",
  "sources": [
   "https://www.merckvetmanual.com/special-pet-topics/poisoning/food-hazards",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-bread",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Tobacco and nicotine products (cigarettes, beedi, chewing tobacco, khaini, vape liquid, nicotine pouches, cigarette butts)",
  "affects": "Both",
  "severity": "FATAL",
  "dose": null,
  "mechanism": "Nicotine is a cholinergic agonist affecting nicotinic acetylcholine receptors, producing an initial stimulatory phase followed by depression and neuromuscular blockade.",
  "symptoms": [
   "Immediate phase: vomiting, drooling, rapid heart rate, high blood pressure, panting, agitation, tremors, seizures",
   "Delayed phase: low heart rate, slow breathing, hypothermia, coma, death"
  ],
  "onset": "Clinical signs occur rapidly following ingestion (Pet Poison Helpline).",
  "whatToDo": "Emergency vet immediately - this progresses fast; do not induce vomiting at home unless explicitly instructed.",
  "speciesNote": "Affects both dogs and cats. Concentrated vape liquid and nicotine pouches carry a much higher dose per unit than a cigarette. Discarded beedi and cigarette butts on the street are a real exposure route for Indian street-dwelling and free-roaming dogs.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/tobacco/"
  ]
 },
 {
  "name": "Wild and unidentified mushrooms",
  "affects": "Both",
  "severity": "FATAL",
  "dose": null,
  "mechanism": "Varies by mushroom genus - amatoxins from Amanita, Galerina and Lepiota cause hepatic necrosis; other genera produce neurotoxic, nephrotoxic or GI toxins.",
  "symptoms": [
   "Vomiting and diarrhoea",
   "Loss of coordination, tremors, seizures",
   "Visual problems, aggression, confusion",
   "Dark stools, elevated liver enzymes, liver failure",
   "Appetite loss, excessive drinking and urination, kidney failure"
  ],
  "onset": "Highly variable - some toxins act within 15-30 minutes of ingestion while others take up to 24 hours to manifest (Pet Poison Helpline).",
  "whatToDo": "Emergency vet immediately, and photograph or bag a sample of the mushroom for identification; do not wait to see whether signs develop.",
  "speciesNote": "Affects both dogs and cats. Pet Poison Helpline states the majority of confirmed fatal mushroom toxicities in pets are due to Amanita, Galerina and Lepiota, and that accurate identification should be left to mycologists. PetMD says only plain washed store-bought white mushrooms are acceptable for dogs and no wild mushroom ever is. Monsoon-season lawn and park mushrooms are the classic Indian exposure.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/mushrooms/",
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat"
  ]
 },
 {
  "name": "Xylitol (birch sugar) - sugar-free gum, mints, sweets, peanut butter, toothpaste, some medicines",
  "affects": "Dog",
  "severity": "FATAL",
  "dose": "Merck (dogs): hypoglycaemia above approximately 100 mg/kg (45 mg/lb); hepatic necrosis above 500 mg/kg (227 mg/lb).",
  "mechanism": "In dogs xylitol triggers a rapid, dose-dependent insulin release causing severe hypoglycaemia; at higher doses it causes liver necrosis, possibly through ATP depletion and reactive oxygen species.",
  "symptoms": [
   "Vomiting",
   "Weakness and lethargy",
   "Ataxia / loss of coordination",
   "Collapse",
   "Seizures",
   "Coma",
   "Later: jaundice, bleeding disorders and elevated liver enzymes"
  ],
  "onset": "Hypoglycaemia can develop within 30 minutes or be delayed up to 12-18 hours depending on the product; liver injury signs typically appear 24-48 hours after ingestion, with enzyme elevations detectable within 4-12 hours (Merck).",
  "whatToDo": "Emergency vet immediately - this is time-critical; do not induce vomiting at home unless instructed, and take the packaging so the xylitol content can be calculated.",
  "speciesNote": "Merck states explicitly that cats are NOT at risk for hypoglycaemia or liver injury from xylitol. This is a dog-specific poison. Watch imported sugar-free products, 'diet'/'keto' peanut butters, and sugar-free chewing gum.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/xylitol-toxicosis-in-dogs",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets"
  ]
 },
 {
  "name": "Betel nut / areca nut (supari), paan and gutka",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "DATA NOT VERIFIED for dogs and cats. No source on the authoritative veterinary allowlist (ASPCA, Merck, VCA, Pet Poison Helpline, AVMA, Cornell, PetMD) publishes a toxicology entry for Areca catechu in dogs or cats, so no mechanism can be stated here without inventing one. Note that paan masala and gutka very commonly contain tobacco, for which nicotine toxicity IS documented.",
  "symptoms": [
   "DATA NOT VERIFIED for areca nut itself in dogs and cats",
   "If the product contains tobacco, expect the documented nicotine picture: drooling, vomiting, rapid heart rate, high blood pressure, panting, agitation, tremors, seizures, then bradycardia, slowed breathing, hypothermia, coma"
  ],
  "onset": null,
  "whatToDo": "Emergency vet or poison control immediately, and take the packet - tell them whether the product contains tobacco (gutka, zarda, khaini) because that changes the treatment.",
  "speciesNote": "IMPORTANT DISAMBIGUATION: the ASPCA plant database entry for 'Areca Palm' refers to Dypsis lutescens, the ornamental golden cane palm, which it lists as non-toxic to dogs, cats and horses. That is a DIFFERENT plant from Areca catechu, the betel/areca nut chewed as supari. Do not use the ornamental palm's non-toxic rating to conclude betel nut is safe. Because the veterinary literature reviewed here does not cover it, this entry is flagged as unverified rather than assigned a confident mechanism, and the practical guidance is to keep paan, supari and gutka completely out of reach.",
  "sources": [
   "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/areca-palm",
   "https://www.petpoisonhelpline.com/poison/tobacco/"
  ]
 },
 {
  "name": "Black walnuts",
  "affects": "Dog",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "DATA NOT VERIFIED - PetMD groups black walnuts with macadamia nuts as nuts that must never be fed but does not state the toxic principle.",
  "symptoms": [
   "Vomiting",
   "Muscle weakness",
   "Tremors",
   "Fever",
   "Seizures"
  ],
  "onset": null,
  "whatToDo": "Call a vet or poison control with the amount ingested.",
  "speciesNote": "PetMD's nut guidance is written for dogs and lists macadamia nuts and black walnuts together as absolutely prohibited. Feline data: DATA NOT VERIFIED. Note that ordinary English walnuts are treated differently by the same source - safe but high fat.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts"
  ]
 },
 {
  "name": "Caffeine - coffee, tea, chai, energy drinks, cola, caffeine pills, coffee grounds",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": "Merck gives an LD50 of 100-200 mg/kg for caffeine in dogs and notes cardiotoxic effects from methylxanthines at 40-50 mg/kg and seizures at 60 mg/kg or more. VCA states ingestion of one or two caffeine pills can be fatal for small dogs and cats.",
  "mechanism": "Caffeine is a methylxanthine that acts as a central nervous system and cardiac stimulant.",
  "symptoms": [
   "Hyperactivity, restlessness, jitteriness, pacing, vocalising",
   "Increased heart rate and abnormal heart rhythm",
   "Vomiting and GI upset",
   "Increased thirst and urination",
   "Tremors",
   "Hyperthermia",
   "Seizures"
  ],
  "onset": "VCA: symptoms can start within 1 to 2 hours of ingestion and can last 12 to 36 hours.",
  "whatToDo": "Emergency vet immediately - early decontamination matters; do not induce vomiting at home unless instructed.",
  "speciesNote": "VCA states both dogs and cats are far more sensitive to caffeine than humans. Used tea bags, chai dregs, coffee grounds in the bin and green tea/pre-workout supplements are all realistic exposures. Cats are small enough that a single caffeine tablet can be lethal.",
  "sources": [
   "https://vcahospitals.com/know-your-pet/caffeine-toxicity-in-pets",
   "https://www.merckvetmanual.com/toxicology/food-hazards/chocolate-toxicosis-in-animals",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Chives (including spring onion greens)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "Allium species - sulfur-containing oxidants cause oxidative haemolysis and Heinz body anaemia.",
  "symptoms": [
   "Gastrointestinal irritation, vomiting, diarrhoea",
   "Lethargy and weakness",
   "Pale or yellow gums",
   "Dark urine",
   "Rapid breathing and heart rate"
  ],
  "onset": "Delayed - haemolysis typically 3-5 days after exposure.",
  "whatToDo": "Emergency vet or poison control the same day.",
  "speciesNote": "ASPCA notes cats are more susceptible than dogs to Allium species. Chive-flavoured cream cheese and spring onion garnishes are common accidental exposures.",
  "sources": [
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals",
   "https://vcahospitals.com/know-your-pet/onion-garlic-chive-and-leek-toxicity-in-dogs"
  ]
 },
 {
  "name": "Cooked bones (chicken, mutton, fish, chop bones)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": "Not a dose-dependent poison - a single bone can be fatal. DATA NOT VERIFIED.",
  "mechanism": "Mechanical, not chemical: hard and brittle bone fractures teeth and splinters into sharp shards that lacerate, perforate or obstruct the gastrointestinal tract.",
  "symptoms": [
   "Choking, gagging, pawing at the mouth",
   "Drooling, blood in the mouth",
   "Repeated vomiting or retching",
   "Abdominal pain and a hunched posture",
   "Straining to defecate, constipation, rectal bleeding",
   "Lethargy and collapse if perforation and peritonitis occur"
  ],
  "onset": "Immediate for choking and oral injury; hours to days for obstruction or perforation.",
  "whatToDo": "Emergency vet - do NOT induce vomiting, because a sharp fragment can do more damage coming back up.",
  "speciesNote": "VCA lists seven distinct dangers (broken teeth, mouth and tongue injuries, choking, gut perforation, stomach retention, intestinal blockage, bacterial contamination) and states it is a myth that dogs need to chew bones. PetMD says chicken bones must never be given to cats. Cats' smaller GI tract makes obstruction from even a small fragment more likely.",
  "sources": [
   "https://vcahospitals.com/know-your-pet/why-bones-are-not-safe-for-dogs",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/can-cats-eat-chicken"
  ]
 },
 {
  "name": "Garlic (raw, cooked, powdered, garlic paste, garlic supplements)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": "Merck states garlic is 3-5 times more toxic than onion. An absolute g/kg threshold for garlic itself: DATA NOT VERIFIED, but it can be scaled from the onion figures (dogs 15-30 g/kg raw onion; cats 5 g/kg raw onion or less than a teaspoon of cooked onion).",
  "mechanism": "Same as onion - sulfur-containing oxidants in Allium species cause oxidative red blood cell damage, Heinz body formation, methaemoglobinaemia and haemolysis.",
  "symptoms": [
   "Lethargy, weakness, exercise intolerance",
   "Anorexia",
   "Rapid breathing and heart rate",
   "Pale or yellow gums",
   "Dark urine",
   "Vomiting and diarrhoea",
   "Collapse and death"
  ],
  "onset": "As for onion - Heinz bodies within 24 hours peaking around 72 hours, haemolysis typically 3-5 days after exposure.",
  "whatToDo": "Contact a vet or poison control the same day, including for 'small' amounts of garlic paste or powder, because garlic is several times more potent than onion by weight.",
  "speciesNote": "Cats are the most susceptible species. Reject any folk or 'natural flea remedy' advice to feed garlic to dogs - the cited veterinary sources classify it as a toxin, not a supplement. Ginger-garlic paste, garlic naan, garlic chutney and hing-garlic tadka are all routes of exposure in Indian kitchens.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals",
   "https://www.petpoisonhelpline.com/poison/garlic/",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets"
  ]
 },
 {
  "name": "High-fat, fried and buttery/ghee-laden foods (pakora, puri, samosa, butter, ghee, refried or oily leftovers)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "A sudden high-fat load triggers inappropriate pancreatic enzyme activation and pancreatic inflammation (pancreatitis), and causes acute gastroenteritis.",
  "symptoms": [
   "Vomiting and diarrhoea, sometimes lasting up to four days",
   "Abdominal pain and a hunched posture",
   "Loss of appetite",
   "Lethargy"
  ],
  "onset": "Typically within hours to a day of the fatty meal. A precise interval: DATA NOT VERIFIED.",
  "whatToDo": "Vet the same day if there is repeated vomiting, abdominal pain or refusal to eat - pancreatitis can be severe and needs fluids, pain control and antiemetics.",
  "speciesNote": "Affects both species; PetMD documents pancreatitis risk from fatty foods in dogs and has separate guidance on feeding cats with pancreatitis. Schnauzers are specifically named by PetMD as predisposed. This is the most common festival-season emergency in Indian households - Diwali mithai and fried snacks fed as 'a little treat'.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-butter",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts",
   "https://www.petmd.com/dog/nutrition/what-can-dogs-not-eat"
  ]
 },
 {
  "name": "Leeks",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "Leeks are an Allium species; sulfur-containing oxidants cause oxidative red blood cell damage, Heinz bodies and haemolytic anaemia.",
  "symptoms": [
   "Lethargy and weakness",
   "Pale or icteric gums",
   "Dark urine",
   "Tachypnoea, tachycardia",
   "Vomiting and diarrhoea"
  ],
  "onset": "Delayed - haemolysis typically 3-5 days after exposure.",
  "whatToDo": "Emergency vet or poison control the same day.",
  "speciesNote": "Cats are the most susceptible species to Allium toxicosis. VCA's dog page covers onion, garlic, chive and leek together as a single toxic group.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals",
   "https://vcahospitals.com/know-your-pet/onion-garlic-chive-and-leek-toxicity-in-dogs",
   "https://www.petmd.com/dog/nutrition/what-vegetables-can-dogs-eat"
  ]
 },
 {
  "name": "Mouldy food and mouldy nuts",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "DATA NOT VERIFIED - PetMD states moulded nuts are toxic but does not name the toxin or mechanism.",
  "symptoms": [
   "DATA NOT VERIFIED - the cited source does not enumerate clinical signs"
  ],
  "onset": null,
  "whatToDo": "Call a vet or poison control immediately if a pet has eaten mouldy food, especially if there are tremors or agitation.",
  "speciesNote": "PetMD's dog nut guidance names mouldy nuts as toxic. Feline data: DATA NOT VERIFIED. Practical rule: bins, compost and monsoon-damp stored grain and nuts should be inaccessible. Evidence strength here is weaker than for the top-tier toxins in this list.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts"
  ]
 },
 {
  "name": "Onion (raw, cooked, powdered, dehydrated, fried)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": "Merck: in dogs, ingestion of 15-30 g/kg of raw onion has resulted in clinical signs. In cats, toxicosis has been reported after ingesting less than a teaspoon of cooked onions or 5 g/kg of raw onion.",
  "mechanism": "Sulfur-containing oxidants in Allium species cause oxidative damage to red blood cells, producing Heinz bodies, methaemoglobinaemia and haemolytic anaemia.",
  "symptoms": [
   "Lethargy and weakness",
   "Anorexia",
   "Tachypnoea and tachycardia",
   "Exercise intolerance",
   "Pale or icteric (yellow) gums",
   "Dark red or brown urine (haemoglobinuria)",
   "Vomiting, diarrhoea, abdominal pain",
   "Collapse and death"
  ],
  "onset": "Heinz body formation and methaemoglobinaemia begin within 24 hours and peak around 72 hours; haemolysis typically occurs 3-5 days after exposure, so clinical signs usually appear days later, not immediately (Merck).",
  "whatToDo": "Contact a vet or poison control the same day even if the animal looks fine - the damage is delayed; do not wait for symptoms and do not induce vomiting unless instructed.",
  "speciesNote": "Merck states cats are the most susceptible species, followed by dogs, and are particularly vulnerable to concentrated forms like onion powder and dehydrated onion. This is the single most important toxin for Indian households - onion is in nearly every sabzi, dal tadka, curry, biryani, sambar and gravy. Onion powder is also hidden in stock cubes, chips, namkeen and instant noodle masala sachets.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals",
   "https://vcahospitals.com/know-your-pet/onion-garlic-chive-and-leek-toxicity-in-dogs",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Raw and undercooked meat, poultry, fish, eggs and unpasteurised dairy",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": "Not dose-dependent - a single contaminated portion can cause infection. DATA NOT VERIFIED.",
  "mechanism": "Bacterial and parasitic contamination - Salmonella, Campylobacter, E. coli, Listeria monocytogenes, Toxoplasma and, in raw salmonid fish, the fluke that transmits Neorickettsia. Raw egg white additionally contains avidin, which binds biotin and interferes with its absorption.",
  "symptoms": [
   "Poor appetite, lethargy",
   "Abdominal pain",
   "Vomiting and diarrhoea",
   "Fever",
   "With salmon poisoning disease in dogs: fever, vomiting, diarrhoea, enlarged lymph nodes, and death within about two weeks if untreated",
   "With chronic raw egg feeding: skin and coat problems from biotin interference"
  ],
  "onset": "Varies by pathogen. Salmon poisoning disease is typically fatal within two weeks if untreated (VCA).",
  "whatToDo": "See a vet if there is vomiting, diarrhoea, fever or lethargy after a raw meal; mention the raw feeding explicitly, because salmon poisoning in dogs is treatable but only if it is suspected.",
  "speciesNote": "AVMA discourages feeding any raw or undercooked animal-sourced protein to dogs and cats because of risk to both human and animal health, noting healthy pets can shed pathogens subclinically and infect children, elderly, pregnant and immunocompromised household members. Cornell adds that raw meat is not recommended for cats because it is a potential vehicle for toxoplasmosis. VCA notes cats do not appear to develop salmon poisoning disease - that one is dog-specific.",
  "sources": [
   "https://www.avma.org/resources-tools/avma-policies/raw-or-undercooked-animal-source-protein-cat-and-dog-diets",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feeding-your-cat",
   "https://vcahospitals.com/know-your-pet/salmon-poisoning",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Salt and salty snacks (namkeen, chips, papad, salt dough, de-icing salt, sea water)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "Excess sodium causes hypernatraemia; water shifts out of brain cells, producing neurological signs, and severe cases cause cerebral oedema on rehydration.",
  "symptoms": [
   "Increased thirst and urination",
   "Vomiting and diarrhoea",
   "Depression and disorientation",
   "Stumbling gait / incoordination",
   "Tremors",
   "Seizures",
   "Collapse and death"
  ],
  "onset": null,
  "whatToDo": "Emergency vet - correction of hypernatraemia must be done slowly and under supervision; do not force water or withhold it without veterinary direction.",
  "speciesNote": "Applies to both species. Pet Poison Helpline additionally warns that salt and salt water must never be used to induce vomiting in an animal because of the risk of creating salt poisoning. In India the common exposures are namkeen, chips, papad, pickle brine and leftover salted curry.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/salt/",
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/dog/nutrition/what-can-dogs-not-eat"
  ]
 },
 {
  "name": "Shallots",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "Shallots are an Allium species - the same sulfur-containing oxidants damage red blood cells and cause Heinz body haemolytic anaemia.",
  "symptoms": [
   "Lethargy, weakness",
   "Pale or yellow gums",
   "Dark urine",
   "Rapid breathing and heart rate",
   "Vomiting and diarrhoea",
   "Collapse"
  ],
  "onset": "Delayed - haemolysis typically 3-5 days after exposure.",
  "whatToDo": "Emergency vet or poison control the same day; do not wait for symptoms.",
  "speciesNote": "Cats are the most susceptible Allium species. In India shallots are sold as sambar onion / chotta pyaz / madras onion and appear in sambar, chutney and South Indian gravies - they are just as dangerous as large onions.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Star fruit (kamrakh / carambola)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "Soluble oxalate / oxalic acid, present in dangerous concentrations in sour star fruit, binds calcium causing acute hypocalcaemia and calcium oxalate crystal deposition in the kidneys.",
  "symptoms": [
   "Vomiting and drooling",
   "Weakness and trembling",
   "Reduced blood calcium",
   "Excessive urination with calcium oxalate crystals",
   "Kidney damage"
  ],
  "onset": null,
  "whatToDo": "Emergency vet - hypocalcaemia and acute kidney injury need immediate treatment and monitoring.",
  "speciesNote": "Pet Poison Helpline lists dogs, cats and potentially humans as affected. It notes sweet varieties contain minimal oxalate and pose no risk to pets with healthy kidneys, while sour star fruit is the dangerous one - a meaningful distinction because kamrakh sold in India is often the sour type. Animals with existing kidney disease are at far greater risk.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/starfruit/"
  ]
 },
 {
  "name": "Tamarind and cream of tartar (tartaric acid sources)",
  "affects": "Both",
  "severity": "SEVERE",
  "dose": null,
  "mechanism": "Tartaric acid, the same compound implicated in grape and raisin toxicosis, accumulates in canine proximal renal tubular cells and causes acute kidney injury.",
  "symptoms": [
   "Vomiting and diarrhoea",
   "Poor appetite and lethargy",
   "Increased thirst",
   "Reduced urine production",
   "Acute kidney failure"
  ],
  "onset": "By analogy with grape toxicosis: GI signs within 6-12 hours, renal changes within 24-72 hours. Tamarind-specific onset: DATA NOT VERIFIED.",
  "whatToDo": "Contact a vet or poison control the same day; do not wait for symptoms.",
  "speciesNote": "Merck's toxicosis entry is titled for grape, raisin AND tamarind (Tamarindus spp) in dogs, and PetMD's feline toxic-foods page groups grapes, raisins, tamarinds and cream of tartar together as tartaric acid sources dangerous to cats. This matters enormously in India: imli is in sambar, rasam, chutney, pani puri water and many curries.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/grape-raisin-and-tamarind-vitis-spp-tamarindus-spp-toxicosis-in-dogs",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats"
  ]
 },
 {
  "name": "Avocado (pit, skin and leaves in particular)",
  "affects": "Both",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "Persin, present throughout the plant with leaves most toxic, causes myocardial damage in sensitive species. In dogs the dominant documented hazard is mechanical - the intact pit causing foreign body obstruction - plus GI upset.",
  "symptoms": [
   "Vomiting and diarrhoea (dogs, per ASPCA)",
   "In severe/sensitive species: lethargy, respiratory distress, subcutaneous oedema, cyanosis, cough, exercise intolerance",
   "With pit ingestion: repeated vomiting, anorexia, abdominal pain - signs of GI obstruction"
  ],
  "onset": "Merck reports signs within 24-48 hours in susceptible species; obstruction from a swallowed pit may present over hours to days.",
  "whatToDo": "Call a vet or poison control; if the pit was swallowed treat it as a possible surgical obstruction and go in for imaging. Do not induce vomiting for a swallowed pit unless instructed.",
  "speciesNote": "SOURCES DISAGREE on how dangerous avocado flesh is to dogs and cats. Merck says dogs seem relatively resistant, citing one report of two dogs with myocardial damage, and does not address cats. Pet Poison Helpline states outright that avocado is non-toxic to dogs and cats and that the pit obstruction is the real risk. ASPCA says persin can cause vomiting and diarrhoea in dogs and that avocado is primarily a problem for birds, rabbits, donkeys, horses and ruminants. PetMD's fruit guide allows very small amounts of soft green flesh for dogs but says the pit, skin and leaves must always be avoided. Practical reading: flesh is a low-grade GI/fat risk, the pit is the emergency.",
  "sources": [
   "https://www.merckvetmanual.com/toxicology/food-hazards/avocado-persea-spp-toxicosis-in-animals",
   "https://www.petpoisonhelpline.com/poison/avocado/",
   "https://www.aspca.org/news/scoop-avocado-and-your-pets",
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat"
  ]
 },
 {
  "name": "Blue cheese and other mouldy cheese",
  "affects": "Dog",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "PetMD states blue cheese contains roquefortine, which is toxic to dogs.",
  "symptoms": [
   "DATA NOT VERIFIED - the cited source names the toxin but does not enumerate clinical signs"
  ],
  "onset": null,
  "whatToDo": "Call a vet or poison control with the amount eaten; do not induce vomiting unless instructed.",
  "speciesNote": "PetMD's guidance is written for dogs and says to avoid blue cheese entirely. Feline data: DATA NOT VERIFIED. Note that PetMD separately warns moulded nuts are toxic, so the general rule is to keep all visibly mouldy food away from pets.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-cheese",
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-nuts"
  ]
 },
 {
  "name": "Citrus peel, pith, seeds, stems and leaves (nimbu, santra, mosambi)",
  "affects": "Both",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "Stems, leaves, peels, fruit and seeds contain varying amounts of citric acid and essential oils that irritate the gastrointestinal tract and, in quantity, can cause central nervous system depression.",
  "symptoms": [
   "Vomiting and diarrhoea",
   "Excessive drooling",
   "Trembling",
   "Light sensitivity",
   "Lethargy and depression",
   "Skin irritation"
  ],
  "onset": null,
  "whatToDo": "Call a vet if a large amount of peel, or any whole lemon/lime, has been eaten - whole citrus can also obstruct.",
  "speciesNote": "ASPCA says small amounts of the flesh are likely to cause only minor stomach upset in both species; PetMD's cat page similarly says citrus flesh is safe but the skins are irritating, and PetMD's dog fruit guide says lemons and limes should be avoided completely. The risk sits with peel, essential oils and quantity rather than a stray segment of orange.",
  "sources": [
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.petmd.com/cat/nutrition/toxic-foods-for-cats",
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat"
  ]
 },
 {
  "name": "Green/unripe tomato, tomato leaves and stems (tomato plant)",
  "affects": "Both",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "Toxic plant alkaloids (solanine-type glycoalkaloids) are found in all parts of the tomato plant; concentrations are highest in green tomatoes, leaves and stems and lowest in ripe fruit.",
  "symptoms": [
   "Vomiting and diarrhoea",
   "Weakness and lethargy",
   "Disorientation",
   "Stumbling / incoordination"
  ],
  "onset": null,
  "whatToDo": "Call a vet or poison control with an estimate of how much plant material was eaten; supportive care is usually sufficient.",
  "speciesNote": "Affects both dogs and cats. Ripe tomato flesh contains the least alkaloid and PetMD lists ripe tomato (stems and leaves removed) as safe for dogs; the danger is the green fruit and the plant itself, which matters for households with a terrace or balcony tomato plant.",
  "sources": [
   "https://www.petpoisonhelpline.com/poison/tomato-plant/",
   "https://www.petmd.com/dog/nutrition/what-fruits-can-dogs-eat"
  ]
 },
 {
  "name": "Macadamia nuts",
  "affects": "Dog",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "Unknown. Pet Poison Helpline states the toxic mechanism is unknown but can affect nerve and muscle function; the high oil content can additionally trigger pancreatitis.",
  "symptoms": [
   "Weakness, particularly hind limb weakness and inability to walk",
   "Incoordination",
   "Depression and severe lethargy",
   "Vomiting",
   "Tremors",
   "Hyperthermia / increased body temperature",
   "Joint stiffness"
  ],
  "onset": "Symptoms usually appear within 12 hours of ingestion, with recovery expected within 24-72 hours (ASPCA); Merck says signs resolve within 12-48 hours.",
  "whatToDo": "Call a vet or poison control - most dogs recover with supportive care, but hyperthermia and inability to walk need veterinary assessment.",
  "speciesNote": "Merck lists dogs as the only susceptible species. Effects in cats: DATA NOT VERIFIED, though PetMD's cat guidance advises avoiding nuts, especially macadamia and walnuts, for cats.",
  "sources": [
   "https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets",
   "https://www.merckvetmanual.com/special-pet-topics/poisoning/food-hazards",
   "https://www.petpoisonhelpline.com/poison/macadamia-nuts/",
   "https://www.petmd.com/cat/nutrition/what-human-foods-can-cats-eat"
  ]
 },
 {
  "name": "Nutmeg (jaiphal) and nutmeg-containing spice mixes",
  "affects": "Both",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "DATA NOT VERIFIED - the cited sources flag nutmeg as an ingredient to keep away from dogs without stating the toxic principle or mechanism.",
  "symptoms": [
   "DATA NOT VERIFIED - the cited sources do not enumerate clinical signs for nutmeg in dogs or cats"
  ],
  "onset": null,
  "whatToDo": "Call a vet or Pet Poison Helpline / ASPCA Animal Poison Control with the amount ingested; do not induce vomiting unless instructed.",
  "speciesNote": "PetMD lists nutmeg among the toxic ingredients that must not be in bread given to dogs, and lists gingerbread and pumpkin bread as unsafe specifically because they contain nutmeg. Cat-specific data: DATA NOT VERIFIED. Relevant in India because jaiphal appears in garam masala, biryani masala, kheer and sweets. Treat as avoid, but note that the strength of published evidence here is weaker than for the Allium, chocolate and xylitol entries.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-bread"
  ]
 },
 {
  "name": "Raw and undercooked kidney beans (rajma)",
  "affects": "Both",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "PetMD states raw kidney beans are toxic and contain high levels of phytohaemagglutinin, a lectin.",
  "symptoms": [
   "Upset stomach",
   "Vomiting",
   "Diarrhoea"
  ],
  "onset": null,
  "whatToDo": "Call a vet if a significant amount of raw or undercooked rajma has been eaten, or if vomiting and diarrhoea are severe or persistent.",
  "speciesNote": "PetMD's beans guidance is written for dogs and specifies that kidney beans are safe only when cooked; the same lectin concern is a reason not to feed cats raw or undercooked legumes either. Highly relevant in Indian kitchens where dry rajma is soaked on the counter overnight and is reachable.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-beans"
  ]
 },
 {
  "name": "Raw, green or sprouted potato and potato plant leaves",
  "affects": "Both",
  "severity": "MODERATE",
  "dose": null,
  "mechanism": "Solanine, a glycoalkaloid concentrated in green skin, sprouts and the leaves and stems of the potato plant.",
  "symptoms": [
   "Vomiting",
   "Diarrhoea",
   "Lethargy"
  ],
  "onset": null,
  "whatToDo": "Call a vet or poison control with an estimate of the amount; do not induce vomiting unless instructed.",
  "speciesNote": "Applies to both species. PetMD states raw potato should never be given to dogs and any green parts must be removed because they contain solanine. Plain cooked, peeled, non-green potato is a different matter and is treated as acceptable in small amounts.",
  "sources": [
   "https://www.petmd.com/dog/nutrition/can-dogs-eat-potatoes",
   "https://www.petpoisonhelpline.com/poison/tomato-plant/"
  ]
 }
];
