// server/whatsapp-server.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const pino = require('pino');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');


const MESSAGES_LIMIT = 100;

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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const sessions = {};
const qrCodes = {};
const configCache = {};
const historyCache = {};


const SESSIONS_DIR = path.join(__dirname, 'sessions');
const USER_DATA_DIR = path.join(__dirname, 'user_data');
const MEDIA_DIR = path.join(__dirname, 'public', 'media');
const frontendBuildPath = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });


app.use(express.json());
app.use(express.static(frontendBuildPath));
app.use('/media', express.static(MEDIA_DIR));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const userId = req.user?.uid;
        if (!userId) {
            return cb(new Error('Usuário não autenticado'), '');
        }
        const userMediaDir = path.join(MEDIA_DIR, userId);
        if (!fs.existsSync(userMediaDir)) {
            fs.mkdirSync(userMediaDir, { recursive: true });
        }
        cb(null, userMediaDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

async function getBotConfig(userId) {
    if (configCache[userId]) {
        return configCache[userId];
    }
    try {
        const configDocRef = db.collection('users').doc(userId).collection('configs').doc('bot_settings');
        const doc = await configDocRef.get();
        if (!doc.exists) return null;

        const config = doc.data();

        if (config.useGeminiAI) {
            const faqFilePath = path.join(USER_DATA_DIR, userId, 'faq.txt');
            if (fs.existsSync(faqFilePath)) {
                config.faqText = fs.readFileSync(faqFilePath, 'utf-8');
            } else {
                config.faqText = '';
            }
        }
        
        configCache[userId] = config;
        setTimeout(() => delete configCache[userId], 5 * 60 * 1000);
        return config;
    } catch (error) {
        console.error(`[Config] Erro ao buscar config para ${userId}:`, error);
        return null;
    }
}


async function getMessageHistory(userId, ticketId) {
    const cacheKey = `${userId}-${ticketId}`;
    if (historyCache[cacheKey]) {
        return historyCache[cacheKey];
    }
    try {
        const messagesRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(ticketId).collection('messages');
        const q = messagesRef.orderBy('timestamp', 'desc').limit(10);
        const snapshot = await q.get();
        const history = snapshot.docs.map(doc => doc.data()).reverse();
        
        historyCache[cacheKey] = history;
        setTimeout(() => delete historyCache[cacheKey], 5 * 60 * 1000);

        return history;
    } catch (error) {
        console.error(`[History] Erro ao buscar histórico para ${ticketId}:`, error);
        return [];
    }
}

async function getGeminiResponse(apiKey, systemPrompt, faqContent, history, currentMessage) {
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const fullPrompt = `
            ${systemPrompt}

            ---
            Base de Conhecimento (FAQ):
            ${faqContent || 'Nenhuma informação de FAQ fornecida.'}
            ---
            Histórico da Conversa:
            ${history.map(h => `${h.sender === 'contact' ? 'Cliente' : 'Você'}: ${h.text}`).join('\n')}
            ---
            Nova Mensagem do Cliente:
            ${currentMessage}

            Sua Resposta:
        `;
        
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("[Gemini AI] Erro ao gerar resposta:", error);
        return "Desculpe, não consegui processar sua solicitação no momento.";
    }
}


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

