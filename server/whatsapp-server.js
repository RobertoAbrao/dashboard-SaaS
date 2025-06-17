// server/whatsapp-server.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const pino = require('pino');
const admin = require('firebase-admin');

// Carrega a chave de serviço do Firebase
const serviceAccount = require('./firebase-service-account-key.json');

// Inicializa o Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const sessions = {};
const qrCodes = {}; // Mantido para o método QR como fallback, se desejado no futuro

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const frontendBuildPath = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(frontendBuildPath));

async function authenticateFirebaseToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    console.error("Falha na verificação do token:", error);
    return res.sendStatus(403);
  }
}

async function createOrUpdateKanbanTicket(userId, phoneNumber, contactName, messagePreview) {
  try {
    const userDocRef = db.collection('users').doc(userId);
    const ticketDocRef = userDocRef.collection('kanban_tickets').doc(phoneNumber);
    
    const ticketDoc = await ticketDocRef.get();
    const currentTimestamp = new Date().toISOString();

    if (ticketDoc.exists) {
      const existingData = ticketDoc.data();
      const updateData = {
        messagePreview: messagePreview,
        lastMessageTimestamp: currentTimestamp,
      };
      if (existingData.status === 'completed') {
        updateData.status = 'pending';
        updateData.botPaused = false;
      }
      await ticketDocRef.update(updateData);
    } else {
      const newTicket = {
        id: phoneNumber,
        phoneNumber,
        contactName,
        status: 'pending',
        createdAt: currentTimestamp,
        lastMessageTimestamp: currentTimestamp,
        messagePreview,
        botPaused: false,
      };
      await ticketDocRef.set(newTicket);
    }
  } catch (error) {
    console.error(`[Firestore] Erro no ticket para usuário ${userId}:`, error);
  }
}

async function emitDashboardDataForUser(userId) {
    if (!io.sockets.adapter.rooms.get(userId)) return;
    const session = sessions[userId];
    const status = session && session.user ? 'online' : (qrCodes[userId] ? 'qr_ready' : 'offline');
    const dashboardPayload = {
        messagesSent: 0,
        connections: status === 'online' ? 1 : 0,
        botStatus: status,
        recentActivity: [{ message: `Status atual: ${status}`, timestamp: new Date().toISOString() }],
    };
    io.to(userId).emit('dashboard_update', dashboardPayload);
}

// ALTERADO: Função principal agora pode lidar com o pairing code
async function startWhatsAppSession(userId, phoneNumberForPairing = null) {
  const sessionFolderPath = path.join(SESSIONS_DIR, userId);

  // Limpa a sessão antiga se já existir, para garantir uma conexão limpa
  if (sessions[userId]) {
    console.log(`[Sessão ${userId}] Desconectando sessão existente antes de iniciar uma nova.`);
    await sessions[userId].logout();
    delete sessions[userId];
  }
  // Se estivermos usando o pairing code, sempre começamos com uma pasta limpa
  if (phoneNumberForPairing && fs.existsSync(sessionFolderPath)) {
    fs.rmSync(sessionFolderPath, { recursive: true, force: true });
  }

  if (!fs.existsSync(sessionFolderPath)) fs.mkdirSync(sessionFolderPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolderPath);
  
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'info' }),
    // NOVO: Define o navegador para melhorar a compatibilidade
    browser: ['Abrão Tech', 'Chrome', '1.0.0']
  });
  sessions[userId] = sock;

  // NOVO: Lógica para solicitar o pairing code
  if (phoneNumberForPairing && !sock.authState.creds.registered) {
    console.log(`[Sessão ${userId}] Solicitando pairing code para o número: ${phoneNumberForPairing}`);
    try {
        const code = await sock.requestPairingCode(phoneNumberForPairing);
        io.to(userId).emit('pairing_code', code); // Envia o código para o frontend
    } catch (error) {
        console.error(`[Sessão ${userId}] Falha ao solicitar pairing code:`, error);
        io.to(userId).emit('error', 'Falha ao solicitar código. Verifique o número de telefone.');
        delete sessions[userId];
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    console.log(`[Sessão ${userId}] Status da Conexão: ${connection || 'N/A'}`);

    if (qr) {
        qrCodes[userId] = qr;
        io.to(userId).emit('qr', qr);
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'Desconhecida';
      console.error(`[Sessão ${userId}] Conexão fechada. Razão: ${reason} (Código: ${statusCode})`);
      
      delete sessions[userId];
      delete qrCodes[userId];
      
      if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.restartRequired) {
          console.log(`[Sessão ${userId}] Limpando credenciais devido a: ${reason}.`);
          if (fs.existsSync(sessionFolderPath)) {
              fs.rmSync(sessionFolderPath, { recursive: true, force: true });
          }
      }
      io.to(userId).emit('disconnected', `Sessão encerrada. Razão: ${reason}`);
    } else if (connection === 'open') {
      console.log(`[Sessão ${userId}] Conexão aberta com sucesso.`);
      delete qrCodes[userId];
      io.to(userId).emit('ready');
    }
    
    emitDashboardDataForUser(userId);
  });
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;
      const remoteJid = msg.key.remoteJid;
      if (remoteJid.endsWith('@g.us')) continue;
      const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || "[Mídia]";
      const contactName = msg.pushName || remoteJid.split('@')[0];
      const phoneNumber = remoteJid.split('@')[0];
      await createOrUpdateKanbanTicket(userId, phoneNumber, contactName, messageContent);
    }
  });
}

// ALTERADO: Rota para reconexão
app.post('/api/whatsapp/connect', authenticateFirebaseToken, (req, res) => {
  startWhatsAppSession(req.user.uid, null).catch(err => console.error(`Erro ao iniciar sessão para ${req.user.uid}:`, err));
  res.status(200).json({ message: 'Tentando reconectar...' });
});

// NOVO: Rota para solicitar o pairing code
app.post('/api/whatsapp/request-pairing-code', authenticateFirebaseToken, (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        return res.status(400).json({ message: 'Número de telefone é obrigatório.' });
    }
    startWhatsAppSession(req.user.uid, phoneNumber).catch(err => console.error(`Erro ao iniciar sessão com pairing code para ${req.user.uid}:`, err));
    res.status(200).json({ message: 'Solicitação de código enviada...' });
});


app.post('/api/whatsapp/logout', authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  if (sessions[userId]) {
    await sessions[userId].logout();
  }
  const sessionFolderPath = path.join(SESSIONS_DIR, userId);
  if (fs.existsSync(sessionFolderPath)) {
    fs.rmSync(sessionFolderPath, { recursive: true, force: true });
  }
  delete sessions[userId];
  delete qrCodes[userId];
  res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
});

io.on('connection', (socket) => {
  console.log('Cliente Socket.IO conectado:', socket.id);

  socket.on('authenticate', async (token) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;
      socket.join(userId);
      console.log(`[Socket Auth] Cliente ${socket.id} autenticado para usuário ${userId}`);
      
      emitDashboardDataForUser(userId);
    } catch (error) {
      console.error("[Socket Auth] Falha na autenticação:", error.message);
      socket.emit('auth_failed', 'Token inválido.');
      socket.disconnect();
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente Socket.IO desconectado:', socket.id);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
