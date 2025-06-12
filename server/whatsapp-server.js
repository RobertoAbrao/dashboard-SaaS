// server/whatsapp-server.js
const crypto = require('crypto');
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
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const Redis = require('ioredis');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3001",
        methods: ["GET", "POST"]
    }
});

let sock;
let currentQr = null;
let isConnecting = false;
const AUTH_FOLDER_PATH = path.join(__dirname, 'baileys_auth_info');
const frontendBuildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendBuildPath));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`Diretório de uploads criado em: ${UPLOADS_DIR}`);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos de imagem são permitidos!'), false);
        }
    }
});

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
    await initializeRedisData();
    addActivityLog('Servidor principal e Redis totalmente operacionais.');
    emitDashboardData();
    emitKanbanTickets();
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
    } catch (error) { console.error('Erro ao adicionar log de atividade no Redis:', error); }
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

let useGeminiAI = true;
let useCustomResponses = false;
let pauseBotKeyword = ''; // Variável para a palavra-chave de pausa

const CUSTOM_RESPONSES_FILE_PATH = path.join(__dirname, 'custom_responses.json');
let customResponses = {};

async function loadCustomResponses() {
    try {
        if (fs.existsSync(CUSTOM_RESPONSES_FILE_PATH)) {
            const data = fs.readFileSync(CUSTOM_RESPONSES_FILE_PATH, 'utf8');
            customResponses = JSON.parse(data);
            console.log('✅ Respostas personalizadas carregadas com sucesso.');
            addActivityLog('Respostas personalizadas carregadas.');
        } else {
            customResponses = {};
            fs.writeFileSync(CUSTOM_RESPONSES_FILE_PATH, JSON.stringify({}, null, 2), 'utf8');
            console.log('Arquivo custom_responses.json não encontrado. Criado um novo.');
            addActivityLog('Arquivo custom_responses.json criado.');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar respostas personalizadas:', error);
        addActivityLog(`Erro ao carregar respostas personalizadas: ${error.message}`);
        customResponses = {};
    }
}

async function saveCustomResponses(responses) {
    try {
        const sortedKeys = Object.keys(responses).sort((a,b) => a.localeCompare(b));
        const sortedResponses = {};
        for (const key of sortedKeys) {
            sortedResponses[key] = responses[key];
        }

        fs.writeFileSync(CUSTOM_RESPONSES_FILE_PATH, JSON.stringify(sortedResponses, null, 2), 'utf8');
        customResponses = sortedResponses;
        console.log('✅ Respostas personalizadas salvas com sucesso.');
        addActivityLog('Respostas personalizadas salvas.');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar respostas personalizadas:', error);
        addActivityLog(`Erro ao salvar respostas personalizadas: ${error.message}`);
        return false;
    }
}

async function initializeRedisData() {
    try {
        const defaultKeys = {
            'bot:messages_sent_today': '0',
            'bot_config:gemini_api_key': '',
            'bot_config:system_prompt': 'Você é um assistente prestativo.',
            'bot_config:faq_text': 'Nenhum FAQ carregado ainda.',
            'bot_config:use_gemini_ai': 'true',
            'bot_config:use_custom_responses': 'false',
            'bot_config:pause_bot_keyword': '' // Novo campo Redis
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

        useGeminiAI = (await redisClient.get('bot_config:use_gemini_ai')) === 'true';
        useCustomResponses = (await redisClient.get('bot_config:use_custom_responses')) === 'true';
        pauseBotKeyword = await redisClient.get('bot_config:pause_bot_keyword') || ''; // Carrega a palavra-chave de pausa

        console.log(`[Redis Init] useGeminiAI: ${useGeminiAI}, useCustomResponses: ${useCustomResponses}, pauseBotKeyword: "${pauseBotKeyword}"`);

        await loadCustomResponses();

        const apiKeyFromRedis = await redisClient.get('bot_config:gemini_api_key');
        if (useGeminiAI && apiKeyFromRedis && apiKeyFromRedis.trim() !== "") {
            console.log("[Redis Init] API Key do Gemini encontrada no Redis e IA ativada, tentando inicializar Gemini...");
            await initializeGemini(apiKeyFromRedis);
        } else {
            console.log("[Redis Init] Gemini AI desativado ou API Key não válida/presente.");
            addActivityLog("Gemini AI desativado ou API Key não configurada/vazia.");
        }
    } catch (error) { console.error("Erro ao inicializar dados no Redis:", error); }
}

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

app.post('/api/whatsapp/upload-media', upload.single('mediaFile'), (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado ou tipo de arquivo inválido.' });
    }
    const relativeFilePath = path.join('uploads', req.file.filename);
    console.log('Arquivo recebido e salvo em:', relativeFilePath);
    addActivityLog(`Arquivo de mídia ${req.file.originalname} (${req.file.mimetype}) recebido para upload.`);
    res.json({
        success: true,
        filePath: relativeFilePath,
        originalName: req.file.originalname,
        mimetype: req.mimetype,
        serverFileName: req.file.filename
    });
}, (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        console.error("Erro do Multer:", error);
        return res.status(400).json({ success: false, message: `Erro no upload: ${error.message}` });
    } else if (error) {
        console.error("Erro no upload (fileFilter ou outro):", error.message);
        return res.status(400).json({ success: false, message: error.message || 'Erro desconhecido no upload.' });
    }
    next(error);
});

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
            logger: pino({ level: 'info' }),
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

                console.error(`Conexão WhatsApp fechada. Razão: ${reason} (código ${statusCode})`);
                addActivityLog(`Conexão WhatsApp fechada. Razão: ${reason}`);
                io.emit('disconnected', `Conexão fechada: ${reason}`);

                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        if (statusCode === DisepageReason.restartRequired) {
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
                const isGroup = remoteJid.endsWith('@g.us');

                if (isGroup) {
                    console.log(`[MSG Recebida] Ignorando mensagem de grupo de ${remoteJid}.`);
                    continue;
                }
                if (!messageContent.trim() && !msg.message.imageMessage && !msg.message.documentMessage && !msg.message.videoMessage && !msg.message.audioMessage) {
                    console.log(`[MSG Recebida] Ignorando mensagem vazia ou não processável de ${remoteJid}.`);
                    continue;
                }

                console.log(`[MSG Recebida] De: ${remoteJid}, Conteúdo: "${messageContent || '[Mídia]'}"`);
                addActivityLog(`Mensagem recebida de: ${remoteJid}`);

                let contactName = remoteJid;
                if (sock && sock.contacts) {
                    const contact = sock.contacts[remoteJid];
                    if (contact && contact.notify) {
                        contactName = contact.notify;
                    } else if (contact && contact.verifiedName) {
                        contactName = contact.verifiedName;
                    }
                }

                const phoneNumber = remoteJid.split('@')[0];

                let messageType = 'text';
                if (msg.message.imageMessage) messageType = 'image';
                else if (msg.message.videoMessage) messageType = 'video';
                else if (msg.message.audioMessage) messageType = 'audio';
                else if (msg.message.documentMessage) messageType = 'document';

                const receivedMessage = {
                    id: msg.key.id,
                    from: phoneNumber,
                    to: sock.user.id.split(':')[0],
                    content: messageContent,
                    timestamp: new Date().toISOString(),
                    type: messageType,
                    fromMe: false
                };

                await saveMessageToHistory(phoneNumber, receivedMessage);
                io.emit('new_message_for_kanban_ticket', receivedMessage);
                await createOrUpdateKanbanTicket(phoneNumber, contactName, messageContent);

                // =============================================================
                // Lógica de Resposta do Bot
                // =============================================================
                // Verifica se o bot está pausado para este contato antes de responder automaticamente
                const ticket = await getKanbanTicket(phoneNumber); // Busca o ticket para verificar o estado
                if (ticket && ticket.botPaused) {
                    console.log(`[Bot Pausado] Bot está pausado para ${phoneNumber}. Ignorando resposta automática.`);
                    addActivityLog(`Bot pausado para ${phoneNumber}.`);
                    continue; // Pula a lógica de resposta automática
                }

                if (useCustomResponses) {
                    console.log("[Bot Response] Usando Respostas Personalizadas.");
                    const normalizedMessageContent = messageContent.trim().toLowerCase();
                    const normalizedPauseBotKeyword = pauseBotKeyword.trim().toLowerCase(); // Normaliza a palavra-chave de pausa

                    let matchedOptionKey = Object.keys(customResponses).find(key => key.toLowerCase() === normalizedMessageContent);

                    // Verifica se a mensagem aciona a pausa do bot
                    if (normalizedPauseBotKeyword && normalizedMessageContent === normalizedPauseBotKeyword) {
                        console.log(`[Bot Pausado] Mensagem "${messageContent}" acionou a palavra-chave de pausa. Pausando bot para ${phoneNumber}.`);
                        await setBotPausedStatus(phoneNumber, true); // Pausa o bot para este contato
                        await sock.sendMessage(remoteJid, { text: "Entendido! Um de nossos atendentes irá te ajudar. Por favor, aguarde." });
                        addActivityLog(`Bot pausado para ${phoneNumber} por solicitação do cliente.`);
                        continue; // Não envia mais respostas automáticas após a pausa
                    }

                    // Fallback: Prioriza "menu" se existir, caso contrário, não responde
                    if (!matchedOptionKey && Object.keys(customResponses).length > 0) {
                        if (customResponses['menu']) { // Verifica se a chave 'menu' existe (já normalizada para minúsculas)
                            matchedOptionKey = 'menu';
                            console.log(`[Bot Response] Nenhuma correspondência exata. Usando a opção "menu" como fallback.`);
                        } else {
                            console.log("[Bot Response] Nenhuma correspondência exata e a opção 'menu' não está configurada para fallback. Nenhuma resposta enviada.");
                            addActivityLog("Nenhuma resposta personalizada correspondente e 'menu' não configurado para fallback.");
                            continue;
                        }
                    }

                    if (matchedOptionKey) {
                        const responseMessages = customResponses[matchedOptionKey];
                        for (const responseMsg of responseMessages) {
                            await new Promise(resolve => setTimeout(resolve, responseMsg.delay || 1000));
                            let payload = { text: responseMsg.text };
                            if (responseMsg.link) {
                                payload = { text: `${responseMsg.text}\n${responseMsg.link}` };
                            }
                            if (responseMsg.image) {
                                payload = { text: `${responseMsg.text}\n${responseMsg.image}` };
                            }
                            await sock.sendMessage(remoteJid, payload);
                            addActivityLog(`Resposta personalizada enviada para: ${remoteJid}`);
                            if (redisClient.status === 'ready') await redisClient.incr('bot:messages_sent_today');

                            await saveMessageToHistory(phoneNumber, {
                                id: crypto.randomBytes(10).toString('hex'),
                                from: sock.user.id.split(':')[0],
                                to: phoneNumber,
                                content: payload.text,
                                timestamp: new Date().toISOString(),
                                type: 'text',
                                fromMe: true
                            });
                        }
                    } else {
                        console.log("[Bot Response] Nenhuma resposta personalizada configurada. Nenhuma resposta enviada.");
                        addActivityLog("Nenhuma resposta personalizada configurada.");
                    }
                } else if (useGeminiAI) {
                    console.log("[Bot Response] Usando Bot Inteligente (Gemini).");
                    // Palavra-chave de pausa também pode funcionar com IA, mas deve ser explícita
                    const normalizedMessageContent = messageContent.trim().toLowerCase();
                    const normalizedPauseBotKeyword = pauseBotKeyword.trim().toLowerCase();

                    if (normalizedPauseBotKeyword && normalizedMessageContent === normalizedPauseBotKeyword) {
                        console.log(`[Bot Pausado] Mensagem "${messageContent}" acionou a palavra-chave de pausa. Pausando bot para ${phoneNumber}.`);
                        await setBotPausedStatus(phoneNumber, true);
                        await sock.sendMessage(remoteJid, { text: "Entendido! Um de nossos atendentes irá te ajudar. Por favor, aguarde." });
                        addActivityLog(`Bot pausado para ${phoneNumber} por solicitação do cliente.`);
                        continue;
                    }

                    if (!geminiModel || !genAI) {
                        console.log("[Gemini Check] Gemini não inicializado ou desativado. Resposta automática desativada.");
                        addActivityLog("Gemini AI desativado ou não inicializado. Sem resposta automática.");
                        continue;
                    }
                    try {
                        const systemPrompt = await redisClient.get('bot_config:system_prompt') || 'Você é um assistente prestativo.';
                        const faqText = await redisClient.get('bot_config:faq_text') || '';
                        const fullPrompt = `${systemPrompt}\n\n---Contexto do FAQ---\n${faqText}\n\n---Fim do Contexto do FAQ---\n\nAgora, responda à seguinte mensagem do cliente:\nCliente: "${messageContent}"\nAssistente:`;

                        const result = await geminiModel.generateContent(fullPrompt);
                        const response = await result.response;
                        botReply = response.text();

                        if (botReply) {
                            console.log(`[GEMINI REPLY SENDING...] Para ${remoteJid} (Resposta Automática): "${botReply}"`);
                            const replySentResponse = await sock.sendMessage(remoteJid, { text: botReply });
                            console.log(`[GEMINI REPLY SENT OK] Resposta de sock.sendMessage (Resposta Automática) para ${remoteJid}:`, JSON.stringify(replySentResponse, null, 2));

                            addActivityLog(`Resposta automática (Gemini) enviada para: ${remoteJid}`);
                            if (redisClient.status === 'ready') await redisClient.incr('bot:messages_sent_today');

                            await saveMessageToHistory(phoneNumber, {
                                id: replySentResponse.key.id,
                                from: sock.user.id.split(':')[0],
                                to: phoneNumber,
                                content: botReply,
                                timestamp: new Date().toISOString(),
                                type: 'text',
                                fromMe: true
                            });
                        } else {
                            console.warn(`[Gemini Resposta] Resposta vazia da API para ${remoteJid}.`);
                            addActivityLog(`Resposta vazia da API Gemini para ${remoteJid}.`);
                        }
                    } catch (error) {
                        console.error(`[Gemini Erro] Falha ao gerar resposta para ${remoteJid}:`, error.message);
                        addActivityLog(`Erro ao gerar resposta Gemini para ${remoteJid}: ${error.message}`);
                    }
                } else {
                    console.log("[Bot Response] Nenhum modo de atendimento ativo (IA ou Respostas Personalizadas).");
                    addActivityLog("Nenhum modo de atendimento ativo para responder.");
                }
            }
        });

    } catch (err) {
        console.error('Erro geral no connectToWhatsApp:', err);
        addActivityLog(`Erro ao conectar ao WhatsApp: ${err.message}`);
        io.emit('auth_failed', `Erro crítico na conexão: ${err.message}`);
    } finally {
        isConnecting = false;
    }
}

