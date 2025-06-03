// server/whatsapp-server.js
const crypto = require('crypto');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    // Browsers // Mantido como no seu whatsapp-server1.js (sem Browsers importado diretamente aqui)
} = require('@whiskeysockets/baileys');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const Redis = require('ioredis');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3001", // Ajuste se necessário
        methods: ["GET", "POST"]
    }
});

let sock;
let currentQr = null;
let isConnecting = false;
const AUTH_FOLDER_PATH = path.join(__dirname, 'baileys_auth_info');
const frontendBuildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendBuildPath));

// --- Lógica do Redis ---
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
        if (err.message.includes(targetError)) return true;
        return false;
    },
    enableReadyCheck: true
});

redisClient.on('connect', () => console.log('🔌 Redis: Conexão TCP estabelecida.'));

redisClient.on('ready', async () => {
    console.log('✅ Redis pronto para uso!');
    await initializeRedisData(); // Agora inicializa Gemini também, se houver chave
    addActivityLog('Servidor principal e Redis totalmente operacionais.');
    emitDashboardData();
});

redisClient.on('error', (err) => {
    console.error('❌ Erro na conexão com o Redis:', err.message);
    io.emit('dashboard_error', 'Erro de conexão com o banco de dados em tempo real (Redis).');
});
redisClient.on('reconnecting', (delay) => console.log(`Redis: Reconectando em ${delay}ms...`));
redisClient.on('end', () => console.log('Redis: Conexão encerrada.'));

const MAX_ACTIVITY_LOGS = 20;
async function addActivityLog(activityMessage) {
    if (redisClient.status !== 'ready') {
        console.warn(`Redis não está pronto (status: ${redisClient.status}), log NÃO adicionado: "${activityMessage}"`);
        return;
    }
    try {
        const logEntry = JSON.stringify({ message: activityMessage, timestamp: new Date().toISOString() });
        await redisClient.lpush('bot:activity_log', logEntry);
        await redisClient.ltrim('bot:activity_log', 0, MAX_ACTIVITY_LOGS - 1);
        console.log(`Log Redis Adicionado: "${activityMessage}"`);
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
        recentActivity: [{ message: "Aguardando dados...", timestamp: new Date().toISOString() }],
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
        } catch (error) { console.error('Erro ao buscar dados do Redis para o dashboard:', error); }
    }
    io.emit('dashboard_update', dashboardPayload);
}

async function initializeRedisData() { // Agora também lida com initializeGemini
    try {
        const defaultKeys = {
            'bot:messages_sent_today': '0',
            'bot_config:gemini_api_key': '',
            'bot_config:system_prompt': 'Você é um assistente prestativo.',
            'bot_config:faq_text': 'Nenhum FAQ carregado ainda.'
        };
        for (const key in defaultKeys) {
            const exists = await redisClient.exists(key);
            if (!exists) {
                await redisClient.set(key, defaultKeys[key]);
                console.log(`Chave Redis inicializada: ${key}`);
                addActivityLog(`Configuração padrão para ${key} definida no Redis.`);
            } else {
                 console.log(`Chave Redis já existe: ${key}`);
            }
        }
        addActivityLog('Configurações e contadores do bot verificados/inicializados no Redis.');

        // Tentar inicializar Gemini com a chave do Redis
        const apiKeyFromRedis = await redisClient.get('bot_config:gemini_api_key');
        if (apiKeyFromRedis && apiKeyFromRedis.trim() !== "") {
            console.log("[Redis Init] API Key do Gemini encontrada no Redis, tentando inicializar Gemini...");
            await initializeGemini(apiKeyFromRedis);
        } else {
            console.log("[Redis Init] Nenhuma API Key do Gemini válida encontrada no Redis para inicialização automática.");
            addActivityLog("API Key do Gemini ainda não configurada ou vazia.");
        }
    } catch (error) { console.error("Erro ao inicializar dados no Redis:", error); }
}
// --- Fim da Lógica do Redis ---

// --- Lógica da API Gemini ---
let genAI;
let geminiModel;

async function initializeGemini(apiKey) {
    console.log(`[Gemini Init] Tentando inicializar com API Key: ${apiKey ? 'CHAVE_FORNECIDA' : 'CHAVE_AUSENTE'}`);
    if (apiKey && apiKey.trim() !== "") {
        try {
            genAI = new GoogleGenerativeAI(apiKey);
            geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            console.log("✅ API do Gemini inicializada com sucesso.");
            addActivityLog("API do Gemini inicializada com sucesso.");
            return true;
        } catch (error) {
            console.error("❌ Falha ao inicializar API do Gemini:", error.message);
            addActivityLog(`Falha ao inicializar API do Gemini: ${error.message}`);
            genAI = null; geminiModel = null; return false;
        }
    } else {
        console.warn("API Key do Gemini não fornecida ou é vazia. Respostas inteligentes desativadas.");
        addActivityLog("API Key do Gemini não configurada/vazia. IA desativada.");
        genAI = null; geminiModel = null; return false;
    }
}
// Não precisamos mais chamar initializeGemini no 'ready' do Redis aqui, pois initializeRedisData já faz isso.
// --- FIM: Lógica da API Gemini ---