async function logMessageToTicket(userId, ticketId, messageData) {
    try {
        const messageCollectionRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(ticketId).collection('messages');
        
        await messageCollectionRef.add(messageData);

        delete historyCache[`${userId}-${ticketId}`];

        const snapshot = await messageCollectionRef.orderBy("timestamp", "desc").get();
        if (snapshot.size > MESSAGES_LIMIT) {
            const deleteCount = snapshot.size - MESSAGES_LIMIT;
            const docsToDelete = snapshot.docs.slice(MESSAGES_LIMIT);
            
            console.log(`[Cleaner] Ticket ${ticketId}: ${snapshot.size} mensagens. Limite de ${MESSAGES_LIMIT} excedido. Deletando ${deleteCount} mensagens.`);
            
            const batch = db.batch();
            docsToDelete.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

    } catch (error) {
        console.error(`[Firestore] Erro ao salvar/limpar mensagem no ticket ${ticketId} para usuário ${userId}:`, error);
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
      
      if (statusCode !== DisconnectReason.loggedOut) {
           console.log(`[Sessão ${userId}] Tentando reconectar em 15 segundos...`);
           setTimeout(() => {
                startWhatsAppSession(userId, null).catch(err => console.error(`[Sessão ${userId}] Erro na reconexão automática:`, err));
           }, 15000);
           io.to(userId).emit('disconnected', `Conexão perdida. Reconectando...`);
      } else {
          console.log(`[Sessão ${userId}] Usuário deslogado. Limpando sessão.`);
          if (fs.existsSync(sessionFolderPath)) {
              fs.rmSync(sessionFolderPath, { recursive: true, force: true });
          }
          io.to(userId).emit('disconnected', `Sessão encerrada permanentemente.`);
      }

    } else if (connection === 'open') {
      console.log(`[Sessão ${userId}] Conexão aberta.`);
      delete qrCodes[userId];
      io.to(userId).emit('ready');
    }
    
    emitDashboardDataForUser(userId);
  });
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (msg.key.fromMe || !msg.message) return;

    const remoteJid = msg.key.remoteJid;
    if (remoteJid.endsWith('@g.us')) return;

    const phoneNumber = remoteJid.split('@')[0];
    const contactName = msg.pushName || phoneNumber;

    let messageContent = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    let messageType = 'text';
    let mediaUrl = null;
    let messagePreview = messageContent;

    const msgContent = msg.message;
    const mediaType = msgContent.imageMessage ? 'image' : msgContent.audioMessage ? 'audio' : msgContent.videoMessage ? 'video' : null;

    if (mediaType) {
        try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'info' }) });
            const userMediaDir = path.join(MEDIA_DIR, userId);
            if (!fs.existsSync(userMediaDir)) fs.mkdirSync(userMediaDir, { recursive: true });

            const fileName = `${uuidv4()}.${mediaType === 'image' ? 'jpg' : 'ogg'}`;
            const filePath = path.join(userMediaDir, fileName);
            fs.writeFileSync(filePath, buffer);

            mediaUrl = `/media/${userId}/${fileName}`;
            messageType = mediaType;
            messagePreview = msgContent.imageMessage?.caption || `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]`;
            messageContent = messagePreview; // For AI processing

            await logMessageToTicket(userId, phoneNumber, {
                type: messageType,
                url: mediaUrl,
                sender: 'contact',
                timestamp: new Date().toISOString(),
                text: messagePreview
            });

        } catch (error) {
            console.error(`[Mídia] Falha ao baixar mídia de ${phoneNumber}:`, error);
            messagePreview = `[Falha ao baixar ${mediaType}]`;
            await logMessageToTicket(userId, phoneNumber, { text: messagePreview, sender: 'contact', timestamp: new Date().toISOString(), type: 'text' });
        }
    } else {
        if (!messageContent) return; // Ignore messages without text or known media
        await logMessageToTicket(userId, phoneNumber, {
            text: messageContent,
            sender: 'contact',
            timestamp: new Date().toISOString(),
            type: 'text'
        });
    }

    await createOrUpdateKanbanTicket(userId, phoneNumber, contactName, messagePreview);

    const config = await getBotConfig(userId);
    if (!config || (!config.useGeminiAI && !config.useCustomResponses)) {
      console.log(`[Bot ${userId}] Bot desativado ou sem configuração. Nenhuma resposta enviada.`);
      return;
    }

    const ticketRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(phoneNumber);
    const ticketDoc = await ticketRef.get();
    if (ticketDoc.exists && ticketDoc.data().botPaused) {
        console.log(`[Bot ${userId}] Pausado para ${phoneNumber}.`);
        return;
    }

    const pauseKeyword = config.pauseBotKeyword?.trim().toLowerCase();
    if (pauseKeyword && messageContent.toLowerCase() === pauseKeyword) {
        await ticketRef.update({ botPaused: true });
        const transferMessage = 'Tudo bem, um de nossos atendentes irá te ajudar em breve. Por favor, aguarde.';
        await sock.sendMessage(remoteJid, { text: transferMessage });
        await logMessageToTicket(userId, phoneNumber, { text: transferMessage, sender: 'user', timestamp: new Date().toISOString(), type: 'text' });
        console.log(`[Bot ${userId}] Pausado para ${phoneNumber} pela palavra-chave.`);
        return;
    }

    let responseSent = false;

    if (config.useCustomResponses && config.customResponses) {
        const responseKey = messageContent.toLowerCase();
        let responseMessages = config.customResponses[responseKey];

        if (!responseMessages || responseMessages.length === 0) {
            responseMessages = config.customResponses['menu'];
        }

        if (responseMessages && responseMessages.length > 0) {
            for (const resMsg of responseMessages) {
                await sock.sendMessage(remoteJid, { text: resMsg.text });
                await logMessageToTicket(userId, phoneNumber, { text: resMsg.text, sender: 'user', timestamp: new Date().toISOString(), type: 'text' });
                await delay(resMsg.delay || 500);
            }
            responseSent = true;
        }
    }

    if (!responseSent && config.useGeminiAI && config.geminiApiKey) {
        const history = await getMessageHistory(userId, phoneNumber);
        const aiResponse = await getGeminiResponse(
            config.geminiApiKey,
            config.systemPrompt,
            config.faqText,
            history,
            messageContent
        );
        if (aiResponse) {
            await sock.sendMessage(remoteJid, { text: aiResponse });
            await logMessageToTicket(userId, phoneNumber, { text: aiResponse, sender: 'user', timestamp: new Date().toISOString(), type: 'text' });
        }
    }
  });
}

