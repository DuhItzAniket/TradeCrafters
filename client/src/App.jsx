import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import StockChart from './components/StockChart';
import Portfolio from './components/Portfolio';
import TradeForm from './components/TradeForm';
import TransactionHistory from './components/TransactionHistory';
import Login from './components/Login';
import './App.css';

function App() {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');

  const handleLogin = (user) => {
    setUsername(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setUsername('');
  };

  // Protected Route component
  const ProtectedRoute = ({ children }) => {
    if (!username) {
      return <Navigate to="/login" />;
    }
    return children;
  };

  return (
    <Router>
      <div>
        {username && (
          <nav className="navbar">
            <div className="container navbar-content">
              <Link to="/" className="logo">📈 TRADECRAFTERS</Link>
              <div className="nav-links">
                <Link to="/" className="nav-link">Home</Link>
                <Link to="/portfolio" className="nav-link">Portfolio</Link>
                <Link to="/trade" className="nav-link">Trade</Link>
                <Link to="/history" className="nav-link">History</Link>
                <div className="user-menu">
                  <span className="nav-link">{username}</span>
                  <button onClick={handleLogout} className="logout-button">Logout</button>
                </div>
              </div>
            </div>
          </nav>
        )}

        <div className="container">
          <Routes>
            <Route path="/login" element={
              username ? <Navigate to="/" /> : <Login onLogin={handleLogin} />
            } />
            
            <Route path="/" element={
              <ProtectedRoute>
                <>
                  <div className="card">
                    <h2 className="card-title">Stock Data</h2>
                    <p className="card-subtitle">Display real-time stock prices using an API (Alpha Vantage)</p>
                    <StockChart />
                  </div>
                  
                  <div className="grid">
                    <div className="card">
                      <h2 className="card-title">Portfolio</h2>
                      <p className="card-subtitle">View owned stocks with quantity, average price, total value</p>
                      <p className="card-subtitle">Calculate total portfolio value (live)</p>
                      <Portfolio username={username} />
                    </div>
                    
                    <div className="card">
                      <h2 className="card-title">Trading</h2>
                      <p className="card-subtitle">Buy/Sell stocks</p>
                      <p className="card-subtitle">Order placement with price, quantity</p>
                      <p className="card-subtitle">Update user portfolio after each trade</p>
                      <TradeForm username={username} />
                    </div>
                  </div>

                  <div className="card">
                    <h2 className="card-title">Transaction History</h2>
                    <p className="card-subtitle">Log all buy/sell operations</p>
                    <TransactionHistory username={username} />
                  </div>
                </>
              </ProtectedRoute>
            } />

            <Route path="/portfolio" element={
              <ProtectedRoute>
                <Portfolio username={username} />
              </ProtectedRoute>
            } />
            
            <Route path="/trade" element={
              <ProtectedRoute>
                <TradeForm username={username} />
              </ProtectedRoute>
            } />
            
            <Route path="/history" element={
              <ProtectedRoute>
                <TransactionHistory username={username} />
              </ProtectedRoute>
            } />
          </Routes>
          <footer className="footer">
            <div className="container">
              <p>&copy; {new Date().getFullYear()} TradeCrafters. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>

      <style jsx>{`
        .user-menu {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .logout-button {
          background-color: var(--danger-color);
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
        }
        .footer {
          margin-top: 2rem;
          padding: 1rem 0;
          background-color: var(--secondary-bg);
          border-top: 1px solid var(--border-color);
          text-align: center;
          position: relative;
          bottom: 0;
          width: 100%;
        }
        .footer p {
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin: 0;
        }
      `}</style>
    </Router>
  );
}

export default App;
