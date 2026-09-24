const db = require('../database/db');
const bcrypt = require('bcrypt');

exports.trade = async (req, res) => {
  const { username, symbol, quantity, price, type } = req.body;

  try {
    // Debug log
    console.log('Received trade request:', { username, symbol, quantity, price, type });

    // Input validation
    if (!username || !symbol || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Price must be greater than 0' });
    }
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    // Start transaction
    await db.query('START TRANSACTION');

    try {
      // Ensure user exists
      console.log('Checking if user exists:', username);
      const [users] = await db.query('SELECT user_id, username FROM users WHERE username = ?', [username]);
      
      if (users.length === 0) {
        throw new Error('User does not exist. Please register or login first.');
      }

      const userId = users[0].user_id;

      // Get current balance
      const [balanceResult] = await db.query(
        'SELECT account_balance FROM Users WHERE user_id = ?',
        [userId]
      );
      const currentBalance = balanceResult[0].account_balance;
      const transactionAmount = quantity * price;

      // Check if user has sufficient funds for buying
      if (type.toLowerCase() === 'buy' && transactionAmount > currentBalance) {
        throw new Error(`Insufficient funds. Required: $${transactionAmount}, Available: $${currentBalance}`);
      }

      // Get current portfolio holding
      console.log('Checking portfolio for:', { username, symbol });
      const [holdings] = await db.query(
        'SELECT quantity, avg_price FROM Portfolios WHERE username = ? AND symbol = ?',
        [username, symbol]
      );

      if (type.toLowerCase() === 'buy') {
        if (holdings.length === 0) {
          console.log('Creating new portfolio entry:', { username, symbol, quantity, price });
          await db.query(
            'INSERT INTO Portfolios (username, symbol, quantity, avg_price) VALUES (?, ?, ?, ?)',
            [username, symbol, quantity, price]
          );
        } else {
          const currentHolding = holdings[0];
          const newQuantity = currentHolding.quantity + quantity;
          const newAvgPrice = ((currentHolding.quantity * currentHolding.avg_price) + (quantity * price)) / newQuantity;
          
          console.log('Updating existing portfolio:', { 
            username, 
            symbol, 
            newQuantity, 
            newAvgPrice 
          });

          await db.query(
            'UPDATE Portfolios SET quantity = ?, avg_price = ? WHERE username = ? AND symbol = ?',
            [newQuantity, newAvgPrice, username, symbol]
          );
        }
      } else if (type.toLowerCase() === 'sell') {
        if (holdings.length === 0) {
          throw new Error('Cannot sell stock that is not in portfolio');
        }

        const currentHolding = holdings[0];
        if (currentHolding.quantity < quantity) {
          throw new Error('Insufficient shares to sell');
        }

        const newQuantity = currentHolding.quantity - quantity;
        console.log('Processing sell:', { username, symbol, currentQuantity: currentHolding.quantity, newQuantity });

        if (newQuantity === 0) {
          await db.query(
            'DELETE FROM Portfolios WHERE username = ? AND symbol = ?',
            [username, symbol]
          );
        } else {
          await db.query(
            'UPDATE Portfolios SET quantity = ? WHERE username = ? AND symbol = ?',
            [newQuantity, username, symbol]
          );
        }
      }

      // After all trade operations succeed, update balance and record transaction
      const newBalance = type.toLowerCase() === 'buy' 
        ? currentBalance - transactionAmount 
        : currentBalance + transactionAmount;

      // Update user's balance
      await db.query(
        'UPDATE Users SET account_balance = ? WHERE user_id = ?',
        [newBalance, userId]
      );

      // Record the transaction
      await db.query(
        'INSERT INTO Transactions (user_id, username, symbol, quantity, price_per_share, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          userId, 
          username, 
          symbol, 
          quantity, 
          price, 
          'TRADE', 
          transactionAmount,
          newBalance,
          `${type.toUpperCase()} ${quantity} shares of ${symbol} at $${price}`
        ]
      );

      // Commit transaction
      await db.query('COMMIT');
      console.log('Trade completed successfully');

      res.status(200).json({ 
        message: 'Trade executed successfully',
        details: {
          symbol,
          quantity,
          price,
          type: type.toLowerCase(),
          total: (quantity * price).toFixed(2)
        }
      });

    } catch (error) {
      // Rollback transaction on error
      console.error('Error during trade execution:', error);
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (err) {
    console.error('Trade error:', err);
    // Send more detailed error information
    res.status(500).json({ 
      error: err.message,
      details: err.code || 'UNKNOWN_ERROR',
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    });
  }
};

exports.getPortfolio = async (req, res) => {
  const { username } = req.params;
  try {
    // First ensure user exists
    const [users] = await db.query('SELECT username FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [rows] = await db.query(`
      SELECT 
        symbol, 
        quantity, 
        avg_price, 
        (quantity * avg_price) as total_value,
        last_updated
      FROM Portfolios 
      WHERE username = ?
      ORDER BY symbol ASC
    `, [username]);

    // Calculate total portfolio value
    const totalValue = rows.reduce((sum, holding) => sum + parseFloat(holding.total_value), 0);

    res.json({
      holdings: rows,
      totalValue: totalValue.toFixed(2)
    });
  } catch (err) {
    console.error('Portfolio error:', err);
    res.status(500).json({ 
      error: err.message,
      details: err.code || 'UNKNOWN_ERROR',
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    });
  }
};

exports.getTransactions = async (req, res) => {
  const { username } = req.params;
  try {
    // First ensure user exists
    const [users] = await db.query('SELECT username FROM Users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [rows] = await db.query(`
      SELECT 
        transaction_id,
        symbol,
        quantity,
        price_per_share as price,
        type,
        transaction_time as date,
        amount as total_amount,
        description
      FROM Transactions 
      WHERE username = ? 
      ORDER BY transaction_time DESC
    `, [username]);

    console.log('Transactions found:', rows); // Debug log
    res.json(rows);
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ 
      error: err.message,
      details: err.code || 'UNKNOWN_ERROR',
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    });
  }
};

exports.getChartData = async (req, res) => {
  const axios = require('axios');
  const { symbol } = req.params;
  try {
    const apiKey = process.env.ALPHA_VANTAGE_KEY;
    const response = await axios.get(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`);
    res.json(response.data);
  } catch (err) {
    console.error('Chart data error:', err);
    res.status(500).json({ 
      error: err.message,
      details: err.code || 'UNKNOWN_ERROR'
    });
  }
};
