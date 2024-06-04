//club.js
const dotenv = require('dotenv');
dotenv.config();  

const express = require('express');
const cors = require('cors'); // Import CORS
const routes = require('./routes');

const server = express();

// Configure CORS
server.use(cors({
  origin: function (origin, callback) {
      const allowedOrigins = ["https://lokkeroom-frontend-24fab992f120.herokuapp.com/"];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
      } else {
          callback(new Error('CORS policy violation'));
      }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));


server.use(express.json()); // Ensure this middleware is used if you're parsing JSON bodies
server.use('/', routes);

// Middleware error management
server.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal error');
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server started on port ${port}`));

