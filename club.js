// Assuming your backend server file is named server.js or index.js

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

// Configure CORS
app.use(cors());

// Add CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://lokkeroom-frontend-24fab992f120.herokuapp.com', 'http://localhost:5173', 'http://127.0.0.1:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// Your routes configuration
app.use('/', routes);

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server started on port ${port}`));
