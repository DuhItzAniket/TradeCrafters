import React, { useEffect, useState } from 'react';
import axios from 'axios';

function Portfolio({ username }) {
  const [portfolio, setPortfolio] = useState([]);
  const [totalValue, setTotalValue] = useState(0);

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/portfolio/${username}`);
        setPortfolio(res.data);
        const total = res.data.reduce((sum, item) => sum + parseFloat(item.total_value), 0);
        setTotalValue(total);
      } catch (error) {
        console.error('Error fetching portfolio:', error);
      }
    };
    fetchPortfolio();
  }, [username]);

  return (
    <div className="portfolio">
      <table>
        <thead>
          <tr>
            <th>Stock</th>
            <th>Quantity</th>
            <th>Avg. Price</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.map((item) => (
            <tr key={item.symbol}>
              <td>{item.symbol}</td>
              <td>{item.quantity}</td>
              <td>${parseFloat(item.average_cost).toFixed(2)}</td>
              <td>${parseFloat(item.total_value).toFixed(2)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan="3">Total</td>
            <td>${totalValue.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <style jsx>{`
        .portfolio {
          overflow-x: auto;
        }
        .total-row {
          font-weight: 600;
          border-top: 2px solid var(--border-color);
        }
        .total-row td {
          padding-top: 1rem;
        }
      `}</style>
    </div>
  );
}

export default Portfolio;
