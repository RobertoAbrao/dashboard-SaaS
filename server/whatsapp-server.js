const crypto = require('crypto');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const Redis = require('ioredis'); // Adicionado para Redis

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3001", // Certifique-se que esta é a porta do seu frontend em desenvolvimento
        methods: ["GET", "POST"]
    }
});

let sock;
let currentQr = null;
let isConnecting = false; 
const AUTH_FOLDER_PATH = path.join(__dirname, 'baileys_auth_info');
const frontendBuildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendBuildPath));

// --- Início da Lógica do Redis ---
const redisClient = new Redis({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        console.log(`Redis: Tentando reconectar (tentativa ${times}). Próxima tentativa em ${delay}ms`);
        return delay;
    },
    reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
            return true;
        }
        return false;
    },
    enableReadyCheck: true
});

redisClient.on('connect', () => {
    console.log('🔌 Redis: Conexão TCP estabelecida com o servidor.');
});

redisClient.on('ready', async () => {
    console.log('✅ Redis pronto para uso!');
    await initializeRedisData();
    addActivityLog('Servidor principal e Redis totalmente operacionais.');
    emitDashboardData();
});

redisClient.on('error', (err) => {
    console.error('❌ Erro na conexão com o Redis:', err.message);
    io.emit('dashboard_error', 'Erro de conexão com o banco de dados em tempo real (Redis).');
});

redisClient.on('reconnecting', (delay) => {
    console.log(`Redis: Reconectando em ${delay}ms...`);
});

redisClient.on('end', () => {
    console.log('Redis: Conexão encerrada.');
});

const MAX_ACTIVITY_LOGS = 20;
async function addActivityLog(activityMessage) {
    if (redisClient.status !== 'ready') {
        console.warn(`Redis não está pronto (status: ${redisClient.status}), log não adicionado: "${activityMessage}"`);
        return;
    }
    try {
        const logEntry = JSON.stringify({ message: activityMessage, timestamp: new Date().toISOString() });
        await redisClient.lpush('bot:activity_log', logEntry);
        await redisClient.ltrim('bot:activity_log', 0, MAX_ACTIVITY_LOGS - 1);
        console.log(`Log Redis: "${activityMessage}"`);
        emitDashboardData();
    } catch (error) {
        console.error('Erro ao adicionar log de atividade no Redis:', error);
    }
}

async function emitDashboardData() {
    const botCurrentStatusFallback = sock && sock.authState?.creds?.me ? 'online' : (currentQr ? 'qr_ready' : (isConnecting ? 'initializing' : 'offline'));
    let dashboardPayload = {
        messagesSent: 0,
        connections: botCurrentStatusFallback === 'online' ? 1 : 0,
        botStatus: botCurrentStatusFallback,
        recentActivity: [{ message: "Aguardando dados do servidor de tempo real...", timestamp: new Date().toISOString() }],
    };

    if (redisClient.status === 'ready') {
        try {
            const messagesSentToday = parseInt(await redisClient.get('bot:messages_sent_today') || '0');
            const rawActivityLog = await redisClient.lrange('bot:activity_log', 0, -1);
            const activityLog = rawActivityLog.map(entry => JSON.parse(entry)).reverse();
            
            dashboardPayload = {
                messagesSent: messagesSentToday,
                connections: botCurrentStatusFallback === 'online' ? 1 : 0,
                botStatus: botCurrentStatusFallback,
                recentActivity: activityLog.length > 0 ? activityLog : [{ message: "Nenhuma atividade recente.", timestamp: new Date().toISOString() }],
            };
        } catch (error) {
            console.error('Erro ao buscar dados do Redis para o dashboard:', error);
            dashboardPayload.recentActivity = [{ message: "Falha ao buscar dados do servidor de tempo real.", timestamp: new Date().toISOString() }];
            io.emit('dashboard_error', 'Falha ao buscar dados para o dashboard.');
        }
    } else {
         console.warn(`Redis não está pronto (status: ${redisClient.status}) para emitir dados do dashboard.`);
    }
    io.emit('dashboard_update', dashboardPayload);
}

async function initializeRedisData() {
    try {
        const messagesExist = await redisClient.exists('bot:messages_sent_today');
        if (!messagesExist) {
            await redisClient.set('bot:messages_sent_today', '0');
            console.log('Contador de mensagens inicializado no Redis.');
            addActivityLog('Contador de mensagens do dashboard inicializado no Redis.');
        } else {
            console.log('Contador de mensagens já existe no Redis.');
            addActivityLog('Contador de mensagens do dashboard verificado no Redis.');
        }
    } catch (error) {
        console.error("Erro ao inicializar dados no Redis:", error);
        addActivityLog(`Erro ao inicializar dados do dashboard no Redis: ${error.message}`);
    }
}
// --- Fim da Lógica do Redis ---

