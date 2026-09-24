USE stockmarketdb;

-- Drop the existing transactions table if it exists
DROP TABLE IF EXISTS transactions;

-- Create the transactions table with the correct structure
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
    type ENUM('buy', 'sell') NOT NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
    INDEX idx_username (username),
    INDEX idx_date (date)
); 