// Lógica de conexão Baileys do whatsapp-server1.js
async function connectToWhatsApp() {
    if (isConnecting) {
        console.log("Conexão WhatsApp já está em andamento. Ignorando.");
        return;
    }
    isConnecting = true;
    console.log('Tentando conectar ao WhatsApp com Baileys...');
    currentQr = null;
    io.emit('disconnected', 'initializing');
    addActivityLog('Tentando conectar ao WhatsApp...');

    try {
        if (!fs.existsSync(AUTH_FOLDER_PATH)) fs.mkdirSync(AUTH_FOLDER_PATH, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);
        sock = makeWASocket({
            printQRInTerminal: false,
            auth: state,
            logger: pino({ level: 'info' }), // Nível de log original
            // browser: Browsers.macOS('Desktop'), // Removido para manter igual ao whatsapp-server1.js
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            console.log('[Servidor WA] Evento connection.update:', JSON.stringify(update, null, 2));

            if (qr) {
                console.log('QR Code Recebido:');
                qrcodeTerminal.generate(qr, { small: true });
                currentQr = qr;
                io.emit('qr', qr);
                io.emit('disconnected', 'qr_ready');
                addActivityLog('QR Code WhatsApp recebido.');
            }

            if (connection === 'close') {
                currentQr = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || lastDisconnect?.error?.message || 'Desconhecido';
                // isConnecting = false; // Movido para o finally, como no whatsapp-server1.js

                console.error(`Conexão WhatsApp fechada. Razão: ${reason} (código ${statusCode})`);
                addActivityLog(`Conexão WhatsApp fechada. Razão: ${reason}`);
                io.emit('disconnected', `Conexão fechada: ${reason}`);

                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        if (statusCode === DisconnectReason.restartRequired) {
                            console.log('Erro 515 (restartRequired) detectado. Preparando reconexão...');
                            sock = null; 
                        }
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
                    if (fs.existsSync(AUTH_FOLDER_PATH)) fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                    sock = null;
                    io.emit('auth_failed', 'Usuário deslogado.');
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                currentQr = null;
                // isConnecting = false; // Será feito no finally
                io.emit('ready');
                addActivityLog('WhatsApp conectado com sucesso!');
            }
            emitDashboardData();
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                if (msg.key.fromMe || !msg.message) continue;
                const remoteJid = msg.key.remoteJid;
                const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
                if (!messageContent.trim()) continue;

                console.log(`[MSG Recebida] De: ${remoteJid}, Conteúdo: "${messageContent}"`);
                addActivityLog(`Mensagem recebida de: ${remoteJid}`);

                if (!geminiModel || !genAI) {
                    console.log("[Gemini Check] Gemini não inicializado. Resposta automática desativada.");
                    continue;
                }
                try {
                    const systemPrompt = await redisClient.get('bot_config:system_prompt') || 'Você é um assistente prestativo.';
                    const faqText = await redisClient.get('bot_config:faq_text') || '';
                    const fullPrompt = `${systemPrompt}\n\n---Contexto do FAQ---\n${faqText}\n\n---Fim do Contexto do FAQ---\n\nAgora, responda à seguinte mensagem do cliente:\nCliente: "${messageContent}"\nAssistente:`;
                    console.log(`[Gemini Prompt] Enviando para API (primeiros 200 chars): ${fullPrompt.substring(0, 200)}...`);
                    
                    const result = await geminiModel.generateContent(fullPrompt);
                    const response = await result.response;
                    const geminiReply = response.text();

                    if (geminiReply) {
                        console.log(`[Gemini Resposta] Para ${remoteJid}: "${geminiReply}"`);
                        await sock.sendMessage(remoteJid, { text: geminiReply });
                        addActivityLog(`Resposta automática (Gemini) enviada para: ${remoteJid}`);
                        if (redisClient.status === 'ready') await redisClient.incr('bot:messages_sent_today');
                    } else {
                        console.warn(`[Gemini Resposta] Resposta vazia da API para ${remoteJid}.`);
                        addActivityLog(`Resposta vazia da API Gemini para ${remoteJid}.`);
                    }
                } catch (error) {
                    console.error(`[Gemini Erro] Falha ao gerar resposta para ${remoteJid}:`, error.message);
                    addActivityLog(`Erro ao gerar resposta Gemini para ${remoteJid}: ${error.message}`);
                }
            }
        });

    } catch (err) {
        console.error('Erro geral no connectToWhatsApp:', err);
        addActivityLog(`Erro ao conectar ao WhatsApp: ${err.message}`);
        io.emit('auth_failed', `Erro crítico na conexão: ${err.message}`);
    } finally {
        isConnecting = false; // Mantido como no whatsapp-server1.js
    }
}

