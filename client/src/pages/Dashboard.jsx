import React from 'react';
import { useParams } from 'react-router-dom';
import Header from '../components/Header';
import StockQuote from '../components/StockQuote';
import StockChart from '../components/StockChart';
import Portfolio from '../components/Portfolio';
import TradeForm from '../components/TradeForm';
import TransactionHistory from '../components/TransactionHistory';

function Dashboard() {
  const { username } = useParams();

  return (
    <div>
      <Header username={username} />
      <StockQuote />
      <StockChart />
      <TradeForm username={username} />
      <Portfolio username={username} />
      <TransactionHistory username={username} />
    </div>
  );
}

export default Dashboard;