// Funções Kanban
// ATENÇÃO: Adicionamos a propriedade 'botPaused' aos tickets no Redis
async function createOrUpdateKanbanTicket(phoneNumber, contactName, messagePreview) {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto para gerenciar tickets Kanban.');
        return;
    }
    const ticketKey = `kanban:ticket:${phoneNumber}`;
    try {
        const existingTicket = await redisClient.get(ticketKey);
        let ticketData;
        const currentTimestamp = new Date().toISOString();

        if (existingTicket) {
            ticketData = JSON.parse(existingTicket);
            if (ticketData.status === 'completed') {
                console.log(`Ticket para ${phoneNumber} estava 'completed'. Movendo para 'pending' devido a nova mensagem.`);
                ticketData.status = 'pending';
                ticketData.botPaused = false; // Garante que o bot não está pausado se o ticket volta a ser pendente por nova mensagem
                addActivityLog(`Ticket ${phoneNumber} movido de 'completed' para 'pending' por nova mensagem. Bot reativado.`);
            }
            // Atualiza preview e timestamp, mantém botPaused existente se não for 'completed'
            ticketData.messagePreview = messagePreview || ticketData.messagePreview;
            ticketData.lastMessageTimestamp = currentTimestamp;
            // Se o ticket já existia, mas não estava 'completed' e recebe nova msg, não altera o botPaused
            // Apenas se ele estava 'completed' e voltou a 'pending' (como acima)
            console.log(`Ticket Kanban atualizado para ${phoneNumber}.`);
            addActivityLog(`Ticket Kanban atualizado para ${phoneNumber}.`);
        } else {
            ticketData = {
                id: phoneNumber,
                phoneNumber: phoneNumber,
                contactName: contactName,
                status: 'pending',
                createdAt: currentTimestamp,
                lastMessageTimestamp: currentTimestamp,
                messagePreview: messagePreview,
                botPaused: false, // Novo ticket inicia com bot não pausado
            };
            console.log(`Novo ticket Kanban criado para ${phoneNumber}.`);
            addActivityLog(`Novo ticket Kanban criado para ${phoneNumber}.`);
        }
        await redisClient.set(ticketKey, JSON.stringify(ticketData));
        emitKanbanTickets();
    } catch (error) {
        console.error('Erro ao criar/atualizar ticket Kanban no Redis:', error);
    }
}

