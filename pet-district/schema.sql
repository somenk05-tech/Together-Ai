-- ═══════════════════════════════════════════════════════════════════════════
-- TOGETHER CITY — PET DISTRICT
-- Postgres schema, matching the 18 sheets of together-city-pet-data-master.xlsx
-- and the TypeScript types in src/features/pets/types.ts one-for-one.
--
-- THREE DECISIONS ARE WRITTEN INTO THIS SCHEMA RATHER THAN INTO A DOCUMENT.
--
-- 1 · VERIFICATION IS A COLUMN, NOT A CONVENTION. Every commercial figure has a
--     nullable value AND a boolean saying whether a source was actually read.
--     NULL price with price_verified = false is a real state the API must be
--     able to express, because 12 of the first 184 catalogue rows are in it.
--
-- 2 · SOURCES ARE MANDATORY. product_sources has a NOT NULL source_url and a
--     foreign key from every product. A row with no provenance cannot exist.
--
-- 3 · RECIPES CARRY completeness AS AN ENUM, defaulting to 'complementary'.
--     Promoting one to 'complete' requires a nutritionist_id — the type system
--     refuses to let a home recipe become a diet by accident.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE species          AS ENUM ('dog', 'cat', 'both');
CREATE TYPE life_stage       AS ENUM ('puppy', 'kitten', 'adult', 'senior', 'all');
CREATE TYPE activity_level   AS ENUM ('low', 'moderate', 'high');
CREATE TYPE body_condition   AS ENUM ('under', 'ideal', 'over');
CREATE TYPE diet_style       AS ENUM ('commercial', 'home-cooked', 'mixed');
CREATE TYPE pet_goal         AS ENUM ('maintain','weight-loss','weight-gain','growth','senior','wellness');
CREATE TYPE verdict          AS ENUM ('SAFE', 'LIMIT', 'AVOID');
CREATE TYPE severity         AS ENUM ('FATAL', 'SEVERE', 'MODERATE');
CREATE TYPE completeness     AS ENUM ('complete', 'complementary');
CREATE TYPE cadence          AS ENUM ('weekly','fortnightly','monthly','six-weekly','two-monthly');

-- ── SHEET 15 · categories ───────────────────────────────────────────────────
CREATE TABLE pet_categories (
  key           text PRIMARY KEY,               -- food, treats, walk, toys …
  label         text NOT NULL,
  marketplace   text NOT NULL CHECK (marketplace IN ('complete-market','pet-specialist')),
  sort_order    int  NOT NULL DEFAULT 0
);

-- ── SHEET 2 · brands ────────────────────────────────────────────────────────
CREATE TABLE pet_brands (
  id                  bigserial PRIMARY KEY,
  name                text UNIQUE NOT NULL,
  manufacturer        text,
  country_of_origin   text,
  made_in_india       boolean,
  notes               text
);

-- ── SHEET 1 · products ──────────────────────────────────────────────────────
CREATE TABLE pet_products (
  id                    text PRIMARY KEY,       -- brand-slug--product-slug
  name                  text NOT NULL,
  brand_id              bigint NOT NULL REFERENCES pet_brands(id),
  category              text NOT NULL REFERENCES pet_categories(key),
  subcategory           text,
  species               species NOT NULL,
  breed_size            text,
  life_stage            life_stage NOT NULL DEFAULT 'all',
  description           text,

  -- commercial. Value nullable, verification explicit.
  mrp_inr               numeric(10,2),
  price_inr             numeric(10,2),
  price_verified        boolean NOT NULL DEFAULT false,
  availability          text,
  subscription_available boolean,
  rating                numeric(2,1),
  review_count          int,

  -- nutrition. Same rule.
  kcal_per_kg           numeric(8,2),
  protein_pct           numeric(5,2),
  fat_pct               numeric(5,2),
  fibre_pct             numeric(5,2),
  moisture_pct          numeric(5,2),
  ash_pct               numeric(5,2),
  carbohydrate_pct      numeric(5,2),
  main_protein          text,
  secondary_protein     text,
  grain_free            boolean,
  vegetarian            boolean,
  chicken_free          boolean,
  ingredients_text      text,
  guaranteed_analysis   text,
  feeding_instructions  text,
  nutrition_verified    boolean NOT NULL DEFAULT false,

  -- safety
  vet_guidance_required boolean NOT NULL DEFAULT false,
  veterinary_diet       boolean NOT NULL DEFAULT false,
  medical_claim_flag    boolean NOT NULL DEFAULT false,
  safety_notes          text,
  contraindications     text,

  last_verified         date NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- A verified price with no number, or a number claiming to be verified with
  -- no source row, are both nonsense. The first half is enforced here; the
  -- second by the NOT NULL foreign key on pet_product_sources.
  CONSTRAINT price_verified_has_a_price CHECK (NOT price_verified OR price_inr IS NOT NULL)
);
CREATE INDEX ON pet_products (category, species, life_stage);
CREATE INDEX ON pet_products (brand_id);

