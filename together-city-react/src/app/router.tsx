import { lazy } from 'react';
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { RootChrome } from '@/layouts/RootChrome';
import { HubLayout } from '@/layouts/HubLayout';
import { HUBS } from '@/config/hubs';
import { REMOVED_ROUTES } from '@/config/labels';
import { ChunkBoundary } from './ChunkBoundary';
import { Home } from '@/pages/Home';
import { Dashboard } from '@/pages/Dashboard';
import { ServicesBrowse } from '@/features/services/pages/Browse';
import { ListBusiness } from '@/features/services/pages/ListBusiness';
import { EditBusiness } from '@/features/services/pages/EditBusiness';
import { BusinessPage } from '@/features/services/pages/BusinessPage';
import { AdminConsole } from '@/features/admin/pages/Console';
import { DevPage } from '@/features/dev/pages/Dev';
import { MyBusiness } from '@/features/services/pages/MyBusiness';
import { ServiceMessages, ServiceThreadView } from '@/features/services/pages/Messages';
import { MyOrders } from '@/features/services/pages/MyOrders';
import { BizOrders } from '@/features/services/pages/BizOrders';
import { Regulars } from '@/features/services/pages/Regulars';
import { DailyOffers } from '@/features/services/pages/DailyOffers';
import { HubLanding } from '@/pages/HubLanding';
import { petsRoutes } from '@/features/pets/routes';
import { ecommerceRoutes } from '@/features/ecommerce/routes';
import { AstroToday } from '@/features/astrology/pages/AstroToday';
import { AstroMonthly } from '@/features/astrology/pages/AstroMonthly';
import { AstroAsk } from '@/features/astrology/pages/AstroAsk';
import { AstroProfilePage } from '@/features/astrology/pages/AstroProfilePage';
import { AstroTarot } from '@/features/astrology/pages/AstroTarot';
import { AstroRemedies } from '@/features/astrology/pages/AstroRemedies';
import { AstroGemstones } from '@/features/astrology/pages/AstroGemstones';
import { GemStudio } from '@/features/astrology/pages/GemStudio';
import { GemCheckout } from '@/features/astrology/pages/GemCheckout';
import { RequireAuth } from '@/features/auth/AuthGate';
import { NotFound } from '@/pages/NotFound';

// Route-level code splitting for the reference vertical.
const MealPlan = lazy(() =>
  import('@/features/nutrition/pages/MealPlan').then((m) => ({ default: m.MealPlan })),
);
const Profile = lazy(() => import('@/features/profile/pages/Profile').then((m) => ({ default: m.Profile })));
/**
 * /profile/master WAS THE SECOND HALF OF ONE PAGE. (28 Aug.)
 *
 * The fields it showed now sit on /profile beneath the passport that prints
 * them, under the same heading. This keeps every link already written — the
 * hubs' `/profile/master#medical`, a bookmark, a mail — landing on the right
 * heading rather than on a 404, and it carries the hash across, which
 * `<Navigate to="/profile">` on its own would drop.
 */
