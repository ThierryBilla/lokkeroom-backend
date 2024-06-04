const { Pool } = require('pg');

// Create a new pool using the connection string from the environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Important for Heroku deployment
  }
});

// Connect to the database and log success/error messages
pool.connect()
  .then(() => console.log('Connected to database'))
  .catch(err => console.error('Error connecting to database:', err));

module.exports = pool;
