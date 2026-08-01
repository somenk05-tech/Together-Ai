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
      <span>Your data is yours — download or delete it any time in <Link to="/settings">Settings</Link>.</span>
      <span>One city for your whole life. Everything personalized. © 2026 Together City</span>
    </footer>
  );
}