function MasterProfileMoved() {
  const { hash } = useLocation();
  return <Navigate to={`/profile${hash || '#your-details'}`} replace />;
}
const DrivePage = lazy(() => import('@/features/drive/pages/Drive').then((m) => ({ default: m.Drive })));
const SocialFeed = lazy(() => import('@/features/social/pages/SocialFeed').then((m) => ({ default: m.SocialFeed })));
const RecipeLibrary = lazy(() => import('@/features/nutrition/pages/RecipeLibrary').then((m) => ({ default: m.RecipeLibrary })));
const SavedRecipes = lazy(() => import('@/features/nutrition/pages/SavedRecipes').then((m) => ({ default: m.SavedRecipes })));
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
const FitnessLog = lazy(() => import('@/features/fitness/pages/Log').then((m) => ({ default: m.Log })));
const FinWallet = lazy(() => import('@/features/financial/pages/Wallet').then((m) => ({ default: m.Wallet })));
const FinSpending = lazy(() => import('@/features/financial/pages/Spending').then((m) => ({ default: m.Spending })));
const FinBudgets = lazy(() => import('@/features/financial/pages/Budgets').then((m) => ({ default: m.Budgets })));
const FinTransactions = lazy(() => import('@/features/financial/pages/Transactions').then((m) => ({ default: m.Transactions })));
const FinInvoices = lazy(() => import('@/features/pay/pages/Invoices').then((m) => ({ default: m.Invoices })));
const InvoiceView = lazy(() => import('@/features/pay/pages/InvoiceView').then((m) => ({ default: m.InvoiceView })));
const BizInvoices = lazy(() => import('@/features/pay/pages/BusinessInvoices').then((m) => ({ default: m.BusinessInvoices })));
const BizCreateInvoice = lazy(() => import('@/features/pay/pages/CreateInvoice').then((m) => ({ default: m.CreateInvoice })));
const BizPayments = lazy(() => import('@/features/pay/pages/BusinessPayments').then((m) => ({ default: m.BusinessPayments })));
const BizPayoutAccount = lazy(() => import('@/features/pay/pages/PayoutAccount').then((m) => ({ default: m.PayoutAccount })));
const BizPayoutView = lazy(() => import('@/features/pay/pages/PayoutView').then((m) => ({ default: m.PayoutView })));
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
// Travel sub-pages (ported from the static site)
const TravelPackages = lazy(() => import('@/features/travel/pages/Packages').then((m) => ({ default: m.TravelPackages })));
const TravelBookings = lazy(() => import('@/features/travel/pages/Bookings').then((m) => ({ default: m.TravelBookings })));
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
const SocPost = lazy(() => import('@/features/social/pages/PostPage').then((m) => ({ default: m.PostPage })));
// Medical sub-pages
const MedTests = lazy(() => import('@/features/medical/pages/Tests').then((m) => ({ default: m.Tests })));
const MedConnections = lazy(() => import('@/features/medical/pages/Connections').then((m) => ({ default: m.Connections })));
const MedTimeline = lazy(() => import('@/features/medical/pages/Timeline').then((m) => ({ default: m.Timeline })));
const MedFamily = lazy(() => import('@/features/medical/pages/Family').then((m) => ({ default: m.Family })));
// Dating sub-pages
const DatingChats = lazy(() => import('@/features/dating/pages/DatingChats').then((m) => ({ default: m.DatingChats })));
const Thoughts = lazy(() => import('@/features/thoughts/pages/Thoughts').then((m) => ({ default: m.Thoughts })));
const PersonalHome = lazy(() => import('@/features/personal/pages/PersonalHome').then((m) => ({ default: m.PersonalHome })));
const Album = lazy(() => import('@/features/personal/pages/Album').then((m) => ({ default: m.Album })));
const DayPage = lazy(() => import('@/features/daybook/pages/DayPage').then((m) => ({ default: m.DayPage })));
const Avatars = lazy(() => import('@/features/avatars/pages/Avatars').then((m) => ({ default: m.Avatars })));
const Medicines = lazy(() => import('@/features/medicines/pages/Medicines').then((m) => ({ default: m.Medicines })));
const DatingAdminStats = lazy(() => import('@/features/dating/pages/DatingAdminStats').then((m) => ({ default: m.DatingAdminStats })));
const DatingSafety = lazy(() => import('@/features/dating/pages/DatingSafety').then((m) => ({ default: m.DatingSafety })));
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
const FitStore = lazy(() => import('@/features/fitness/pages/Store').then((m) => ({ default: m.Store })));
const FitMultivitamins = lazy(() => import('@/features/fitness/pages/Multivitamins').then((m) => ({ default: m.Multivitamins })));
const FitOrders = lazy(() => import('@/features/fitness/pages/Orders').then((m) => ({ default: m.Orders })));
const FitSleep = lazy(() => import('@/features/fitness/pages/Sleep').then((m) => ({ default: m.Sleep })));
const FamConnect = lazy(() => import('@/features/family/pages/Connect').then((m) => ({ default: m.FamilyConnect })));
const FamWeekly = lazy(() => import('@/features/family/pages/Weekly').then((m) => ({ default: m.FamilyWeekly })));
const FamGrocery = lazy(() => import('@/features/family/pages/Grocery').then((m) => ({ default: m.FamilyGrocery })));
const FamCart = lazy(() => import('@/features/family/pages/Cart').then((m) => ({ default: m.FamilyCart })));
const FamSearch = lazy(() => import('@/features/family/pages/Search').then((m) => ({ default: m.FamilySearch })));
const FamPantry = lazy(() => import('@/features/family/pages/Pantry').then((m) => ({ default: m.FamilyPantry })));
const MailProjects = lazy(() => import('@/features/mail/pages/Projects').then((m) => ({ default: m.MailProjects })));
const MailProjectInbox = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.ProjectInbox })));
const MailProjectFolder = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.ProjectFolderRoute })));
const MailInbox = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Inbox })));
const MailSent = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Sent })));
const MailUnsent = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Unsent })));
const MailStarred = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Starred })));
const MailTrash = lazy(() => import('@/features/mail/pages/Folders').then((m) => ({ default: m.Trash })));
const MailCompose = lazy(() => import('@/features/mail/pages/Compose').then((m) => ({ default: m.Compose })));
const MailMessage = lazy(() => import('@/features/mail/pages/MessageView').then((m) => ({ default: m.MessageView })));
const DatingMatches = lazy(() => import('@/features/dating/pages/DatingMatches').then((m) => ({ default: m.DatingMatches })));
const DatingBrowse = lazy(() => import('@/features/dating/pages/DatingBrowse').then((m) => ({ default: m.DatingBrowse })));
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
/* THE STORE IS NOT A HUB ROOM, and its two screens are registered in the
   AppShell block below rather than under a HubLayout for exactly one reason:
   the owner asked for a shop with no rail and one way back. A sidebar is not
   something a page can opt out of once it is inside that layout. */