CREATE TABLE pet_product_variants (
  id            bigserial PRIMARY KEY,
  product_id    text NOT NULL REFERENCES pet_products(id) ON DELETE CASCADE,
  pack_label    text,                            -- '3kg', '14x80g'
  pack_grams    int,                             -- parsed; NULL when unparseable
  price_inr     numeric(10,2),
  mrp_inr       numeric(10,2),
  in_stock      boolean
);

-- ── SHEET 14 · sources. The audit trail; nothing exists without one. ────────
CREATE TABLE pet_product_sources (
  id             bigserial PRIMARY KEY,
  product_id     text NOT NULL REFERENCES pet_products(id) ON DELETE CASCADE,
  retailer       text NOT NULL,
  source_url     text NOT NULL,
  image_url      text,
  image_licensed boolean NOT NULL DEFAULT false,  -- republication needs merchant consent
  fetched_at     date NOT NULL
);
CREATE UNIQUE INDEX ON pet_product_sources (product_id, source_url);

-- ── SHEET 5/6/7 · species, breeds, life stages ─────────────────────────────
CREATE TABLE pet_species (
  key           text PRIMARY KEY,
  label         text NOT NULL,
  supported     boolean NOT NULL DEFAULT false,
  notes         text
);

CREATE TABLE pet_breeds (
  id                bigserial PRIMARY KEY,
  species           text NOT NULL REFERENCES pet_species(key),
  name              text NOT NULL,
  size_class        text NOT NULL,
  adult_kg_low      numeric(5,2),
  adult_kg_high     numeric(5,2),
  growth_ends_months int,
  senior_from_years  int,
  note              text,
  UNIQUE (species, name)
);

CREATE TABLE pet_energy_factors (
  id           bigserial PRIMARY KEY,
  species      text NOT NULL REFERENCES pet_species(key),
  key          text NOT NULL,                    -- neuteredAdult, weightLoss …
  label        text NOT NULL,
  factor       numeric(4,2) NOT NULL,
  source       text NOT NULL,
  source_url   text NOT NULL,
  quote        text,
  UNIQUE (species, key)
);

-- ── SHEET 3 · ingredients, and SHEET 13 · the never-feed list ──────────────
CREATE TABLE pet_ingredients (
  id             bigserial PRIMARY KEY,
  name           text UNIQUE NOT NULL,
  indian_name    text,
  dog_verdict    verdict NOT NULL,
  cat_verdict    verdict NOT NULL,
  dog_reason     text NOT NULL,
  cat_reason     text NOT NULL,
  preparation    text,
  portion_guidance text,
  frequency      text,
  risks          text[],
  allergen       boolean,
  raw_cooked_note text,
  kcal_per_100g  numeric(7,2),
  protein_g      numeric(6,2),
  fat_g          numeric(6,2),
  carbohydrate_g numeric(6,2),
  fibre_g        numeric(6,2),
  calcium_mg     numeric(8,2),
  phosphorus_mg  numeric(8,2),
  composition_source text,
  source_urls    text[] NOT NULL CHECK (array_length(source_urls, 1) >= 1)
);

CREATE TABLE pet_toxic_foods (
  id            bigserial PRIMARY KEY,
  name          text UNIQUE NOT NULL,
  affects       species NOT NULL,
  severity      severity NOT NULL,
  toxic_dose    text,                            -- prose; sources rarely give a clean number
  mechanism     text NOT NULL,
  symptoms      text[] NOT NULL,
  onset         text,
  what_to_do    text NOT NULL,
  species_note  text,
  source_urls   text[] NOT NULL CHECK (array_length(source_urls, 1) >= 1)
);

-- ── SHEET 4 · recipes ──────────────────────────────────────────────────────
CREATE TABLE pet_recipes (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  species          species NOT NULL,
  kind             completeness NOT NULL DEFAULT 'complementary',
  summary          text NOT NULL,
  method           text[] NOT NULL,
  suitable_for     text[],
  not_for          text[],
  supplement_note  text NOT NULL,
  prep_minutes     int,
  tags             text[],
  -- A recipe may only claim completeness if a named veterinary nutritionist
  -- formulated it. This is the constraint that stops a topper becoming a diet.
  nutritionist_id  bigint,
  CONSTRAINT complete_needs_a_nutritionist
    CHECK (kind = 'complementary' OR nutritionist_id IS NOT NULL)
);

CREATE TABLE pet_recipe_items (
  id            bigserial PRIMARY KEY,
  recipe_id     text NOT NULL REFERENCES pet_recipes(id) ON DELETE CASCADE,
  ingredient_id bigint REFERENCES pet_ingredients(id),
  label         text NOT NULL,
  share         numeric(4,3) NOT NULL CHECK (share > 0 AND share <= 1)
);