app.post('/api/whatsapp/connect', authenticateFirebaseToken, (req, res) => {
    startWhatsAppSession(req.user.uid, null).catch(err => console.error(`Erro ao iniciar sessão para ${req.user.uid}:`, err));
    res.status(200).json({ message: 'Tentando reconectar...' });
});

app.post('/api/whatsapp/upload-media', authenticateFirebaseToken, upload.single('mediaFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
    }
    const relativePath = path.join(req.user.uid, req.file.filename);
    res.json({
        success: true,
        message: 'Upload bem-sucedido!',
        filePath: relativePath,
        mimetype: req.file.mimetype,
        originalName: req.file.originalname
    });
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

  socket.on('get_bot_config', async (callback) => {
      if (!userId) return callback({ success: false, message: "Usuário não autenticado." });
      try {
          const configDocRef = db.collection('users').doc(userId).collection('configs').doc('bot_settings');
          const doc = await configDocRef.get();

          let configData = {};
          if (doc.exists) {
              configData = doc.data();
          }

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
          
          const configDocRef = db.collection('users').doc(userId).collection('configs').doc('bot_settings');
          await configDocRef.set(configToSave, { merge: true });

          if (typeof faqText === 'string' && faqText.length > 0) {
              const userFaqDir = path.join(USER_DATA_DIR, userId);
              if (!fs.existsSync(userFaqDir)) {
                  fs.mkdirSync(userFaqDir, { recursive: true });
              }
              const faqFilePath = path.join(userFaqDir, 'faq.txt');
              fs.writeFileSync(faqFilePath, faqText);
          }
          
          delete configCache[userId];

          callback({ success: true, message: "Configurações salvas com sucesso!" });
      } catch (error) {
          console.error(`[Config] Erro ao salvar config para ${userId}:`, error);
          callback({ success: false, message: "Erro interno ao salvar configurações." });
      }
  });
  
  socket.on('send-message', async ({ to, text, media }, callback) => {
    if (!userId) return callback({ success: false, message: 'Socket não autenticado.' });
    const sock = sessions[userId];
    if (sock && sock.user) {
        try {
            const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
            
            let messagePayload;
            let logPayload;

            if (media?.serverFilePath) {
                const mediaPath = path.join(MEDIA_DIR, media.serverFilePath);
                
                if (media.mimetype.startsWith('image/')) {
                    messagePayload = { image: { url: mediaPath }, caption: text };
                    logPayload = { type: 'image', url: `/media/${media.serverFilePath}`, text: text, sender: 'user', timestamp: new Date().toISOString() };
                } else if (media.mimetype.startsWith('audio/')) {
                    messagePayload = { audio: { url: mediaPath }, mimetype: media.mimetype };
                     logPayload = { type: 'audio', url: `/media/${media.serverFilePath}`, text: '', sender: 'user', timestamp: new Date().toISOString() };
                } else {
                    // Fallback para outros tipos de arquivo, se necessário
                    messagePayload = { document: { url: mediaPath }, fileName: media.originalName, mimetype: media.mimetype };
                    logPayload = { type: 'document', url: `/media/${media.serverFilePath}`, text: media.originalName, sender: 'user', timestamp: new Date().toISOString() };
                }

            } else {
                messagePayload = { text };
                logPayload = { text, sender: 'user', timestamp: new Date().toISOString(), type: 'text' };
            }

            await sock.sendMessage(jid, messagePayload);
            await logMessageToTicket(userId, to.replace(/\D/g, ''), logPayload);

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
  // Adiciona a dependência 'uuid' que faltava.
  const { exec } = require('child_process');
  exec('npm install uuid', (err, stdout, stderr) => {
    if (err) { console.error('Erro ao instalar uuid:', stderr); return; }
    console.log(stdout);
  });
});