// Lógica de conexão do whatsapp-server1.js (mantida)
async function connectToWhatsApp() {
    if (isConnecting) {
        console.log("Conexão já está em andamento. Ignorando nova tentativa.");
        return;
    }

    isConnecting = true;
    console.log('Tentando conectar ao WhatsApp com Baileys...');
    currentQr = null;
    io.emit('disconnected', 'initializing'); // Emitir estado para o frontend
    addActivityLog('Tentando conectar ao WhatsApp...');


    try {
        if (!fs.existsSync(AUTH_FOLDER_PATH)) {
            fs.mkdirSync(AUTH_FOLDER_PATH, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);

        sock = makeWASocket({
            printQRInTerminal: false, // frontend lida com o QR
            auth: state,
            logger: pino({ level: 'info' }), // Nível de log original do whatsapp-server1.js
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            console.log('[Servidor WA] Evento connection.update:', JSON.stringify(update, null, 2));

            if (qr) {
                console.log('QR Code Recebido:');
                qrcodeTerminal.generate(qr, { small: true }); // Mantido para debug no terminal
                currentQr = qr;
                io.emit('qr', qr);
                io.emit('disconnected', 'qr_ready');
                addActivityLog('QR Code WhatsApp recebido.');
            }

            if (connection === 'close') {
                currentQr = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || lastDisconnect?.error?.message || 'Desconhecido';

                console.error(`Conexão WhatsApp fechada. Razão: ${reason} (código ${statusCode})`);
                addActivityLog(`Conexão WhatsApp fechada. Razão: ${reason}`);
                io.emit('disconnected', `Conexão fechada: ${reason}`); // Emitindo o estado original

                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        if (statusCode === DisconnectReason.restartRequired) {
                            console.log('Erro 515 (restartRequired) detectado. Preparando reconexão...');
                            sock = null; // Limpa sock para nova instância
                        }
                        // Lógica de reconexão automática original
                        console.log(`Tentando reconectar automaticamente em 15s devido a: ${reason}`);
                        connectToWhatsApp().catch(err => {
                            console.error("Erro na tentativa de reconexão automática:", err);
                            io.emit('auth_failed', `Falha na reconexão automática: ${err.message}`);
                            addActivityLog(`Falha na reconexão automática: ${err.message}`);
                        });
                    }, 15000);
                } else {
                    console.log('Usuário deslogado do WA. Limpando pasta de autenticação...');
                    addActivityLog('Usuário deslogado do WhatsApp.');
                    if (fs.existsSync(AUTH_FOLDER_PATH)) {
                        fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                    }
                    sock = null;
                    io.emit('auth_failed', 'Usuário deslogado.'); // Para o frontend saber que precisa de novo QR
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                currentQr = null;
                io.emit('ready');
                addActivityLog('WhatsApp conectado com sucesso!');
            }
            // Atualizar dados do dashboard em qualquer atualização de conexão
            emitDashboardData();
        });

        sock.ev.on('messages.upsert', async m => {
            // console.log(JSON.stringify(m, undefined, 2));
        });

    } catch (err) {
        console.error('Erro geral no connectToWhatsApp:', err);
        addActivityLog(`Erro ao conectar ao WhatsApp: ${err.message}`);
        io.emit('auth_failed', `Erro crítico na conexão: ${err.message}`);
    } finally {
        isConnecting = false; // Mantido do whatsapp-server1.js
    }
}