async function getKanbanTicket(phoneNumber) {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto. Não foi possível buscar ticket Kanban.');
        return null;
    }
    const ticketKey = `kanban:ticket:${phoneNumber}`;
    try {
        const ticketData = await redisClient.get(ticketKey);
        return ticketData ? JSON.parse(ticketData) : null;
    } catch (error) {
        console.error(`Erro ao buscar ticket Kanban para ${phoneNumber} do Redis:`, error);
        return null;
    }
}


// Nova função para definir o status de pausa do bot para um contato
async function setBotPausedStatus(phoneNumber, isPaused) {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto. Não foi possível definir o status de pausa do bot.');
        return false;
    }
    const ticketKey = `kanban:ticket:${phoneNumber}`;
    try {
        const existingTicket = await redisClient.get(ticketKey);
        if (existingTicket) {
            const ticketData = JSON.parse(existingTicket);
            ticketData.botPaused = isPaused;
            await redisClient.set(ticketKey, JSON.stringify(ticketData));
            addActivityLog(`Status de pausa do bot para ${phoneNumber} definido como: ${isPaused}.`);
            emitKanbanTickets(); // Emite atualização para o frontend
            return true;
        } else {
            console.warn(`Ticket ${phoneNumber} não encontrado para definir o status de pausa.`);
            return false;
        }
    } catch (error) {
        console.error(`Erro ao definir status de pausa do bot para ${phoneNumber} no Redis:`, error);
        return false;
    }
}