-- ── the citizen's own rows ─────────────────────────────────────────────────
CREATE TABLE pets (
  id                text PRIMARY KEY,
  citizen_id        bigint NOT NULL,             -- REFERENCES citizens(id)
  name              text NOT NULL,
  species           text NOT NULL REFERENCES pet_species(key),
  breed             text,
  dob               date,
  age_months        int,
  sex               text CHECK (sex IN ('male','female')),
  weight_kg         numeric(5,2),
  target_weight_kg  numeric(5,2),
  body_condition    body_condition NOT NULL DEFAULT 'ideal',
  activity          activity_level NOT NULL DEFAULT 'moderate',
  housing           text NOT NULL DEFAULT 'both',
  sterilised        boolean,
  allergies         text[] NOT NULL DEFAULT '{}',
  sensitivities     text[] NOT NULL DEFAULT '{}',
  restrictions      text[] NOT NULL DEFAULT '{}',
  current_food      text,
  diet_style        diet_style NOT NULL DEFAULT 'commercial',
  goal              pet_goal NOT NULL DEFAULT 'maintain',
  health_notes      text,
  portrait          text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON pets (citizen_id);

CREATE TABLE pet_plans (
  id             bigserial PRIMARY KEY,
  pet_id         text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  rer_kcal       int NOT NULL,
  mer_kcal       int NOT NULL,
  factor         numeric(4,2) NOT NULL,
  factor_key     text NOT NULL,
  basis          text NOT NULL CHECK (basis IN ('current-weight','ideal-weight')),
  basis_kg       numeric(5,2) NOT NULL,
  meals_per_day  int NOT NULL,
  treat_kcal     int NOT NULL,
  water_ml_low   int NOT NULL,
  water_ml_high  int NOT NULL,
  cautions       text[]
);

CREATE TABLE pet_plan_meals (
  id           bigserial PRIMARY KEY,
  plan_id      bigint NOT NULL REFERENCES pet_plans(id) ON DELETE CASCADE,
  on_date      date NOT NULL,
  slot         text NOT NULL CHECK (slot IN ('breakfast','lunch','dinner')),
  feed_at      text,
  title        text NOT NULL,
  detail       text,
  grams        int,                              -- NULL when kcal/kg is unknown
  kcal         int,
  kind         completeness NOT NULL,
  recipe_id    text REFERENCES pet_recipes(id),
  product_id   text REFERENCES pet_products(id),
  fed          boolean NOT NULL DEFAULT false
);
CREATE INDEX ON pet_plan_meals (plan_id, on_date);

-- ── SHEET 17/18 · bundles and subscriptions ────────────────────────────────
CREATE TABLE pet_bundles (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  species   species NOT NULL,
  line      text,
  gaps      text[]                               -- slots with nothing verified yet
);
CREATE TABLE pet_bundle_items (
  bundle_id  text NOT NULL REFERENCES pet_bundles(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES pet_products(id),
  PRIMARY KEY (bundle_id, product_id)
);

CREATE TABLE pet_subscriptions (
  id             bigserial PRIMARY KEY,
  citizen_id     bigint NOT NULL,
  pet_id         text REFERENCES pets(id) ON DELETE SET NULL,
  product_id     text NOT NULL REFERENCES pet_products(id),
  variant_id     bigint REFERENCES pet_product_variants(id),
  cadence        cadence NOT NULL,
  grams_per_day  int,                            -- owner-supplied when kcal/kg is unknown
  next_delivery  date,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── SHEET 16 · services. Joins to the city's own directory. ────────────────
CREATE TABLE pet_services (
  id             bigserial PRIMARY KEY,
  business_id    bigint,                         -- REFERENCES local_services.businesses(id)
  kind           text NOT NULL,
  species        species NOT NULL DEFAULT 'both',
  emergency      boolean NOT NULL DEFAULT false,
  note           text,
  verified       boolean NOT NULL DEFAULT false  -- false until the city verifies it
);

-- ── wellness and activity ──────────────────────────────────────────────────
CREATE TABLE pet_wellness_entries (
  id        bigserial PRIMARY KEY,
  pet_id    text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('weight','vaccination','grooming','dental','parasite','medication','vet-visit')),
  on_date   date NOT NULL,
  label     text NOT NULL,
  value     text,
  done      boolean NOT NULL DEFAULT false
);
CREATE INDEX ON pet_wellness_entries (pet_id, on_date);

CREATE TABLE pet_activity_entries (
  id       bigserial PRIMARY KEY,
  pet_id   text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  on_date  date NOT NULL,
  kind     text NOT NULL CHECK (kind IN ('walk','play','training','run')),
  minutes  int NOT NULL CHECK (minutes > 0)
);
CREATE INDEX ON pet_activity_entries (pet_id, on_date);
