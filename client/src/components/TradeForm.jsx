import React, { useState, useEffect } from 'react';
import axios from 'axios';

function TradeForm({ username }) {
  const [formData, setFormData] = useState({
    symbol: '',
    quantity: '',
    price: '',
    type: 'buy'
  });

  const [message, setMessage] = useState({ text: '', type: '' });
  const [currentPrice, setCurrentPrice] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch current price when symbol changes
  useEffect(() => {
    const fetchCurrentPrice = async () => {
      if (!formData.symbol) {
        setCurrentPrice(null);
        return;
      }

      setLoading(true);
      try {
        const response = await axios.get(`http://localhost:5000/api/stocks/chart/${formData.symbol}`);
        const timeSeries = response.data['Time Series (Daily)'];
        if (timeSeries) {
          // Get the most recent day's data
          const mostRecentDate = Object.keys(timeSeries)[0];
          const mostRecentData = timeSeries[mostRecentDate];
          const price = parseFloat(mostRecentData['4. close']).toFixed(2);
          setCurrentPrice(price);
          // Auto-fill the price field with current market price
          setFormData(prev => ({
            ...prev,
            price: price
          }));
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching price:', error);
        setCurrentPrice(null);
        setLoading(false);
      }
    };

    // Debounce the API call to prevent too many requests
    const timeoutId = setTimeout(() => {
      if (formData.symbol) {
        fetchCurrentPrice();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.symbol]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Show loading message
      setMessage({ text: 'Processing trade...', type: 'info' });
      console.log(formData);
      await axios.post('http://localhost:5000/api/trade', {
        ...formData,
        username
      });

      // Show success message
      setMessage({
        text: `Successfully ${formData.type === 'buy' ? 'bought' : 'sold'} ${formData.quantity} shares of ${formData.symbol} at $${formData.price}`,
        type: 'success'
      });

      // Clear form
      setFormData({
        symbol: '',
        quantity: '',
        price: '',
        type: 'buy'
      });

      // Clear success message after 5 seconds
      setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 5000);

    } catch (error) {
      console.error('Error executing trade:', error);
      setMessage({
        text: error.response?.data?.error || 'Failed to execute trade. Please try again.',
        type: 'error'
      });

      // Clear error message after 5 seconds
      setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 5000);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="trade-form-container">
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="trade-form">
        <div className="form-group">
          <label htmlFor="symbol">Symbol</label>
          <input
            type="text"
            id="symbol"
            name="symbol"
            value={formData.symbol}
            onChange={handleChange}
            placeholder="e.g., AAPL"
            required
          />
          {loading && <div className="price-info loading">Fetching current price...</div>}
          {currentPrice && !loading && (
            <div className="price-info">
              Current Market Price: <span className="current-price">${currentPrice}</span>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="quantity">Quantity</label>
          <input
            type="number"
            id="quantity"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            min="1"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="price">Price</label>
          <input
            type="number"
            id="price"
            name="price"
            value={formData.price}
            onChange={handleChange}
            min="0.01"
            step="0.01"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleChange}
            required
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>

        <button type="submit" className={formData.type === 'buy' ? 'btn-buy' : 'btn-sell'}>
          {formData.type === 'buy' ? 'Buy' : 'Sell'}
        </button>
      </form>

      <style jsx>{`
        .trade-form-container {
          position: relative;
        }
        .message {
          position: relative;
          padding: 1rem;
          margin-bottom: 1rem;
          border-radius: 6px;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .message.success {
          background-color: rgba(35, 134, 54, 0.2);
          border: 1px solid var(--success-color);
          color: #2ea043;
        }
        .message.error {
          background-color: rgba(248, 81, 73, 0.2);
          border: 1px solid var(--danger-color);
          color: #f85149;
        }
        .message.info {
          background-color: rgba(88, 166, 255, 0.2);
          border: 1px solid var(--accent-color);
          color: var(--accent-color);
        }
        .price-info {
          margin-top: 0.5rem;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .price-info.loading {
          color: var(--accent-color);
          font-style: italic;
        }
        .current-price {
          color: var(--text-primary);
          font-weight: 600;
        }
        .trade-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        label {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        select {
          background-color: var(--secondary-bg);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 0.5rem 1rem;
          color: var(--text-primary);
          font-size: 1rem;
          width: 100%;
        }
        select:focus {
          outline: none;
          border-color: var(--accent-color);
        }
        .btn-buy {
          background-color: var(--success-color);
        }
        .btn-sell {
          background-color: var(--danger-color);
        }
      `}</style>
    </div>
  );
}

export default TradeForm;