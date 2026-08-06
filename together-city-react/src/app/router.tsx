import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { HubLayout } from '@/layouts/HubLayout';
import { HUBS } from '@/config/hubs';
import { REMOVED_ROUTES } from '@/config/labels';
import { ChunkBoundary } from './ChunkBoundary';
import { Home } from '@/pages/Home';
import { Dashboard } from '@/pages/Dashboard';
import { ServicesBrowse } from '@/features/services/pages/Browse';
import { ListBusiness } from '@/features/services/pages/ListBusiness';
import { MyBusiness } from '@/features/services/pages/MyBusiness';
import { ServiceMessages, ServiceThreadView } from '@/features/services/pages/Messages';
import { HubLanding } from '@/pages/HubLanding';
import { AstroToday } from '@/features/astrology/pages/AstroToday';
import { AstroMonthly } from '@/features/astrology/pages/AstroMonthly';
import { AstroAsk } from '@/features/astrology/pages/AstroAsk';
import { AstroProfilePage } from '@/features/astrology/pages/AstroProfilePage';
import { AstroTarot } from '@/features/astrology/pages/AstroTarot';
import { AstroRemedies } from '@/features/astrology/pages/AstroRemedies';
import { RequireAuth } from '@/features/auth/AuthGate';
import { NotFound } from '@/pages/NotFound';

