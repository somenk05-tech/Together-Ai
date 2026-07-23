import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="tc-footer">
      <span className="word">TOGETHER CITY</span>
      <nav aria-label="Utility">
        <Link to="/about">About</Link>
        <Link to="/help">Help</Link>
        <Link to="/legal/privacy">Privacy</Link>
        <Link to="/legal/terms">Terms</Link>
        <Link to="/contact">Contact</Link>
      </nav>
      <span>The world's largest digital city. Everything personalized. © 2026 Together City</span>
    </footer>
  );
}
