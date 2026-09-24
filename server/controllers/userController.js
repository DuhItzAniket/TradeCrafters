const db = require('../database/db');
const bcrypt = require('bcrypt');

exports.register = async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Input validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if user already exists
        const [existingUsers] = await db.query(
            'SELECT username FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create new user
        const [result] = await db.query(
            'INSERT INTO users (username, email, password_hash, account_balance) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, 10000.00] // Starting balance of $10,000
        );

        res.status(201).json({
            message: 'User registered successfully',
            userId: result.insertId,
            username,
            email
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            error: err.message,
            details: err.code || 'UNKNOWN_ERROR'
        });
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        // Input validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Missing username or password' });
        }

        // Get user by username only (not email)
        const [users] = await db.query(
            'SELECT user_id, username, password_hash FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = users[0];

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Update last login
        await db.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?',
            [user.user_id]
        );

        res.json({
            success: true,
            message: 'Login successful',
            username: user.username
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            error: err.message,
            details: err.code || 'UNKNOWN_ERROR'
        });
    }
};