io.on('connection', (socket) => {
    const clientId = socket.id;
    console.log('Frontend conectado via Socket.IO:', clientId);
    addActivityLog(`Cliente frontend conectado: ${clientId}`);

    if (sock && sock.authState?.creds?.me) {
        socket.emit('ready');
    } else if (currentQr) {
        socket.emit('qr', currentQr);
        socket.emit('disconnected', 'qr_ready');
    } else {
        socket.emit('disconnected', 'offline');
    }
    emitDashboardData();

    socket.on('initialize-connection', async () => {
        console.log(`Frontend (${clientId}) solicitou inicialização do WhatsApp.`);
        addActivityLog(`Cliente ${clientId} solicitou inicialização da conexão WhatsApp.`);

        if (sock && sock.authState?.creds?.me) {
            console.log("WhatsApp já conectado. Emitindo 'ready' (lógica original 'already_connected').");
            socket.emit('ready'); // Manteve o 'ready' em vez de 'already_connected' para alinhar com o hook
            emitDashboardData();
            return;
        }
        // A checagem if (isConnecting) no início de connectToWhatsApp() deve lidar com múltiplas chamadas.
        // Mantendo a lógica do whatsapp-server1.js que não limpava 'sock' explicitamente aqui.
        
        // currentQr = null; // Já é resetado no início de connectToWhatsApp
        // io.emit('disconnected', 'initializing'); // Também no início de connectToWhatsApp
        
        connectToWhatsApp().catch(err => {
            console.error("Erro ao conectar no WhatsApp (solicitado por cliente):", err);
            io.emit('auth_failed', err.message || 'Erro desconhecido ao conectar.');
            addActivityLog(`Erro ao conectar (solicitado por ${clientId}): ${err.message}`);
        });
    });

    socket.on('disconnect-client', async () => {
        console.log(`Frontend (${clientId}) solicitou logout do WhatsApp.`);
        addActivityLog(`Cliente ${clientId} solicitou logout do WhatsApp.`);

        if (sock) {
            try {
                await sock.logout();
                addActivityLog('Logout do WhatsApp realizado.');
                console.log('Logout do WhatsApp realizado com sucesso.');
            } catch (error) {
                console.error('Erro no logout do WhatsApp:', error);
                addActivityLog(`Erro no logout: ${error.message}`);
            }
            sock = null; // Limpa a instância após logout
        } else {
            console.log('Nenhuma sessão WhatsApp ativa para deslogar.');
            addActivityLog('Tentativa de logout sem sessão WhatsApp ativa.');
        }

        if (fs.existsSync(AUTH_FOLDER_PATH)) {
            console.log('Limpando pasta de autenticação para logout completo...');
            fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
            addActivityLog('Dados de autenticação limpos após logout.');
        }
        
        currentQr = null; // Limpa qualquer QR restante
        io.emit('disconnected', 'offline'); // Mantendo o 'offline' para consistência com o frontend
        emitDashboardData(); 
    });

    socket.on('send-message', async ({ to, message }) => {
        console.log(`[DEBUG send-message] Recebido pedido. Destino: ${to}, Mensagem: "${message}"`);
        if (sock && sock.authState?.creds?.me) {
            console.log(`[DEBUG send-message] WhatsApp conectado. Tentando enviar...`);
            try {
                const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                console.log(`[DEBUG send-message] JID Formatado: ${jid}`);
                await sock.sendMessage(jid, { text: message });
                console.log(`[DEBUG send-message] Mensagem enviada com sucesso via Baileys para ${jid}.`);
                socket.emit('message_sent_status', { to, message, status: 'success', info: 'Mensagem enviada.' });

                if (redisClient.status === 'ready') {
                    const newCount = await redisClient.incr('bot:messages_sent_today');
                    console.log(`[DEBUG send-message] Redis: Contador 'bot:messages_sent_today' atualizado para: ${newCount}`);
                } else {
                    console.warn('[DEBUG send-message] Redis não estava pronto para incrementar contador.');
                }
                addActivityLog(`Mensagem enviada para: ${to}`);
            } catch (error) {
                console.error(`[DEBUG send-message] Erro ao enviar mensagem via Baileys para ${to}:`, error);
                socket.emit('message_sent_status', { to, message, status: 'error', error: error.message });
                addActivityLog(`Falha ao enviar mensagem para: ${to}. Erro: ${error.message}`);
            }
        } else {
            console.warn(`[DEBUG send-message] Tentativa de enviar mensagem, mas WhatsApp não conectado. sock: ${!!sock}, authState: ${!!sock?.authState?.creds?.me}`);
            socket.emit('message_sent_status', { to, message, status: 'error', error: 'WhatsApp não conectado.' });
            addActivityLog(`Tentativa de enviar mensagem com bot offline para: ${to}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Frontend desconectado (${clientId}).`);
        addActivityLog(`Cliente frontend desconectado: ${clientId}`);
    });
});

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io/')) return next();
    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend não encontrado. Execute `npm run build` na raiz.');
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor HTTP rodando em http://localhost:${PORT}`);
    // O log de início do servidor com Redis será feito pelo handler 'ready' do redisClient.
});

process.on('SIGINT', async () => {
    console.log('Encerrando servidor...');
    addActivityLog('Servidor encerrando...');
    if (sock) {
        await sock.logout().catch(e => console.error("Erro no logout durante SIGINT:", e.message));
    }
    if (redisClient.status === 'ready') {
        await redisClient.quit();
    } else {
        redisClient.disconnect();
    }
    io.close(() => console.log('Socket.IO fechado.'));
    server.close(() => {
        console.log('Servidor HTTP fechado.');
        process.exit(0);
    });
});