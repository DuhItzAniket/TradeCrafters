import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function StockChart() {
  const [symbol, setSymbol] = useState('MSFT');
  const [chartData, setChartData] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);

  useEffect(() => {
    const fetchChart = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/stocks/chart/${symbol}`);
        const timeSeries = res.data["Time Series (Daily)"];
        const labels = Object.keys(timeSeries).slice(0, 30).reverse();
        const data = labels.map(date => parseFloat(timeSeries[date]["4. close"]));
        
        // Set current price
        setCurrentPrice(data[data.length - 1].toFixed(2));

        setChartData({
          labels,
          datasets: [
            {
              label: `${symbol} Price`,
              data,
              fill: 'start',
              backgroundColor: 'rgba(88, 166, 255, 0.1)',
              borderColor: '#58a6ff',
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: '#58a6ff',
            }
          ]
        });
      } catch (error) {
        console.error('Error fetching chart data:', error);
      }
    };
    fetchChart();
  }, [symbol]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#161b22',
        borderColor: '#30363d',
        borderWidth: 1,
        titleColor: '#8b949e',
        bodyColor: '#ffffff',
        displayColors: false,
        callbacks: {
          label: (context) => `$${context.parsed.y.toFixed(2)}`
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false
        },
        ticks: {
          color: '#8b949e',
          maxRotation: 0
        }
      },
      y: {
        grid: {
          color: '#30363d',
          drawBorder: false
        },
        ticks: {
          color: '#8b949e',
          callback: (value) => `$${value}`
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    }
  };

  return (
    <div className="stock-chart-container">
      <div className="stock-info">
        <div className="stock-symbol">{symbol}</div>
        {currentPrice && <div className="stock-price">${currentPrice}</div>}
      </div>
      <div className="stock-chart">
        {chartData && <Line data={chartData} options={options} />}
      </div>
      <style jsx>{`
        .stock-chart-container {
          position: relative;
          height: 400px;
        }
        .stock-info {
          position: absolute;
          top: 1rem;
          right: 1rem;
          text-align: right;
          z-index: 1;
        }
        .stock-symbol {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .stock-price {
          font-size: 2rem;
          font-weight: 700;
          color: var(--accent-color);
        }
        .stock-chart {
          height: 100%;
        }
      `}</style>
    </div>
  );
}

export default StockChart;