io.on('connection', (socket) => {
    const clientId = socket.id;
    console.log('Frontend conectado via Socket.IO:', clientId);
    addActivityLog(`Cliente frontend conectado: ${clientId}`);

    if (sock && sock.authState?.creds?.me) socket.emit('ready');
    else if (currentQr) { socket.emit('qr', currentQr); socket.emit('disconnected', 'qr_ready'); }
    else socket.emit('disconnected', 'offline');
    emitDashboardData();

    socket.on('initialize-connection', async () => {
        console.log(`Frontend (${clientId}) solicitou inicialização do WhatsApp.`);
        addActivityLog(`Cliente ${clientId} solicitou inicialização da conexão WhatsApp.`);
        if (sock && sock.authState?.creds?.me) {
            console.log("Já conectado. Ignorando nova inicialização (emitindo 'already_connected').");
            socket.emit('already_connected'); // Como no whatsapp-server1.js
            emitDashboardData();
            return;
        }
        currentQr = null;
        io.emit('disconnected', 'initializing');
        connectToWhatsApp().catch(err => {
            console.error("Erro ao conectar no WhatsApp (solicitado por cliente):", err);
            io.emit('auth_failed', err.message || 'Erro desconhecido ao conectar.');
            addActivityLog(`Erro ao conectar (solicitado por ${clientId}): ${err.message}`);
        });
    });

    socket.on('disconnect-client', async () => {
        console.log(`Frontend (${clientId}) solicitou logout.`);
        addActivityLog(`Cliente ${clientId} solicitou logout do WhatsApp.`);
        if (sock) {
            try { await sock.logout(); addActivityLog('Logout do WhatsApp realizado.'); }
            catch (error) { console.error('Erro no logout:', error); addActivityLog(`Erro no logout: ${error.message}`);}
            sock = null;
        }
        if (fs.existsSync(AUTH_FOLDER_PATH)) {
            fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
            addActivityLog('Dados de autenticação limpos após logout.');
        }
        currentQr = null;
        io.emit('disconnected', 'Sessão encerrada.'); // Como no whatsapp-server1.js
        emitDashboardData();
    });
    
    socket.on('save_bot_config', async (config, callback) => { // CORRIGIDO: Adicionado callback
        console.log(`[Socket Event] Recebido 'save_bot_config':`, { ...config, geminiApiKey: config.geminiApiKey ? 'CHAVE_OCULTA' : 'N/A' });
        try {
            if (redisClient.status !== 'ready') {
                console.warn("[Save Config] Redis não está pronto.");
                if (typeof callback === 'function') callback({ success: false, message: 'Serviço de armazenamento (Redis) não está pronto.' });
                return;
            }
            let geminiReInitialized = false;
            if (config.geminiApiKey) {
                await redisClient.set('bot_config:gemini_api_key', config.geminiApiKey);
                console.log("[Save Config] API Key do Gemini salva no Redis.");
                geminiReInitialized = await initializeGemini(config.geminiApiKey); 
            }
            if (config.systemPrompt) {
                await redisClient.set('bot_config:system_prompt', config.systemPrompt);
                console.log("[Save Config] Prompt do sistema salvo no Redis.");
            }
            if (typeof config.faqText === 'string') {
                await redisClient.set('bot_config:faq_text', config.faqText);
                console.log("[Save Config] Texto do FAQ salvo no Redis.");
            }
            
            const successMessage = `Configurações salvas com sucesso! ${config.geminiApiKey ? (geminiReInitialized ? 'API Gemini operacional.' : 'Falha ao inicializar API Gemini com a nova chave.') : 'API Gemini não configurada.'}`;
            addActivityLog('Configurações do bot salvas via frontend.');
            if (typeof callback === 'function') callback({ success: true, message: successMessage });

        } catch (error) {
            console.error("Erro ao salvar configurações do bot:", error);
            addActivityLog(`Erro ao salvar configurações do bot: ${error.message}`);
            if (typeof callback === 'function') callback({ success: false, message: `Erro ao salvar: ${error.message}` });
        }
    });

    socket.on('get_bot_config', async (callback) => { /* ... (código mantido) ... */ });
    socket.on('send-message', async ({ to, message }) => { /* ... (código mantido com DEBUG logs) ... */ });
    socket.on('disconnect', () => { /* ... (código mantido) ... */});
});

app.get('*', (req, res, next) => { 
    if (req.path.startsWith('/socket.io/')) return next();
    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Frontend não encontrado.');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor HTTP rodando em http://localhost:${PORT}`);
});

process.on('SIGINT', async () => { /* ... (código mantido) ... */});