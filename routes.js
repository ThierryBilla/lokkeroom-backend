//routes.js

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./database');

const router = express.Router();

router.use(express.json());

// Middleware check user authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decodedUser) => {
    if (err) return res.sendStatus(403);
    req.user = decodedUser;  
    next();
  });
}

// Route for user connexion
router.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
      return res.status(400).send({ error: 'Requête invalide' });

  try {
      const { rows } = await pool.query(
          'SELECT id, password, nickname FROM users WHERE email = $1',
          [email]
      );

      if (rows.length === 0)
          return res.status(401).send({ error: 'User not found' });

      const user = rows[0];

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch)
          return res.status(401).send({ error: 'Incorrect password' });

      const accessToken = jwt.sign({ id: user.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

      return res.send({
          accessToken,
          id: user.id,
          name: user.nickname
      });
  } catch (err) {
      console.error('Erreur lors de la connexion de l\'utilisateur :', err);
      return res.status(500).send({ error: 'Erreur interne du serveur' });
  }
});


// Route create a new user
router.post('/api/register', async (req, res) => {
  const { email, nickname, password } = req.body;

  if (!email || !password || !nickname)
    return res.status(400).send({ error: 'Requête invalide' });

  try {
    const encryptedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (email, password, nickname) VALUES ($1, $2, $3)',
      [email, encryptedPassword, nickname]
    );

    return res.send({ info: 'Utilisateur créé avec succès' });
  } catch (err) {
    console.error('Erreur lors de la création de lutilisateur :', err);
    return res.status(500).send({ error: 'Erreur interne du serveur' });
  }
});


// Route to get all lobbies a user is a member of
router.get('/api/user/lobbies', authenticateToken, async (req, res) => {
  const userId = req.user.id;  // Assuming 'id' is stored in user details after token verification

  try {
      const { rows } = await pool.query(
          'SELECT lobbies.id, lobbies.name FROM lobbies ' +
          'JOIN lobby_members ON lobbies.id = lobby_members.lobby_id ' +
          'WHERE lobby_members.user_id = $1', 
          [userId]
      );
      res.send(rows);
  } catch (err) {
      console.error('Error fetching lobbies for user:', err);
      res.status(500).send({ error: 'Internal Server Error' });
  }
});


// Route to create a lobby
router.post('/api/create-lobby', authenticateToken, async (req, res) => {
  const { lobbyName } = req.body;
  const userId = req.user.id;

  if (!lobbyName)
    return res.status(400).send({ error: 'Requête invalide' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO lobbies (name, admin_id) VALUES ($1, $2) RETURNING id',
      [lobbyName, userId]
    );

    const lobbyId = rows[0].id;

    await pool.query(
      'INSERT INTO lobby_members (lobby_id, user_id) VALUES ($1, $2)',
      [lobbyId, userId]
    );

    return res.send({ info: 'Lobby créé avec succès', lobbyId });
  } catch (err) {
    console.error('Erreur lors de la création du lobby :', err);
    return res.status(500).send({ error: 'Erreur interne du serveur' });
  }
});

