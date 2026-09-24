import React, { useEffect, useState } from 'react';
import axios from 'axios';

function TransactionHistory({ username }) {
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');

  const fetchTransactions = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/api/transactions/${username}`);
      setTransactions(res.data);
      setError('');
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setError('Failed to load transaction history');
    }
  };

  useEffect(() => {
    fetchTransactions();
    // Refresh every 5 seconds
    const interval = setInterval(fetchTransactions, 5000);
    return () => clearInterval(interval);
  }, [username]);

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  const getTypeDisplay = (type, description) => {
    if (type === 'TRADE' && description) {
      return description.toLowerCase().startsWith('buy') ? 'BUY' : 'SELL';
    }
    return type;
  };

  const getTypeClass = (description, type) => {
    if (type === 'TRADE' && description) {
      return description.toLowerCase().startsWith('buy') ? 'buy' : 'sell';
    }
    return type.toLowerCase();
  };

  return (
    <div className="transactions">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Symbol</th>
            <th>Type</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.transaction_id}>
              <td>{new Date(transaction.date).toLocaleString()}</td>
              <td>{transaction.symbol}</td>
              <td>
                <span className={`type-badge ${getTypeClass(transaction.description, transaction.type)}`}>
                  {getTypeDisplay(transaction.type, transaction.description)}
                </span>
              </td>
              <td>{transaction.quantity}</td>
              <td>${parseFloat(transaction.price).toFixed(2)}</td>
              <td>${parseFloat(transaction.total_amount).toFixed(2)}</td>
              <td className="description">{transaction.description || '-'}</td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr>
              <td colSpan="7" className="no-transactions">
                No transactions yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <style jsx>{`
        .transactions {
          overflow-x: auto;
          margin-top: 1rem;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }
        th {
          background-color: var(--secondary-bg);
          font-weight: 600;
        }
        .type-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 500;
          text-transform: uppercase;
        }
        .type-badge.buy {
          background-color: rgba(35, 134, 54, 0.2);
          color: #2ea043;
        }
        .type-badge.sell {
          background-color: rgba(248, 81, 73, 0.2);
          color: #f85149;
        }
        .type-badge.deposit {
          background-color: rgba(88, 166, 255, 0.2);
          color: #58a6ff;
        }
        .type-badge.withdrawal {
          background-color: rgba(248, 81, 73, 0.2);
          color: #f85149;
        }
        .type-badge.dividend {
          background-color: rgba(35, 134, 54, 0.2);
          color: #2ea043;
        }
        td {
          white-space: nowrap;
        }
        td.description {
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .no-transactions {
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
        }
        .error-message {
          color: var(--danger-color);
          text-align: center;
          padding: 1rem;
          background-color: rgba(248, 81, 73, 0.1);
          border-radius: 4px;
          margin: 1rem 0;
        }
      `}</style>
    </div>
  );
}

export default TransactionHistory;
