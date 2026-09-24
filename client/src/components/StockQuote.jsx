import React, { useState } from 'react';
import axios from 'axios';

function StockQuote() {
  const [symbol, setSymbol] = useState('AAPL');
  const [quote, setQuote] = useState(null);

  const fetchQuote = async () => {
    const res = await axios.get(`http://localhost:5000/api/stocks/quote/${symbol}`);
    setQuote(res.data["Global Quote"]);
  };

  return (
    <div className="stock-quote">
      <h3>Get Stock Quote</h3>
      <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
      <button onClick={fetchQuote}>Fetch</button>
      {quote && (
        <div>
          <p><strong>Price:</strong> ${quote["05. price"]}</p>
          <p><strong>Change:</strong> {quote["10. change percent"]}</p>
        </div>
      )}
    </div>
  );
}

export default StockQuote;
