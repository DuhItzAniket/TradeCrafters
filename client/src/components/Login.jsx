import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Login({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (isRegistering) {
        // Registration
        const response = await axios.post('http://localhost:5000/api/auth/register', {
          username,
          email,
          password
        });
        
        if (response.status === 201) {
          // Switch to login mode after successful registration
          setIsRegistering(false);
          setPassword(''); // Clear password for security
          setError('');
          // Show success message
          setError('Registration successful! Please login with your credentials.');
        }
      } else {
        // Login
        const response = await axios.post('http://localhost:5000/api/auth/login', {
          username, // Send username, not email for login
          password
        });
        
        if (response.data.success) {
          localStorage.setItem('username', username);
          onLogin(username);
          navigate('/');
        }
      }
    } catch (error) {
      console.error(isRegistering ? 'Registration error:' : 'Login error:', error);
      setError(error.response?.data?.error || (isRegistering ? 'Registration failed' : 'Invalid username or password'));
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
    setUsername('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">📈 TRADECRAFTERS</h2>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className={`error-message ${error.includes('successful') ? 'success' : ''}`}>{error}</div>}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Enter your username"
            />
          </div>
          {isRegistering && (
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>
          <button type="submit" className="login-button">
            {isRegistering ? 'Register' : 'Login'}
          </button>
          <button type="button" className="toggle-button" onClick={toggleMode}>
            {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
          </button>
        </form>
      </div>

      <style jsx>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 1rem;
        }
        .login-card {
          background-color: var(--secondary-bg);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 2rem;
          width: 100%;
          max-width: 400px;
        }
        .login-title {
          text-align: center;
          font-size: 2rem;
          margin-bottom: 2rem;
          color: var(--text-primary);
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .login-button {
          background-color: var(--accent-color);
          margin-top: 1rem;
        }
        .toggle-button {
          background: none;
          border: none;
          color: var(--accent-color);
          font-size: 0.9rem;
          cursor: pointer;
          padding: 0.5rem;
        }
        .toggle-button:hover {
          text-decoration: underline;
        }
        .error-message {
          color: var(--danger-color);
          text-align: center;
          padding: 0.5rem;
          border-radius: 4px;
          background-color: rgba(248, 81, 73, 0.1);
        }
        .error-message.success {
          color: #4CAF50;
          background-color: rgba(76, 175, 80, 0.1);
        }
      `}</style>
    </div>
  );
}

export default Login; 