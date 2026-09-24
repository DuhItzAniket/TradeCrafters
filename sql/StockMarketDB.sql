-- Create the database
DROP DATABASE IF EXISTS StockMarketDB;
CREATE DATABASE StockMarketDB;
USE StockMarketDB;

-- User table with authentication fields
CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role ENUM('TRADER', 'ADMIN') NOT NULL DEFAULT 'TRADER',
    account_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    CHECK (account_balance >= 0)
) ENGINE=InnoDB;

-- User sessions for JWT token management
CREATE TABLE UserSessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id INT NOT NULL,
    jwt_token TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Stocks table
CREATE TABLE Stocks (
    stock_id INT AUTO_INCREMENT PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL UNIQUE,
    company_name VARCHAR(100) NOT NULL,
    sector VARCHAR(50),
    industry VARCHAR(50),
    current_price DECIMAL(10,2) NOT NULL,
    previous_close DECIMAL(10,2),
    day_high DECIMAL(10,2),
    day_low DECIMAL(10,2),
    volume BIGINT,
    market_cap BIGINT,
    pe_ratio DECIMAL(10,2),
    dividend_yield DECIMAL(5,2),
    is_active BOOLEAN DEFAULT TRUE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (current_price > 0)
) ENGINE=InnoDB;

-- Stock price history for charts
CREATE TABLE StockPriceHistory (
    history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    stock_id INT NOT NULL,
    `interval` ENUM('1min', '5min', '15min', '30min', '60min', 'daily') NOT NULL,
    timestamp DATETIME NOT NULL,
    open DECIMAL(10,2) NOT NULL,
    high DECIMAL(10,2) NOT NULL,
    low DECIMAL(10,2) NOT NULL,
    close DECIMAL(10,2) NOT NULL,
    volume BIGINT NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES Stocks(stock_id) ON DELETE CASCADE,
    INDEX idx_stock_interval (stock_id, `interval`),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB;

-- Portfolios
CREATE TABLE Portfolios (
    portfolio_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    description TEXT,
    symbol VARCHAR(50),
    quantity INT NOT NULL DEFAULT 0,
    avg_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES Users(username)
    );

-- Portfolio holdings
CREATE TABLE PortfolioHoldings (
    holding_id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    stock_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    average_cost DECIMAL(10,2) NOT NULL,
    total_invested DECIMAL(15,2) GENERATED ALWAYS AS (quantity * average_cost) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES Portfolios(portfolio_id) ON DELETE CASCADE,
    FOREIGN KEY (stock_id) REFERENCES Stocks(stock_id) ON DELETE CASCADE,
    UNIQUE KEY (portfolio_id, stock_id),
    CHECK (quantity >= 0),
    CHECK (average_cost > 0)
) ENGINE=InnoDB;

-- Orders table
CREATE TABLE Orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    portfolio_id INT NOT NULL,
    stock_id INT NOT NULL,
    order_type ENUM('MARKET', 'LIMIT', 'STOP') NOT NULL,
    side ENUM('BUY', 'SELL') NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2),
    status ENUM('PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED') DEFAULT 'PENDING',
    time_in_force ENUM('GTC', 'IOC', 'FOK') DEFAULT 'GTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (portfolio_id) REFERENCES Portfolios(portfolio_id),
    FOREIGN KEY (stock_id) REFERENCES Stocks(stock_id),
    CHECK (quantity > 0),
    CHECK (
        (order_type = 'MARKET' AND price IS NULL) OR 
        (order_type IN ('LIMIT', 'STOP') AND price > 0)
    )
) ENGINE=InnoDB;

-- Order executions
CREATE TABLE OrderExecutions (
    execution_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    execution_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES Orders(order_id),
    CHECK (quantity > 0),
    CHECK (price > 0)
) ENGINE=InnoDB;

-- Transactions history
CREATE TABLE Transactions (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    description TEXT,
    order_id INT,
    stock_id INT,
    username VARCHAR(50) NOT NULL,
    symbol VARCHAR(50),
    quantity INT NOT NULL DEFAULT 0,
    avg_price DECIMAL(10,2),
    type ENUM('TRADE', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND') NOT NULL,
    price_per_share DECIMAL(10,2),
    transaction_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES Users(username),
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (order_id) REFERENCES Orders(order_id),
    FOREIGN KEY (stock_id) REFERENCES Stocks(stock_id),
    INDEX idx_user_transactions (user_id, transaction_time)
) ENGINE=InnoDB;

-- Watchlists
CREATE TABLE Watchlists (
    watchlist_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    UNIQUE KEY (user_id, name)
) ENGINE=InnoDB;

-- Watchlist items
CREATE TABLE WatchlistItems (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    watchlist_id INT NOT NULL,
    stock_id INT NOT NULL,
    notes TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (watchlist_id) REFERENCES Watchlists(watchlist_id) ON DELETE CASCADE,
    FOREIGN KEY (stock_id) REFERENCES Stocks(stock_id) ON DELETE CASCADE,
    UNIQUE KEY (watchlist_id, stock_id)
) ENGINE=InnoDB;

-- Dividends
CREATE TABLE Dividends (
    dividend_id INT AUTO_INCREMENT PRIMARY KEY,
    stock_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    declaration_date DATE NOT NULL,
    ex_dividend_date DATE NOT NULL,
    record_date DATE NOT NULL,
    payment_date DATE NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES Stocks(stock_id) ON DELETE CASCADE,
    INDEX idx_dividend_dates (ex_dividend_date, payment_date)
) ENGINE=InnoDB;

-- Additional Indexes for performance
CREATE INDEX idx_stock_symbol ON Stocks(symbol);
CREATE INDEX idx_user_orders ON Orders(user_id, status);
CREATE INDEX idx_portfolio_holdings ON PortfolioHoldings(portfolio_id);
CREATE INDEX idx_transaction_details ON Transactions(user_id, type, transaction_time);
CREATE INDEX idx_price_history ON StockPriceHistory(stock_id, `interval`, timestamp);
SHOW TABLES;
SELECT * FROM DIVIDENDS;