const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./firebase');
const { SESSIONS_DIR, MEDIA_DIR } = require('./paths');
const { 
  getBotConfig, 
  getMessageHistory, 
  getGeminiResponse, 
  logActivity, 
  updateDailyStats, 
  logMessageToTicket,
  createOrUpdateKanbanTicket,
  calculateResponseTime,
  emitDashboardDataForUser
} = require('./utils');

const sessions = {};
const qrCodes = {};
const connectionTimestamps = {};

const getFileExtension = (mediaType) => {
    if (mediaType === 'image') return 'jpg';
    if (mediaType === 'audio') return 'ogg';
    if (mediaType === 'video') return 'mp4';
    return 'dat';
};

async function startWhatsAppSession(io, userId, phoneNumberForPairing = null) {
  const sessionFolderPath = path.join(SESSIONS_DIR, userId);

  // Se já existe uma sessão para este usuário, desconecte-a primeiro.
  if (sessions[userId]) {
    try {
      await sessions[userId].logout();
      console.log(`[Sessão ${userId}] Sessão antiga desconectada com sucesso.`);
    } catch (e) {
      console.warn(`[Sessão ${userId}] Erro ao deslogar sessão antiga, mas continuando.`, e.message);
    } finally {
      delete sessions[userId];
    }
  }

  // Se não estamos usando pareamento por código (ou seja, queremos um QR code)
  // ou se estamos trocando para o modo de pareamento, limpamos a pasta da sessão antiga.
  if (!phoneNumberForPairing || (phoneNumberForPairing && fs.existsSync(sessionFolderPath))) {
    if (fs.existsSync(sessionFolderPath)) {
        fs.rmSync(sessionFolderPath, { recursive: true, force: true });
        console.log(`[Sessão ${userId}] Pasta de sessão antiga removida para garantir um início limpo.`);
    }
  }
  
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolderPath);
  
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Abrão Tech', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60_000,
    syncFullHistory: true, 
    // Adicionado para tentar resolver problemas de conexão em algumas redes
    shouldIgnoreJid: jid => jid.includes('@g.us'), // Ignora grupos
    qrTimeout: 30000, // Aumenta o timeout do QR
  });

  sessions[userId] = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    // Adicionado log detalhado para depuração
    console.log(`[Sessão ${userId}] Connection Update:`, JSON.stringify(update, null, 2));

    if (qr && !phoneNumberForPairing) {
        // Apenas emite QR se não estivermos no fluxo de pairing code
        qrCodes[userId] = qr;
        io.to(userId).emit('qr', qr);
        console.log(`[Sessão ${userId}] QR Code emitido para o cliente.`);
    }
    
    if (connection === 'close') {
      if (connectionTimestamps[userId]) {
          const sessionDuration = (Date.now() - connectionTimestamps[userId]) / 1000;
          await updateDailyStats(userId, 'totalUptime', sessionDuration);
          delete connectionTimestamps[userId];
      }

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'Desconhecida';
      console.error(`[Sessão ${userId}] Conexão perdida. Razão: ${reason}`, lastDisconnect?.error);
      await logActivity(userId, `Conexão perdida. Razão: ${reason}`);
      
      delete sessions[userId];
      delete qrCodes[userId];
      
      if (statusCode !== DisconnectReason.loggedOut) {
           setTimeout(() => {
                console.log(`[Sessão ${userId}] Tentando reconexão automática...`);
                startWhatsAppSession(io, userId, null).catch(err => console.error(`[Sessão ${userId}] Erro na reconexão automática:`, err));
           }, 15000);
           io.to(userId).emit('disconnected', `Conexão perdida. Reconectando...`);
      } else {
          console.log(`[Sessão ${userId}] Sessão encerrada (logout).`);
          await logActivity(userId, `Sessão encerrada (logout).`);
          if (fs.existsSync(sessionFolderPath)) {
              fs.rmSync(sessionFolderPath, { recursive: true, force: true });
          }
          io.to(userId).emit('disconnected', `Sessão encerrada permanentemente.`);
      }
    } else if (connection === 'open') {
      console.log(`[Sessão ${userId}] Conexão estabelecida com sucesso.`);
      connectionTimestamps[userId] = Date.now();
      await logActivity(userId, 'Bot conectado com sucesso.');
      delete qrCodes[userId]; // Limpa o QR code pois não é mais necessário
      io.to(userId).emit('ready');
    }
    
    await emitDashboardDataForUser(io, userId);
  });
  
  // A lógica de pairing code é tratada separadamente para maior clareza.
  if (phoneNumberForPairing) {
    try {
      console.log(`[Sessão ${userId}] Solicitando código de pareamento para o número: ${phoneNumberForPairing}`);
      const code = await sock.requestPairingCode(phoneNumberForPairing);
      console.log(`[Sessão ${userId}] Código de pareamento gerado: ${code}`);
      io.to(userId).emit('pairing_code', code);
    } catch (error) {
      console.error(`[Sessão ${userId}] Falha crítica ao gerar código de pareamento:`, error);
      io.to(userId).emit('error', 'Falha ao gerar o código. Verifique o número e tente novamente.');
      // Encerra a sessão com falha para permitir uma nova tentativa limpa.
      if (sessions[userId]) {
        try { await sessions[userId].logout(); } catch {}
        delete sessions[userId];
      }
    }
  }
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (msg.key.fromMe || !msg.message) return;

    const remoteJid = msg.key.remoteJid;
    if (remoteJid.endsWith('@g.us')) return;

    const phoneNumber = remoteJid.split('@')[0];
    const contactName = msg.pushName || phoneNumber;

    await logActivity(userId, `Mensagem recebida de ${contactName}.`);
    
    let messageContent = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    let messagePreview = messageContent;

    const msgContent = msg.message;
    const mediaType = msgContent.imageMessage ? 'image' : msgContent.audioMessage ? 'audio' : msgContent.videoMessage ? 'video' : null;

    if (mediaType) {
        try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            const userMediaDir = path.join(MEDIA_DIR, userId);
            if (!fs.existsSync(userMediaDir)) fs.mkdirSync(userMediaDir, { recursive: true });

            const fileName = `${uuidv4()}.${getFileExtension(mediaType)}`;
            const filePath = path.join(userMediaDir, fileName);
            fs.writeFileSync(filePath, buffer);

            const mediaUrl = `/media/${userId}/${fileName}`;
            messagePreview = msgContent.imageMessage?.caption || `[${mediaType}]`;
            messageContent = messagePreview; 

            await logMessageToTicket(userId, phoneNumber, {
                type: mediaType,
                url: mediaUrl,
                sender: 'contact',
                timestamp: new Date().toISOString(),
                text: messagePreview
            });
        } catch (error) {
            console.error(`[Mídia] Falha ao baixar mídia:`, error);
        }
    } else {
        if (!messageContent) return; 
        await logMessageToTicket(userId, phoneNumber, {
            text: messageContent,
            sender: 'contact',
            timestamp: new Date().toISOString(),
            type: 'text'
        });
    }

    await createOrUpdateKanbanTicket(userId, phoneNumber, contactName, messagePreview, true, io);

    const config = await getBotConfig(userId);
    if (!config || (!config.useGeminiAI && !config.useCustomResponses)) return;

    const ticketRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(phoneNumber);
    const ticketDoc = await ticketRef.get();
    const ticketData = ticketDoc.exists ? ticketDoc.data() : {};

    // Verifica se o dono do bot enviou um comando para pausar ou reativar
    if (msg.key.fromMe) {
        const ownerPauseKeyword = config.ownerPauseKeyword?.trim().toLowerCase();
        const ownerResumeKeyword = config.ownerResumeKeyword?.trim().toLowerCase();

        if (ownerPauseKeyword && messageContent.toLowerCase() === ownerPauseKeyword) {
            await ticketRef.set({ botPaused: true }, { merge: true });
            await logActivity(userId, `Bot pausado manualmente para ${contactName}.`);
            await emitDashboardDataForUser(io, userId);
            // Opcional: enviar uma confirmação para si mesmo
            // await sock.sendMessage(remoteJid, { text: `Bot pausado para ${contactName}.` });
            return; 
        }

        if (ownerResumeKeyword && messageContent.toLowerCase() === ownerResumeKeyword) {
            await ticketRef.set({ botPaused: false }, { merge: true });
            await logActivity(userId, `Bot reativado manualmente para ${contactName}.`);
            await emitDashboardDataForUser(io, userId);
            // Opcional: enviar uma confirmação para si mesmo
            // await sock.sendMessage(remoteJid, { text: `Bot reativado para ${contactName}.` });
            return;
        }
    }

    // Se o bot estiver pausado para este ticket, não faz nada.
    if (ticketData.botPaused) {
        console.log(`[Sessão ${userId}] Bot pausado para ${contactName}, ignorando mensagem.`);
        return;
    }

    const pauseKeyword = config.pauseBotKeyword?.trim().toLowerCase();
    if (pauseKeyword && messageContent.toLowerCase() === pauseKeyword) {
        await ticketRef.set({ botPaused: true }, { merge: true });
        const transferMessage = config.transferMessage || 'Tudo bem, um de nossos atendentes irá te ajudar em breve. Por favor, aguarde.';
        await sock.sendMessage(remoteJid, { text: transferMessage });
        await logMessageToTicket(userId, phoneNumber, { text: transferMessage, sender: 'user', timestamp: new Date().toISOString(), type: 'text' });
        await calculateResponseTime(userId, phoneNumber);
        await logActivity(userId, `Bot pausado para atendimento humano com ${contactName}.`);
        await emitDashboardDataForUser(io, userId);
        return;
    }

    let responseSent = false;
    if (config.useCustomResponses && config.customResponses) {
        const responseKey = messageContent.toLowerCase();
        let responseMessages = config.customResponses[responseKey] || config.customResponses['menu'];

        if (responseMessages && responseMessages.length > 0) {
            for (const resMsg of responseMessages) {
                await sock.sendMessage(remoteJid, { text: resMsg.text });
                await logMessageToTicket(userId, phoneNumber, { text: resMsg.text, sender: 'user', timestamp: new Date().toISOString(), type: 'text' });
                await delay(resMsg.delay || 500);
            }
            responseSent = true;
            await calculateResponseTime(userId, phoneNumber);
        }
    }

    if (!responseSent && config.useGeminiAI && config.geminiApiKey) {
        const history = await getMessageHistory(userId, phoneNumber);
        const aiResponse = await getGeminiResponse(config.geminiApiKey, config.systemPrompt, config.faqText, history, messageContent);
        if (aiResponse) {
            await sock.sendMessage(remoteJid, { text: aiResponse });
            await logMessageToTicket(userId, phoneNumber, { text: aiResponse, sender: 'user', timestamp: new Date().toISOString(), type: 'text' });
            await calculateResponseTime(userId, phoneNumber);
        }
    }
  });
}

module.exports = {
    startWhatsAppSession,
    sessions,
    qrCodes,
    connectionTimestamps
};