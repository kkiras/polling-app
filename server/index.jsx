// Server bootstrap and route mounting
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const DB_NAME = process.env.MONGODB_DB_NAME

if (!MONGO_URI) {
  console.error('Missing MONGO_URI in .env');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI, { dbName: DB_NAME })
  .then(() => console.log('Mongo connected'))
  .catch((err) => {
    console.error('Mongo connection error', err);
    process.exit(1);
  });

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Mount routes
app.use('/auth', require('./routes/auth'));
app.use('/polls', require('./routes/polls'));

// Initialize Socket.IO
const http = require('http');
const { initIO } = require('./realtime/io');
const httpServer = http.createServer(app);
initIO(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
