const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const { initializeRoutes } = require('./modules/routes');
const { initializeSocket } = require('./modules/sockets');
const { startCron } = require('./modules/cron');
const { SESSIONS_DIR, USER_DATA_DIR, MEDIA_DIR, FRONTEND_DIR } = require('./modules/paths');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Criação de diretórios essenciais
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Middlewares
app.use(express.json());
app.use(express.static(FRONTEND_DIR));
app.use('/media', express.static(MEDIA_DIR));

// Inicialização dos módulos
initializeRoutes(app, io);
initializeSocket(io);
startCron();

// Rota genérica para servir o frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});