async function updateKanbanTicketStatus(ticketId, newStatus) {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto. Não foi possível atualizar o status do ticket.');
        return false;
    }
    const ticketKey = `kanban:ticket:${ticketId}`;
    try {
        const existingTicket = await redisClient.get(ticketKey);
        if (existingTicket) {
            const ticketData = JSON.parse(existingTicket);
            ticketData.status = newStatus;
            // Se o ticket for movido para 'completed', despausamos o bot
            if (newStatus === 'completed') {
                ticketData.botPaused = false;
                addActivityLog(`Ticket ${ticketId} marcado como 'completed'. Bot reativado para este contato.`);
            }
            await redisClient.set(ticketKey, JSON.stringify(ticketData));
            addActivityLog(`Status do ticket ${ticketId} atualizado para: ${newStatus}.`);
            emitKanbanTickets();
            return true;
        } else {
            console.warn(`Ticket ${ticketId} não encontrado no Redis para atualização de status.`);
            return false;
        }
    } catch (error) {
        console.error(`Erro ao atualizar status do ticket ${ticketId} no Redis:`, error);
        return false;
    }
}

async function removeKanbanTicket(ticketId) {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto. Não foi possível remover o ticket.');
        return false;
    }
    const ticketKey = `kanban:ticket:${ticketId}`;
    const historyKey = `kanban:history:${ticketId}`;
    try {
        const deletedTicketCount = await redisClient.del(ticketKey);
        const deletedHistoryCount = await redisClient.del(historyKey);

        if (deletedTicketCount > 0) {
            addActivityLog(`Ticket Kanban ${ticketId} e seu histórico (${deletedHistoryCount} msgs) removidos.`);
            emitKanbanTickets();
            return true;
        } else {
            console.warn(`Ticket ${ticketId} não encontrado para remoção.`);
            return false;
        }
    } catch (error) {
        console.error(`Erro ao remover ticket ${ticketId} e histórico do Redis:`, error);
        return false;
    }
}

