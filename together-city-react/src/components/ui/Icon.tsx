import type { CSSProperties } from 'react';
import {
  Bell, Heart, MessageCircle, MessageSquare, UserPlus, Users, Handshake, CheckCircle2,
  Sparkles, AtSign, Mail, Menu, User, Share2, Star, MapPin, Film, Tv, UtensilsCrossed,
  Salad, Briefcase, Home, Ticket, ShoppingBag, Plane, Luggage, CalendarDays, Bookmark,
  Search, Clock, ShieldCheck, type LucideIcon,
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
  | 'product' | 'flight' | 'trip' | 'calendar' | 'save' | 'search' | 'clock' | 'shield';

const MAP: Record<IconName, LucideIcon> = {
  bell: Bell, heart: Heart, comment: MessageCircle, follow: UserPlus, connection: Handshake,
  accepted: CheckCircle2, sparkles: Sparkles, mention: AtSign, mail: Mail, menu: Menu,
  user: User, people: Users, chat: MessageSquare, share: Share2, star: Star, place: MapPin,
  movie: Film, tv: Tv, restaurant: UtensilsCrossed, recipe: Salad, job: Briefcase,
  property: Home, ticket: Ticket, product: ShoppingBag, flight: Plane, trip: Luggage,
  calendar: CalendarDays, save: Bookmark, search: Search, clock: Clock, shield: ShieldCheck,
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