// Route-level code splitting for the reference vertical.
const MealPlan = lazy(() =>
  import('@/features/nutrition/pages/MealPlan').then((m) => ({ default: m.MealPlan })),
);
const Profile = lazy(() => import('@/features/profile/pages/Profile').then((m) => ({ default: m.Profile })));
const MasterProfile = lazy(() => import('@/features/profile/pages/MasterProfile').then((m) => ({ default: m.MasterProfile })));
const DrivePage = lazy(() => import('@/features/drive/pages/Drive').then((m) => ({ default: m.Drive })));
const SocialFeed = lazy(() => import('@/features/social/pages/SocialFeed').then((m) => ({ default: m.SocialFeed })));
const RecipeLibrary = lazy(() => import('@/features/nutrition/pages/RecipeLibrary').then((m) => ({ default: m.RecipeLibrary })));
const RecipeDetail = lazy(() => import('@/features/nutrition/pages/RecipeDetail').then((m) => ({ default: m.RecipeDetail })));
const SharedMeal = lazy(() => import('@/features/nutrition/pages/SharedMeal').then((m) => ({ default: m.SharedMeal })));
const Grocery = lazy(() => import('@/features/nutrition/pages/Grocery').then((m) => ({ default: m.Grocery })));
const Preferences = lazy(() => import('@/features/nutrition/pages/Preferences').then((m) => ({ default: m.Preferences })));
const Blood = lazy(() => import('@/features/nutrition/pages/Blood').then((m) => ({ default: m.Blood })));
const FoodJournal = lazy(() => import('@/features/nutrition/pages/FoodJournal').then((m) => ({ default: m.FoodJournal })));
const Connections = lazy(() => import('@/features/connections/pages/Connections').then((m) => ({ default: m.Connections })));
const BloodAnalysis = lazy(() => import('@/features/medical/pages/BloodAnalysis').then((m) => ({ default: m.BloodAnalysis })));
const MedSupplementPlan = lazy(() => import('@/features/medical/pages/SupplementPlan').then((m) => ({ default: m.SupplementPlan })));
const MedRecords = lazy(() => import('@/features/medical/pages/Records').then((m) => ({ default: m.Records })));
const MedConsults = lazy(() => import('@/features/medical/pages/Consults').then((m) => ({ default: m.Consults })));
const MedConsent = lazy(() => import('@/features/medical/pages/Consent').then((m) => ({ default: m.Consent })));
const BeautyProfile = lazy(() => import('@/features/beauty/pages/Profile').then((m) => ({ default: m.Profile })));
const BeautyMarket = lazy(() => import('@/features/beauty/pages/Market').then((m) => ({ default: m.Market })));
const BeautyOrders = lazy(() => import('@/features/beauty/pages/Orders').then((m) => ({ default: m.Orders })));
const FitnessProfile = lazy(() => import('@/features/fitness/pages/Profile').then((m) => ({ default: m.Profile })));
const FitnessPlan = lazy(() => import('@/features/fitness/pages/Plan').then((m) => ({ default: m.Plan })));
const FitnessBodyGoal = lazy(() => import('@/features/fitness/pages/BodyGoal').then((m) => ({ default: m.BodyGoal })));
const FitnessTrainer = lazy(() => import('@/features/fitness/pages/Trainer').then((m) => ({ default: m.Trainer })));
const FitnessLog = lazy(() => import('@/features/fitness/pages/Log').then((m) => ({ default: m.Log })));
const FinWallet = lazy(() => import('@/features/financial/pages/Wallet').then((m) => ({ default: m.Wallet })));
const FinSpending = lazy(() => import('@/features/financial/pages/Spending').then((m) => ({ default: m.Spending })));
const FinBudgets = lazy(() => import('@/features/financial/pages/Budgets').then((m) => ({ default: m.Budgets })));
const FinTransactions = lazy(() => import('@/features/financial/pages/Transactions').then((m) => ({ default: m.Transactions })));
const JobsProfile = lazy(() => import('@/features/jobs/pages/Profile').then((m) => ({ default: m.Profile })));
const JobsMatches = lazy(() => import('@/features/jobs/pages/Matches').then((m) => ({ default: m.Matches })));
const JobsApplications = lazy(() => import('@/features/jobs/pages/Applications').then((m) => ({ default: m.Applications })));
const JobsPost = lazy(() => import('@/features/jobs/pages/PostJob').then((m) => ({ default: m.PostJob })));
const JobsPostings = lazy(() => import('@/features/jobs/pages/Postings').then((m) => ({ default: m.Postings })));
const REUnderConstruction = lazy(() => import('@/features/realestate/pages/UnderConstruction').then((m) => ({ default: m.UnderConstruction })));
const REMine = lazy(() => import('@/features/realestate/pages/MyListings').then((m) => ({ default: m.MyListings })));
const REDetail = lazy(() => import('@/features/realestate/pages/PropertyDetail').then((m) => ({ default: m.PropertyDetail })));
const REEdit = lazy(() => import('@/features/realestate/pages/EditListing').then((m) => ({ default: m.EditListing })));
const TravelExplore = lazy(() => import('@/features/travel/pages/Explore').then((m) => ({ default: m.Explore })));
const TravelPackage = lazy(() => import('@/features/travel/pages/PackageDetail').then((m) => ({ default: m.PackageDetail })));
const TravelFlights = lazy(() => import('@/features/travel/pages/Flights').then((m) => ({ default: m.Flights })));
const TravelTrips = lazy(() => import('@/features/travel/pages/MyTrips').then((m) => ({ default: m.MyTrips })));
const RestaurantsDiscover = lazy(() => import('@/features/restaurants/pages/Discover').then((m) => ({ default: m.Discover })));
const RestaurantDetail = lazy(() => import('@/features/restaurants/pages/RestaurantDetail').then((m) => ({ default: m.RestaurantDetail })));
const RestaurantsReservations = lazy(() => import('@/features/restaurants/pages/Reservations').then((m) => ({ default: m.Reservations })));
const RestaurantsOrders = lazy(() => import('@/features/restaurants/pages/Orders').then((m) => ({ default: m.Orders })));
// Travel sub-pages (ported from the static site)
const TravelPackages = lazy(() => import('@/features/travel/pages/Packages').then((m) => ({ default: m.TravelPackages })));
const TravelBookings = lazy(() => import('@/features/travel/pages/Bookings').then((m) => ({ default: m.TravelBookings })));
// Restaurants sub-pages
const RestExplore = lazy(() => import('@/features/restaurants/pages/Explore').then((m) => ({ default: m.Explore })));
const RestHome = lazy(() => import('@/features/restaurants/pages/RestaurantsHome').then((m) => ({ default: m.RestaurantsHome })));
const RestDecide = lazy(() => import('@/features/restaurants/pages/Decide').then((m) => ({ default: m.Decide })));
// Entertainment sub-pages
const EntMovies = lazy(() => import('@/features/entertainment/pages/Movies').then((m) => ({ default: m.Movies })));
const EntOtt = lazy(() => import('@/features/entertainment/pages/Ott').then((m) => ({ default: m.Ott })));
const EntCurated = lazy(() => import('@/features/entertainment/pages/Curated').then((m) => ({ default: m.Curated })));
const EntWatchlist = lazy(() => import('@/features/entertainment/pages/Watchlist').then((m) => ({ default: m.Watchlist })));
// Beauty sub-pages
const BeautyMakeup = lazy(() => import('@/features/beauty/pages/Makeup').then((m) => ({ default: m.Makeup })));
const BeautyRoutine = lazy(() => import('@/features/beauty/pages/Routine').then((m) => ({ default: m.Routine })));
// Social sub-pages
const SocCreate = lazy(() => import('@/features/social/pages/CreatePost').then((m) => ({ default: m.CreatePost })));
const SocNotifications = lazy(() => import('@/features/social/pages/Notifications').then((m) => ({ default: m.SocialNotifications })));
const HubsPage = lazy(() => import('@/pages/Hubs').then((m) => ({ default: m.Hubs })));
const SocProfile = lazy(() => import('@/features/social/pages/Profile').then((m) => ({ default: m.SocialProfile })));
const SocPublicProfile = lazy(() => import('@/features/social/pages/Profile').then((m) => ({ default: m.PublicProfilePage })));
const SocSaved = lazy(() => import('@/features/social/pages/Saved').then((m) => ({ default: m.SocialSaved })));
// Medical sub-pages
const MedTests = lazy(() => import('@/features/medical/pages/Tests').then((m) => ({ default: m.Tests })));
const MedConnections = lazy(() => import('@/features/medical/pages/Connections').then((m) => ({ default: m.Connections })));
const MedTimeline = lazy(() => import('@/features/medical/pages/Timeline').then((m) => ({ default: m.Timeline })));
const MedFamily = lazy(() => import('@/features/medical/pages/Family').then((m) => ({ default: m.Family })));
// Dating sub-pages
const DatingActivity = lazy(() => import('@/features/dating/pages/DatingActivity').then((m) => ({ default: m.DatingActivity })));
const DatingChats = lazy(() => import('@/features/dating/pages/DatingChats').then((m) => ({ default: m.DatingChats })));
const Thoughts = lazy(() => import('@/features/thoughts/pages/Thoughts').then((m) => ({ default: m.Thoughts })));
const Avatars = lazy(() => import('@/features/avatars/pages/Avatars').then((m) => ({ default: m.Avatars })));
const Medicines = lazy(() => import('@/features/medicines/pages/Medicines').then((m) => ({ default: m.Medicines })));
const DatingAdminStats = lazy(() => import('@/features/dating/pages/DatingAdminStats').then((m) => ({ default: m.DatingAdminStats })));
const DatingMatchDetail = lazy(() => import('@/features/dating/pages/DatingMatchDetail').then((m) => ({ default: m.DatingMatchDetail })));
// Nutrition sub-pages
const NutCart = lazy(() => import('@/features/nutrition/pages/Cart').then((m) => ({ default: m.Cart })));
const NutCheckout = lazy(() => import('@/features/nutrition/pages/Checkout').then((m) => ({ default: m.Checkout })));
// Batch 3 sub-pages (ported from the static site)
const REExplore = lazy(() => import('@/features/realestate/pages/Explore').then((m) => ({ default: m.Explore })));
const REModeration = lazy(() => import('@/features/realestate/pages/Moderation').then((m) => ({ default: m.Moderation })));
const RESell = lazy(() => import('@/features/realestate/pages/Sell').then((m) => ({ default: m.Sell })));
const FitWorkout = lazy(() => import('@/features/fitness/pages/Workout').then((m) => ({ default: m.Workout })));
const FitSupplements = lazy(() => import('@/features/fitness/pages/Supplements').then((m) => ({ default: m.Supplements })));
const FitSleep = lazy(() => import('@/features/fitness/pages/Sleep').then((m) => ({ default: m.Sleep })));
const FamHome = lazy(() => import('@/features/family/pages/Family').then((m) => ({ default: m.Family })));
const FamConnect = lazy(() => import('@/features/family/pages/Connect').then((m) => ({ default: m.FamilyConnect })));
const FamWeekly = lazy(() => import('@/features/family/pages/Weekly').then((m) => ({ default: m.FamilyWeekly })));
const FamDaily = lazy(() => import('@/features/family/pages/Daily').then((m) => ({ default: m.FamilyDaily })));
const FamGrocery = lazy(() => import('@/features/family/pages/Grocery').then((m) => ({ default: m.FamilyGrocery })));
const FamCart = lazy(() => import('@/features/family/pages/Cart').then((m) => ({ default: m.FamilyCart })));
const FamOrders = lazy(() => import('@/features/family/pages/Orders').then((m) => ({ default: m.FamilyOrders })));
const FamSearch = lazy(() => import('@/features/family/pages/Search').then((m) => ({ default: m.FamilySearch })));
const FamPantry = lazy(() => import('@/features/family/pages/Pantry').then((m) => ({ default: m.FamilyPantry })));
const MailInbox = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Inbox })));
const MailSent = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Sent })));
const MailUnsent = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Unsent })));
const MailStarred = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Starred })));
const MailTrash = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Trash })));
const MailCompose = lazy(() => import('@/features/mail/pages/Compose').then((m) => ({ default: m.Compose })));
const MailMessage = lazy(() => import('@/features/mail/pages/MessageView').then((m) => ({ default: m.MessageView })));
const DatingMatches = lazy(() => import('@/features/dating/pages/DatingMatches').then((m) => ({ default: m.DatingMatches })));
const DatingProfilePage = lazy(() => import('@/features/dating/pages/DatingProfile').then((m) => ({ default: m.DatingProfilePage })));
const Chats = lazy(() => import('@/features/chat/pages/Chats').then((m) => ({ default: m.Chats })));
const Settings = lazy(() => import('@/features/settings/pages/Settings').then((m) => ({ default: m.Settings })));
const Calendar = lazy(() => import('@/features/calendar/pages/Calendar').then((m) => ({ default: m.Calendar })));
const SignIn = lazy(() => import('@/features/auth/pages/SignIn').then((m) => ({ default: m.SignIn })));
const ModerationQueue = lazy(() => import('@/features/moderation/pages/ModerationQueue').then((m) => ({ default: m.ModerationQueue })));
const BlockedPeople = lazy(() => import('@/features/social/pages/Blocked').then((m) => ({ default: m.BlockedPeople })));
const PrivacySettings = lazy(() => import('@/features/privacy/pages/PrivacySettings').then((m) => ({ default: m.PrivacySettings })));
const Info = lazy(() => import('@/pages/Info').then((m) => ({ default: m.Info })));
const LegalCenter = lazy(() => import('@/features/legal/LegalCenter').then((m) => ({ default: m.LegalCenter })));

