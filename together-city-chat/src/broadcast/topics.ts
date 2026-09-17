/**
 * ── ONE TOPIC, ONE SET OF DOORS (owner, 17 Sep) ─────────────────────────────
 *
 * "Create a together social media page where I upload the video there and all
 * details are automatically uploaded on youtube and instagram channels from
 * there, connect dating with dating site, health with health."
 *
 * A topic is the whole routing table for one upload: which YouTube channel it
 * goes to, which Instagram account and Threads profile, which Together City
 * hub the description sends people to, and which hub pages show it
 * afterwards. Nothing else in the desk decides where a video goes.
 *
 * THE ACCOUNTS ARE NAMED, NOT DISCOVERED. Each YouTube channel is written down
 * by its channel id and each Instagram/Threads profile by its username, and a
 * sign-in that comes back as anybody else is refused (accounts.service.ts).
 * All six YouTube channels sit under one Google login, so the account chooser
 * is one mis-click away from connecting Dating's slot to the Pets channel —
 * and a Dating film on the Pets channel is a mistake nobody can take back
 * from here.
 *
 * The ids and usernames are the ones set up on 17 Sep (see the audit doc
 * "Together City Dating — Social Growth Audit" in the project).
 */

export type TopicKey = 'dating' | 'health' | 'fitness' | 'pets' | 'astrology' | 'world';

export interface Topic {
  key: TopicKey;
  label: string;
  /** Where the description and caption send people — a real route in the web app. */
  hubPath: string;
  /** The HubLanding keys whose page shows this topic's videos. World has no
   *  hub page of its own; its films live on the channels and on Together TV. */
  hubs: string[];
  youtube: { channelId: string; handle: string; categoryId: string };
  instagram: string;
  threads: string;
  /** Three, always three — see the audit's hashtag rule. */
  hashtags: [string, string, string];
  /** The one line a film on this topic must carry, or null. */
  disclaimer: string | null;
  /** What the drafting model is told this channel is. */
  brief: string;
}

export const SITE = 'https://togethercity.app';

export const TOPICS: readonly Topic[] = [
  {
    key: 'dating', label: 'Dating', hubPath: '/matchmaking', hubs: ['dating'],
    youtube: { channelId: 'UCDV1dJnJoPMqvRa8fmA29-g', handle: '@TogethercityDating', categoryId: '1' },
    instagram: 'togethercitymatchmaking', threads: 'togethercitymatchmaking',
    hashtags: ['#TogetherCity', '#Dating', '#LoveStory'],
    disclaimer: null,
    brief: 'Together City – Dating: short love-story series about compatibility-first matchmaking. Warm, cinematic, never cheesy; the app is a compatibility engine, not a swipe app.',
  },
  {
    key: 'health', label: 'Health', hubPath: '/medical', hubs: ['medical', 'nutrition'],
    youtube: { channelId: 'UCSIhiL9roCklRF6iZNXV1Zg', handle: '@togethercityhealth', categoryId: '27' },
    instagram: 'togethercity_nutrition', threads: 'togethercity_nutrition',
    hashtags: ['#TogetherCity', '#Health', '#Nutrition'],
    disclaimer: 'For education only — not medical advice. Talk to your doctor about your own health.',
    brief: 'Together City – Health: short explainer films on how the body works — food, blood sugar, gut, sleep. Accurate, calm, never a diagnosis or a cure claim.',
  },
  {
    key: 'fitness', label: 'Fitness', hubPath: '/fitness', hubs: ['fitness'],
    youtube: { channelId: 'UCD-i8T3tYF52LOQ3Wn8WWyA', handle: '@TogetherCityFitness', categoryId: '26' },
    instagram: 'togethercity_fitness', threads: 'togethercity_fitness',
    hashtags: ['#TogetherCity', '#HomeWorkout', '#Fitness'],
    disclaimer: 'Check with a doctor before starting a new exercise program.',
    brief: 'Together City – Fitness: follow-along home workouts filmed like movies. Name the move, the muscles and the common form mistake; no body-shaming, no promised results.',
  },
  {
    key: 'pets', label: 'Pets', hubPath: '/pets', hubs: ['pets'],
    youtube: { channelId: 'UCiim0uRRjUhrCX0e6Mr2fFA', handle: '@TogetherCityPets', categoryId: '15' },
    instagram: 'togethercity_pets', threads: 'togethercity_pets',
    hashtags: ['#TogetherCity', '#Pets', '#DogsAndCats'],
    disclaimer: 'Not veterinary advice — ask your vet about your own pet.',
    brief: 'Together City Pets: dog and cat comedy told from the pet\'s point of view, plus simple care tips. Playful, kind, never medical claims.',
  },
  {
    key: 'astrology', label: 'Astrology', hubPath: '/astrology', hubs: ['astrology'],
    youtube: { channelId: 'UCRvznGSOxXLDIr4ZSar5POA', handle: '@togethercity-astrology', categoryId: '24' },
    instagram: 'togethercity_astrology', threads: 'togethercity_astrology',
    hashtags: ['#TogetherCity', '#Astrology', '#Horoscope'],
    disclaimer: 'For reflection and entertainment.',
    brief: 'Together City – Astrology: horoscopes, zodiac signs and birth charts read clearly. Reflective, never fear-based, no guaranteed predictions.',
  },
  {
    key: 'world', label: 'World', hubPath: '/', hubs: [],
    youtube: { channelId: 'UCAm0byocKV236N8mzEuLWPg', handle: '@togethercityworld', categoryId: '24' },
    instagram: 'togethercity', threads: 'togethercity',
    hashtags: ['#TogetherCity', '#DigitalCity', '#Lifestyle'],
    disclaimer: null,
    brief: 'Together City: the brand channel for the whole digital city — dating, health, fitness, pets and more in one app.',
  },
];

export const TOPIC_KEYS = TOPICS.map((t) => t.key) as [TopicKey, ...TopicKey[]];

export function topic(key: string): Topic | undefined {
  return TOPICS.find((t) => t.key === key);
}

/** The topic whose videos a hub page shows, or undefined. */
export function topicForHub(hub: string): Topic | undefined {
  return TOPICS.find((t) => t.hubs.includes(hub));
}

export const hubUrl = (t: Topic): string => (t.hubPath === '/' ? SITE : `${SITE}${t.hubPath}`);
