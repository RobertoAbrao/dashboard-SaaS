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

// --- INÍCIO: Bloco de inicialização do Firebase ---
// Garanta que o caminho para o seu arquivo de chave de serviço está correto.
// O nome 'firebase-service-account-key.json' é o padrão que estamos usando.
let serviceAccount;
try {
  serviceAccount = require('./firebase-service-account-key.json');
} catch (error) {
  console.error("ERRO FATAL: O arquivo 'firebase-service-account-key.json' não foi encontrado.");
  console.error("Por favor, baixe-o do seu console do Firebase e coloque na pasta 'server'.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
// --- FIM: Bloco de inicialização do Firebase ---

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const sessions = {};
const qrCodes = {};

const SESSIONS_DIR = path.join(__dirname, 'sessions');
// NOVO: Diretório para armazenar dados específicos do usuário, como o FAQ.
const USER_DATA_DIR = path.join(__dirname, 'user_data');
const frontendBuildPath = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });


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

// Lógica de log simplificada para usar um timestamp de texto padrão
async function logMessageToTicket(userId, ticketId, messageData) {
    try {
        const messageCollectionRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(ticketId).collection('messages');
        await messageCollectionRef.add(messageData);
    } catch (error) {
        console.error(`[Firestore] Erro ao salvar mensagem no ticket ${ticketId} para usuário ${userId}:`, error);
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

async function startWhatsAppSession(userId, phoneNumberForPairing = null) {
  const sessionFolderPath = path.join(SESSIONS_DIR, userId);

  if (sessions[userId]) {
    console.log(`[Sessão ${userId}] Desconectando sessão existente antes de iniciar uma nova.`);
    try {
      await sessions[userId].logout();
    } catch (e) {
      console.warn(`[Sessão ${userId}] Erro ao deslogar sessão antiga.`, e.message);
    } finally {
      delete sessions[userId];
    }
  }

  if (phoneNumberForPairing && fs.existsSync(sessionFolderPath)) {
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
          const code = await sock.requestPairingCode(phoneNumberForPairing);
          io.to(userId).emit('pairing_code', code);
        } catch (error) {
          io.to(userId).emit('error', 'Falha ao gerar o código. Tente usar o QR Code.');
        }
      } else {
        qrCodes[userId] = qr;
        io.to(userId).emit('qr', qr);
      }
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'Desconhecida';
      console.error(`[Sessão ${userId}] Conexão fechada. Razão: ${reason}`);
      
      delete sessions[userId];
      delete qrCodes[userId];
      
      if (statusCode === DisconnectReason.loggedOut) {
          if (fs.existsSync(sessionFolderPath)) {
              fs.rmSync(sessionFolderPath, { recursive: true, force: true });
          }
          io.to(userId).emit('disconnected', `Sessão encerrada permanentemente.`);
      } else if (statusCode !== DisconnectReason.restartRequired) {
           setTimeout(() => {
                startWhatsAppSession(userId, null).catch(err => console.error(`[Sessão ${userId}] Erro na reconexão:`, err));
           }, 15000);
           io.to(userId).emit('disconnected', `Conexão perdida. Reconectando...`);
      }
    } else if (connection === 'open') {
      console.log(`[Sessão ${userId}] Conexão aberta.`);
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

      // Loga a mensagem recebida com um timestamp padronizado
      await logMessageToTicket(userId, phoneNumber, {
          text: messageContent,
          sender: 'contact',
          timestamp: new Date().toISOString()
      });
    }
  });
}

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
  let userId; 

  socket.on('authenticate', async (token) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      userId = decodedToken.uid;
      socket.join(userId);
      console.log(`[Socket Auth] Cliente ${socket.id} autenticado para usuário ${userId}`);
      socket.emit('auth_success');
      emitDashboardDataForUser(userId);
    } catch (error) {
      console.error("[Socket Auth] Falha na autenticação:", error.message);
      socket.emit('auth_failed', 'Token inválido.');
      socket.disconnect();
    }
  });

  // --- INÍCIO: NOVOS HANDLERS PARA CONFIGURAÇÃO DO BOT ---
  socket.on('get_bot_config', async (callback) => {
      if (!userId) return callback({ success: false, message: "Usuário não autenticado." });
      try {
          const configDocRef = db.collection('users').doc(userId).collection('configs').doc('bot_settings');
          const doc = await configDocRef.get();

          let configData = {};
          if (doc.exists) {
              configData = doc.data();
          }

          // Checa se o arquivo faq.txt existe e envia o nome
          const faqFilePath = path.join(USER_DATA_DIR, userId, 'faq.txt');
          if (fs.existsSync(faqFilePath)) {
              configData.faqFilename = 'faq.txt';
          }

          callback({ success: true, data: configData });
      } catch (error) {
          console.error(`[Config] Erro ao buscar config para ${userId}:`, error);
          callback({ success: false, message: "Erro interno ao buscar configurações." });
      }
  });

  socket.on('save_bot_config', async (config, callback) => {
      if (!userId) return callback({ success: false, message: "Usuário não autenticado." });
      try {
          const { faqText, ...configToSave } = config;

          // Salva as configurações principais no Firestore
          const configDocRef = db.collection('users').doc(userId).collection('configs').doc('bot_settings');
          await configDocRef.set(configToSave, { merge: true });

          // Salva o conteúdo do FAQ em um arquivo de texto no servidor
          if (typeof faqText === 'string' && faqText.length > 0) {
              const userFaqDir = path.join(USER_DATA_DIR, userId);
              if (!fs.existsSync(userFaqDir)) {
                  fs.mkdirSync(userFaqDir, { recursive: true });
              }
              const faqFilePath = path.join(userFaqDir, 'faq.txt');
              fs.writeFileSync(faqFilePath, faqText);
          }

          callback({ success: true, message: "Configurações salvas com sucesso!" });
      } catch (error) {
          console.error(`[Config] Erro ao salvar config para ${userId}:`, error);
          callback({ success: false, message: "Erro interno ao salvar configurações." });
      }
  });
  // --- FIM: NOVOS HANDLERS PARA CONFIGURAÇÃO DO BOT ---

  socket.on('send-message', async ({ to, text }, callback) => {
      if (!userId) return callback({ success: false, message: 'Socket não autenticado.' });
      const sock = sessions[userId];
      if (sock && sock.user) {
          try {
              const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
              await sock.sendMessage(jid, { text });
              
              await logMessageToTicket(userId, to.replace(/\D/g, ''), {
                  text: text,
                  sender: 'user',
                  timestamp: new Date().toISOString()
              });

              callback({ success: true, message: 'Mensagem enviada com sucesso!' });
          } catch (error) {
              console.error(`[Sessão ${userId}] Erro ao enviar mensagem:`, error);
              callback({ success: false, message: error.message || 'Falha ao enviar mensagem.' });
          }
      } else {
          callback({ success: false, message: 'WhatsApp não está conectado.' });
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