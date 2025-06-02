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
let isConnecting = false; // <- controle contra reconexões simultâneas
const AUTH_FOLDER_PATH = path.join(__dirname, 'baileys_auth_info');
const frontendBuildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendBuildPath));

async function connectToWhatsApp() {
    if (isConnecting) {
        console.log("Conexão já está em andamento. Ignorando nova tentativa.");
        return;
    }

    isConnecting = true;
    console.log('Tentando conectar ao WhatsApp com Baileys...');
    currentQr = null;

    try {
        if (!fs.existsSync(AUTH_FOLDER_PATH)) {
            fs.mkdirSync(AUTH_FOLDER_PATH, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);

        sock = makeWASocket({
            printQRInTerminal: false,
            auth: state,
            logger: pino({ level: 'info' }),
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            console.log('[Servidor] Evento connection.update:', JSON.stringify(update, null, 2));

            if (qr) {
                console.log('QR Code Recebido:');
                qrcodeTerminal.generate(qr, { small: true });
                currentQr = qr;
                io.emit('qr', qr);
                io.emit('disconnected', 'qr_ready');
            }

            if (connection === 'close') {
                currentQr = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || 'Desconhecido';

                console.error(`Conexão fechada. Razão: ${reason} (código ${statusCode})`);
                io.emit('disconnected', `Conexão fechada: ${reason}`);

                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        if (statusCode === DisconnectReason.restartRequired) {
                            console.log('Erro 515 detectado. Preparando reconexão...');
                            sock = null;
                        }
                        connectToWhatsApp().catch(err => {
                            console.error("Erro na tentativa de reconexão:", err);
                            io.emit('auth_failed', `Falha na reconexão: ${err.message}`);
                        });
                    }, 15000);
                } else {
                    console.log('Usuário deslogado. Limpando pasta...');
                    if (fs.existsSync(AUTH_FOLDER_PATH)) {
                        fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                    }
                    sock = null;
                    io.emit('auth_failed', 'Usuário deslogado.');
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                currentQr = null;
                io.emit('ready');
            }
        });

        sock.ev.on('messages.upsert', async m => {
            // Lógica para mensagens aqui se desejar
        });

    } catch (err) {
        console.error('Erro geral no connectToWhatsApp:', err);
    } finally {
        isConnecting = false;
    }
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
        console.log(`Frontend (${clientId}) solicitou inicialização do WhatsApp.`);

        if (sock && sock.authState?.creds?.me) {
            console.log("Já conectado. Ignorando nova inicialização.");
            socket.emit('already_connected');
            return;
        }

        currentQr = null;
        io.emit('disconnected', 'initializing');

        connectToWhatsApp().catch(err => {
            console.error("Erro ao conectar no WhatsApp:", err);
            io.emit('auth_failed', err.message || 'Erro desconhecido ao conectar.');
        });
    });

    socket.on('disconnect-client', async () => {
        console.log(`Frontend (${clientId}) solicitou logout.`);

        if (sock) {
            try {
                await sock.logout();
            } catch (error) {
                console.error('Erro no logout:', error);
            }
            sock = null;
        }

        if (fs.existsSync(AUTH_FOLDER_PATH)) {
            fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
        }

        currentQr = null;
        io.emit('disconnected', 'Sessão encerrada.');
    });

    socket.on('send-message', async ({ to, message }) => {
        if (sock && sock.authState?.creds?.me) {
            try {
                const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                await sock.sendMessage(jid, { text: message });
                socket.emit('message_sent_status', { to, message, status: 'success' });
            } catch (error) {
                socket.emit('message_sent_status', { to, message, status: 'error', error: error.message });
            }
        } else {
            socket.emit('message_sent_status', { to, message, status: 'error', error: 'WhatsApp não conectado.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Frontend desconectado (${clientId}).`);
    });
});

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io/')) return next();

    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend não encontrado.');
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    console.log('Encerrando servidor...');
    if (sock) await sock.logout();
    io.close(() => console.log('Socket.IO fechado.'));
    server.close(() => {
        console.log('Servidor HTTP fechado.');
        process.exit(0);
    });
});