// Route to join a lobby
router.post('/api/lobby/:lobbyId/join', authenticateToken, async (req, res) => {
  const lobbyId = req.params.lobbyId;
  const userId = req.user.id;

  try {
    const { rows: lobbyRows } = await pool.query(
      'SELECT * FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyRows.length === 0)
      return res.status(404).send({ error: 'Lobby not found' });

    const { rows: membershipRows } = await pool.query(
      'SELECT * FROM lobby_members WHERE lobby_id = $1 AND user_id = $2',
      [lobbyId, userId]
    );

    if (membershipRows.length > 0)
      return res.status(400).send({ error: 'You are already a member of this lobby' });

    await pool.query(
      'INSERT INTO lobby_members (lobby_id, user_id) VALUES ($1, $2)',
      [lobbyId, userId]
    );

    return res.send({ info: 'You have joined the lobby successfully' });
  } catch (err) {
    console.error('Error joining the lobby:', err);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// Display message from a lobby
router.get('/api/lobby/:lobbyId/messages', authenticateToken, async (req, res) => {
  const lobbyId = req.params.lobbyId;
  const userId = req.user.id; // The ID from the authenticated user

  try {
    const { rows: messages } = await pool.query(
      'SELECT messages.*, users.nickname as user_nickname FROM messages ' +
      'JOIN users ON users.id = messages.user_id ' +
      'WHERE messages.lobby_id = $1',
      [lobbyId]
    );

    const isAdmin = (await pool.query(
      'SELECT * FROM lobbies WHERE id = $1 AND admin_id = $2',
      [lobbyId, userId]
    )).rowCount > 0;

    // Add a sender flag to distinguish messages sent by the current user
    const enhancedMessages = messages.map(message => ({
      ...message,
      sender: message.user_id === userId
    }));

    return res.send({ messages: enhancedMessages, isAdmin });
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});



// Route to post a message in the lobby
router.post('/api/lobby/:lobbyId/post-message', authenticateToken, async (req, res) => {
  const lobbyId = req.params.lobbyId;
  const userId = req.user.id;
  const { message } = req.body;

  if (!message) {
    return res.status(400).send({ error: 'Requête invalide' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM lobby_members WHERE lobby_id = $1 AND user_id = $2',
      [lobbyId, userId]
    );

    if (rows.length === 0) {
      return res.status(403).send({ error: 'You are not member of this lobby' });
    }

    // Ensure to return the ID of the newly inserted message
    const insertResult = await pool.query(
      'INSERT INTO messages (lobby_id, user_id, message) VALUES ($1, $2, $3) RETURNING id',
      [lobbyId, userId, message]
    );

    if (insertResult.rows.length > 0) {
      return res.status(201).send({ info: 'Message sent successfully', id: insertResult.rows[0].id });
    } else {
      return res.status(500).send({ error: 'Failed to post message' });
    }
  } catch (err) {
    console.error('Erreur lors du post du message dans le lobby :', err);
    return res.status(500).send({ error: 'Erreur interne du serveur' });
  }
});


// Route edit a message
router.put('/api/message/:messageId/edit', authenticateToken, async (req, res) => {
  const messageId = req.params.messageId;
  const userId = req.user.id;
  const { newMessage } = req.body;

  if (!newMessage)
    return res.status(400).send({ error: 'Requête invalide' });

  try {
    const { rows: messageRows } = await pool.query(
      'SELECT * FROM messages WHERE id = $1',
      [messageId]
    );

    if (messageRows.length === 0)
      return res.status(404).send({ error: 'Message not found' });

    const message = messageRows[0];
    const lobbyId = message.lobby_id;

    const { rows: lobbyRows } = await pool.query(
      'SELECT * FROM lobbies WHERE id = $1 AND admin_id = $2',
      [lobbyId, userId]
    );

    if (lobbyRows.length === 0)
      return res.status(403).send({ error: 'You do not have authorization to modify this message' });

    await pool.query(
      'UPDATE messages SET message = $1 WHERE id = $2',
      [newMessage, messageId]
    );

    return res.send({ info: 'Message updated' });
  } catch (err) {
    console.error('Erreur lors de la modification du message :', err);
    return res.status(500).send({ error: 'Server internal error' });
  }
});

// Route to delete a message in the lobby
router.delete('/api/message/:messageId/delete', authenticateToken, async (req, res) => {
  const messageId = req.params.messageId;
  const userId = req.user.id;

  try {
    const { rows: messageRows } = await pool.query(
      'SELECT * FROM messages WHERE id = $1',
      [messageId]
    );

    if (messageRows.length === 0)
      return res.status(404).send({ error: 'Message not found' });

    const message = messageRows[0];
    const lobbyId = message.lobby_id;

    const { rows: lobbyRows } = await pool.query(
      'SELECT * FROM lobbies WHERE id = $1 AND admin_id = $2',
      [lobbyId, userId]
    );

    if (lobbyRows.length === 0)
      return res.status(403).send({ error: 'You do not have authorization to delete this message' });

    await pool.query(
      'DELETE FROM messages WHERE id = $1',
      [messageId]
    );

    return res.send({ info: 'Message deleted successfully' });
  } catch (err) {
    console.error('Erreur lors de la suppression du message :', err);
    return res.status(500).send({ error: 'Erreur interne du serveur' });
  }
});

// Route to find user by nickname
router.get('/api/find-user/:nickname', authenticateToken, async (req, res) => {
  const { nickname } = req.params;

  try {
      const { rows } = await pool.query(
          'SELECT id FROM users WHERE nickname = $1',
          [nickname]
      );

      if (rows.length === 0) {
          return res.status(404).send({ error: 'User not found' });
      }

      return res.send({ id: rows[0].id });
  } catch (err) {
      console.error('Error finding user:', err);
      return res.status(500).send({ error: 'Internal Server Error' });
  }
});


// Route to send a direct message
router.post('/api/send-direct-message', authenticateToken, async (req, res) => {
  const { recipientId, message } = req.body;
  const senderId = req.user.id;

  if (!recipientId || !message) {
    return res.status(400).send({ error: 'Requête invalide' });
  }

  try {
    const { rows: recipientRows } = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [recipientId]
    );

    if (recipientRows.length === 0) {
      return res.status(404).send({ error: 'Recipient user not found' });
    }

    await pool.query(
      'INSERT INTO direct_messages (sender_id, receiver_id, message) VALUES ($1, $2, $3)',
      [senderId, recipientId, message]
    );

    return res.send({ info: 'Direct message sent successfully' });
  } catch (err) {
    console.error('Error sending direct message:', err);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// Route to get direct messages of a user
router.get('/api/direct-messages', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const { rows: sentMessages } = await pool.query(
      'SELECT dm.*, u.nickname as receiver_nickname FROM direct_messages dm ' +
      'JOIN users u ON u.id = dm.receiver_id ' +
      'WHERE sender_id = $1',
      [userId]
    );

    const { rows: receivedMessages } = await pool.query(
      'SELECT dm.*, u.nickname as sender_nickname FROM direct_messages dm ' +
      'JOIN users u ON u.id = dm.sender_id ' +
      'WHERE receiver_id = $1',
      [userId]
    );

    const directMessages = {
      sent: sentMessages.map(msg => ({
        ...msg,
        partnerNickname: msg.receiver_nickname
      })),
      received: receivedMessages.map(msg => ({
        ...msg,
        partnerNickname: msg.sender_nickname
      }))
    };

    return res.send(directMessages);
  } catch (err) {
    console.error('Error fetching direct messages:', err);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});


module.exports = router;

