import type { CSSProperties } from 'react';
import {
  Bell, Heart, MessageCircle, MessageSquare, UserPlus, Users, Handshake, CheckCircle2,
  Sparkles, AtSign, Mail, Menu, User, Share2, Star, MapPin, Film, Tv, UtensilsCrossed,
  Salad, Briefcase, Home, Ticket, ShoppingBag, Plane, Luggage, CalendarDays, Bookmark,
  Search, Clock, ShieldCheck,
  // Social Life chrome. Added because those screens were labelling their own
  // controls with emoji — camera, film, speech bubble, people, pin, smile,
  // briefcase, globe, money bag — which this file's own rule has always
  // forbidden for chrome. A name had to exist before the rule could be obeyed.
  Camera, Video, Globe2, Hash, Smile, Sun, Wallet, Pencil, Image, ArrowUpDown,
  LayoutGrid, Plus, ArrowLeft, ChevronRight, Notebook, MoreHorizontal,
  Music, X, Flag, Ban, FolderOpen, Satellite, TriangleAlert, Play, Pause,
  Megaphone, FileText, LineChart,
  // Mira's voice, on and off. A megaphone stood in for this and read as
  // "broadcast" rather than "read this aloud" — the owner asked what the
  // button did, which is the only review a control icon ever gets.
  Volume2, VolumeX,
  type LucideIcon,
} from 'lucide-react';

/**
 * The app's single icon primitive. Chrome — navigation, tabs, buttons and cards —
 * uses these consistent line icons (Lucide) instead of emoji, for a cohesive,
 * premium visual language. Emoji stay reserved for user-generated content, chat
 * reactions, mood/journal entries and AI-written messages, where personality helps.
 *
 * Reference icons by SEMANTIC name so the underlying set can be swapped centrally.
 */
export type IconName =
  | 'bell' | 'heart' | 'comment' | 'follow' | 'connection' | 'accepted' | 'sparkles' | 'mention'
  | 'mail' | 'menu' | 'user' | 'people' | 'chat' | 'share'
  | 'star' | 'place' | 'movie' | 'tv' | 'restaurant' | 'recipe' | 'job' | 'property' | 'ticket'
  | 'product' | 'flight' | 'trip' | 'calendar' | 'save' | 'search' | 'clock' | 'shield'
  | 'camera' | 'video' | 'globe' | 'hash' | 'mood' | 'personal' | 'wallet' | 'edit'
  | 'image' | 'reorder' | 'grid' | 'plus' | 'back' | 'next' | 'journal' | 'more'
  | 'music' | 'close' | 'flag' | 'block' | 'sort' | 'locating' | 'warn'
  | 'play' | 'pause'
  // Marks the mail folders derive from a project's name.
  | 'megaphone' | 'doc' | 'chart'
  // Mira reading her replies aloud, and not.
  | 'speak' | 'mute';

const MAP: Record<IconName, LucideIcon> = {
  bell: Bell, heart: Heart, comment: MessageCircle, follow: UserPlus, connection: Handshake,
  accepted: CheckCircle2, sparkles: Sparkles, mention: AtSign, mail: Mail, menu: Menu,
  user: User, people: Users, chat: MessageSquare, share: Share2, star: Star, place: MapPin,
  movie: Film, tv: Tv, restaurant: UtensilsCrossed, recipe: Salad, job: Briefcase,
  property: Home, ticket: Ticket, product: ShoppingBag, flight: Plane, trip: Luggage,
  calendar: CalendarDays, save: Bookmark, search: Search, clock: Clock, shield: ShieldCheck,
  camera: Camera, video: Video, globe: Globe2, hash: Hash, mood: Smile, personal: Sun,
  wallet: Wallet, edit: Pencil, image: Image, reorder: ArrowUpDown, grid: LayoutGrid,
  plus: Plus, back: ArrowLeft, next: ChevronRight, journal: Notebook, more: MoreHorizontal,
  music: Music, close: X, flag: Flag, block: Ban, sort: FolderOpen,
  locating: Satellite, warn: TriangleAlert, play: Play, pause: Pause,
  // Four marks the mail folders derive from a project's name. Megaphone,
  // FileText and LineChart had no entry here; `sort` (FolderOpen) is the
  // plain folder every unmatched name falls back to and was already present.
  megaphone: Megaphone, doc: FileText, chart: LineChart,
  speak: Volume2, mute: VolumeX,
};

export function Icon({ name, size = 18, strokeWidth = 1.75, className, style }: {
  name: IconName; size?: number; strokeWidth?: number; className?: string; style?: CSSProperties;
}) {
  const C = MAP[name] ?? Bell;
  return (
    <C size={size} strokeWidth={strokeWidth} className={className} aria-hidden
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0, ...style }} />
  );
}
