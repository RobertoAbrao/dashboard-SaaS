// server/whatsapp-server.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay
} = require('@whiskeysockets/baileys');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const pino = require('pino');
const admin = require('firebase-admin');
// NOVO: Importando a biblioteca do Google Generative AI
const { GoogleGenerativeAI } = require("@google/generative-ai");


// --- Bloco de inicialização do Firebase ---
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
// NOVO: Cache para configurações e histórico para evitar múltiplas leituras do DB na mesma interação
const configCache = {};
const historyCache = {};


const SESSIONS_DIR = path.join(__dirname, 'sessions');
const USER_DATA_DIR = path.join(__dirname, 'user_data');
const frontendBuildPath = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });


app.use(express.json());
app.use(express.static(frontendBuildPath));

// --- INÍCIO: NOVAS FUNÇÕES HELPER PARA O BOT ---

/**
 * Busca as configurações do bot para um usuário, usando um cache simples.
 * @param {string} userId - O ID do usuário do Firebase.
 * @returns {Promise<object|null>} As configurações do bot ou nulo se não encontradas.
 */
async function getBotConfig(userId) {
    if (configCache[userId]) {
        return configCache[userId];
    }
    try {
        const configDocRef = db.collection('users').doc(userId).collection('configs').doc('bot_settings');
        const doc = await configDocRef.get();
        if (!doc.exists) return null;

        const config = doc.data();

        // Se a IA estiver ativa, carrega o conteúdo do FAQ do arquivo
        if (config.useGeminiAI) {
            const faqFilePath = path.join(USER_DATA_DIR, userId, 'faq.txt');
            if (fs.existsSync(faqFilePath)) {
                config.faqText = fs.readFileSync(faqFilePath, 'utf-8');
            } else {
                config.faqText = ''; // Garante que a propriedade exista
            }
        }
        
        configCache[userId] = config; // Armazena no cache
        setTimeout(() => delete configCache[userId], 5 * 60 * 1000); // Limpa o cache após 5 minutos
        return config;
    } catch (error) {
        console.error(`[Config] Erro ao buscar config para ${userId}:`, error);
        return null;
    }
}


/**
 * Busca o histórico de mensagens de uma conversa.
 * @param {string} userId - O ID do usuário do Firebase.
 * @param {string} ticketId - O ID do ticket (número do telefone).
 * @returns {Promise<Array<object>>} O histórico de mensagens.
 */
async function getMessageHistory(userId, ticketId) {
    const cacheKey = `${userId}-${ticketId}`;
    if (historyCache[cacheKey]) {
        return historyCache[cacheKey];
    }
    try {
        const messagesRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(ticketId).collection('messages');
        const q = messagesRef.orderBy('timestamp', 'desc').limit(10); // Pega as 10 últimas mensagens
        const snapshot = await q.get();
        const history = snapshot.docs.map(doc => doc.data()).reverse(); // Reverte para ordem cronológica
        
        historyCache[cacheKey] = history;
        setTimeout(() => delete historyCache[cacheKey], 5 * 60 * 1000); // Limpa o cache após 5 minutos

        return history;
    } catch (error) {
        console.error(`[History] Erro ao buscar histórico para ${ticketId}:`, error);
        return [];
    }
}

/**
 * Gera uma resposta usando a API do Google Gemini.
 * @param {string} apiKey - A chave da API do Gemini.
 * @param {string} systemPrompt - O prompt de sistema para o comportamento do bot.
 * @param {string} faqContent - O conteúdo do arquivo FAQ.
 * @param {Array<object>} history - O histórico da conversa.
 * @param {string} currentMessage - A mensagem atual do cliente.
 * @returns {Promise<string|null>} A resposta da IA ou nulo em caso de erro.
 */
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


// --- FIM: NOVAS FUNÇÕES HELPER PARA O BOT ---

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
        // Limpa o cache de histórico para forçar a releitura
        delete historyCache[`${userId}-${ticketId}`];
    } catch (error) {
        console.error(`[Firestore] Erro ao salvar mensagem no ticket ${ticketId} para usuário ${userId}:`, error);
    }
}

