// server/whatsapp-server.js

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore, // Opcional: para armazenar dados como contatos, chats
} = require('@whiskeysockets/baileys');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal'); // Opcional para debug no terminal

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3001", // Frontend e Backend na mesma origem
        methods: ["GET", "POST"]
    }
});

let sock;
let currentQr = null;
const AUTH_FOLDER_PATH = path.join(__dirname, 'baileys_auth_info'); // Pasta para guardar a sessão do Baileys

// ---- INÍCIO: SERVIR O FRONTEND ----
const frontendBuildPath = path.join(__dirname, '..', 'dist'); // Caminho para a pasta 'dist' do frontend
app.use(express.static(frontendBuildPath));
// ---- FIM: SERVIR O FRONTEND ----

// Opcional: Configuração de um armazenamento em memória para dados do WhatsApp
// const store = makeInMemoryStore({});
// // Carrega dados do arquivo se existir (opcional)
// try {
//     if (fs.existsSync(path.join(__dirname, 'baileys_store.json'))) {
//         store.readFromFile(path.join(__dirname, 'baileys_store.json'));
//     }
// } catch (error) {
//     console.error("Erro ao ler o arquivo da store do Baileys:", error);
// }
// // Salva a store periodicamente (opcional)
// setInterval(() => {
//     try {
//         store.writeToFile(path.join(__dirname, 'baileys_store.json'));
//     } catch (error) {
//         console.error("Erro ao escrever no arquivo da store do Baileys:", error);
//     }
// }, 10_000);


