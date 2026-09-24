import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  const handleLogin = () => {
    if (username.trim()) {
      navigate(`/dashboard/${username}`);
    }
  };

  return (
    <div className="login-container">
      <h1>Welcome to TradeCrafters</h1>
      <input
        type="text"
        placeholder="Enter your name"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <button onClick={handleLogin}>Start Trading</button>
    </div>
  );
}

export default Home;