const BeautyShop = lazy(() => import('@/features/ecommerce/pages/BeautyShop').then((m) => ({ default: m.BeautyShop })));
const BeautyShopBag = lazy(() => import('@/features/ecommerce/pages/BeautyShop').then((m) => ({ default: m.BeautyShopBag })));
const SupplementsShop = lazy(() => import('@/features/ecommerce/pages/SupplementsShop').then((m) => ({ default: m.SupplementsShop })));
const SupplementsShopBag = lazy(() => import('@/features/ecommerce/pages/SupplementsShop').then((m) => ({ default: m.SupplementsShopBag })));
const GemstonesShop = lazy(() => import('@/features/ecommerce/pages/GemstonesShop').then((m) => ({ default: m.GemstonesShop })));
const GemstonesShopBag = lazy(() => import('@/features/ecommerce/pages/GemstonesShop').then((m) => ({ default: m.GemstonesShopBag })));
/* The Open Market's aisles — the same storefront, the whole shelf. */
const SkinHairMarket = lazy(() => import('@/features/ecommerce/pages/MarketAisles').then((m) => ({ default: m.SkinHairMarket })));
const SkinHairMarketBag = lazy(() => import('@/features/ecommerce/pages/MarketAisles').then((m) => ({ default: m.SkinHairMarketBag })));
const SupplementsMarket = lazy(() => import('@/features/ecommerce/pages/MarketAisles').then((m) => ({ default: m.SupplementsMarket })));
const SupplementsMarketBag = lazy(() => import('@/features/ecommerce/pages/MarketAisles').then((m) => ({ default: m.SupplementsMarketBag })));
const PetMarket = lazy(() => import('@/features/ecommerce/pages/MarketAisles').then((m) => ({ default: m.PetMarket })));
const GemMarket = lazy(() => import('@/features/ecommerce/pages/MarketAisles').then((m) => ({ default: m.GemMarket })));
const GemMarketBag = lazy(() => import('@/features/ecommerce/pages/MarketAisles').then((m) => ({ default: m.GemMarketBag })));

// Every lazy page is wrapped so a stale code-split chunk (after a new deploy)
// auto-recovers instead of leaving a blank page.
const wrap = (el: JSX.Element) => <ChunkBoundary>{el}</ChunkBoundary>;

/**
 * Router covers every hub. Landings are data-driven (HubLanding); inner pages
 * live under a HubLayout (sidebar). Nutrition is fully migrated as the reference;
 * other inner routes are migrated one at a time, following the same pattern.
 */
/**
 * THE ROUTE BLOCKS, AS THEY HAVE ALWAYS BEEN — and now a list rather than the
 * router itself, so that one root route can sit above all nineteen of them.
 * See RootChrome for what that root is for and why it had to exist.
 */
