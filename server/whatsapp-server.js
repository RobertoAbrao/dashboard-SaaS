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
const qrCodes = {};

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

// =====================================================================================
// == FUNÇÃO CORRIGIDA ABAIXO ==
// =====================================================================================
async function startWhatsAppSession(userId, phoneNumberForPairing = null) {
  const sessionFolderPath = path.join(SESSIONS_DIR, userId);

  // ALTERADO: Lógica de limpeza de sessão mais robusta
  if (sessions[userId]) {
    console.log(`[Sessão ${userId}] Desconectando sessão existente antes de iniciar uma nova.`);
    try {
      // Não espera indefinidamente, apenas envia o comando de logout
      sessions[userId].logout();
    } catch (e) {
      console.warn(`[Sessão ${userId}] Erro ao deslogar sessão antiga, pode já estar desconectada.`, e.message);
    } finally {
      delete sessions[userId];
    }
  }

  // Se for usar pairing code, é sempre melhor começar com uma sessão 100% limpa.
  if (phoneNumberForPairing && fs.existsSync(sessionFolderPath)) {
    console.log(`[Sessão ${userId}] Limpando pasta de sessão para novo pareamento com código.`);
    fs.rmSync(sessionFolderPath, { recursive: true, force: true });
  }

  if (!fs.existsSync(sessionFolderPath)) {
    fs.mkdirSync(sessionFolderPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolderPath);
  
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'info' }),
    browser: ['Abrão Tech', 'Chrome', '1.0.0'],
    // NOVO: Aumenta o timeout de conexão para dar mais tempo ao usuário
    connectTimeoutMs: 60_000,
    syncFullHistory: true, 
  });

  sessions[userId] = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    console.log(`[Sessão ${userId}] Status da Conexão: ${connection || 'N/A'}`);

    if (qr) {
      if (phoneNumberForPairing) {
        try {
          console.log(`[Sessão ${userId}] Conexão pronta. Solicitando código para ${phoneNumberForPairing}...`);
          const code = await sock.requestPairingCode(phoneNumberForPairing);
          console.log(`[Sessão ${userId}] Código de pareamento recebido: ${code}`);
          io.to(userId).emit('pairing_code', code);
        } catch (error) {
          console.error(`[Sessão ${userId}] Falha CRÍTICA ao solicitar pairing code:`, error);
          io.to(userId).emit('error', 'Falha ao gerar o código. Tente usar o QR Code ou verifique o console do servidor.');
        }
      } else {
        console.log(`[Sessão ${userId}] QR Code gerado. Nenhum número para pareamento fornecido.`);
        qrCodes[userId] = qr;
        io.to(userId).emit('qr', qr);
      }
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'Desconhecida';
      console.error(`[Sessão ${userId}] Conexão fechada. Razão: ${reason} (Código: ${statusCode})`);
      
      delete sessions[userId];
      delete qrCodes[userId];
      
      // NOVO: Lógica de reconexão aprimorada
      if (statusCode === DisconnectReason.loggedOut) {
          console.log(`[Sessão ${userId}] Usuário deslogado. Limpando credenciais...`);
          if (fs.existsSync(sessionFolderPath)) {
              fs.rmSync(sessionFolderPath, { recursive: true, force: true });
          }
          io.to(userId).emit('disconnected', `Sessão encerrada permanentemente. Por favor, conecte novamente.`);
      } else if (statusCode === DisconnectReason.restartRequired) {
          console.log(`[Sessão ${userId}] Reinicialização solicitada pelo WhatsApp (Erro 515). Reconectando imediatamente...`);
          // Tenta reconectar com os mesmos parâmetros
          startWhatsAppSession(userId, phoneNumberForPairing).catch(err => console.error(`[Sessão ${userId}] Erro na tentativa de reinicialização:`, err));
      } else {
           console.log(`[Sessão ${userId}] Conexão perdida. Tentando reconectar em 15 segundos...`);
           // Para outras falhas (rede, etc.), tenta reconectar após um tempo
           setTimeout(() => {
                startWhatsAppSession(userId, phoneNumberForPairing).catch(err => console.error(`[Sessão ${userId}] Erro na tentativa de reconexão:`, err));
           }, 15000);
           io.to(userId).emit('disconnected', `Conexão perdida. Tentando reconectar...`);
      }
    } else if (connection === 'open') {
      console.log(`[Sessão ${userId}] Conexão aberta com sucesso.`);
      delete qrCodes[userId];
      io.to(userId).emit('ready');
    }
    
    emitDashboardDataForUser(userId);
  });
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    // ... (sua lógica de mensagens permanece igual)
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
// =====================================================================================

app.post('/api/whatsapp/connect', authenticateFirebaseToken, (req, res) => {
  startWhatsAppSession(req.user.uid, null).catch(err => console.error(`Erro ao iniciar sessão para ${req.user.uid}:`, err));
  res.status(200).json({ message: 'Tentando reconectar...' });
});

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