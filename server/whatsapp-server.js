// server/whatsapp-server.js
const crypto = require('crypto'); // Mantemos esta linha

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');

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
const AUTH_FOLDER_PATH = path.join(__dirname, 'baileys_auth_info');

const frontendBuildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendBuildPath));

async function connectToWhatsApp() {
    console.log('Tentando conectar ao WhatsApp com Baileys (função connectToWhatsApp)...');
    currentQr = null;

    // Não vamos limpar a pasta de autenticação aqui automaticamente ao chamar connectToWhatsApp,
    // a menos que seja uma inicialização forçada pelo frontend ('initialize-connection').
    // A lógica de limpeza será mais controlada.

    if (!fs.existsSync(AUTH_FOLDER_PATH)){
        fs.mkdirSync(AUTH_FOLDER_PATH, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WhatsApp Web v${version.join('.')}, é a mais recente: ${isLatest}`);

    sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        browser: ['MsgFlowConnect', 'Chrome', '1.0.0'],
        shouldIgnoreJid: jid => false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log('[Servidor] Evento connection.update:', JSON.stringify(update, null, 2)); // Log detalhado do update

        if (qr) {
            console.log('QR Code Recebido do Baileys.');
            qrcodeTerminal.generate(qr, { small: true });
            currentQr = qr;
            io.emit('qr', qr);
            io.emit('disconnected', 'qr_ready');
        }

        if (connection === 'close') {
            currentQr = null; // Limpa o QR se a conexão fechar
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const reason = DisconnectReason[statusCode] || 'Desconhecido';
            
            console.error(`Conexão Baileys fechada. Razão: ${reason} (código ${statusCode})`);
            io.emit('disconnected', `Conexão fechada: ${reason}`);

            // Lógica do fórum: reconectar se não for logout
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('Tentando reconectar automaticamente (abordagem do fórum)...');
                // Adiciona um pequeno atraso para evitar loops muito rápidos
                setTimeout(() => {
                    // Antes de chamar connectToWhatsApp, idealmente limpamos a sessão se for erro 515
                    // Se não for erro 515, talvez não precise limpar, Baileys pode tentar com a sessão existente.
                    // Para o erro 515, o WhatsApp pode ter invalidado a sessão.
                    if (statusCode === DisconnectReason.restartRequired) { // Erro 515
                         console.log('Erro 515 detectado na reconexão automática. Limpando autenticação antes de tentar novamente.');
                         if (fs.existsSync(AUTH_FOLDER_PATH)) {
                            fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                         }
                         sock = null; // Força nova instância
                    }
                    // Para outros erros que não são logout, tentamos reconectar.
                    connectToWhatsApp().catch(err => {
                        console.error("Erro na tentativa de reconexão automática:", err);
                        io.emit('auth_failed', `Falha na reconexão automática: ${err.message}.`);
                    });
                }, 3000); // Atraso de 3 segundos
            } else {
                console.log('Conexão fechada por logout. Limpando pasta de autenticação...');
                if (fs.existsSync(AUTH_FOLDER_PATH)) {
                    fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                }
                sock = null;
                io.emit('auth_failed', 'Usuário deslogado.');
            }
        } else if (connection === 'open') {
            console.log('Conexão com WhatsApp estabelecida via Baileys!');
            currentQr = null;
            io.emit('ready');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        // Lógica para mensagens recebidas
    });

    return sock;
}

io.on('connection', (socket) => {
    const clientId = socket.id;
    console.log('Frontend conectado via Socket.IO:', clientId);

    if (sock && sock.authState?.creds?.me) {
        socket.emit('ready');
    } else if (currentQr) {
        socket.emit('qr', currentQr);
        socket.emit('disconnected', 'qr_ready');
    } else {
        socket.emit('disconnected', 'offline');
    }

    socket.on('initialize-connection', async () => {
        console.log(`Frontend (${clientId}) pediu para inicializar a conexão com WhatsApp (gerar novo QR).`);
        
        // Sempre que o usuário pede para inicializar (gerar QR), limpamos a sessão antiga
        // para garantir um novo QR code e uma nova tentativa de pareamento.
        if (fs.existsSync(AUTH_FOLDER_PATH)) {
            console.log("Limpando pasta de autenticação a pedido do frontend.");
            fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
        }
        if (sock) { // Se existe um socket antigo, tentamos deslogá-lo antes de criar um novo
            try {
                console.log("Tentando deslogar sessão Baileys existente antes de nova inicialização...");
                await sock.logout(); // Isso deve disparar connection.update com loggedOut
            } catch (e) {
                console.warn("Erro ao tentar deslogar sessão Baileys existente:", e.message);
            }
            sock = null; // Garante que uma nova instância seja criada
        }
        currentQr = null;
        io.emit('disconnected', 'initializing'); // Informa todos os clientes

        // Chama connectToWhatsApp para iniciar o processo com uma sessão limpa
        connectToWhatsApp().catch(err => {
            console.error("Erro ao conectar no WhatsApp via 'initialize-connection':", err);
            io.emit('connection_error', err.message || 'Erro desconhecido ao conectar.');
            io.emit('auth_failed', err.message || 'Falha na autenticação.');
        });
    });

    socket.on('disconnect-client', async () => {
        console.log(`Frontend (${clientId}) pediu para desconectar o cliente WhatsApp (logout).`);
        if (sock) {
            try {
                await sock.logout(); // Isso deve acionar 'connection.update' com DisconnectReason.loggedOut
            } catch (error) {
                console.error('Erro durante o logout do Baileys:', error);
                if (fs.existsSync(AUTH_FOLDER_PATH)) {
                    fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                }
                sock = null;
                currentQr = null;
                io.emit('disconnected', 'Erro no logout');
                io.emit('auth_failed', 'Erro no logout');
            }
        } else {
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
                await sock.sendMessage(jid, { text: message });
                socket.emit('message_sent_status', { to, message, status: 'success', info: 'Mensagem enviada para o servidor WhatsApp.' });
            } catch (error) {
                socket.emit('message_sent_status', { to, message, status: 'error', error: error.message });
            }
        } else {
            socket.emit('message_sent_status', { to, message, status: 'error', error: 'WhatsApp não conectado.' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Frontend desconectado do Socket.IO:', clientId);
    });
});

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io/')) {
        return next();
    }
    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Frontend não encontrado. Execute o build do projeto (npm run build).');
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor Express com Socket.IO rodando na porta ${PORT}`);
    console.log(`Frontend deve estar acessível em http://localhost:${PORT}`);
    console.log("Servidor pronto. O frontend deve solicitar 'initialize-connection' para iniciar o WhatsApp.");
});

process.on('SIGINT', async () => {
    console.log('Recebido SIGINT. Desconectando Baileys e fechando servidor...');
    if (sock) {
        await sock.logout();
    }
    io.close(() => {
        console.log('Servidor Socket.IO fechado.');
    });
    server.close(() => {
        console.log('Servidor HTTP fechado.');
        process.exit(0);
    });
});