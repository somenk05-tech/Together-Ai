import { Link, useLocation } from 'react-router-dom';

/**
 * THE FOOT OF THE CITY BELONGS TO THE CITY, NOT TO EVERY ROOM IN IT.
 *
 * About, Help, Privacy, Terms, Contact and the line about your data are what
 * a place says when you arrive at its front door and are deciding whether to
 * come in. Repeated under Beauty, under a salon's price list, under a search
 * result and under somebody's profile, they stop being an introduction and
 * become forty pixels of legal furniture at the bottom of every screen — and
 * on a phone, where the screen is the page, that is the last thing a citizen
 * reads about a haircut.
 *
 * ONE RULE, IN THE ONE COMPONENT BOTH LAYOUTS ASK FOR. AppShell renders the
 * city home and the twelve hub landings; HubLayout renders every inner hub
 * page. Deciding here rather than in each of them is the difference between
 * one rule and two that can drift — and it is why nothing above needed to
 * change: both still ask for the foot, and the foot answers.
 *
 * Nothing is removed. Every link, every line and the whole of its design are
 * exactly as they were; on any page but the home page this returns nothing at
 * all, which is not a hidden element and therefore not a gap either — the
 * page simply ends where its content ends.
 */
export function Footer() {
  /* The city home, and only the city home. A hub LANDING is not it: /travel
     is a hub's front door, not the city's. */
  if (useLocation().pathname !== '/') return null;

  return (
    <footer className="tc-footer">
      <span className="word">TOGETHER CITY</span>
      <nav aria-label="Utility">
        <Link to="/about">About</Link>
        <Link to="/help">Help</Link>
        <Link to="/legal/privacy">Privacy</Link>
        <Link to="/legal/terms">Terms</Link>
        <Link to="/contact">Contact</Link>
        <Link to="/investor">Investor</Link>
      </nav>
      <span>Your data is yours — download or delete it any time in <Link to="/settings">Settings</Link>.</span>
      <span>One city for your whole life. Everything personalized. © 2026 Together City</span>
    </footer>
  );
}