// ATUALIZADO: Função createOrUpdateKanbanTicket para lidar com o status 'botPaused'
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
      // Se o ticket estava 'concluído', ele volta para 'pendente' e reativa o bot.
      if (existingData.status === 'completed') {
        updateData.status = 'pending';
        updateData.botPaused = false; // Reativa o bot automaticamente
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
        botPaused: false, // O bot começa ativo por padrão
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
  
  // --- INÍCIO: LÓGICA PRINCIPAL DE PROCESSAMENTO DE MENSAGENS ---
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (msg.key.fromMe || !msg.message) return;

    const remoteJid = msg.key.remoteJid;
    if (remoteJid.endsWith('@g.us')) return; // Ignora mensagens de grupo

    const messageContent = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    if (!messageContent) return; // Ignora mensagens sem texto (ex: apenas mídia)

    const contactName = msg.pushName || remoteJid.split('@')[0];
    const phoneNumber = remoteJid.split('@')[0];
    
    // 1. Loga a mensagem recebida e cria/atualiza o ticket no Kanban
    await createOrUpdateKanbanTicket(userId, phoneNumber, contactName, messageContent);
    await logMessageToTicket(userId, phoneNumber, {
        text: messageContent,
        sender: 'contact',
        timestamp: new Date().toISOString()
    });

    // 2. Busca a configuração do bot para este usuário
    const config = await getBotConfig(userId);
    if (!config || (!config.useGeminiAI && !config.useCustomResponses)) {
      console.log(`[Bot ${userId}] Bot desativado ou sem configuração. Nenhuma resposta enviada.`);
      return;
    }

    // 3. Verifica se o bot está pausado para esta conversa
    const ticketRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(phoneNumber);
    const ticketDoc = await ticketRef.get();
    if (ticketDoc.exists && ticketDoc.data().botPaused) {
        console.log(`[Bot ${userId}] Pausado para ${phoneNumber}.`);
        return;
    }

    // 4. Verifica se a mensagem é a palavra-chave para pausar o bot
    const pauseKeyword = config.pauseBotKeyword?.trim().toLowerCase();
    if (pauseKeyword && messageContent.toLowerCase() === pauseKeyword) {
        await ticketRef.update({ botPaused: true });
        const transferMessage = 'Tudo bem, um de nossos atendentes irá te ajudar em breve. Por favor, aguarde.';
        await sock.sendMessage(remoteJid, { text: transferMessage });
        await logMessageToTicket(userId, phoneNumber, { text: transferMessage, sender: 'user', timestamp: new Date().toISOString() });
        console.log(`[Bot ${userId}] Pausado para ${phoneNumber} pela palavra-chave.`);
        return;
    }

    let responseSent = false;

    // 5. Tenta encontrar uma resposta personalizada (menu)
    if (config.useCustomResponses && config.customResponses) {
        const responseKey = messageContent.toLowerCase();
        const responseMessages = config.customResponses[responseKey];
        if (responseMessages && responseMessages.length > 0) {
            for (const resMsg of responseMessages) {
                await sock.sendMessage(remoteJid, { text: resMsg.text });
                await logMessageToTicket(userId, phoneNumber, { text: resMsg.text, sender: 'user', timestamp: new Date().toISOString() });
                await delay(resMsg.delay || 500);
            }
            responseSent = true;
        }
    }

    // 6. Se nenhuma resposta personalizada foi enviada, usa a IA
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
            await logMessageToTicket(userId, phoneNumber, { text: aiResponse, sender: 'user', timestamp: new Date().toISOString() });
        }
    }
  });
  // --- FIM: LÓGICA PRINCIPAL DE PROCESSAMENTO DE MENSAGENS ---
}

// ... (endpoints app.post não precisam de alteração) ...
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
          
          // Limpa o cache de configuração para forçar a recarga na próxima mensagem
          delete configCache[userId];

          callback({ success: true, message: "Configurações salvas com sucesso!" });
      } catch (error) {
          console.error(`[Config] Erro ao salvar config para ${userId}:`, error);
          callback({ success: false, message: "Erro interno ao salvar configurações." });
      }
  });
  
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