async function getKanbanTickets() {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto. Não foi possível buscar tickets Kanban.');
        return [];
    }
    try {
        const keys = await redisClient.keys('kanban:ticket:*');
        const tickets = [];
        for (const key of keys) {
            const ticketData = await redisClient.get(key);
            if (ticketData) {
                tickets.push(JSON.parse(ticketData));
            }
        }
        return tickets;
    } catch (error) {
        console.error('Erro ao buscar tickets Kanban do Redis:', error);
        return [];
    }
}

async function saveMessageToHistory(phoneNumber, message) {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto para salvar histórico de mensagens.');
        return;
    }
    const historyKey = `kanban:history:${phoneNumber}`;
    try {
        await redisClient.rpush(historyKey, JSON.stringify(message));
        await redisClient.ltrim(historyKey, -100, -1);
        console.log(`Mensagem salva no histórico de ${phoneNumber}.`);
    } catch (error) {
        console.error(`Erro ao salvar mensagem no histórico de ${phoneNumber}:`, error);
    }
}

async function getMessageHistory(phoneNumber) {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto para buscar histórico de mensagens.');
        return [];
    }
    const historyKey = `kanban:history:${phoneNumber}`;
    try {
        const rawHistory = await redisClient.lrange(historyKey, 0, -1);
        return rawHistory.map(entry => JSON.parse(entry));
    } catch (error) {
        console.error(`Erro ao buscar histórico de mensagens para ${phoneNumber}:`, error);
        return [];
    }
}

function emitKanbanTickets() {
    if (redisClient.status !== 'ready') {
        console.warn('Redis não está pronto, não é possível emitir tickets Kanban.');
        return;
    }
    getKanbanTickets().then(tickets => {
        io.emit('kanban_tickets_update', tickets);
        console.log('Tickets Kanban emitidos via Socket.IO.');
    }).catch(error => {
        console.error('Erro ao emitir tickets Kanban:', error);
    });
}

