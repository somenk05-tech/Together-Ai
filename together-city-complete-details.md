# Together City — Complete Website Details

Everything we built, hub by hub and page by page. This is the full inventory of the
14-hub app: every screen, the platform-wide features that tie the hubs together, and the
visual identity. (The actual working code for all of this is in the two zip files already
delivered — `together-city-react-source.zip` and `together-city-api-source.zip`. This
document is the human-readable map of what's inside them, and it doubles as the complete
build spec for Emergent.)

---

## The homepage — the "city"

Together City opens as an illustrated **pavilion city**: a map with clickable building
districts, one per hub. Below it, a "Walk the districts" grid of cards leads into each hub,
and a trust strip runs along the bottom. The whole product is framed as walking through a
city where each district is a part of life.

**Top navigation (every page):** the 12 hub tabs, plus three action buttons — **Mail**,
**Chat**, and your **Profile** (shows your first name).

---

## The 14 hubs

### 1. Travel — *"Explore. Dream. Discover. Together."*
- **Explore Trips** — curated travel packages
- **Flights** — compare fares & book
- **Trains** — rail across India
- **Hotels** — find the perfect stay
- **Packages** — curated experiences
- **Visa Services** — three steps, zero stress
- **Travel Insurance** — covered wherever you go
- **Travel Guide** — editorial guides & tips
- **Connect Friends** — groups & shared trips
- **My Trips** — your bookings & tickets
- *Booking flow:* search results → trip detail → checkout → confirmation

### 2. Restaurants — *"Exceptional dining, curated for you."*
- **Discover** — browse by cuisine & diet
- **Find a Meal** — nutrition-aware ordering (ties into your Nutrition profile)
- **Explore** — curated places near you
- **Book a Table** — reserve tonight
- **Food Scanner** — meal calculator
- **Cheat Meals** — what's inside today's calorie buffer
- **Favourites** — saved places
- **My Reviews** — your ratings
- **Reservations** — your table bookings
- **My Orders** — food orders & wallet
- *Order flow:* checkout → confirm → order tracking

### 3. Nutrition — *"Eat healthy, live better."*
- **Connect with Blood Test** — personalise meals from your lab results
- **Food Preference Profile** — your taste & goals
- **Weekly Meal Planner** — a personalised 7-day plan
- **Daily Meal Planner** — today's plate
- **Grocery Store** — pre-filled from your plan
- **My Health Profile** — tracker, macros & journal
- **My Orders** — deliveries & wallet
- **Recipes** — a 12,976-recipe world database
- **Supplements** — a goal-matched kit
- **Expert Care** — talk to a dietitian
- *Onboarding flow:* goals → health profile → cart → checkout → confirm

#### 3b. Family Nutrition (sub-hub) — *"One table, every plate personal."*
- **Family Home** — everyone on one dashboard
- **Connect Members** — link family, set roles & permissions
- **Weekly Planner** — seven days, portioned per member
- **Daily Planner** — today's plate for every member
- **Grocery Store** — one combined basket, no duplicates
- **Cart** — review & checkout
- **My Orders** — family-wide deliveries & spend
- **Search by Ingredients** — cook from what's already in the kitchen
- *Meals re-portion automatically as members are added, removed, or set inactive.*

### 4. Entertainment — *"Always something worth experiencing."*
- **Discover** — what's on in your city
- **Movies Now** — in theatres this week
- **OTT Watch** — stream tonight
- **Curated Movies** — indie, pay-per-view
- **Events** — live experiences
- **Comedy Club** — live laughs
- **Sports** — scores, tickets & watch parties
- **Others** — nightlife, gaming & more
- **My Tickets** — your booked passes
- *Booking flow:* showtime → seat selection → checkout

### 5. Social Life — *"Discover everything around you."*
- **City Feed** — moments from around you
- **Explore** — nearby activities & communities
- **Circles** — your communities
- **Create Post** — share a photo, video or plan
- **City Map** — outdoor posts pinned nearby
- **Messages** — direct conversations
- **Notifications** — likes, comments & mentions
- **My Profile** — story, stats & "Post & Earn"
- **Saved** — bookmarked posts & places

### 6. Dating — *"Curated, not endless."*
- **My Dating Profile** — birth details & interests
- **Curated Matches** — only real matches, 75%+ compatibility
- **Activity Dating** — meet by doing, not swiping
- **Friends** — your connections
- *Plus:* in-app chat and a detailed match view

### 7. Real Estate — *"Find where life happens next."*
- **Explore** — discover & book a viewing
- **Buy & Rent** — ready-to-move homes
- **Under Construction** — plans, RERA status & build progress
- **List a Property** — multi-property, live photos
- **Post a Property** — camera photos required (anti-fraud)
- **My Listings** — your posted properties
- *Plus:* a full property detail page

