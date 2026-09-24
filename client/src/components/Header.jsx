import React from 'react';

function Header({ username }) {
  return (
    <header className="header">
      <h2>TradeCrafters Dashboard</h2>
      <p>Welcome, {username}</p>
    </header>
  );
}

export default Header;