// Every lazy page is wrapped so a stale code-split chunk (after a new deploy)
// auto-recovers instead of leaving a blank page.
const wrap = (el: JSX.Element) => <ChunkBoundary>{el}</ChunkBoundary>;

/**
 * Router covers every hub. Landings are data-driven (HubLanding); inner pages
 * live under a HubLayout (sidebar). Nutrition is fully migrated as the reference;
 * other inner routes are migrated one at a time, following the same pattern.
 */
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Home /> },
      // 12 hub landings, generated from config
      { path: '/travel', element: <HubLanding hub="travel" /> },
      { path: '/restaurants', element: <RequireAuth>{wrap(<RestHome />)}</RequireAuth> },
      { path: '/astrology', element: <HubLanding hub="astrology" /> },
      { path: '/mail', element: <HubLanding hub="mail" /> },
      { path: '/nutrition', element: <HubLanding hub="nutrition" /> },
      { path: '/entertainment', element: <HubLanding hub="entertainment" /> },
      { path: '/social', element: <HubLanding hub="social" /> },
      { path: '/dating', element: <HubLanding hub="dating" /> },
      { path: '/realestate', element: <HubLanding hub="realestate" /> },
      { path: '/jobs', element: <HubLanding hub="jobs" /> },
      { path: '/medical', element: <HubLanding hub="medical" /> },
      { path: '/financial', element: <HubLanding hub="financial" /> },
      { path: '/beauty', element: <HubLanding hub="beauty" /> },
      { path: '/fitness', element: <HubLanding hub="fitness" /> },
      // THIS ONE EARNS ITS LANDING, and the distinction is worth stating
      // because the 5 Aug design audit argued against exactly this pattern.
      //
      // The objection was never to pictures. It was that a hub door showed a
      // photoreal render of a building with nothing in it — atmosphere charged
      // at a full viewport and a click. The picture the owner commissioned for
      // this hub is different in kind: the billboards on it are the eighteen
      // category groups, so it tells somebody arriving what is inside before
      // they read a word. It is a directory board, not a mood.
      { path: '/services', element: <HubLanding hub="services" /> },
      // Cars was a nav tab and a map building with a coming-soon page behind it
      // and nothing else. Somebody may still have the URL; a redirect into the
      // hub that took its place beats a 404 for a page that never had content.
      { path: '/cars', element: <Navigate to="/services" replace /> },
      { path: '/profile', element: <RequireAuth>{wrap(<Profile />)}</RequireAuth> },
      { path: '/profile/master', element: <RequireAuth>{wrap(<MasterProfile />)}</RequireAuth> },
      { path: '/profile/avatar', element: <RequireAuth>{wrap(<Avatars />)}</RequireAuth> },
      { path: '/settings', element: <RequireAuth>{wrap(<Settings />)}</RequireAuth> },
      { path: '/drive', element: <RequireAuth>{wrap(<DrivePage />)}</RequireAuth> },
      { path: '/settings/privacy', element: <RequireAuth>{wrap(<PrivacySettings />)}</RequireAuth> },
      { path: '/settings/blocked', element: <RequireAuth>{wrap(<BlockedPeople />)}</RequireAuth> },
      { path: '/moderation', element: <RequireAuth>{wrap(<ModerationQueue />)}</RequireAuth> },
      { path: '/legal', element: wrap(<LegalCenter />) },
      { path: '/legal/policy/:policyId', element: wrap(<LegalCenter />) },
      { path: '/legal/privacy', element: wrap(<Info slug="privacy" />) },
      { path: '/legal/terms', element: wrap(<Info slug="terms" />) },
      { path: '/about', element: wrap(<Info slug="about" />) },
      { path: '/help', element: wrap(<Info slug="help" />) },
      { path: '/contact', element: wrap(<Info slug="contact" />) },
      { path: '/calendar', element: <RequireAuth>{wrap(<Calendar />)}</RequireAuth> },
      { path: '/chats', element: <RequireAuth>{wrap(<Chats />)}</RequireAuth> },
      // The mobile bottom bar's doors: the whole city on one screen, and the
      // bell as a full page (the header dropdown does not exist on a phone).
      { path: '/hubs', element: <RequireAuth>{wrap(<HubsPage />)}</RequireAuth> },
      { path: '/alerts', element: <RequireAuth>{wrap(<SocNotifications />)}</RequireAuth> },
      { path: '/connections', element: <RequireAuth>{wrap(<Connections />)}</RequireAuth> },
      { path: '/dashboard', element: <Dashboard /> },
    ],
  },
  {
    // Nutrition inner pages — reference vertical with sidebar.
    element: <HubLayout hub={HUBS.nutrition} />,
    children: [
      { path: '/nutrition/weekly', element: <RequireAuth>{wrap(<MealPlan />)}</RequireAuth> },
      { path: '/nutrition/weekly-classic', element: <Navigate to="/nutrition/weekly" replace /> },
      { path: '/nutrition/blood', element: <RequireAuth>{wrap(<Blood />)}</RequireAuth> },
      { path: '/nutrition/journal', element: <RequireAuth>{wrap(<FoodJournal />)}</RequireAuth> },
      { path: '/nutrition/preferences', element: <RequireAuth>{wrap(<Preferences />)}</RequireAuth> },
      { path: '/nutrition/grocery', element: <RequireAuth>{wrap(<Grocery />)}</RequireAuth> },
      { path: '/nutrition/recipes', element: <RequireAuth>{wrap(<RecipeLibrary />)}</RequireAuth> },
      // Before :id, or "own" is read as a recipe id. Your own recipes are part
      // of /nutrition/recipes now; the old URL still resolves for saved links.
      { path: '/nutrition/recipes/own', element: <Navigate to="/nutrition/recipes" replace /> },
      { path: '/nutrition/recipes-classic', element: <Navigate to="/nutrition/recipes" replace /> },
      { path: '/nutrition/recipes/:id', element: wrap(<RecipeDetail />) },
      { path: '/nutrition/shared-meal', element: wrap(<SharedMeal />) },
      { path: '/nutrition/cart', element: <RequireAuth>{wrap(<NutCart />)}</RequireAuth> },
      { path: '/nutrition/checkout', element: <RequireAuth>{wrap(<NutCheckout />)}</RequireAuth> },
    ],
  },
  {
    // Social inner pages.
    element: <HubLayout hub={HUBS.social} />,
    children: [
      { path: '/social/feed', element: <RequireAuth>{wrap(<SocialFeed />)}</RequireAuth> },
      { path: '/social/create', element: <RequireAuth>{wrap(<SocCreate />)}</RequireAuth> },
      { path: '/social/notifications', element: <RequireAuth>{wrap(<SocNotifications />)}</RequireAuth> },
      { path: '/social/profile', element: <RequireAuth>{wrap(<SocProfile />)}</RequireAuth> },
      { path: '/social/u/:handle', element: <RequireAuth>{wrap(<SocPublicProfile />)}</RequireAuth> },
      { path: '/social/saved', element: <RequireAuth>{wrap(<SocSaved />)}</RequireAuth> },
      // The journal, which the Social Life menu now lists. It was rendering
      // under the Dating hub's layout, so opening it from Social Life put a
      // sidebar headed "Dating Hub" beside somebody's private writing.
      { path: '/thoughts', element: <RequireAuth>{wrap(<Thoughts />)}</RequireAuth> },
    ],
  },
  {
    // Dating inner pages.
    element: <HubLayout hub={HUBS.dating} />,
    children: [
      { path: '/dating/profile', element: <RequireAuth>{wrap(<DatingProfilePage />)}</RequireAuth> },
      { path: '/dating/matches', element: <RequireAuth>{wrap(<DatingMatches />)}</RequireAuth> },
      { path: '/dating/activity', element: <RequireAuth>{wrap(<DatingActivity />)}</RequireAuth> },
      { path: '/dating/chats', element: <RequireAuth>{wrap(<DatingChats />)}</RequireAuth> },
      { path: '/dating/admin', element: <RequireAuth>{wrap(<DatingAdminStats />)}</RequireAuth> },
      // '/dating/chat' (singular) removed — it served a hardcoded conversation
      // with scripted replies. The real one is '/dating/chats'.
      { path: '/dating/chat', element: <Navigate to="/dating/chats" replace /> },
      { path: '/dating/match', element: <RequireAuth>{wrap(<DatingMatchDetail />)}</RequireAuth> },
    ],
  },
  {
    // Medical hub inner pages (source of truth for health data).
    element: <HubLayout hub={HUBS.medical} />,
    children: [
      { path: '/medical/blood', element: <RequireAuth>{wrap(<BloodAnalysis />)}</RequireAuth> },
      { path: '/medical/supplements', element: <RequireAuth>{wrap(<MedSupplementPlan />)}</RequireAuth> },
      { path: '/medical/records', element: <RequireAuth>{wrap(<MedRecords />)}</RequireAuth> },
      { path: '/medical/consults', element: <RequireAuth>{wrap(<MedConsults />)}</RequireAuth> },
      { path: '/medical/consent', element: <RequireAuth>{wrap(<MedConsent />)}</RequireAuth> },
      { path: '/medical/tests', element: <RequireAuth>{wrap(<MedTests />)}</RequireAuth> },
      { path: '/medical/booking', element: <Navigate to="/medical/consults" replace /> },
      { path: '/medical/connections', element: <RequireAuth>{wrap(<MedConnections />)}</RequireAuth> },
      { path: '/medical/timeline', element: <RequireAuth>{wrap(<MedTimeline />)}</RequireAuth> },
      { path: '/medical/family', element: <RequireAuth>{wrap(<MedFamily />)}</RequireAuth> },
      { path: '/medical/medicines', element: <RequireAuth>{wrap(<Medicines />)}</RequireAuth> },
    ],
  },
  {
    // Beauty hub inner pages (reads Medical biomarkers via the consent gate).
    element: <HubLayout hub={HUBS.beauty} />,
    children: [
      { path: '/beauty/profile', element: <RequireAuth>{wrap(<BeautyProfile />)}</RequireAuth> },
      { path: '/beauty/market', element: <RequireAuth>{wrap(<BeautyMarket />)}</RequireAuth> },
      { path: '/beauty/orders', element: <RequireAuth>{wrap(<BeautyOrders />)}</RequireAuth> },
      { path: '/beauty/makeup', element: <RequireAuth>{wrap(<BeautyMakeup />)}</RequireAuth> },
      { path: '/beauty/routine', element: <RequireAuth>{wrap(<BeautyRoutine />)}</RequireAuth> },
    ],
  },
  {
    // Fitness hub inner pages (reads Medical biomarkers via the consent gate).
    element: <HubLayout hub={HUBS.fitness} />,
    children: [
      { path: '/fitness/profile', element: <RequireAuth>{wrap(<FitnessProfile />)}</RequireAuth> },
      { path: '/fitness/body-goal', element: <RequireAuth>{wrap(<FitnessBodyGoal />)}</RequireAuth> },
      { path: '/fitness/plan', element: <RequireAuth>{wrap(<FitnessPlan />)}</RequireAuth> },
      { path: '/fitness/trainer', element: <RequireAuth>{wrap(<FitnessTrainer />)}</RequireAuth> },
      { path: '/fitness/log', element: <RequireAuth>{wrap(<FitnessLog />)}</RequireAuth> },
      { path: '/fitness/workout', element: <RequireAuth>{wrap(<FitWorkout />)}</RequireAuth> },
      { path: '/fitness/supplements', element: <RequireAuth>{wrap(<FitSupplements />)}</RequireAuth> },
      { path: '/fitness/sleep', element: <RequireAuth>{wrap(<FitSleep />)}</RequireAuth> },
    ],
  },
  {
    // Financial hub inner pages (aggregates spend across every commerce hub).
    element: <HubLayout hub={HUBS.financial} />,
    children: [
      { path: '/financial/wallet', element: <RequireAuth>{wrap(<FinWallet />)}</RequireAuth> },
      { path: '/financial/spending', element: <RequireAuth>{wrap(<FinSpending />)}</RequireAuth> },
      { path: '/financial/budgets', element: <RequireAuth>{wrap(<FinBudgets />)}</RequireAuth> },
      { path: '/financial/transactions', element: <RequireAuth>{wrap(<FinTransactions />)}</RequireAuth> },
    ],
  },
  {
    // Family Nutrition hub — one plan portioned per member (reached from the Nutrition Individual/Family toggle).
    element: <HubLayout hub={HUBS.family} />,
    children: [
      { path: '/family', element: <RequireAuth>{wrap(<FamHome />)}</RequireAuth> },
      { path: '/family/connect', element: <RequireAuth>{wrap(<FamConnect />)}</RequireAuth> },
      { path: '/family/weekly', element: <RequireAuth>{wrap(<FamWeekly />)}</RequireAuth> },
      { path: '/family/daily', element: <RequireAuth>{wrap(<FamDaily />)}</RequireAuth> },
      { path: '/family/grocery', element: <RequireAuth>{wrap(<FamGrocery />)}</RequireAuth> },
      { path: '/family/cart', element: <RequireAuth>{wrap(<FamCart />)}</RequireAuth> },
      { path: '/family/orders', element: <RequireAuth>{wrap(<FamOrders />)}</RequireAuth> },
      { path: '/family/search', element: <RequireAuth>{wrap(<FamSearch />)}</RequireAuth> },
      { path: '/family/pantry', element: <RequireAuth>{wrap(<FamPantry />)}</RequireAuth> },
    ],
  },
  {
    // Astrology Zone inner pages — same hub sidebar every other section uses.
    // These used to sit directly under AppShell with their own tab bar, which
    // made the one section that looked unlike the rest of the app.
    element: <HubLayout hub={HUBS.astrology} />,
    children: [
      { path: '/astrology/today', element: <RequireAuth>{wrap(<AstroToday />)}</RequireAuth> },
      { path: '/astrology/monthly', element: <RequireAuth>{wrap(<AstroMonthly />)}</RequireAuth> },
      { path: '/astrology/ask', element: <RequireAuth>{wrap(<AstroAsk />)}</RequireAuth> },
      { path: '/astrology/tarot', element: <RequireAuth>{wrap(<AstroTarot />)}</RequireAuth> },
      { path: '/astrology/remedies', element: <RequireAuth>{wrap(<AstroRemedies />)}</RequireAuth> },
      { path: '/profile/astrology', element: <RequireAuth>{wrap(<AstroProfilePage />)}</RequireAuth> },
    ],
  },
  {
    // Jobs hub inner pages (two-sided: candidates + employers).
    element: <HubLayout hub={HUBS.jobs} />,
    children: [
      { path: '/jobs/profile', element: <RequireAuth>{wrap(<JobsProfile />)}</RequireAuth> },
      { path: '/jobs/matches', element: <RequireAuth>{wrap(<JobsMatches />)}</RequireAuth> },
      { path: '/jobs/applications', element: <RequireAuth>{wrap(<JobsApplications />)}</RequireAuth> },
      { path: '/jobs/post', element: <RequireAuth>{wrap(<JobsPost />)}</RequireAuth> },
      { path: '/jobs/postings', element: <RequireAuth>{wrap(<JobsPostings />)}</RequireAuth> },
    ],
  },
  {
    // Real Estate hub inner pages (under-construction, list/sell, my listings, detail).
    element: <HubLayout hub={HUBS.realestate} />,
    children: [
      { path: '/realestate/under-construction', element: <RequireAuth>{wrap(<REUnderConstruction />)}</RequireAuth> },
      { path: '/realestate/mine', element: <RequireAuth>{wrap(<REMine />)}</RequireAuth> },
      { path: '/realestate/admin', element: <RequireAuth>{wrap(<REModeration />)}</RequireAuth> },
      { path: '/realestate/explore', element: <RequireAuth>{wrap(<REExplore />)}</RequireAuth> },
      { path: '/realestate/sell', element: <RequireAuth>{wrap(<RESell />)}</RequireAuth> },
      { path: '/realestate/property/:id', element: <RequireAuth>{wrap(<REDetail />)}</RequireAuth> },
      { path: '/realestate/edit/:id', element: <RequireAuth>{wrap(<REEdit />)}</RequireAuth> },
    ],
  },
  {
    // Local Services hub inner pages. Its own block, and not a few lines added
    // to the one above: a route parked in another hub's block renders with that
    // hub's sidebar, which nav-audit caught within a minute of it happening.
    element: <HubLayout hub={HUBS.services} />,
    children: [
      { path: '/services/browse', element: <RequireAuth>{wrap(<ServicesBrowse />)}</RequireAuth> },
      { path: '/services/list', element: <RequireAuth>{wrap(<ListBusiness />)}</RequireAuth> },
      { path: '/services/mine', element: <RequireAuth>{wrap(<MyBusiness />)}</RequireAuth> },
      // The thread route is declared BEFORE the index, or React Router reads
      // "messages" as an id on the way past.
      { path: '/services/messages/:id', element: <RequireAuth>{wrap(<ServiceThreadView />)}</RequireAuth> },
      { path: '/services/messages', element: <RequireAuth>{wrap(<ServiceMessages />)}</RequireAuth> },
    ],
  },
  {
    // Entertainment hub inner pages (discover, event detail, my tickets).
    element: <HubLayout hub={HUBS.entertainment} />,
    children: [
      { path: '/entertainment/movies', element: <RequireAuth>{wrap(<EntMovies />)}</RequireAuth> },
      { path: '/entertainment/ott', element: <RequireAuth>{wrap(<EntOtt />)}</RequireAuth> },
      { path: '/entertainment/curated', element: <RequireAuth>{wrap(<EntCurated />)}</RequireAuth> },
      { path: '/entertainment/watchlist', element: <RequireAuth>{wrap(<EntWatchlist />)}</RequireAuth> },
    ],
  },
  {
    // Travel hub inner pages (explore, package detail, flights metasearch, my trips).
    element: <HubLayout hub={HUBS.travel} />,
    children: [
      { path: '/travel/explore', element: <RequireAuth>{wrap(<TravelExplore />)}</RequireAuth> },
      { path: '/travel/package/:id', element: <RequireAuth>{wrap(<TravelPackage />)}</RequireAuth> },
      { path: '/travel/flights', element: <RequireAuth>{wrap(<TravelFlights />)}</RequireAuth> },
      { path: '/travel/trips', element: <RequireAuth>{wrap(<TravelTrips />)}</RequireAuth> },
      { path: '/travel/packages', element: <RequireAuth>{wrap(<TravelPackages />)}</RequireAuth> },
      { path: '/travel/bookings', element: <RequireAuth>{wrap(<TravelBookings />)}</RequireAuth> },
    ],
  },
  {
    // Restaurants hub — single full-width Explore experience, NO left sidebar.
    // All inner pages render under AppShell (full width); flows are reached from
    // Explore cards and in-page links, not a persistent hub nav.
    element: <AppShell />,
    children: [
      { path: '/restaurants/explore', element: <RequireAuth>{wrap(<RestExplore />)}</RequireAuth> },
      { path: '/restaurants/decide', element: <RequireAuth>{wrap(<RestDecide />)}</RequireAuth> },
      { path: '/restaurants/discover', element: <RequireAuth>{wrap(<RestaurantsDiscover />)}</RequireAuth> },
      { path: '/restaurants/reservations', element: <RequireAuth>{wrap(<RestaurantsReservations />)}</RequireAuth> },
      { path: '/restaurants/orders', element: <RequireAuth>{wrap(<RestaurantsOrders />)}</RequireAuth> },
      { path: '/restaurants/:id', element: <RequireAuth>{wrap(<RestaurantDetail />)}</RequireAuth> },
    ],
  },
  {
    // Together City Mail — webmail inbox (@togethercity.app), 10 GB per citizen.
    element: <HubLayout hub={HUBS.mail} />,
    children: [
      { path: '/mail/inbox', element: <RequireAuth>{wrap(<MailInbox />)}</RequireAuth> },
      { path: '/mail/compose', element: <RequireAuth>{wrap(<MailCompose />)}</RequireAuth> },
      { path: '/mail/sent', element: <RequireAuth>{wrap(<MailSent />)}</RequireAuth> },
      { path: '/mail/unsent', element: <RequireAuth>{wrap(<MailUnsent />)}</RequireAuth> },
      // Old links, and the old menu key. Failed lives inside Unsent now.
      { path: '/mail/failed', element: <Navigate to="/mail/unsent" replace /> },
      { path: '/mail/starred', element: <RequireAuth>{wrap(<MailStarred />)}</RequireAuth> },
      { path: '/mail/drive', element: <RequireAuth>{wrap(<DrivePage />)}</RequireAuth> },
      { path: '/mail/trash', element: <RequireAuth>{wrap(<MailTrash />)}</RequireAuth> },
      { path: '/mail/message/:id', element: <RequireAuth>{wrap(<MailMessage />)}</RequireAuth> },
    ],
  },
  { path: '/sign-in', element: wrap(<SignIn />) },
  { path: '/signin', element: <Navigate to="/sign-in" replace /> },
  // A real front door for new citizens (consumer review #2) — and the landing
  // page an ad, invite or referral link needs. Same component, register-first.
  { path: '/sign-up', element: wrap(<SignIn initialMode="register" />) },
  { path: '/signup', element: <Navigate to="/sign-up" replace /> },
  { path: '/register', element: <Navigate to="/sign-up" replace /> },
  { path: '/join', element: <Navigate to="/sign-up" replace /> },
  { path: '/index.html', element: <Navigate to="/" replace /> },

  // Destinations the review removed. They keep resolving for one release so
  // an old bookmark, an old email link or a mobile build that has not updated
  // lands somewhere real instead of on a 404. Declared after the hub blocks so
  // a surviving route always wins, and before the catch-all so these never
  // reach NotFound.
  ...Object.entries(REMOVED_ROUTES).map(([from, to]) => ({
    path: from,
    element: <Navigate to={to} replace />,
  })),

  // The 404 renders INSIDE the app shell (consumer review #8): full header,
  // menu and search — a wrong turn, not a locked exit.
  { element: <AppShell />, children: [{ path: '*', element: wrap(<NotFound />) }] },
]);
