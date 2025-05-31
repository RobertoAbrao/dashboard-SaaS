// server/whatsapp-server.js
const crypto = require('crypto'); // Adicione esta linha no topo

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
const qrcodeTerminal = require('qrcode-terminal'); // Para mostrar QR no terminal do servidor

const app = express();
const server = http.createServer(app); // Servidor HTTP ao qual o Socket.IO será anexado
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3001", // Permitindo a origem do seu frontend
        methods: ["GET", "POST"]
    }
});

let sock; // Variável para armazenar a instância do socket Baileys
let currentQr = null; // Variável para armazenar o QR code atual
const AUTH_FOLDER_PATH = path.join(__dirname, 'baileys_auth_info'); // Pasta para guardar a sessão

// ---- SERVIR O FRONTEND BUILDADO ----
const frontendBuildPath = path.join(__dirname, '..', 'dist'); // Caminho para a pasta 'dist' do frontend
app.use(express.static(frontendBuildPath));
// ---- FIM: SERVIR O FRONTEND ----

async function connectToWhatsApp() {
    console.log('Tentando conectar ao WhatsApp com Baileys...');
    currentQr = null; // Limpa QR anterior ao tentar conectar

    // Garante que a pasta de autenticação exista
    if (!fs.existsSync(AUTH_FOLDER_PATH)){
        fs.mkdirSync(AUTH_FOLDER_PATH, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WhatsApp Web v${version.join('.')}, é a mais recente: ${isLatest}`);

    sock = makeWASocket({
        version,
        printQRInTerminal: false, // Desabilitamos, pois vamos tratar o QR manualmente
        auth: state,       
        browser: ['MsgFlowConnect', 'Chrome', '1.0.0'], // Define um nome customizado para o dispositivo
        shouldIgnoreJid: jid => false, // Exemplo, pode ser usado para ignorar certos JIDs
    });

    sock.ev.on('creds.update', saveCreds); // Salva as credenciais quando atualizadas

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code Recebido do Baileys.');
            qrcodeTerminal.generate(qr, { small: true }); // Mostra QR no terminal do servidor
            currentQr = qr;
            io.emit('qr', qr); // Emitir para o frontend via Socket.IO
            io.emit('disconnected', 'qr_ready'); // Informa o frontend que está aguardando QR
        }

        if (connection === 'close') {
            currentQr = null;
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const reason = DisconnectReason[statusCode] || 'Desconhecido';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.error(`Conexão Baileys fechada: ${reason} (código ${statusCode}), reconectando: ${shouldReconnect}`);
            io.emit('disconnected', `Conexão fechada: ${reason}`);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Usuário deslogado do WhatsApp. Limpando pasta de autenticação...');
                if (fs.existsSync(AUTH_FOLDER_PATH)) {
                    fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                }
                sock = null; // Destrói a instância atual para forçar uma nova em 'initialize-connection'
                io.emit('auth_failed', 'Usuário deslogado.'); // Emite um evento específico para auth_failed
            } else {
                // Se não for logout, pode tentar reconectar ou apenas informar o frontend
                console.log("Conexão fechada por outro motivo. Frontend pode solicitar nova conexão.");
            }
        } else if (connection === 'open') {
            console.log('Conexão com WhatsApp estabelecida via Baileys!');
            currentQr = null; // Limpa o QR pois já conectou
            io.emit('ready'); // Emitir que está conectado e pronto
        }
    });

    // Exemplo de como receber mensagens
    sock.ev.on('messages.upsert', async m => {
        // console.log('Mensagem recebida (RAW):', JSON.stringify(m, undefined, 2));
        // m.messages.forEach(msg => {
        //     if (!msg.key.fromMe && m.type === 'notify') {
        //         console.log('Nova mensagem para nós:', msg);
        //         // Aqui você pode adicionar lógica para processar mensagens recebidas
        //         // Ex: io.emit('new-message', { from: msg.key.remoteJid, text: msg.message?.conversation });
        //     }
        // });
    });

    return sock;
}

io.on('connection', (socket) => {
    const clientId = socket.id;
    console.log('Frontend conectado via Socket.IO:', clientId);

    // Envia o estado atual da conexão WhatsApp para o cliente que acabou de conectar
    if (sock && sock.authState?.creds?.me) {
        console.log('Informando frontend que WhatsApp já está conectado.');
        socket.emit('ready');
    } else if (currentQr) {
        console.log('Enviando QR code existente para o frontend.');
        socket.emit('qr', currentQr);
        socket.emit('disconnected', 'qr_ready'); // Informa que está aguardando QR
    } else {
        console.log('WhatsApp não conectado. Aguardando ação do frontend.');
        socket.emit('disconnected', 'offline'); // Estado inicial
    }

    socket.on('initialize-connection', async () => {
        console.log(`Frontend (${clientId}) pediu para inicializar a conexão com WhatsApp.`);
        if (sock && (sock.ws?.readyState === sock.ws?.OPEN || sock.ws?.readyState === sock.ws?.CONNECTING)) {
            console.log("Conexão WhatsApp já ativa ou em progresso. Enviando estado atual.");
            if (sock.authState?.creds?.me) socket.emit('ready');
            else if (currentQr) socket.emit('qr', currentQr);
            else socket.emit('disconnected', 'initializing'); // Se está tentando mas ainda sem QR/ready
            return;
        }
        
        // Limpar sessão antiga se explicitamente pedido para gerar novo QR ou se logout
        if (fs.existsSync(AUTH_FOLDER_PATH)) {
            console.log("Limpando pasta de autenticação existente antes de nova tentativa.");
            fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
        }
        sock = null; // Garante que uma nova instância seja criada
        currentQr = null;
        io.emit('disconnected', 'initializing'); // Informa todos os clientes

        connectToWhatsApp().catch(err => {
            console.error("Erro ao conectar no WhatsApp via 'initialize-connection':", err);
            io.emit('connection_error', err.message || 'Erro desconhecido ao conectar.');
            io.emit('auth_failed', err.message || 'Falha na autenticação.');
        });
    });

    socket.on('disconnect-client', async () => { // Pedido de logout do WhatsApp
        console.log(`Frontend (${clientId}) pediu para desconectar o cliente WhatsApp (logout).`);
        if (sock) {
            try {
                await sock.logout();
                console.log('Logout solicitado ao Baileys. Evento "connection.update" com DisconnectReason.loggedOut deve tratar o resto.');
                // A limpeza da pasta de autenticação e a emissão de 'disconnected'/'auth_failed'
                // são tratadas no handler 'connection.update'
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
        console.log(`Frontend (${clientId}) pediu para enviar mensagem para ${to}`);
        if (sock && sock.authState?.creds?.me) { // Verifica se conectado
            try {
                const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                console.log(`Enviando mensagem via Baileys para ${jid}: "${message}"`);
                await sock.sendMessage(jid, { text: message });
                socket.emit('message_sent_status', { to, message, status: 'success', info: 'Mensagem enviada para o servidor WhatsApp.' });
            } catch (error) {
                console.error('Erro ao enviar mensagem com Baileys:', error);
                socket.emit('message_sent_status', { to, message, status: 'error', error: error.message });
            }
        } else {
            console.warn('Tentativa de enviar mensagem sem cliente WhatsApp conectado.');
            socket.emit('message_sent_status', { to, message, status: 'error', error: 'WhatsApp não conectado.' });
        }
    });

    socket.on('disconnect', () => { // Quando o cliente Socket.IO desconecta do servidor
        console.log('Frontend desconectado do Socket.IO:', clientId);
    });
});

// ---- ROTA DE FALLBACK PARA SPA ----
// Deve vir depois das rotas de API/Socket.IO e do express.static
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io/')) { // Não interferir com Socket.IO
        return next();
    }
    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      // Se o index.html não existir no build (ex: build não foi feito), envie um erro ou mensagem
      res.status(404).send('Frontend não encontrado. Execute o build do projeto (npm run build).');
    }
});
// ---- FIM: ROTA DE FALLBACK PARA SPA ----


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor Express com Socket.IO rodando na porta ${PORT}`);
    console.log(`Frontend deve estar acessível em http://localhost:${PORT}`);
    console.log("Servidor pronto. O frontend deve solicitar 'initialize-connection' para iniciar o WhatsApp.");
    // Não iniciaremos o Baileys automaticamente. Esperaremos o comando do frontend.
    // Isso dá mais controle e evita múltiplas instâncias se o servidor reiniciar rapidamente.
});

process.on('SIGINT', async () => {
    console.log('Recebido SIGINT. Desconectando Baileys e fechando servidor...');
    if (sock) {
        // O Baileys pode precisar de um tempo para fechar a conexão de forma limpa.
        // await sock.end(new Error('Servidor desligando via SIGINT')); // O logout é mais apropriado
        await sock.logout(); // Tenta deslogar antes de fechar
    }
    io.close(() => {
        console.log('Servidor Socket.IO fechado.');
    });
    server.close(() => {
        console.log('Servidor HTTP fechado.');
        process.exit(0);
    });
});