async function connectToWhatsApp() {
    console.log('Tentando conectar ao WhatsApp...');

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WhatsApp Web v${version.join('.')}, é a mais recente: ${isLatest}`);

    sock = makeWASocket({
        version,
        printQRInTerminal: false, // QR será mostrado via qrcodeTerminal e emitido via socket
        auth: state,
        // logger: P // Para logs detalhados do Baileys, se necessário (requer importação de 'pino')
        // getMessage: async key => { // Opcional, para buscar mensagens do store
        //     if (store) {
        //         const msg = await store.loadMessage(key.remoteJid, key.id)
        //         return msg?.message || undefined
        //     }
        //     return { conversation: 'hello' } // fallback
        // }
    });

    // Opcional: Vincular eventos da store ao socket, se estiver usando makeInMemoryStore
    // store?.bind(sock.ev);

    sock.ev.on('creds.update', saveCreds); // Salva as credenciais quando atualizadas

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code Recebido do Baileys.');
            qrcodeTerminal.generate(qr, { small: true }); // Mostra QR no terminal do servidor
            currentQr = qr;
            io.emit('qr', qr);
            io.emit('disconnected'); // Garante que o frontend saiba que não está 'ready' ainda
        }

        if (connection === 'close') {
            currentQr = null;
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const reason = DisconnectReason[statusCode] || 'Desconhecido';
            console.error(`Conexão fechada: ${reason} (código ${statusCode})`);
            io.emit('disconnected', reason);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Usuário deslogado. Limpando pasta de autenticação...');
                if (fs.existsSync(AUTH_FOLDER_PATH)) {
                    fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                }
                sock = null; // Destrói a instância atual para forçar uma nova em 'initialize-connection'
            } else {
                // Aqui você pode adicionar lógica para tentar reconectar automaticamente se não for logout
                // Por exemplo: if (statusCode !== DisconnectReason.connectionReplaced) { connectToWhatsApp(); }
                console.log("Não foi logout. Se necessário, o frontend pode solicitar nova conexão.");
            }
        } else if (connection === 'open') {
            console.log('Conexão com WhatsApp estabelecida!');
            currentQr = null;
            io.emit('ready');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        // console.log('Mensagem recebida (RAW):', JSON.stringify(m, undefined, 2));
        // m.messages.forEach(msg => {
        //     if (!msg.key.fromMe && m.type === 'notify') {
        //         console.log('Nova mensagem para nós:', msg);
        //         // Aqui você pode adicionar lógica para processar mensagens recebidas
        //         // Ex: io.emit('new-message', msg);
        //     }
        // });
    });

    return sock;
}

io.on('connection', (socket) => {
    console.log('Frontend conectado via Socket.IO:', socket.id);

    if (sock && sock.authState?.creds?.me) {
        console.log('Informando frontend que já está conectado ao WhatsApp.');
        socket.emit('ready');
    } else if (currentQr) {
        console.log('Enviando QR code existente para o frontend.');
        socket.emit('qr', currentQr);
        socket.emit('disconnected');
    } else {
        console.log('Aguardando ação do frontend para iniciar conexão WhatsApp.');
        socket.emit('disconnected'); // Garante estado inicial correto
    }

    socket.on('initialize-connection', async () => {
        console.log('Frontend pediu para inicializar a conexão com WhatsApp.');
        // Verifica se o socket não existe ou se a conexão WebSocket interna está fechada ou não existe
        if (!sock || !sock.ws || (sock.ws.readyState !== sock.ws.OPEN && sock.ws.readyState !== sock.ws.CONNECTING)) {
            // Limpa a pasta de autenticação se o motivo da última desconexão foi logout,
            // para garantir que um novo QR seja gerado.
            const lastDisconnectFilePath = path.join(AUTH_FOLDER_PATH, 'creds.json'); // Baileys salva as credenciais aqui
             if (!fs.existsSync(lastDisconnectFilePath) && fs.existsSync(AUTH_FOLDER_PATH)) {
                 // Se creds.json não existe mas a pasta sim (pode acontecer se o logout foi interrompido)
                 // ou se explicitamente sabemos que foi logout
                 // Por segurança, se 'initialize' é chamado e não há creds, limpamos tudo para recomeçar
                 console.log("Arquivo de credenciais não encontrado ou estado incerto, limpando pasta de autenticação antes de tentar conectar.");
                 fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
             }

            connectToWhatsApp().catch(err => {
                console.error("Erro ao conectar no WhatsApp via 'initialize-connection':", err);
                io.emit('connection-error', err.message || 'Erro desconhecido ao conectar.');
            });
        } else {
            console.log("Conexão WhatsApp já ativa ou em progresso.");
            if (sock.authState?.creds?.me) {
                 socket.emit('ready');
            } else if(currentQr) {
                 socket.emit('qr', currentQr);
            }
        }
    });

    socket.on('disconnect-client', async () => {
        console.log('Recebido pedido para desconectar o cliente WhatsApp (logout).');
        if (sock) {
            try {
                await sock.logout();
                console.log('Logout solicitado ao Baileys. Evento "connection.update" deve tratar o resto.');
                // A limpeza da pasta de autenticação e emissão de 'disconnected' é tratada no 'connection.update'
                // com DisconnectReason.loggedOut
            } catch (error) {
                console.error('Erro durante o logout do Baileys:', error);
                if (fs.existsSync(AUTH_FOLDER_PATH)) {
                    fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                }
                sock = null;
                currentQr = null;
                io.emit('disconnected', 'Erro no logout');
            }
        } else {
            console.log('Nenhuma sessão Baileys ativa para desconectar.');
             if (fs.existsSync(AUTH_FOLDER_PATH)) {
                fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
            }
            currentQr = null;
            io.emit('disconnected', 'Nenhuma sessão ativa');
        }
    });

    socket.on('send-message', async (data) => {
        const { to, message } = data;
        if (sock && sock.authState?.creds?.me) {
            try {
                const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                console.log(`Enviando mensagem para ${jid}: "${message}"`);
                await sock.sendMessage(jid, { text: message });
                socket.emit('message-sent', { to, message, status: 'success' });
            } catch (error) {
                console.error('Erro ao enviar mensagem com Baileys:', error);
                socket.emit('message-sent', { to, message, status: 'error', error: error.message });
            }
        } else {
            console.warn('Tentativa de enviar mensagem sem cliente WhatsApp conectado.');
            socket.emit('message-sent', { to, message, status: 'error', error: 'WhatsApp não conectado.' });
        }
    });

    socket.on('disconnect', () => { // Quando o cliente Socket.IO desconecta
        console.log('Frontend desconectado do Socket.IO:', socket.id);
    });
});

// ---- INÍCIO: ROTA DE FALLBACK PARA SPA ----
// Deve vir depois das rotas de API/Socket.IO e do express.static
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io/')) { // Não interferir com Socket.IO
        return next();
    }
    // Se não for uma rota de API específica, serve o index.html
    if (!req.originalUrl.includes('/api/')) { // Adicione outros prefixos de API se tiver
      res.sendFile(path.join(frontendBuildPath, 'index.html'));
    } else {
      next(); // Deixa outras rotas de API (se houver) ou 404s acontecerem
    }
});
// ---- FIM: ROTA DE FALLBACK PARA SPA ----


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor Express com Socket.IO rodando na porta ${PORT}`);
    console.log(`Frontend deve estar acessível em http://localhost:${PORT}`);
    console.log("Servidor pronto. Aguardando 'initialize-connection' do frontend para iniciar o WhatsApp, ou tentará usar sessão existente.");
    // Você pode tentar conectar automaticamente se uma sessão válida puder existir,
    // mas é mais seguro esperar a interação do frontend ou uma verificação mais robusta.
    // connectToWhatsApp().catch(err => console.error("Erro inicial ao tentar conectar no WhatsApp:", err));
});

process.on('SIGINT', async () => {
    console.log('Recebido SIGINT. Desconectando Baileys e fechando servidor...');
    if (sock) {
        // await sock.end(new Error('Servidor desligando via SIGINT')); // Baileys não tem um método 'end' explícito assim.
        // O logout ou o fechamento do processo deve lidar com a desconexão.
    }
    io.close(() => {
        console.log('Servidor Socket.IO fechado.');
    });
    server.close(() => {
        console.log('Servidor HTTP fechado.');
        process.exit(0);
    });
});