io.on('connection', (socket) => {
    const clientId = socket.id;
    console.log('Frontend conectado via Socket.IO:', clientId);
    addActivityLog(`Cliente frontend conectado: ${clientId}`);

    if (sock && sock.authState?.creds?.me) socket.emit('ready');
    else if (currentQr) { socket.emit('qr', currentQr); socket.emit('disconnected', 'qr_ready'); }
    else socket.emit('disconnected', 'offline');
    emitDashboardData();
    emitKanbanTickets();

    socket.on('initialize-connection', async () => {
        console.log(`Frontend (${clientId}) solicitou inicialização do WhatsApp.`);
        addActivityLog(`Cliente ${clientId} solicitou inicialização da conexão WhatsApp.`);
        if (sock && sock.authState?.creds?.me) {
            console.log("Já conectado. Ignorando nova inicialização (emitindo 'already_connected').");
            socket.emit('already_connected');
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
        io.emit('disconnected', 'Sessão encerrada.');
        emitDashboardData();
    });

    socket.on('save_bot_config', async (config, callback) => {
        console.log(`[Socket Event] Recebido 'save_bot_config':`, {
            ...config,
            geminiApiKey: config.geminiApiKey ? 'CHAVE_OCULTA' : 'N/A',
            customResponses: config.customResponses ? 'RESPOSTAS_OCULTAS' : 'N/A'
        });
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
            } else {
                await redisClient.set('bot_config:gemini_api_key', '');
            }

            if (config.systemPrompt) {
                await redisClient.set('bot_config:system_prompt', config.systemPrompt);
                console.log("[Save Config] Prompt do sistema salvo no Redis.");
            }

            if (typeof config.faqText === 'string') {
                await redisClient.set('bot_config:faq_text', config.faqText);
                console.log("[Save Config] Texto do FAQ salvo no Redis.");
            }

            useGeminiAI = config.useGeminiAI;
            useCustomResponses = config.useCustomResponses;
            pauseBotKeyword = config.pauseBotKeyword || ''; // Salva a palavra-chave de pausa no backend

            await redisClient.set('bot_config:use_gemini_ai', String(useGeminiAI));
            await redisClient.set('bot_config:use_custom_responses', String(useCustomResponses));
            await redisClient.set('bot_config:pause_bot_keyword', pauseBotKeyword); // Salva no Redis

            console.log(`[Save Config] useGeminiAI: ${useGeminiAI}, useCustomResponses: ${useCustomResponses}, pauseBotKeyword: "${pauseBotKeyword}"`);

            if (useGeminiAI && config.geminiApiKey) {
                geminiReInitialized = await initializeGemini(config.geminiApiKey);
            } else {
                genAI = null;
                geminiModel = null;
                addActivityLog("Gemini AI desativado ou chave removida.");
            }

            if (useCustomResponses && config.customResponses) {
                const normalizedCustomResponses = {};
                for (const key in config.customResponses) {
                    normalizedCustomResponses[key.toLowerCase()] = config.customResponses[key];
                }
                await saveCustomResponses(normalizedCustomResponses);
            } else {
                console.log("Respostas personalizadas desativadas.");
                await saveCustomResponses({});
            }

            const successMessage = `Configurações salvas com sucesso! ` +
                                   `${useGeminiAI ? (geminiReInitialized ? 'API Gemini operacional.' : 'Falha ao inicializar API Gemini com a nova chave.') : 'API Gemini desativada.'} ` +
                                   `${useCustomResponses ? 'Respostas Personalizadas ativadas.' : 'Respostas Personalizadas desativadas.'}`;
            addActivityLog('Configurações do bot salvas via frontend.');
            if (typeof callback === 'function') callback({ success: true, message: successMessage });

        } catch (error) {
            console.error("Erro ao salvar configurações do bot:", error);
            addActivityLog(`Erro ao salvar configurações do bot: ${error.message}`);
            if (typeof callback === 'function') callback({ success: false, message: `Erro ao salvar: ${error.message}` });
        }
    });

    socket.on('get_bot_config', async (callback) => {
        console.log(`[Socket Event] Recebido 'get_bot_config' de ${clientId}`);
        if (redisClient.status !== 'ready') {
            console.warn("[Get Config] Redis não está pronto.");
            if (typeof callback === 'function') callback({ success: false, message: 'Serviço de armazenamento (Redis) não está pronto.' });
            return;
        }
        try {
            const geminiApiKey = await redisClient.get('bot_config:gemini_api_key') || '';
            const systemPrompt = await redisClient.get('bot_config:system_prompt') || 'Você é um assistente prestativo.';
            const faqTextExists = await redisClient.exists('bot_config:faq_text');
            const faqFilename = faqTextExists && (await redisClient.get('bot_config:faq_text') || '').length > 0 ? "faq.txt (carregado)" : "Nenhum arquivo FAQ carregado.";

            const currentUseGeminiAI = (await redisClient.get('bot_config:use_gemini_ai')) === 'true';
            const currentUseCustomResponses = (await redisClient.get('bot_config:use_custom_responses')) === 'true';
            const currentPauseBotKeyword = await redisClient.get('bot_config:pause_bot_keyword') || ''; // Carrega do Redis

            await loadCustomResponses();

            if (typeof callback === 'function') {
                callback({
                    success: true,
                    data: {
                        geminiApiKey: geminiApiKey,
                        systemPrompt: systemPrompt,
                        faqFilename: faqFilename,
                        useGeminiAI: currentUseGeminiAI,
                        useCustomResponses: currentUseCustomResponses,
                        customResponses: customResponses,
                        pauseBotKeyword: currentPauseBotKeyword // Envia para o frontend
                    }
                });
            }
        } catch (error) {
            console.error("Erro ao buscar configurações do bot:", error);
            addActivityLog(`Erro ao buscar configurações do bot: ${error.message}`);
            if (typeof callback === 'function') callback({ success: false, message: `Erro ao buscar: ${error.message}` });
        }
    });

    socket.on('send-message', async ({ to, message, mediaInfo }, callback) => {
        if (!sock || !sock.authState?.creds?.me) {
            console.warn(`[MSG SEND FAIL] Tentativa de envio por ${clientId} enquanto desconectado.`);
            if (typeof callback === 'function') {
                callback({
                    status: 'error',
                    error: 'WhatsApp não conectado. Não é possível enviar a mensagem.'
                });
            }
            return socket.emit('message_sent_status', {
                to,
                message: mediaInfo?.caption || message,
                status: 'error',
                error: 'WhatsApp não conectado. Não é possível enviar a mensagem.'
            });
        }

        const messageDescriptionForLog = mediaInfo ? `mídia ${mediaInfo.originalName || 'sem nome'}` : `texto "${message ? message.substring(0,30) + '...' : ''}"`;
        console.log(`[MSG SEND START] Evento 'send-message' de ${clientId} para ${to}. Conteúdo: ${messageDescriptionForLog}`);

        try {
            let jid;
            let cleanNumber = to.replace(/\D/g, '');

            if (cleanNumber.startsWith('55') && cleanNumber.length >= 12) {
                jid = `${cleanNumber}@s.whatsapp.net`;
            }
            else if ((cleanNumber.length === 10 || cleanNumber.length === 11) && !cleanNumber.startsWith('55')) {
                jid = `55${cleanNumber}@s.whatsapp.net`;
            }
            else if (to.includes('@')) {
                 jid = to;
            }
            else {
                 jid = `${cleanNumber}@s.whatsapp.net`;
            }
            console.log(`[JID PREP] Número original: "${to}", JID formatado: "${jid}"`);

            let messagePayload = {};
            let sentMessageDescription = `Mensagem de texto para ${jid}`;
            let messageType = 'text';

            if (mediaInfo && mediaInfo.serverFilePath && mediaInfo.mimetype?.startsWith('image/')) {
                const absoluteMediaPath = path.resolve(__dirname, mediaInfo.serverFilePath);
                if (!fs.existsSync(absoluteMediaPath)) {
                    console.error(`[MSG SEND FAIL] Arquivo de imagem não encontrado: ${absoluteMediaPath}`);
                    if (typeof callback === 'function') callback({ status: 'error', error: 'Arquivo de imagem não encontrado no servidor.' });
                    return socket.emit('message_sent_status', { to, message: mediaInfo.caption || message, status: 'error', error: 'Arquivo de imagem não encontrado no servidor.'});
                }
                messagePayload = {
                    image: fs.readFileSync(absoluteMediaPath),
                    caption: mediaInfo.caption || message || '',
                    mimetype: mediaInfo.mimetype
                };
                sentMessageDescription = `Imagem ${mediaInfo.originalName || mediaInfo.serverFileName} para ${jid}`;
                messageType = 'image';
                console.log(`[MSG SEND PREP] Preparando para enviar imagem (buffer) para ${jid} com caption: "${messagePayload.caption}"`);
            } else if (message && message.trim() !== "") {
                messagePayload = { text: message };
                console.log(`[MSG SEND PREP] Preparando para enviar texto para ${jid}:`, messagePayload);

            } else {
                 console.warn(`[MSG SEND FAIL] Tentativa de envio de mensagem vazia para ${to} sem mídia válida.`);
                 if (typeof callback === 'function') callback({ status: 'error', error: 'A mensagem deve conter texto ou uma imagem válida.' });
                 return socket.emit('message_sent_status', { to, message, status: 'error', error: 'A mensagem deve conter texto ou uma imagem válida.' });
            }

            console.log(`[MSG SENDING...] Enviando para ${jid} com payload:`, messagePayload.text ? {text: messagePayload.text} : {caption: messagePayload.caption, mimetype: messagePayload.mimetype, image_size: messagePayload.image?.length});
            const sentMsgResponse = await sock.sendMessage(jid, messagePayload);
            console.log(`[MSG SENT OK] Resposta de sock.sendMessage (Resposta Automática) para ${jid}:`, JSON.stringify(sentMsgResponse, null, 2));

            addActivityLog(`${sentMessageDescription} enviada.`);
            if (redisClient.status === 'ready') await redisClient.incr('bot:messages_sent_today');

            const cleanToNumber = to.replace(/\D/g, '');
            await saveMessageToHistory(cleanToNumber, {
                id: sentMsgResponse.key.id,
                from: sock.user.id.split(':')[0],
                to: cleanToNumber,
                content: mediaInfo?.caption || message || '',
                timestamp: new Date().toISOString(),
                type: messageType,
                fromMe: true
            });
            io.emit('new_message_for_kanban_ticket', {
                id: sentMsgResponse.key.id,
                from: sock.user.id.split(':')[0],
                to: cleanToNumber,
                content: mediaInfo?.caption || message || '',
                timestamp: new Date().toISOString(),
                type: messageType,
                fromMe: true,
            });


            const successInfo = `${sentMessageDescription} enviada com sucesso via Baileys. ID da mensagem: ${sentMsgResponse?.key?.id || 'N/A'}`;
            if (typeof callback === 'function') callback({ status: 'success', info: successInfo, messageId: sentMsgResponse?.key?.id });
            socket.emit('message_sent_status', {
                to,
                message: mediaInfo ? mediaInfo.caption || message : message,
                status: 'error',
                error: `Falha ao enviar mensagem: ${error.message}`
            });

            if (mediaInfo && mediaInfo.serverFilePath) {
                const absoluteMediaPath = path.resolve(__dirname, mediaInfo.serverFilePath);
                fs.unlink(absoluteMediaPath, (err) => {
                    if (err) console.error('[FILE CLEANUP ERR] Erro ao deletar arquivo temporário de mídia:', err);
                    else console.log('[FILE CLEANUP OK] Arquivo temporário de mídia deletado:', mediaInfo.serverFilePath);
                });
            }

        } catch (error) {
            console.error(`[MSG SEND FAIL] Erro ao enviar ${messageDescriptionForLog} para ${to}:`, error);
            addActivityLog(`Erro ao enviar ${messageDescriptionForLog} para ${to}: ${error.message}`);
            if (typeof callback === 'function') callback({ status: 'error', error: `Falha ao enviar mensagem: ${error.message}` });
            socket.emit('message_sent_status', {
                to,
                message: mediaInfo ? mediaInfo.caption || message : message,
                status: 'error',
                error: `Falha ao enviar mensagem: ${error.message}`
            });
        }
    });

    socket.on('get_kanban_tickets', async (callback) => {
        console.log(`[Socket Event] Recebido 'get_kanban_tickets' de ${clientId}`);
        const tickets = await getKanbanTickets();
        if (typeof callback === 'function') {
            callback({ success: true, tickets: tickets });
        }
    });

    socket.on('update_ticket_status', async ({ ticketId, newStatus }, callback) => {
        console.log(`[Socket Event] Recebido 'update_ticket_status' para ticket ${ticketId} para status: ${newStatus}`);
        const success = await updateKanbanTicketStatus(ticketId, newStatus);
        if (typeof callback === 'function') {
            callback({ success: success, message: success ? 'Status atualizado com sucesso.' : 'Falha ao atualizar status.' });
        }
    });

    socket.on('remove_kanban_ticket', async ({ ticketId }, callback) => {
        console.log(`[Socket Event] Recebido 'remove_kanban_ticket' para ticket ${ticketId}`);
        const success = await removeKanbanTicket(ticketId);
        if (typeof callback === 'function') {
            callback({ success: success, message: success ? 'Ticket removido com sucesso.' : 'Falha ao remover ticket.' });
        }
    });

    socket.on('get_message_history', async ({ phoneNumber }, callback) => {
        console.log(`[Socket Event] Recebido 'get_message_history' para ${phoneNumber}`);
        const history = await getMessageHistory(phoneNumber);
        if (typeof callback === 'function') {
            callback({ success: true, history: history });
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
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Frontend não encontrado.');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor HTTP rodando em http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    console.log('Encerrando servidor...');
    if (sock) {
        try {
            await sock.logout("Servidor encerrando");
            console.log('Logout do WhatsApp realizado.');
        } catch (err) {
            console.error('Erro durante o logout do WhatsApp no SIGINT:', err);
        }
    }
    io.close(() => {
        console.log('Socket.IO fechado.');
        redisClient.quit(() => {
            console.log('Conexão Redis fechada.');
            server.close(() => {
                console.log('Servidor HTTP fechado.');
                process.exit(0);
            });
        });
    });
});