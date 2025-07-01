const path = require('path');
const fs = require('fs');
const { db, admin } = require('./firebase');
const { getBotConfig, updateDailyStats, logActivity, logMessageToTicket, createOrUpdateKanbanTicket, emitDashboardDataForUser, configCache } = require('./utils');
const { sessions } = require('./whatsapp');
const { MEDIA_DIR, USER_DATA_DIR } = require('./paths');

function initializeSocket(io) {
    io.on('connection', (socket) => {
      let userId; 

      socket.on('authenticate', async (token) => {
        try {
          const decodedToken = await admin.auth().verifyIdToken(token);
          userId = decodedToken.uid;
          socket.join(userId);
          socket.emit('auth_success');
          await emitDashboardDataForUser(io, userId);
        } catch (error) {
          socket.emit('auth_failed', 'Token inválido.');
          socket.disconnect();
        }
      });
      
      socket.on('get_bot_config', async (callback) => {
          if (!userId) return callback({ success: false, message: "Usuário não autenticado." });
          try {
              const config = await getBotConfig(userId);
              const faqFilePath = path.join(USER_DATA_DIR, userId, 'faq.txt');
              if (fs.existsSync(faqFilePath)) {
                  config.faqFilename = 'faq.txt';
              }
              callback({ success: true, data: config });
          } catch (error) {
              callback({ success: false, message: "Erro interno ao buscar configurações." });
          }
      });
      
      socket.on('save_bot_config', async (config, callback) => {
          if (!userId) return callback({ success: false, message: "Usuário não autenticado." });
          try {
              const { faqText, ...configToSave } = config;
              
              const configDocRef = db.collection('users').doc(userId).collection('configs').doc('bot_settings');
              await configDocRef.set(configToSave, { merge: true });

              if (typeof faqText === 'string') {
                  const userFaqDir = path.join(USER_DATA_DIR, userId);
                  if (!fs.existsSync(userFaqDir)) {
                      fs.mkdirSync(userFaqDir, { recursive: true });
                  }
                  const faqFilePath = path.join(userFaqDir, 'faq.txt');
                  fs.writeFileSync(faqFilePath, faqText);
              }
              
              delete configCache[userId];
              await logActivity(userId, 'Configurações do bot foram salvas.');
              await emitDashboardDataForUser(io, userId);

              callback({ success: true, message: "Configurações salvas com sucesso!" });
          } catch (error) {
              callback({ success: false, message: "Erro interno ao salvar configurações." });
          }
      });
      
      socket.on('send-message', async ({ to, text, media }, callback) => {
        if (!userId) return callback({ success: false, message: 'Socket não autenticado.' });
        const sock = sessions[userId];
        if (!sock || !sock.user) {
            return callback({ success: false, message: 'WhatsApp não está conectado.' });
        }

        try {
            const phoneNumber = to.replace(/\D/g, '');
            const jid = `${phoneNumber}@s.whatsapp.net`;

            await createOrUpdateKanbanTicket(userId, phoneNumber, phoneNumber, text, false, io);
            
            let messagePayload, logPayload;

            if (media?.filePath) {
                const mediaPath = path.join(MEDIA_DIR, media.filePath);
                if (media.mimetype.startsWith('image/')) {
                    messagePayload = { image: { url: mediaPath }, caption: text };
                    logPayload = { type: 'image', url: `/media/${media.filePath}`, text, sender: 'user', timestamp: new Date().toISOString() };
                } else {
                    messagePayload = { document: { url: mediaPath }, fileName: media.originalName, mimetype: media.mimetype };
                    logPayload = { type: 'document', url: `/media/${media.filePath}`, text: media.originalName, sender: 'user', timestamp: new Date().toISOString() };
                }
            } else {
                messagePayload = { text };
                logPayload = { text, sender: 'user', timestamp: new Date().toISOString(), type: 'text' };
            }

            await sock.sendMessage(jid, messagePayload);
            
            await updateDailyStats(userId, 'messagesSent', 1);
            await logMessageToTicket(userId, phoneNumber, logPayload);
            await logActivity(userId, `Mensagem manual enviada para ${phoneNumber}.`);
            
            callback({ success: true, message: 'Mensagem enviada!' });
        } catch (error) {
            await updateDailyStats(userId, 'messagesFailed', 1);
            callback({ success: false, message: 'Falha ao enviar mensagem.' });
        }
      });

      socket.on('disconnect', () => {
        // console.log('Cliente Socket.IO desconectado:', socket.id);
      });
    });
}

module.exports = { initializeSocket };