### 8. Jobs — *"Upload once. We do the rest."*
- **Resume & Profile** — upload once, we parse it
- **Matched Roles** — ranked by fit
- **My Applications** — track your applies
- **Post a Job** — for employers
- **My Postings** — see your applicants

### 9. Medical — *"Your health, one secure place."*
- **Blood Test Analysis** — cited, trend-aware panel
- **Order Blood Tests** — 5,000+ tests, home collection
- **Health Records** — conditions, reports, allergies
- **Talk to a Doctor** — a connection-gated consult
- **Book Appointment** — confirm your consult slot
- **Health Timeline** — your longitudinal history
- **Family Profiles** — records, allergies & reminders
- **Health Insurance** — compare, buy & manage
- **Emergency** — one-tap SOS & medical ID
- **Supplement Plan** — from your labs & goal
- **Connections** — who can read your data
- **Privacy & Consent** — consent controls
- *Medical is the source of truth for health data; other hubs (Nutrition, Beauty, Fitness) read it only through the consent gate.*

### 10. Financial District — *"One city wallet, live today."*
- **City Wallet** — balance & top-up
- **Spending** — where your money goes
- **Budgets** — caps that track live
- **Payments** — bills, EMIs & rent
- **Transactions** — every hub, one feed
- *One wallet is charged by every commerce hub in the city.*

### 11. Beauty Market — *"Science-led, personally curated."*
- **Skin & Hair Profile** — your type, goals & concerns
- **Biomarker Insights** — what your labs say for skin & hair
- **Beauty Market** — curated products, matched to you
- **Consult a Dermatologist** — certified derms, video or clinic
- **Makeup Studio** — matched picks, to your budget
- **My Orders** — your beauty shelf
- *Plus:* a routine builder and checkout flow

### 12. Fitness — *"Move. Recover. Fuel."*
- **Training Profile** — age, level, style & body goal
- **Body Goal** — diet + workout + health, integrated
- **My Plan** — an age & condition-aware week
- **Trainer Mode** — live AI form coach + voice
- **Workout** — guided live-timer plan
- **Activity Log** — what you actually did
- **Supplements** — a goal-matched kit
- **Sleep Cycle** — duration, quality & schedule

### 13. Together City Mail — *"Your @togethercity.tech inbox."*
- **Inbox** — mail from around the city
- **Compose** — write a new message
- **Sent · Starred · Trash** — standard folders
- *Every confirmation in the city (tickets, tables, trips, food orders) auto-lands here — the mailbox is the city's system-of-record for receipts.*

### 14. E-Commerce — *Coming soon* (reserved district on the city map)

---

## The platform features that connect all the hubs

These are the things that make Together City one city instead of 14 separate apps:

- **One identity.** You sign in with your existing email and phone, which become your
  primary contacts — and you also get a `@togethercity.tech` address. Every bill and receipt
  is sent to both your primary email and your city inbox.
- **Receipts as the city's records.** Confirmations from every hub automatically land in your
  Together City Mail inbox, so the mailbox is a single, permanent record of everything you've
  booked and bought.
- **Chat woven through every hub.** You can send a flight, a product, a listing, or any detail
  straight into a chat, and create group chats — so planning happens where you already talk.
- **One city wallet.** A single balance funds every commerce hub, with all spending, budgets,
  and transactions visible in the Financial District.
- **Connections & consent.** You control who can see your data — for example, Medical shares
  biomarkers with Nutrition, Beauty, and Fitness only when you grant consent.
- **Account recovery** flows through your email and phone (OTP) for any lock-out or password
  reset.

---

## The look and feel

Together City has a deliberately calm, editorial, almost luxury feel — not a busy tech dashboard:

- **Background:** warm off-white "paper" (`#faf9f6`)
- **Text:** near-black ink (`#141412`)
- **Accent:** a muted gold (`#b08d3e`)
- **Headlines:** a classic serif (Georgia), with clean sans-serif body text
- **Per-hub colour accents:** travel / real estate / jobs / restaurants lean **gold**;
  medical **blue**; nutrition / fitness / financial **green**; dating / beauty **rose**;
  entertainment / social **purple**
- **Feel:** generous whitespace, softly rounded cards, gentle shadows, unhurried layout

---

## Scale, in one line

14 hubs (plus a Family sub-hub), well over 100 individual screens, a single shared identity
and wallet, chat and a mailbox running through all of it, and a consent system controlling
how health data flows between hubs.