const ROUTE_BLOCKS: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Home /> },
      // 12 hub landings, generated from config
      { path: '/travel', element: <HubLanding hub="travel" /> },
      { path: '/astrology', element: <HubLanding hub="astrology" /> },
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
      { path: '/pets', element: <HubLanding hub="pets" /> },
      { path: '/ecommerce', element: <HubLanding hub="ecommerce" /> },
      /* The white storefronts. Behind RequireAuth because a shortlist is built
         from somebody's own profile and a bag is their money. */
      { path: '/ecommerce/shop/beauty', element: <RequireAuth>{wrap(<BeautyShop />)}</RequireAuth> },
      { path: '/ecommerce/shop/beauty/bag', element: <RequireAuth>{wrap(<BeautyShopBag />)}</RequireAuth> },
      { path: '/ecommerce/shop/supplements', element: <RequireAuth>{wrap(<SupplementsShop />)}</RequireAuth> },
      { path: '/ecommerce/shop/supplements/bag', element: <RequireAuth>{wrap(<SupplementsShopBag />)}</RequireAuth> },
      { path: '/ecommerce/shop/gemstones', element: <RequireAuth>{wrap(<GemstonesShop />)}</RequireAuth> },
      { path: '/ecommerce/shop/gemstones/bag', element: <RequireAuth>{wrap(<GemstonesShopBag />)}</RequireAuth> },
      { path: '/ecommerce/market/skin-hair', element: <RequireAuth>{wrap(<SkinHairMarket />)}</RequireAuth> },
      { path: '/ecommerce/market/skin-hair/bag', element: <RequireAuth>{wrap(<SkinHairMarketBag />)}</RequireAuth> },
      { path: '/ecommerce/market/supplements', element: <RequireAuth>{wrap(<SupplementsMarket />)}</RequireAuth> },
      { path: '/ecommerce/market/supplements/bag', element: <RequireAuth>{wrap(<SupplementsMarketBag />)}</RequireAuth> },
      { path: '/ecommerce/market/pets', element: <RequireAuth>{wrap(<PetMarket />)}</RequireAuth> },
      { path: '/ecommerce/market/gemstones', element: <RequireAuth>{wrap(<GemMarket />)}</RequireAuth> },
      { path: '/ecommerce/market/gemstones/bag', element: <RequireAuth>{wrap(<GemMarketBag />)}</RequireAuth> },
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
      // THE CONSOLE. Not a hub, and deliberately not in any menu: the route
      // existing is not access, and a link to it in a citizen's navigation
      // would be an invitation to a door that will not open for them. The
      // server checks the permission on every request.
      { path: '/console', element: <RequireAuth>{wrap(<AdminConsole />)}</RequireAuth> },
      // THE DEVELOPER PAGE. Same rule as the console and one more lock: signed
      // in, and then a password the server checks. Not in any menu — the route
      // existing is not access, and the API refuses every request that does not
      // carry the password regardless of what this app renders.
      { path: '/dev', element: <RequireAuth>{wrap(<DevPage />)}</RequireAuth> },
      { path: '/profile', element: <RequireAuth>{wrap(<Profile />)}</RequireAuth> },
      { path: '/profile/master', element: <MasterProfileMoved /> },
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
      /* ── PERSONAL: THE CITIZEN'S OWN DRAWER (owner, 15 Aug) ───────────────
         A tab, not a hub — so its rooms are city-level pages rather than a
         HubLayout rail, and three of the four were already exactly that and
         listed nowhere (/thoughts, /calendar above, /drive below). The tab's
         own page gathers them; the album is the one new room. */
      { path: '/personal', element: <RequireAuth>{wrap(<PersonalHome />)}</RequireAuth> },
      { path: '/personal/album', element: <RequireAuth>{wrap(<Album />)}</RequireAuth> },
      /* One day of the daybook. The calendar is the map; this is the place. */
      { path: '/daybook/:date', element: <RequireAuth>{wrap(<DayPage />)}</RequireAuth> },
      { path: '/thoughts', element: <RequireAuth>{wrap(<Thoughts />)}</RequireAuth> },
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
      { path: '/nutrition/saved', element: <RequireAuth>{wrap(<SavedRecipes />)}</RequireAuth> },
      { path: '/nutrition/preferences', element: <RequireAuth>{wrap(<Preferences />)}</RequireAuth> },
      { path: '/nutrition/grocery', element: <RequireAuth>{wrap(<Grocery />)}</RequireAuth> },
      { path: '/nutrition/recipes', element: <RequireAuth>{wrap(<RecipeLibrary />)}</RequireAuth> },
      // Before :id, or "own" is read as a recipe id. Your own recipes are part
      // of /nutrition/recipes now; the old URL still resolves for saved links.
      { path: '/nutrition/recipes/own', element: <Navigate to="/nutrition/saved" replace /> },
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
      /* The destination of every shared card's link. It used to be /social/feed. */
      { path: '/social/p/:id', element: <RequireAuth>{wrap(<SocPost />)}</RequireAuth> },
      { path: '/social/saved', element: <RequireAuth>{wrap(<SocSaved />)}</RequireAuth> },
      /* The journal moved out with Personal (15 Aug). It rendered here because
         the Social Life menu listed it — a private journal on the social
         shelf, which was always the wrong shelf. It is a city-level page now,
         routed with the rest of Personal's rooms below. */
    ],
  },
  {
    // Dating inner pages.
    element: <HubLayout hub={HUBS.dating} />,
    children: [
      { path: '/dating/profile', element: <RequireAuth>{wrap(<DatingProfilePage />)}</RequireAuth> },
      { path: '/dating/browse', element: <RequireAuth>{wrap(<DatingBrowse />)}</RequireAuth> },
      { path: '/dating/matches', element: <RequireAuth>{wrap(<DatingMatches />)}</RequireAuth> },
      { path: '/dating/chats', element: <RequireAuth>{wrap(<DatingChats />)}</RequireAuth> },
      { path: '/dating/admin', element: <RequireAuth>{wrap(<DatingAdminStats />)}</RequireAuth> },
      { path: '/dating/safety', element: <RequireAuth>{wrap(<DatingSafety />)}</RequireAuth> },
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
    /* PET DISTRICT.
       The feature exports its rooms as plain route objects; the auth gate and
       the chunk boundary are applied HERE, in one line, rather than written
       into twenty page entries inside the feature. A room that forgot its
       RequireAuth would look identical until the day it leaked somebody's pet
       profile, and this is the shape that makes forgetting impossible. */
    element: <HubLayout hub={HUBS.pets} />,
    children: petsRoutes.map((route) => ({
      ...route,
      element: <RequireAuth>{wrap(route.element as JSX.Element)}</RequireAuth>,
    })),
  },
  {
    /* E-COMMERCE. Two rooms, and the Pet district's shape rather than a pair
       of hand-written entries: the feature exports plain route objects and the
       auth gate and the chunk boundary are applied here, once. A room that
       forgot its RequireAuth would look identical until the day somebody's
       shortlist was readable signed out. */
    element: <HubLayout hub={HUBS.ecommerce} />,
    children: ecommerceRoutes.map((route) => ({
      ...route,
      element: <RequireAuth>{wrap(route.element as JSX.Element)}</RequireAuth>,
    })),
  },
  {
    // Fitness hub inner pages (reads Medical biomarkers via the consent gate).
    element: <HubLayout hub={HUBS.fitness} />,
    children: [
      { path: '/fitness/profile', element: <RequireAuth>{wrap(<FitnessProfile />)}</RequireAuth> },
      { path: '/fitness/body-goal', element: <RequireAuth>{wrap(<FitnessBodyGoal />)}</RequireAuth> },
      { path: '/fitness/plan', element: <RequireAuth>{wrap(<FitnessPlan />)}</RequireAuth> },
      { path: '/fitness/log', element: <RequireAuth>{wrap(<FitnessLog />)}</RequireAuth> },
      { path: '/fitness/workout', element: <RequireAuth>{wrap(<FitWorkout />)}</RequireAuth> },
      { path: '/fitness/supplements', element: <RequireAuth>{wrap(<FitSupplements />)}</RequireAuth> },
      { path: '/fitness/multivitamins', element: <RequireAuth>{wrap(<FitMultivitamins />)}</RequireAuth> },
      { path: '/fitness/store', element: <RequireAuth>{wrap(<FitStore />)}</RequireAuth> },
      { path: '/fitness/orders', element: <RequireAuth>{wrap(<FitOrders />)}</RequireAuth> },
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
      // THE TILL, CITIZEN SIDE. The detail route serves the business too — the
      // server shapes the object by who is asking, so one screen shows one
      // document rather than two screens showing two versions of it.
      { path: '/financial/invoices', element: <RequireAuth>{wrap(<FinInvoices />)}</RequireAuth> },
      { path: '/financial/invoices/:id', element: <RequireAuth>{wrap(<InvoiceView />)}</RequireAuth> },
    ],
  },
  {
    // Family Nutrition hub — one plan portioned per member (reached from the Nutrition Individual/Family toggle).
    element: <HubLayout hub={HUBS.family} />,
    children: [
      // The family hub has no landing — the door opens on the first thing to
      // DO (owner's call, 13 Aug): connect the members whose portions every
      // other page depends on. Same shape as /cars and /nutrition/weekly-classic.
      { path: '/family', element: <Navigate to="/family/connect" replace /> },
      { path: '/family/connect', element: <RequireAuth>{wrap(<FamConnect />)}</RequireAuth> },
      { path: '/family/weekly', element: <RequireAuth>{wrap(<FamWeekly />)}</RequireAuth> },
      { path: '/family/grocery', element: <RequireAuth>{wrap(<FamGrocery />)}</RequireAuth> },
      { path: '/family/cart', element: <RequireAuth>{wrap(<FamCart />)}</RequireAuth> },
      // Orders was empty until ordering goes live; its door now opens on the
      // list, where the coming-soon notice already stands.
      { path: '/family/orders', element: <Navigate to="/family/grocery" replace /> },
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
      { path: '/astrology/gemstones', element: <RequireAuth>{wrap(<AstroGemstones />)}</RequireAuth> },
      { path: '/astrology/gemstones/:gemId/design', element: <RequireAuth>{wrap(<GemStudio />)}</RequireAuth> },
      { path: '/astrology/gem-checkout', element: <RequireAuth>{wrap(<GemCheckout />)}</RequireAuth> },
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
      // Declared before ':id' on the server for the same reason it needs no
      // care here: 'orders' is a literal, and the citizen's own orders are a
      // room of their own rather than a tab inside somebody's business.
      { path: '/services/orders', element: <RequireAuth>{wrap(<MyOrders />)}</RequireAuth> },
      { path: '/services/:id/edit', element: <RequireAuth>{wrap(<EditBusiness />)}</RequireAuth> },
      // THE TILL, BUSINESS SIDE. Every one of these is per LISTING rather than
      // per owner: somebody with a salon and a tuition class keeps two books,
      // two payout accounts and two sets of invoices, because they are two
      // businesses however many of them one person runs.
      // THE COUNTER. Before the till's rooms because it is the one an owner
      // opens most: every order is already paid, and this is where it is
      // accepted, rejected-with-refund, and walked to the door.
      { path: '/services/:id/orders', element: <RequireAuth>{wrap(<BizOrders />)}</RequireAuth> },
      { path: '/services/:id/invoices', element: <RequireAuth>{wrap(<BizInvoices />)}</RequireAuth> },
      { path: '/services/:id/invoices/new', element: <RequireAuth>{wrap(<BizCreateInvoice />)}</RequireAuth> },
      { path: '/services/:id/payments', element: <RequireAuth>{wrap(<BizPayments />)}</RequireAuth> },
      { path: '/services/:id/payouts', element: <RequireAuth>{wrap(<BizPayoutAccount />)}</RequireAuth> },
      { path: '/services/:id/payouts/:payoutId', element: <RequireAuth>{wrap(<BizPayoutView />)}</RequireAuth> },
      // Declared last: every static /services/* path above wins on rank, so
      // 'browse' and 'mine' are never mistaken for a listing id.
      { path: '/services/:id', element: <RequireAuth>{wrap(<BusinessPage />)}</RequireAuth> },
      { path: '/services/regulars', element: <RequireAuth>{wrap(<Regulars />)}</RequireAuth> },
      { path: '/services/offers', element: <RequireAuth>{wrap(<DailyOffers />)}</RequireAuth> },
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
    // Together City Mail — webmail inbox (@togethercity.app), 10 GB per citizen.
    element: <HubLayout hub={HUBS.mail} />,
    children: [
      /* THE DOOR. /mail used to be a hub landing that redirected past itself
         to the inbox on every visit after the first, so the mailbox had a
         front door nobody stood in. It is the project cards now — All Email
         first, then the rooms — and every older mail URL below is untouched. */
      { path: '/mail', element: <RequireAuth>{wrap(<MailProjects />)}</RequireAuth> },
      { path: '/mail/projects', element: <Navigate to="/mail" replace /> },
      { path: '/mail/p/:key', element: <RequireAuth>{wrap(<MailProjectInbox />)}</RequireAuth> },
      { path: '/mail/p/:key/:folder', element: <RequireAuth>{wrap(<MailProjectFolder />)}</RequireAuth> },
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
  { path: '/login', element: <Navigate to="/sign-in" replace /> },
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
];

/**
 * ONE ROOT, ABOVE EVERY BLOCK. RootChrome renders an Outlet and the chrome that
 * is true of the whole application rather than of one layout — today that is
 * Mira's door. Adding a twentieth route block below costs nothing and cannot
 * lose her, which is the entire point of the wrapper.
 */
export const router = createBrowserRouter([
  { element: <RootChrome />, children: ROUTE_BLOCKS },
]);
