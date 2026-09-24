# TradeCrafters - Stock Market Simulation Application

A full-stack application that simulates stock market trading with real-time data and user portfolio management.

## 🚀 Features

- Real-time stock market simulation
- User portfolio management
- Buy/Sell stock functionality
- Historical data tracking
- User authentication and authorization
- Responsive web interface

## 🛠️ Tech Stack

- **Frontend**: React.js
- **Backend**: Node.js, Express.js
- **Database**: SQL
- **Authentication**: JWT
- **Styling**: CSS/SCSS

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- SQL Database

## 🚀 Installation

1. Clone the repository:
```bash
git clone https://github.com/DuhItzAniket/TradeCrafters.git
cd TradeCrafters
```

2. Install dependencies:
```bash
npm run install-all
```

3. Set up environment variables:
- Copy `server/.env.example` to `server/.env`
- Fill in the required environment variables

4. Start the application:
```bash
# Start backend server
npm start

# Start frontend development server (in a new terminal)
npm run start-client
```

## 📁 Project Structure

```
TradeCrafters/
├── client/           # React frontend
├── server/           # Node.js backend
│   ├── config/      # Configuration files
│   ├── controllers/ # Request handlers
│   ├── models/      # Database models
│   ├── routes/      # API routes
│   └── database/    # Database setup
└── sql/             # SQL scripts
```

## 🔧 Configuration

Create a `.env` file in the `server/` directory (see `server/.env.example`) with the following variables:
```
PORT=5000
DB_HOST=localhost
DB_USER=
DB_PASS=
DB_NAME=
ALPHA_VANTAGE_KEY=
```

Project Link: https://github.com/DuhItzAniket/TradeCrafters.git