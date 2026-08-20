/**
 * THE EVIDENCE FILE — where every number in the feeding engine comes from.
 *
 * The engine could have carried these constants inline. It does not, because a
 * calorie multiplier with no citation beside it is indistinguishable from a
 * calorie multiplier somebody made up, and this hub tells pet owners how much
 * to feed an animal. Each factor here arrived from a page that was fetched:
 * the Merck Veterinary Manual's maintenance-energy table, AAHA's weight-
 * management guidance, UC Davis on the ten-percent treat rule, Cornell on
 * water intake, WSAVA on body condition and food transition.
 *
 * `unverified` is the honest half of the file: the figures that are repeated
 * everywhere on the internet and that no authoritative page would confirm —
 * the puppy meal-frequency ladder, the working-dog multiplier, the 25/50/75
 * transition steps. The engine does not use them. The UI says so where a
 * reader would otherwise expect a number.
 *
 * ONE TRAP, RECORDED BY THE RESEARCH AND WORTH KEEPING: Merck/AAHA's
 * RER-multiplier method and WSAVA/FEDIAF's NRC-2006 direct equations are two
 * different systems. This engine uses the RER-multiplier method throughout and
 * never blends the two.
 *
 * GENERATED FILE.
 */

export const EVIDENCE = {
 "rer": {
  "exponentialFormula": "RER (kcal/day) = 70 x (body weight in kg)^0.75",
  "exponentialQuote": "RER = 70 [body weight in kg0.75]",
  "exponentialSource": "Merck Veterinary Manual, Nutritional Requirements of Small Animals",
  "exponentialSourceUrl": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals",
  "linearApproximation": "RER (kcal/day) = 30 x (body weight in kg) + 70",
  "linearQuote": "RER = 30 x [body weight in kg] + 70",
  "linearValidRange": "Applies only to animals greater than 2 kg and less than 45 kg",
  "linearRangeQuote": "greater than 2 kg and less than 45 kg",
  "linearSource": "Merck Veterinary Manual, Nutritional Requirements of Small Animals",
  "linearSourceUrl": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals",
  "bodyWeightForWeightLoss": "IDEAL body weight, not current body weight",
  "bodyWeightQuote": "RER in kcal/day = 70 x (ideal BWkg)0.75",
  "bodyWeightSource": "AAHA, Tip Sheet: Calculating a Pet's Caloric Intake for Weight Management (Weight Management Guidelines)",
  "bodyWeightSourceUrl": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/Weight-Management-Tip-Sheet",
  "bodyWeightCorroboration": {
   "source": "AAHA 2021 Nutrition and Weight Management Guidelines, Weight Reduction in the Obese Pet",
   "sourceUrl": "https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/weight-reduction-in-the-obese-pet/",
   "quote": "RER = BWkg0.75 X 70 ... Base these calculations on ideal weight and adjust as needed for the individual patient, based on current intake and lifestyle needs."
  },
  "osuConfirmation": {
   "source": "Ohio State University Veterinary Medical Center, Companion Animal Nutrition Support Service",
   "sourceUrl": "https://vmc.vet.osu.edu/services/companion-animal-nutrition-support-service",
   "quote": "a 10kg (22lb) adult neutered dog of healthy weight needs RER = 70(10kg)3/4 = approx 400 Calories/day",
   "caveatQuote": "these calculations can only give crude, 'zip-code' level estimates of your pet's Calorie needs"
  },
  "alternativeNrcEquations": {
   "note": "WSAVA's own owner-facing calorie tools do NOT use 70 x BW^0.75 x factor; they cite NRC 2006 daily maintenance energy requirement equations directly.",
   "dogsActiveAdult": "130 kcal x BWkg^0.75",
   "dogsInactiveAdult": "95 kcal x BWkg^0.75",
   "dogsSource": "WSAVA Global Nutrition Toolkit, Calorie Needs for Healthy Adult Dogs (updated July 2020)",
   "dogsSourceUrl": "https://wsava.org/wp-content/uploads/2020/07/Calorie-Needs-for-Healthy-Adult-Dogs-updated-July-2020.pdf",
   "dogsCitationQuote": "Reference calculations used: 2006 NRC Daily Maintenance Energy Requirement for Dogs.",
   "catsLeanAdult": "100 kcal x BWkg^0.67",
   "catsObeseProneAdult": "130 kcal x BWkg^0.4",
   "catsSource": "WSAVA Global Nutrition Toolkit, Calorie Needs for Healthy Adult Cats (updated July 2020)",
   "catsSourceUrl": "https://wsava.org/wp-content/uploads/2020/07/Calorie-Needs-for-Healthy-Adult-Cats-updated-July-2020.pdf",
   "catsCitationQuote": "2006 NRC Daily Maintenance Energy Requirement for Cats",
   "fediafDogs": "95 kcal/kg0.75 (398 kJ/kg0.75) or 110 kcal/kg0.75 (460 kJ/kg0.75)",
   "fediafCats": "75 kcal/kg0.67 (314 kJ/kg0.67) or 100 kcal/kg0.67 (418 kJ/kg0.67)",
   "fediafSource": "FEDIAF Nutritional Guidelines (October 2021)",
   "fediafSourceUrl": "https://europeanpetfood.org/wp-content/uploads/2022/03/Updated-Nutritional-Guidelines.pdf"
  },
  "caveat": "MER = maintenance energy requirement (remember that any calculation of caloric intake is only a starting point and may need to be modified based on how the patient responds)",
  "caveatSourceUrl": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats"
 },
 "factors": {
  "dog": [
   {
    "key": "neuteredAdult",
    "label": "Healthy adult dog, neutered/spayed",
    "factor": 1.6,
    "range": "1.6 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy adult dogs - Neutered | 1.6 x RER"
   },
   {
    "key": "intactAdult",
    "label": "Healthy adult dog, intact",
    "factor": 1.8,
    "range": "1.8 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy adult dogs - Intact | 1.8 x RER"
   },
   {
    "key": "inactiveObeseProne",
    "label": "Inactive / obesity-prone adult dog",
    "factor": 1.4,
    "range": "1.4 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy adult dogs - Obesity prone | 1.4 x RER"
   },
   {
    "key": "weightLoss",
    "label": "Weight loss (dog)",
    "factor": 1.0,
    "range": "0.8-1.0 x RER calculated on IDEAL body weight. AAHA 2021 lists a life-stage factor of 1.0 for dogs during weight loss; the AAHA weight-management tip sheet recommends feeding 80% of ideal-weight RER.",
    "source": "AAHA 2021 Nutrition and Weight Management Guidelines (Weight Reduction in the Obese Pet); AAHA Weight Management Tip Sheet",
    "url": "https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/weight-reduction-in-the-obese-pet/",
    "quote": "The table specifies factors of 0.8 for cats and 1.0 for dogs during weight loss phases. ... Base these calculations on ideal weight. ... Recent data suggest mean caloric intake for weight loss over a 12 week period is 63 +/- 10.2 kcal/kg0.75 in dogs and 52 +/- 4.9 kcal/kg0.711 in cats. [AAHA tip sheet: 'Feeding 80% of ideal-weight RER is effective and well tolerated.']"
   },
   {
    "key": "weightGain",
    "label": "Weight gain (dog)",
    "factor": null,
    "range": "DATA NOT VERIFIED",
    "source": "DATA NOT VERIFIED",
    "url": null,
    "quote": "DATA NOT VERIFIED. The commonly repeated figure of 1.2-1.8 x RER for weight gain could not be found on any of the authoritative pages fetched (WSAVA toolkit, AAHA 2021/2014 guidelines, Merck Veterinary Manual MER table, OSU, Tufts, UC Davis, VCA, Cornell). Merck's MER table and the AAHA guidelines list no weight-gain factor. What WAS found: Merck states only that 'any calculation of caloric intake is only a starting point and may need to be modified based on how the patient responds.'"
   },
   {
    "key": "puppy0to4Months",
    "label": "Puppy, birth to 4 months",
    "factor": 3.0,
    "range": "3 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy puppies < 4 months old | 3 x RER"
   },
   {
    "key": "puppy4MonthsToAdult",
    "label": "Puppy, 4 months to adult",
    "factor": 2.0,
    "range": "2 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy puppies > 4 months old | 2 x RER"
   },
   {
    "key": "activeWorking",
    "label": "Active / working dog",
    "factor": null,
    "range": "DATA NOT VERIFIED as a multiple of RER. WSAVA (NRC 2006) instead gives an absolute equation: active adult 130 kcal x BWkg^0.75 vs inactive adult 95 kcal x BWkg^0.75 (a ~1.37x spread between inactive and active). FEDIAF gives 95 vs 110 kcal/kg^0.75 for dogs.",
    "source": "WSAVA Global Nutrition Toolkit, Calorie Needs for Healthy Adult Dogs; FEDIAF Nutritional Guidelines 2021; VCA Nutrition for Working and Service Dogs",
    "url": "https://wsava.org/wp-content/uploads/2020/07/Calorie-Needs-for-Healthy-Adult-Dogs-updated-July-2020.pdf",
    "quote": "WSAVA: 'Active Adult: 130 kcal x BWkg0.75 ... Inactive Adult: 95 kcal x BWkg0.75'. VCA declines to give a multiplier: 'The daily energy requirements of a working or service dog are highly variable and are dependent on the amount and type of work performed.' The commonly cited 2.0-5.0 x RER range for working dogs was NOT found on any authoritative page fetched."
   },
   {
    "key": "gestation",
    "label": "Gestation (pregnant bitch)",
    "factor": null,
    "range": "After day 40 of gestation: 30% to 60% above normal adult maintenance (i.e. approx 1.3-1.6 x maintenance), depending on litter size. Not expressed as a multiple of RER.",
    "source": "VCA Animal Hospitals, Feeding the Pregnant Dog",
    "url": "https://vcahospitals.com/know-your-pet/feeding-the-pregnant-dog",
    "quote": "Her daily energy (Calorie) needs may be 30% to 60% higher than normal adult maintenance levels, depending on the size of the litter. ... The highest energy requirement for the mother occurs between weeks 6 and 8 of gestation."
   },
   {
    "key": "lactation",
    "label": "Lactation (nursing bitch)",
    "factor": null,
    "range": "2-4 x the calories of a normal healthy adult dog (multiple of ADULT MAINTENANCE, not of RER); peak at 3-5 weeks post-whelping",
    "source": "VCA Animal Hospitals, Feeding the Nursing Dog",
    "url": "https://vcahospitals.com/know-your-pet/feeding-the-nursing-dog",
    "quote": "she may require two to four times the calories of a normal, healthy adult dog ... [peak energy demands occur] three to five weeks after giving birth."
   }
  ],
  "cat": [
   {
    "key": "neuteredAdult",
    "label": "Healthy adult cat, neutered/spayed",
    "factor": 1.2,
    "range": "1.2 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy adult cats - Neutered | 1.2 x RER"
   },
   {
    "key": "intactAdult",
    "label": "Healthy adult cat, intact",
    "factor": 1.4,
    "range": "1.4 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy adult cats - Intact | 1.4 x RER"
   },
   {
    "key": "inactiveObeseProne",
    "label": "Inactive / obesity-prone adult cat",
    "factor": 1.0,
    "range": "1 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy adult cats - Obesity prone | 1 x RER"
   },
   {
    "key": "weightLoss",
    "label": "Weight loss (cat)",
    "factor": 0.8,
    "range": "0.8 x RER calculated on IDEAL body weight",
    "source": "AAHA 2021 Nutrition and Weight Management Guidelines (Weight Reduction in the Obese Pet); AAHA Weight Management Tip Sheet",
    "url": "https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/weight-reduction-in-the-obese-pet/",
    "quote": "The table specifies factors of 0.8 for cats and 1.0 for dogs during weight loss phases. ... Recent data suggest mean caloric intake for weight loss over a 12 week period is ... 52 +/- 4.9 kcal/kg0.711 in cats. [AAHA tip sheet: 'Feeding 80% of ideal-weight RER is effective and well tolerated.']"
   },
   {
    "key": "weightGain",
    "label": "Weight gain (cat)",
    "factor": null,
    "range": "DATA NOT VERIFIED",
    "source": "DATA NOT VERIFIED",
    "url": null,
    "quote": "DATA NOT VERIFIED. The commonly repeated 1.2-1.8 x RER weight-gain factor was not found on any authoritative page fetched. Merck's MER table lists no weight-gain category. WSAVA's cat tool instead offers an obese-prone equation (130 kcal x BWkg^0.4) and a lean equation (100 kcal x BWkg^0.67)."
   },
   {
    "key": "kitten",
    "label": "Healthy kitten",
    "factor": 2.5,
    "range": "2.5 x RER",
    "source": "Merck Veterinary Manual, Table: Daily Maintenance Energy Requirements for Dogs and Cats",
    "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
    "quote": "Healthy kittens | 2.5 x RER (footnote: 'Kittens can alternatively be fed free choice')"
   }
  ]
 },
 "treats": {
  "rule": "Treats and other non-complete foods should be no more than 10% of daily caloric intake; at least 90% should come from a complete and balanced food.",
  "percent": 10,
  "statedBy": [
   {
    "source": "UC Davis Veterinary Medical Teaching Hospital, Nutrition Support Service - Treat Guidelines for Dogs (2020)",
    "sourceUrl": "https://www.vetmed.ucdavis.edu/sites/g/files/dgvnsk491/files/inline-files/treats-guidelines-for-dogs-2020.pdf",
    "quote": "Treats and additional food items should not exceed 10% of the daily caloric intake. The majority (90% or greater) of the calories should come from a complete and balanced food. ... if your dog eats 100 Calories per day, NO MORE than 10 Calories should be from treats or other foods (with 90 Calories from a complete and balanced diet)."
   },
   {
    "source": "WSAVA Global Nutrition Committee, Nutritional Assessment Guidelines (JSAP 2011)",
    "sourceUrl": "https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf",
    "quote": "Snacks, treats, table food > 10% of total calories [listed as a nutritional screening RISK FACTOR requiring extended nutritional evaluation]"
   },
   {
    "source": "VCA Animal Hospitals, Creating a Weight Reduction Plan for Dogs / for Cats",
    "sourceUrl": "https://vcahospitals.com/know-your-pet/creating-a-weight-reduction-plan-for-dogs",
    "quote": "A typical rule is that 10% of calories can come from treats and 90% should come from the food."
   },
   {
    "source": "VCA Animal Hospitals, How Much Food Should I Feed My Puppy",
    "sourceUrl": "https://vcahospitals.com/pediatric/puppy/nutrition/how-much-to-feed-your-puppy",
    "quote": "treats should not make up over 10% of your puppy's calories."
   }
  ],
  "note": "The 10% rule is stated identically by UC Davis, WSAVA (as a >10% risk-factor threshold), and VCA across dog, cat and puppy pages. It applies to the same daily calorie budget - treat calories come OUT of the daily allowance, not in addition to it."
 },
 "water": {
  "dogs": {
   "normalIntake": "approximately 40-60 mL of water per kg body weight per day",
   "quote": "approximately 40-60 milliliters of water for every kilogram of body weight",
   "source": "Cornell University Richard P. Riney Canine Health Center - Canine Polyuria and Polydipsia (PU/PD), April 2024",
   "sourceUrl": "https://riney.vet.cornell.edu/member-benefits-health-tips/polyuria-polydipsia-april-2024",
   "polydipsiaThreshold": "> 100 mL/kg/day",
   "polydipsiaQuote": "a dog is polydipsic when their water intake exceeds 100ml per kilogram",
   "polydipsiaSourceUrl": "https://riney.vet.cornell.edu/member-benefits-health-tips/polyuria-polydipsia-april-2024"
  },
  "cats": {
   "normalIntake": "approximately 4 ounces (about 118 mL) of water per 5 lb (2.27 kg) lean body weight per day = approximately 52 mL/kg/day; an average 10-lb cat should drink about one cup per day",
   "quote": "Cats need to consume about 4 ounces of water per five pounds of lean body weight per day, so the average 10-pound cat should drink about one cup of water per day.",
   "source": "Cornell Feline Health Center - Hydration",
   "sourceUrl": "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hydration",
   "polydipsiaThreshold": "DATA NOT VERIFIED",
   "polydipsiaQuote": "DATA NOT VERIFIED. The commonly cited feline polydipsia threshold of >45 mL/kg/day was not found on any authoritative page fetched (Cornell Feline Health Center hydration page, Merck diabetes insipidus / renal dysfunction pages, VCA Testing for Increased Thirst and Urination, VCA Diabetes Insipidus in Cats). Cornell's hydration page gives normal intake only and states no excess threshold. The nearest quantitative anchors found were Merck's general mammalian requirement of ~44-66 mL/kg/day and Merck's normal feline urine volume of 10-20 mL/kg/day.",
   "polydipsiaSourceUrl": null
  },
  "generalMammalian": {
   "quote": "In a thermoneutral environment, most mammalian species need ~44-66 mL/kg body weight.",
   "source": "Merck Veterinary Manual, Nutritional Requirements of Small Animals",
   "sourceUrl": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals"
  },
  "wetFoodEffect": {
   "summary": "Pets eating canned/wet food drink measurably less free water because the food supplies much of the requirement; pets on dry food take most of their water requirement in by drinking. Total water intake (food + drinking) stays about the same.",
   "quotes": [
    {
     "quote": "dogs and cats consuming predominantly canned food generally drink less water than those consuming predominantly dry diets",
     "source": "Merck Veterinary Manual, Nutritional Requirements of Small Animals",
     "sourceUrl": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals"
    },
    {
     "quote": "cats that eat wet food, which can contain up to 80% water, may drink less, and cats that eat dry food usually take more of their daily water requirement in by drinking",
     "source": "Cornell Feline Health Center - Hydration",
     "sourceUrl": "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hydration"
    },
    {
     "quote": "Dogs typically regulate their water intake well, keeping their total intake fairly consistent. Their total daily water intake will vary depending on the environment, activity, and food composition. Dogs eating a dry kibble diet will drink more than those dogs who acquire part of their water intake from canned food.",
     "source": "VCA Animal Hospitals, Feeding Your Young Adult Dog",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/feeding-your-young-adult-dog"
    }
   ]
  },
  "catsDrinkPoorlyNote": {
   "quote": "Multiple water sources encourage consumption. This is particularly important in cats, which often do not drink a lot of water.",
   "source": "Merck Veterinary Manual, Nutritional Requirements of Small Animals",
   "sourceUrl": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals"
  },
  "referenceUrineVolume": {
   "dogs": "20-100 mL/kg/day",
   "cats": "10-20 mL/kg/day",
   "source": "Merck Veterinary Manual, Table: Urine Volume and Specific Gravity (adapted from Dukes' Physiology of Domestic Animals, 13th ed., 2015)",
   "sourceUrl": "https://www.merckvetmanual.com/multimedia/table/urine-volume-and-specific-gravity"
  }
 },
 "mealFrequency": {
  "puppies": {
   "guidance": "2-4 meals per day. VCA gives 'three to four meals a day' for young puppies to break the day's food into smaller volumes, and '2-3 times per day' / 'two to three equal meals per day' as the general puppy recommendation. Age-band breakdowns were not found.",
   "byAge": "DATA NOT VERIFIED. The widely repeated schedule (6-12 weeks = 4 meals/day, 3-6 months = 3 meals/day, 6-12 months = 2 meals/day) was NOT found on any authoritative page fetched. VCA's 'Feeding Times and Frequency for Your Dog' explicitly gives no age-specific breakdown.",
   "quotes": [
    {
     "quote": "Feeding three to four meals a day can be helpful, as it breaks up the day's food into smaller volumes for a puppy's small belly.",
     "source": "VCA Animal Hospitals, Feeding Times and Frequency for Your Dog",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-your-dog"
    },
    {
     "quote": "Puppies grow rapidly and should be fed measured amounts at regular feeding times, generally 2-3 times per day, based on their body condition and age.",
     "source": "VCA Animal Hospitals, Feeding Growing Puppies",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/feeding-growing-puppies"
    },
    {
     "quote": "Most puppies at this age should be fed two to three equal meals per day.",
     "source": "VCA Animal Hospitals, How Much Food Should I Feed My Puppy",
     "sourceUrl": "https://vcahospitals.com/pediatric/puppy/nutrition/how-much-to-feed-your-puppy"
    }
   ]
  },
  "adultDogs": {
   "guidance": "At least 2 meals per day; commonly 1-3. Measured portions rather than free feeding.",
   "quotes": [
    {
     "quote": "The most common recommendation is to feed your dog at least two meals per day. Some dogs are less food motivated and do fine with one meal per day. Others may need more frequent meals.",
     "source": "VCA Animal Hospitals, Feeding Times and Frequency for Your Dog",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-your-dog"
    },
    {
     "quote": "For most pet dogs, feeding once or twice per day is recommended. Many dogs benefit from eating equally divided meals, two to three times per day.",
     "source": "VCA Animal Hospitals, Nutrition - General Feeding Guidelines for Dogs",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/nutrition-general-feeding-guidelines-for-dogs"
    },
    {
     "quote": "Meal feeding two or three times per day using a measured portion provides optimal control over intake.",
     "source": "VCA Animal Hospitals, Feeding Your Young Adult Dog",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/feeding-your-young-adult-dog"
    }
   ]
  },
  "kittens": {
   "guidance": "3 meals per day until 6 months old; twice daily from 6 months to 1 year. VCA additionally suggests 3-4 meals a day for kittens.",
   "quotes": [
    {
     "quote": "Until they are six months old, kittens will usually do best when fed three meals a day. Between the ages of six months and one year, twice daily feeding is generally best.",
     "source": "Cornell Feline Health Center, How often should you feed your cat?",
     "sourceUrl": "https://www.vet.cornell.edu/departments/cornell-feline-health-center/health-information/feline-health-topics/how-often-should-you-feed-your-cat"
    },
    {
     "quote": "feeding three to four meals a day can be helpful, as it breaks up the day's food into smaller volumes for a kitten's small belly",
     "source": "VCA Animal Hospitals, Feeding Times and Frequency for Your Cat",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-cats"
    }
   ]
  },
  "adultCats": {
   "guidance": "Once or twice a day from about 1 year of age (Cornell); VCA says at least two meals per day is best, and some cats do better with three to four smaller meals.",
   "quotes": [
    {
     "quote": "Once the cat becomes an adult, at about one year of age, feeding once or twice a day is appropriate in most cases. Senior cats (10 years of age and older) should maintain the same feeding regimen unless owners are otherwise instructed by a veterinarian.",
     "source": "Cornell Feline Health Center, How often should you feed your cat?",
     "sourceUrl": "https://www.vet.cornell.edu/departments/cornell-feline-health-center/health-information/feline-health-topics/how-often-should-you-feed-your-cat"
    },
    {
     "quote": "at least two meals per day is best ... It really depends on the individual cat as well as the family schedule.",
     "source": "VCA Animal Hospitals, Feeding Times and Frequency for Your Cat",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-cats"
    }
   ]
  },
  "freeFeeding": {
   "quote": "Free feeding dry food (keeping it available all the time, sometimes referred to as grazing-feeding) may be acceptable for some cats, but for others, it can result in overeating and inappropriate weight gain.",
   "source": "Cornell Feline Health Center, How often should you feed your cat?",
   "sourceUrl": "https://www.vet.cornell.edu/departments/cornell-feline-health-center/health-information/feline-health-topics/how-often-should-you-feed-your-cat",
   "vcaPosition": "VCA states ad libitum ('free choice') feeding is not recommended, citing risks of juvenile obesity, binge-eating, orthopedic issues and diabetes.",
   "vcaSourceUrl": "https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-cats",
   "kittenException": "Merck's MER table footnote states 'Kittens can alternatively be fed free choice.'"
  }
 },
 "bcs": {
  "scale": "9-point body condition score (BCS) scale, used for both dogs and cats",
  "idealScore": "4 to 5 out of 9",
  "idealQuote": "The goal for most pets is a BCS of 4 to 5 of 9.",
  "idealSource": "WSAVA Global Nutrition Committee, Nutritional Assessment Guidelines (JSAP 2011)",
  "idealSourceUrl": "https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf",
  "bodyFatAtIdeal": "BCS 5/9 correlates to 20-24% body fat",
  "bodyFatSource": "AAHA 2014 Weight Management Guidelines for Dogs and Cats",
  "bodyFatSourceUrl": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/2014-AAHA-Weight-Management-Guidelines-for-Dogs-and-Cats",
  "tenPercentRule": {
   "rule": "Each BCS point above ideal (i.e. each point above 5 on the 9-point scale) is equivalent to being approximately 10% overweight.",
   "percentPerPoint": 10,
   "quote": "Each BCS >= 5 (on a 9 point scale) ... is equivalent to being 10% overweight.",
   "source": "AAHA 2014 Weight Management Guidelines for Dogs and Cats",
   "sourceUrl": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/2014-AAHA-Weight-Management-Guidelines-for-Dogs-and-Cats",
   "note": "WSAVA's 2011 Nutritional Assessment Guidelines do NOT contain this statement; it was verified on the AAHA 2014 Weight Management Guidelines. Practical use: ideal body weight = current weight / (1 + 0.10 x (BCS - 5)). E.g. a dog at BCS 8/9 is approx 30% overweight."
  },
  "dogScale": {
   "source": "WSAVA Body Condition Score Chart - Dog",
   "sourceUrl": "https://wsava.org/wp-content/uploads/2020/01/Body-Condition-Score-Dog.pdf",
   "bands": "UNDER IDEAL = 1-3; IDEAL = 4-5; OVER IDEAL = 6-9",
   "score1": "Ribs, lumbar vertebrae, pelvic bones, and all bony prominences evident from a distance",
   "score2": "Ribs, lumbar vertebrae, and pelvic bones easily visible; muscle loss obvious",
   "score3": "Ribs easily palpated, tops of lumbar vertebrae visible, pelvic bones becoming prominent",
   "score4": "Ribs easily palpable with minimal fat covering",
   "score5": "Ribs palpable without excess fat covering; waist observed behind ribs when viewed from above; abdominal tuck evident",
   "score6": "Ribs palpable with slight excess fat covering; noticeable fat deposits",
   "score7": "Ribs not easily palpable under heavy fat cover; heavy fat deposits over lumbar area",
   "score8": "Ribs not palpable under very heavy fat cover; massive fat deposits over lumbar area and base of tail",
   "score9": "Ribs not palpable under very heavy fat cover; massive fat deposits over thorax, spine, limbs and neck; obvious abdominal distention"
  },
  "catScale": {
   "source": "WSAVA Body Condition Score Chart - Cat (2017)",
   "sourceUrl": "https://wsava.org/wp-content/uploads/2020/01/Cat-Body-Condition-Scoring-2017.pdf",
   "idealScore": "5 of 9",
   "score1": "No palpable fat. Ribs visible on shorthaired cats; severe abdominal tuck; lumbar vertebrae and wings of ilia easily palpated",
   "score3": "Ribs easily palpable with minimal fat covering; lumbar vertebrae obvious; pronounced abdominal tuck",
   "score5": "Ribs palpable with slight fat covering. Observe ribs behind waist. Well-proportioned; minimal abdominal fat pad",
   "score7": "Ribs not easily palpated with moderate fat covering; obvious abdominal rounding; moderate abdominal fat pad",
   "score9": "Ribs not palpable with heavy fat cover; obvious abdominal distention; heavy fat deposits over lumbar area, extending to face and limbs"
  },
  "merNote": {
   "quote": "The MER depends upon BCS, sex and neuter status, life stage, activity, and environment variables.",
   "source": "WSAVA Nutritional Assessment Guidelines (JSAP 2011)",
   "sourceUrl": "https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf"
  }
 },
 "weightLoss": {
  "dogs": {
   "safeRate": "1-2% of body weight per week",
   "quote": "The desired rate of weight loss in dogs is 1-2%/wk",
   "source": "AAHA 2014 Weight Management Guidelines for Dogs and Cats",
   "sourceUrl": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/2014-AAHA-Weight-Management-Guidelines-for-Dogs-and-Cats",
   "corroboration": {
    "quote": "dogs should lose somewhere between 1% and 2% of their initial body weight per week, and closer to 0.5% might be more achievable for morbidly obese dogs",
    "source": "VCA Animal Hospitals, Creating a Weight Reduction Plan for Dogs",
    "sourceUrl": "https://vcahospitals.com/know-your-pet/creating-a-weight-reduction-plan-for-dogs"
   }
  },
  "cats": {
   "safeRate": "0.5-2% of body weight per week (AAHA); VCA gives 1-2%/week with 0.5%/week for morbidly obese cats",
   "quote": "The desired rate of weight loss in dogs is 1-2%/wk, and in cats is 0.5-2%/wk.",
   "source": "AAHA 2014 Weight Management Guidelines for Dogs and Cats",
   "sourceUrl": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/2014-AAHA-Weight-Management-Guidelines-for-Dogs-and-Cats",
   "corroboration": {
    "quote": "Cats should lose somewhere between 1% and 2% of their initial body weight per week, and closer to 0.5% might be more appropriate for morbidly obese cats.",
    "source": "VCA Animal Hospitals, Creating a Weight Reduction Plan for Cats",
    "sourceUrl": "https://vcahospitals.com/know-your-pet/creating-a-weight-reduction-plan-for-cats"
   }
  },
  "hepaticLipidosisWarning": {
   "warning": "Cats losing weight too rapidly, or subjected to aggressive caloric restriction, are at risk of hepatic lipidosis (fatty liver syndrome) and loss of lean muscle mass.",
   "quotes": [
    {
     "quote": "Rapid weight loss is not a good thing, as it can lead to loss of lean muscle and can put your cat at risk of severe liver disease (hepatic lipidosis or fatty liver syndrome).",
     "source": "VCA Animal Hospitals, Creating a Weight Reduction Plan for Cats",
     "sourceUrl": "https://vcahospitals.com/know-your-pet/creating-a-weight-reduction-plan-for-cats"
    },
    {
     "quote": "More aggressive caloric restriction (<60% RER) increases the risk of ... Cats may also have increased risk of hepatic lipidosis.",
     "source": "AAHA 2014 Weight Management Guidelines for Dogs and Cats",
     "sourceUrl": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/2014-AAHA-Weight-Management-Guidelines-for-Dogs-and-Cats"
    }
   ],
   "practicalFloor": "Do not restrict below 60% of RER in cats (AAHA). Target intake for weight loss is 80% of ideal-weight RER."
  },
  "calorieBasis": {
   "formula": "RER in kcal/day = 70 x (ideal BWkg)^0.75; feed 80% of ideal-weight RER",
   "quote": "RER in kcal/day = 70 x (ideal BWkg)0.75 ... Feeding 80% of ideal-weight RER is effective and well tolerated.",
   "source": "AAHA, Tip Sheet: Calculating a Pet's Caloric Intake for Weight Management",
   "sourceUrl": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/Weight-Management-Tip-Sheet",
   "empiricalData": "Recent data suggest mean caloric intake for weight loss over a 12 week period is 63 +/- 10.2 kcal/kg0.75 in dogs and 52 +/- 4.9 kcal/kg0.711 in cats.",
   "empiricalSourceUrl": "https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/weight-reduction-in-the-obese-pet/"
  },
  "treatsDuringWeightLoss": {
   "quote": "A typical rule is that 10% of calories can come from treats and 90% should come from the food.",
   "source": "VCA Animal Hospitals, Creating a Weight Reduction Plan for Dogs / for Cats",
   "sourceUrl": "https://vcahospitals.com/know-your-pet/creating-a-weight-reduction-plan-for-dogs"
  }
 },
 "transition": {
  "standardSchedule": "Gradual change over 7-10 days (WSAVA); VCA describes a 7-14 day transition stepping the new food up by about 10% per day.",
  "days": "7-10 (WSAVA); 7-14 (VCA)",
  "quotes": [
   {
    "quote": "Some animals tolerate an abrupt change in diet with little problem although some appear to have fewer gastrointestinal issues if food is gradually changed over a 7-10 day period.",
    "source": "WSAVA Global Nutrition Committee, Nutritional Assessment Guidelines (JSAP 2011)",
    "sourceUrl": "https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf"
   },
   {
    "quote": "on day one, feed your pet 90% puppy or kitten food and 10% adult food. On day two, give your pet 80% puppy or kitten food and 20% adult food, and so on.",
    "source": "VCA Animal Hospitals, Everything you need to know about switching your pet to adult wellness food",
    "sourceUrl": "https://vcahospitals.com/resources/preventive-dog/nutrition/everything-you-need-to-know-about-switching-your-pet-to-adult-wellness-food",
    "note": "VCA frames this as a 7 to 14 day transition period, incrementing the new food by roughly 10% of the ration per day."
   }
  ],
  "quarterStepSchedule": "DATA NOT VERIFIED. The commonly cited stepwise schedule (days 1-3 = 25% new / 75% old, days 4-6 = 50/50, days 7-9 = 75% new / 25% old, day 10 = 100% new) was not found verbatim on any authoritative page fetched. WSAVA states only the 7-10 day duration; VCA describes a 10%-per-day linear ramp over 7-14 days."
 },
 "homeCooked": {
  "warning": "The large majority of home-prepared maintenance diet recipes for dogs available to the public are nutritionally incomplete.",
  "headlineFigures": {
   "recipesEvaluated": 200,
   "sourcesOfRecipes": 34,
   "percentDeficientInAtLeastOneNutrient": 95,
   "percentWithMultipleDeficiencies": 83,
   "recipesMeetingMinimumStandards": 9,
   "recipesMeetingNrcRequirements": 5
  },
  "quote": "95 percent of the 200 recipes examined resulted in food that was lacking in the necessary levels of at least one essential nutrient, and more than 83 percent of the recipes had multiple nutrient deficiencies.",
  "recipeSourcesQuote": "200 recipes from 34 different sources, including veterinary textbooks, pet care books and web sites.",
  "authors": "Jennifer Larsen, Jonathan Stockman, Andrea Fascetti, Philip Kass (UC Davis School of Veterinary Medicine)",
  "citation": "Stockman J, Fascetti AJ, Kass PH, Larsen JA. Evaluation of recipes of home-prepared maintenance diets for dogs. Journal of the American Veterinary Medical Association, June 2013. Reported by UC Davis, 15 July 2013.",
  "journalQuote": "Findings from the study appear in the June issue of the Journal of the American Veterinary Medical Association.",
  "source": "UC Davis Center for Companion Animal Health / UC Davis News - 'Homemade dog food recipes can be risky business, study finds', July 15, 2013",
  "sourceUrl": "https://ccah.vetmed.ucdavis.edu/sites/g/files/dgvnsk4586/files/local_resources/pdfs/Homemade_dog_food_recipes_July-15-2013_UCD-News.pdf",
  "supportingWarning": {
   "quote": "it is not enough to just feed a diet of table scraps or to toss some meat, grains, and vegetables into a bowl for your pet. Feeding this type of unbalanced diet over time could result in your pet becoming malnourished. ... The most common imbalances in home-prepared diets involve calcium, phosphorus, zinc, magnesium, and iron.",
   "source": "VCA Animal Hospitals, Nutrition - Home Made Diets",
   "sourceUrl": "https://vcahospitals.com/know-your-pet/nutrition---home-made-diets",
   "note": "VCA gives the qualitative warning and the specific minerals most often imbalanced, but cites no study or prevalence figures."
  }
 },
 "unverified": [
  {
   "item": "Weight gain factor (dogs and cats), commonly cited as 1.2-1.8 x RER",
   "status": "DATA NOT VERIFIED",
   "whatWasFound": "No authoritative source fetched lists a weight-gain multiplier. Merck's MER table has no weight-gain row; AAHA 2021/2014 give weight-loss factors only."
  },
  {
   "item": "Active/working dog factor, commonly cited as 2.0-5.0 x RER",
   "status": "DATA NOT VERIFIED",
   "whatWasFound": "WSAVA (NRC 2006) gives absolute equations instead: active adult dog 130 kcal x BWkg^0.75 vs inactive adult 95 kcal x BWkg^0.75. FEDIAF gives 95 vs 110 kcal/kg^0.75. VCA explicitly declines a multiplier for working dogs."
  },
  {
   "item": "Feline polydipsia threshold, commonly cited as >45 mL/kg/day",
   "status": "DATA NOT VERIFIED",
   "whatWasFound": "Cornell Feline Health Center gives normal cat intake (4 oz per 5 lb lean BW/day, approx 52 mL/kg/day) but no excess threshold. Merck's diabetes insipidus and renal dysfunction pages give no feline mL/kg/day polydipsia cutoff. The verified canine threshold is >100 mL/kg/day (Cornell Riney)."
  },
  {
   "item": "Puppy meal frequency by age band (6-12 wk = 4/day, 3-6 mo = 3/day, 6-12 mo = 2/day)",
   "status": "DATA NOT VERIFIED",
   "whatWasFound": "VCA gives only aggregate guidance: 3-4 meals/day for young puppies, and 2-3 meals/day generally. VCA's dedicated feeding-frequency page provides no age-specific breakdown."
  },
  {
   "item": "Food transition 25/50/75% stepwise schedule",
   "status": "DATA NOT VERIFIED",
   "whatWasFound": "WSAVA confirms the 7-10 day duration only. VCA describes a 7-14 day transition incrementing new food by about 10% of the ration per day (day 1 = 10% new, day 2 = 20% new, and so on)."
  },
  {
   "item": "Gestation factor as a multiple of RER",
   "status": "PARTIAL",
   "whatWasFound": "VCA gives 30-60% above adult maintenance after day 40 (approx 1.3-1.6 x maintenance), not a multiple of RER."
  },
  {
   "item": "AAHA 2021 Box 1 full life-stage factor table",
   "status": "PARTIALLY EXTRACTED",
   "whatWasFound": "Box 1 is published as a figure. Only the weight-loss factors (dogs 1.0, cats 0.8) were recoverable via the Weight Reduction in the Obese Pet page text."
  }
 ],
 "sources": [
  {
   "id": "merck-nutrition-req",
   "name": "Merck Veterinary Manual - Nutritional Requirements of Small Animals",
   "url": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals",
   "usedFor": [
    "rer-exponential",
    "rer-linear",
    "water-general",
    "wet-food-effect"
   ]
  },
  {
   "id": "merck-mer-table",
   "name": "Merck Veterinary Manual - Table: Daily Maintenance Energy Requirements for Dogs and Cats",
   "url": "https://www.merckvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats",
   "usedFor": [
    "dogFactors",
    "catFactors"
   ]
  },
  {
   "id": "merck-urine-table",
   "name": "Merck Veterinary Manual - Table: Urine Volume and Specific Gravity",
   "url": "https://www.merckvetmanual.com/multimedia/table/urine-volume-and-specific-gravity",
   "usedFor": [
    "water-urine-reference"
   ]
  },
  {
   "id": "wsava-nutrition-assessment-2011",
   "name": "WSAVA Global Nutrition Committee - Nutritional Assessment Guidelines (JSAP 2011)",
   "url": "https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf",
   "usedFor": [
    "bcs-ideal",
    "treats-10pct-risk-factor",
    "transition-7-10-days"
   ]
  },
  {
   "id": "wsava-toolkit",
   "name": "WSAVA Global Nutrition Toolkit (English)",
   "url": "https://wsava.org/wp-content/uploads/2022/11/WSAVA-Global-Nutrition-Toolkit-English.pdf",
   "usedFor": [
    "index-of-tools"
   ]
  },
  {
   "id": "wsava-cal-dogs",
   "name": "WSAVA - Calorie Needs for Healthy Adult Dogs (updated July 2020)",
   "url": "https://wsava.org/wp-content/uploads/2020/07/Calorie-Needs-for-Healthy-Adult-Dogs-updated-July-2020.pdf",
   "usedFor": [
    "nrc-2006-dog-equations",
    "active-vs-inactive"
   ]
  },
  {
   "id": "wsava-cal-cats",
   "name": "WSAVA - Calorie Needs for Healthy Adult Cats (updated July 2020)",
   "url": "https://wsava.org/wp-content/uploads/2020/07/Calorie-Needs-for-Healthy-Adult-Cats-updated-July-2020.pdf",
   "usedFor": [
    "nrc-2006-cat-equations"
   ]
  },
  {
   "id": "wsava-bcs-dog",
   "name": "WSAVA Body Condition Score Chart - Dog",
   "url": "https://wsava.org/wp-content/uploads/2020/01/Body-Condition-Score-Dog.pdf",
   "usedFor": [
    "bcs-dog-9-point"
   ]
  },
  {
   "id": "wsava-bcs-cat",
   "name": "WSAVA Body Condition Score Chart - Cat (2017)",
   "url": "https://wsava.org/wp-content/uploads/2020/01/Cat-Body-Condition-Scoring-2017.pdf",
   "usedFor": [
    "bcs-cat-9-point"
   ]
  },
  {
   "id": "aaha-2021-weight-reduction",
   "name": "AAHA 2021 Nutrition and Weight Management Guidelines - Weight Reduction in the Obese Pet",
   "url": "https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/weight-reduction-in-the-obese-pet/",
   "usedFor": [
    "weight-loss-factors",
    "ideal-weight-basis"
   ]
  },
  {
   "id": "aaha-weight-tip-sheet",
   "name": "AAHA - Tip Sheet: Calculating a Pet's Caloric Intake for Weight Management",
   "url": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/Weight-Management-Tip-Sheet",
   "usedFor": [
    "rer-ideal-bw",
    "80-percent-rer"
   ]
  },
  {
   "id": "aaha-2014-weight",
   "name": "AAHA 2014 Weight Management Guidelines for Dogs and Cats",
   "url": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/2014-AAHA-Weight-Management-Guidelines-for-Dogs-and-Cats",
   "usedFor": [
    "safe-weight-loss-rate",
    "bcs-10-percent-rule",
    "hepatic-lipidosis"
   ]
  },
  {
   "id": "aaha-2021-pdf",
   "name": "AAHA 2021 Nutrition and Weight Management Guidelines (full PDF)",
   "url": "https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/2021-nutrition-and-weight-management/resourcepdfs/new-2021-aaha-nutrition-and-weight-management-guidelines-with-ref.pdf",
   "usedFor": [
    "context"
   ],
   "note": "Box 1 (life stage and activity factor table) is rendered as a figure and its numeric contents could not be extracted by text fetch."
  },
  {
   "id": "ucd-treats",
   "name": "UC Davis VMTH Nutrition Support Service - Treat Guidelines for Dogs (2020)",
   "url": "https://www.vetmed.ucdavis.edu/sites/g/files/dgvnsk491/files/inline-files/treats-guidelines-for-dogs-2020.pdf",
   "usedFor": [
    "treats-10-percent"
   ]
  },
  {
   "id": "ucd-homemade",
   "name": "UC Davis News - Homemade dog food recipes can be risky business, study finds (July 15, 2013)",
   "url": "https://ccah.vetmed.ucdavis.edu/sites/g/files/dgvnsk4586/files/local_resources/pdfs/Homemade_dog_food_recipes_July-15-2013_UCD-News.pdf",
   "usedFor": [
    "home-cooked-warning"
   ]
  },
  {
   "id": "osu-nutrition",
   "name": "Ohio State University Veterinary Medical Center - Companion Animal Nutrition Support Service",
   "url": "https://vmc.vet.osu.edu/services/companion-animal-nutrition-support-service",
   "usedFor": [
    "rer-worked-example"
   ],
   "note": "Table 1 of RER multiplier factors is an image and could not be extracted by text fetch."
  },
  {
   "id": "cornell-hydration",
   "name": "Cornell Feline Health Center - Hydration",
   "url": "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hydration",
   "usedFor": [
    "cat-water-intake",
    "wet-food-effect"
   ]
  },
  {
   "id": "cornell-feeding-frequency",
   "name": "Cornell Feline Health Center - How often should you feed your cat?",
   "url": "https://www.vet.cornell.edu/departments/cornell-feline-health-center/health-information/feline-health-topics/how-often-should-you-feed-your-cat",
   "usedFor": [
    "cat-meal-frequency",
    "kitten-meal-frequency"
   ]
  },
  {
   "id": "cornell-riney-pupd",
   "name": "Cornell Richard P. Riney Canine Health Center - Canine Polyuria and Polydipsia (PU/PD), April 2024",
   "url": "https://riney.vet.cornell.edu/member-benefits-health-tips/polyuria-polydipsia-april-2024",
   "usedFor": [
    "dog-water-intake",
    "dog-polydipsia-threshold"
   ]
  },
  {
   "id": "vca-weight-dogs",
   "name": "VCA Animal Hospitals - Creating a Weight Reduction Plan for Dogs",
   "url": "https://vcahospitals.com/know-your-pet/creating-a-weight-reduction-plan-for-dogs",
   "usedFor": [
    "dog-weight-loss-rate",
    "treats-10-percent"
   ]
  },
  {
   "id": "vca-weight-cats",
   "name": "VCA Animal Hospitals - Creating a Weight Reduction Plan for Cats",
   "url": "https://vcahospitals.com/know-your-pet/creating-a-weight-reduction-plan-for-cats",
   "usedFor": [
    "cat-weight-loss-rate",
    "hepatic-lipidosis",
    "treats-10-percent"
   ]
  },
  {
   "id": "vca-feeding-times-dog",
   "name": "VCA Animal Hospitals - Feeding Times and Frequency for Your Dog",
   "url": "https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-your-dog",
   "usedFor": [
    "dog-meal-frequency",
    "puppy-meal-frequency"
   ]
  },
  {
   "id": "vca-feeding-times-cat",
   "name": "VCA Animal Hospitals - Feeding Times and Frequency for Your Cat",
   "url": "https://vcahospitals.com/know-your-pet/feeding-times-and-frequency-for-cats",
   "usedFor": [
    "cat-meal-frequency",
    "free-feeding"
   ]
  },
  {
   "id": "vca-young-adult-dog",
   "name": "VCA Animal Hospitals - Feeding Your Young Adult Dog",
   "url": "https://vcahospitals.com/know-your-pet/feeding-your-young-adult-dog",
   "usedFor": [
    "dog-meal-frequency",
    "water-wet-food"
   ]
  },
  {
   "id": "vca-general-dog",
   "name": "VCA Animal Hospitals - Nutrition: General Feeding Guidelines for Dogs",
   "url": "https://vcahospitals.com/know-your-pet/nutrition-general-feeding-guidelines-for-dogs",
   "usedFor": [
    "dog-meal-frequency"
   ]
  },
  {
   "id": "vca-growing-puppies",
   "name": "VCA Animal Hospitals - Feeding Growing Puppies",
   "url": "https://vcahospitals.com/know-your-pet/feeding-growing-puppies",
   "usedFor": [
    "puppy-meal-frequency"
   ]
  },
  {
   "id": "vca-puppy-how-much",
   "name": "VCA Animal Hospitals - How Much Food Should I Feed My Puppy",
   "url": "https://vcahospitals.com/pediatric/puppy/nutrition/how-much-to-feed-your-puppy",
   "usedFor": [
    "puppy-meal-frequency",
    "treats-10-percent"
   ]
  },
  {
   "id": "vca-pregnant-dog",
   "name": "VCA Animal Hospitals - Feeding the Pregnant Dog",
   "url": "https://vcahospitals.com/know-your-pet/feeding-the-pregnant-dog",
   "usedFor": [
    "gestation-energy"
   ]
  },
  {
   "id": "vca-nursing-dog",
   "name": "VCA Animal Hospitals - Feeding the Nursing Dog",
   "url": "https://vcahospitals.com/know-your-pet/feeding-the-nursing-dog",
   "usedFor": [
    "lactation-energy"
   ]
  },
  {
   "id": "vca-working-dogs",
   "name": "VCA Animal Hospitals - Nutrition for Working and Service Dogs",
   "url": "https://vcahospitals.com/know-your-pet/nutrition-for-working-and-service-dogs",
   "usedFor": [
    "working-dog-energy-nonspecific"
   ]
  },
  {
   "id": "vca-switch-food",
   "name": "VCA Animal Hospitals - Everything you need to know about switching your pet to adult wellness food",
   "url": "https://vcahospitals.com/resources/preventive-dog/nutrition/everything-you-need-to-know-about-switching-your-pet-to-adult-wellness-food",
   "usedFor": [
    "transition-schedule"
   ]
  },
  {
   "id": "vca-homemade",
   "name": "VCA Animal Hospitals - Nutrition: Home Made Diets",
   "url": "https://vcahospitals.com/know-your-pet/nutrition---home-made-diets",
   "usedFor": [
    "home-cooked-warning-qualitative"
   ]
  },
  {
   "id": "fediaf-2021",
   "name": "FEDIAF Nutritional Guidelines (October 2021)",
   "url": "https://europeanpetfood.org/wp-content/uploads/2022/03/Updated-Nutritional-Guidelines.pdf",
   "usedFor": [
    "energy-basis-dogs-cats"
   ]
  }
 ]
} as const;

export interface Citation { source: string; url: string; quote?: string | null }
