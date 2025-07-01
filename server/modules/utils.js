const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db, admin } = require('./firebase');
const path = require('path');
const fs = require('fs');
const { USER_DATA_DIR } = require('./paths');

const configCache = {};
const historyCache = {};
const MESSAGES_LIMIT = 100;

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

async function logActivity(userId, message) {
  if (!userId || !message) return;
  try {
    const logCollectionRef = db.collection('users').doc(userId).collection('activity_log');
    await logCollectionRef.add({
      message,
      timestamp: new Date().toISOString(),
    });
    
    const snapshot = await logCollectionRef.orderBy('timestamp', 'desc').get();
    if (snapshot.size > 50) {
        const batch = db.batch();
        snapshot.docs.slice(50).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
  } catch (error) {
    console.error(`[Activity Log] Erro ao salvar log para ${userId}:`, error);
  }
}

async function updateDailyStats(userId, stat, value = 1) {
    if (!userId || !stat) return;
    try {
        const today = new Date().toISOString().split('T')[0];
        const statRef = db.collection('users').doc(userId).collection('daily_stats').doc(today);
        await statRef.set({
            // CORREÇÃO APLICADA AQUI
            [stat]: admin.firestore.FieldValue.increment(value)
        }, { merge: true });
    } catch (error) {
        console.error(`[Daily Stats] Erro ao atualizar '${stat}' para ${userId}:`, error);
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
            
            const batch = db.batch();
            docsToDelete.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    } catch (error) {
        console.error(`[Firestore] Erro ao salvar/limpar mensagem no ticket ${ticketId}:`, error);
    }
}

async function createOrUpdateKanbanTicket(userId, phoneNumber, contactName, messagePreview, isContactMessage = false, io) {
    try {
      const userDocRef = db.collection('users').doc(userId);
      const ticketDocRef = userDocRef.collection('kanban_tickets').doc(phoneNumber);
      
      const ticketDoc = await ticketDocRef.get();
      const currentTimestamp = new Date().toISOString();
      
      const updateData = {
          messagePreview: messagePreview,
          lastMessageTimestamp: currentTimestamp,
      };
  
      if (isContactMessage) {
          updateData.lastContactMessageTimestamp = currentTimestamp;
      }
  
      if (ticketDoc.exists) {
        const existingData = ticketDoc.data();
        if (existingData.status === 'completed') {
          updateData.status = 'pending';
          updateData.botPaused = false;
          await logActivity(userId, `Ticket reaberto para ${contactName || phoneNumber}.`);
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
          ...(isContactMessage && { lastContactMessageTimestamp: currentTimestamp })
        };
        await ticketDocRef.set(newTicket);
        await logActivity(userId, `Novo ticket criado para ${contactName || phoneNumber}.`);
      }
      await emitDashboardDataForUser(io, userId);
    } catch (error) {
      console.error(`[Firestore] Erro no ticket para usuário ${userId}:`, error);
    }
}

async function calculateResponseTime(userId, phoneNumber) {
    try {
        const ticketRef = db.collection('users').doc(userId).collection('kanban_tickets').doc(phoneNumber);
        const ticketDoc = await ticketRef.get();

        if (ticketDoc.exists && ticketDoc.data().lastContactMessageTimestamp) {
            const lastContactTime = new Date(ticketDoc.data().lastContactMessageTimestamp);
            const responseTime = Date.now() - lastContactTime.getTime();

            await updateDailyStats(userId, 'totalResponseTime', responseTime);
            await updateDailyStats(userId, 'responseCount', 1);

            await ticketRef.update({ lastContactMessageTimestamp: admin.firestore.FieldValue.delete() });
        }
    } catch (error) {
        console.error(`[Response Time] Erro ao calcular tempo de resposta para ${phoneNumber}:`, error);
    }
}

async function emitDashboardDataForUser(io, userId) {
    const { sessions, qrCodes, connectionTimestamps } = require('./whatsapp');
    if (!io || !io.sockets.adapter.rooms.get(userId)) return;

    const session = sessions[userId];
    const status = session && session.user ? 'online' : (qrCodes[userId] ? 'qr_ready' : 'offline');

    try {
        const today = new Date().toISOString().split('T')[0];
        const statsDoc = await db.collection('users').doc(userId).collection('daily_stats').doc(today).get();
        const dailyData = statsDoc.exists ? statsDoc.data() : {};
        
        const activitySnapshot = await db.collection('users').doc(userId).collection('activity_log').orderBy('timestamp', 'desc').limit(5).get();
        const recentActivity = activitySnapshot.docs.map(doc => doc.data());

        const messagesSent = dailyData.messagesSent || 0;
        const messagesFailed = dailyData.messagesFailed || 0;
        const deliveryRate = (messagesSent + messagesFailed) > 0 
            ? (messagesSent / (messagesSent + messagesFailed)) * 100 
            : 100;

        const totalResponseTime = dailyData.totalResponseTime || 0;
        const responseCount = dailyData.responseCount || 0;
        const avgResponseTime = responseCount > 0 ? (totalResponseTime / responseCount / 1000) : 0;

        const savedUptime = dailyData.totalUptime || 0;
        let currentSessionUptime = 0;
        
        if (connectionTimestamps[userId]) {
            currentSessionUptime = (Date.now() - connectionTimestamps[userId]) / 1000;
        }
        
        const totalUptime = savedUptime + currentSessionUptime;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const secondsSinceStartOfDay = (now.getTime() - startOfDay.getTime()) / 1000;
        const uptimePercentage = secondsSinceStartOfDay > 0 
            ? Math.min((totalUptime / secondsSinceStartOfDay) * 100, 100)
            : 100;

        const dashboardPayload = {
            messagesSent: messagesSent,
            messagesPending: dailyData.messagesPending || 0,
            messagesFailed: messagesFailed,
            connections: status === 'online' ? 1 : 0,
            botStatus: status,
            recentActivity: recentActivity,
            deliveryRate: deliveryRate,
            avgResponseTime: avgResponseTime,
            uptimePercentage: uptimePercentage,
        };
        io.to(userId).emit('dashboard_update', dashboardPayload);
    } catch (error) {
        console.error(`[Dashboard] Erro ao buscar dados para ${userId}:`, error);
    }
}

module.exports = {
    getBotConfig,
    getMessageHistory,
    getGeminiResponse,
    logActivity,
    updateDailyStats,
    logMessageToTicket,
    createOrUpdateKanbanTicket,
    calculateResponseTime,
    emitDashboardDataForUser,
    configCache,
    historyCache
};