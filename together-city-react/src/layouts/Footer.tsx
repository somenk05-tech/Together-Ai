import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="tc-footer">
      <span className="word">TOGETHER CITY</span>
      <nav>
        <Link to="/">City</Link><Link to="/profile">Dashboard</Link>
        <Link to="/chats">Chats</Link><Link to="/connections">Connections</Link><Link to="/profile">Profile</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <span>One city. Every part of life. © 2026 Together City</span>
    </footer>
  );
}
