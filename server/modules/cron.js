const cron = require('node-cron');
const { db } = require('./firebase');

async function cleanupCompletedTickets() {
    console.log('[CRON] Iniciando a varredura de tickets concluídos para limpeza.');
    try {
        const usersSnapshot = await db.collection('users').get();

        if (usersSnapshot.empty) {
            console.log('[CRON] Nenhum usuário encontrado para verificar.');
            return;
        }

        const cleanupPromises = [];

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            console.log(`[CRON] Verificando tickets para o usuário: ${userId}`);

            const ticketsQuery = db.collection('users').doc(userId).collection('kanban_tickets').where('status', '==', 'completed');
            const completedTicketsSnapshot = await ticketsQuery.get();

            if (completedTicketsSnapshot.empty) {
                console.log(`[CRON] Nenhum ticket concluído para o usuário: ${userId}`);
                continue;
            }

            for (const ticketDoc of completedTicketsSnapshot.docs) {
                const ticketId = ticketDoc.id;
                
                const cleanupPromise = (async () => {
                    try {
                        const messagesRef = ticketDoc.ref.collection('messages');
                        const messagesSnapshot = await messagesRef.get();

                        if (messagesSnapshot.empty) {
                            console.log(`[CRON] Ticket ${ticketId} já está limpo. Pulando.`);
                            return;
                        }

                        console.log(`[CRON] Limpando ${messagesSnapshot.size} mensagens do ticket ${ticketId} para o usuário ${userId}`);
                        const batch = db.batch();
                        
                        messagesSnapshot.docs.forEach(doc => {
                            batch.delete(doc.ref);
                        });

                        await batch.commit();

                        const today = new Date().toLocaleDateString('pt-BR');
                        await ticketDoc.ref.update({ messagePreview: `Histórico limpo em ${today}` });
                        console.log(`[CRON] Sucesso ao limpar ticket ${ticketId}.`);
                    } catch (error) {
                        console.error(`[CRON] Erro ao processar o ticket ${ticketId} para o usuário ${userId}:`, error);
                    }
                })();

                cleanupPromises.push(cleanupPromise);
            }
        }

        await Promise.all(cleanupPromises);
        console.log('[CRON] Limpeza diária de tickets concluídos finalizada.');

    } catch (error) {
        console.error('[CRON] Erro GERAL na rotina de limpeza:', error);
    }
}

function startCron() {
    cron.schedule('0 23 * * *', () => {
      console.log('[CRON] Disparando a rotina de limpeza automática de mensagens.');
      cleanupCompletedTickets().catch(error => {
        console.error('[CRON] Falha crítica na execução da rotina de limpeza:', error);
      });
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });
}

module.exports = { startCron };