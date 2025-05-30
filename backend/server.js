const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); // Adicionado MessageMedia se precisar enviar mídias no futuro
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: "http://localhost:8080", // Permite requisições do seu frontend Vite
  methods: ["GET", "POST"]
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:8080", // URL do seu frontend Vite
    methods: ["GET", "POST"]
  }
});

let client;
let currentQR = null;
let botReady = false;
let statusMessage = "Initializing...";

function initializeWhatsAppClient() {
  console.log('Initializing WhatsApp client...');
  statusMessage = "Initializing client...";
  io.emit('status_update', { status: 'offline', message: statusMessage });

  client = new Client({
    authStrategy: new LocalAuth({ clientId: "whatsapp-saas-dashboard" }),
    puppeteer: {
      headless: true, // Mude para false para depuração visual, se necessário
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        // '--single-process', // Descomente apenas se tiver problemas com múltiplos processos do Chromium em ambientes restritos
        '--disable-gpu' // Pode ajudar em alguns ambientes sem GPU física ou com drivers problemáticos
      ],
    },
     webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html', // Exemplo de uma versão específica
    }
  });

  client.on('qr', (qr) => {
    console.log('QR RECEIVED');
    statusMessage = 'QR Code received. Please scan with your WhatsApp.';
    qrcode.toDataURL(qr, (err, url) => {
      if (err) {
        console.error('Error generating QR code data URL:', err);
        currentQR = null;
        statusMessage = 'Error generating QR code.';
        io.emit('qr_code', null);
        io.emit('status_update', { status: 'offline', message: statusMessage });
        return;
      }
      currentQR = url;
      botReady = false;
      io.emit('qr_code', url);
      io.emit('status_update', { status: 'offline', message: statusMessage });
    });
  });

  client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    botReady = true;
    currentQR = null;
    statusMessage = 'WhatsApp client is connected and ready.';
    io.emit('status_update', { status: 'online', message: statusMessage });
    io.emit('qr_code', null);
  });

  client.on('authenticated', () => {
    console.log('WhatsApp client is authenticated!');
    statusMessage = 'Client authenticated. Waiting for readiness...';
    // Não emita 'online' aqui, pois 'ready' é o evento definitivo.
    io.emit('status_update', { status: 'authenticating', message: statusMessage });
  });

  client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE:', msg);
    botReady = false;
    currentQR = null;
    statusMessage = `Authentication failure: ${msg}. Please try again.`;
    io.emit('status_update', { status: 'offline', message: statusMessage });
    // Considerar destruir e reinicializar o cliente aqui, ou notificar para ação manual.
    // client.destroy();
    // setTimeout(initializeWhatsAppClient, 10000); // Tenta novamente após 10s
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp client was logged out:', reason);
    botReady = false;
    currentQR = null;
    statusMessage = 'Client disconnected. Attempting to reconnect...';
    io.emit('status_update', { status: 'offline', message: statusMessage });
    if (client) {
        client.destroy().catch(err => console.error('Error destroying client on disconnect:', err));
    }
    setTimeout(initializeWhatsAppClient, 15000); // Tenta reinicializar após 15 segundos
  });

  client.on('loading_screen', (percent, message) => {
      console.log('LOADING SCREEN', percent, message);
      statusMessage = `Loading: ${message} (${percent}%)`;
      io.emit('status_update', { status: 'loading', message: statusMessage, percent: percent });
  });

  client.initialize().catch(err => {
    console.error("Failed to initialize WhatsApp client:", err);
    statusMessage = `Failed to initialize client: ${err.message}. Retrying...`;
    io.emit('status_update', { status: 'offline', message: statusMessage });
    if (client) {
        client.destroy().catch(destroyErr => console.error('Error destroying client on init fail:', destroyErr));
    }
    setTimeout(initializeWhatsAppClient, 15000); // Tenta reinicializar após 15 segundos
  });
}

initializeWhatsAppClient(); // Chama a função para iniciar o cliente

// Endpoint para verificar o status do bot
app.get('/api/status', (req, res) => {
  res.json({
    status: botReady ? 'online' : (currentQR ? 'pending_qr' : 'offline'),
    qr: currentQR,
    message: statusMessage
  });
});

// Endpoint para enviar mensagens
app.post('/api/send-message', async (req, res) => {
  if (!botReady) {
    return res.status(400).json({ success: false, message: 'WhatsApp client is not ready.' });
  }
  const { number, message } = req.body;
  if (!number || !message) {
    return res.status(400).json({ success: false, message: 'Phone number and message are required.' });
  }

  const sanitizedNumber = String(number).replace(/\D/g, '');
  if (!sanitizedNumber) {
    return res.status(400).json({ success: false, message: 'Invalid phone number format.' });
  }
  
  const chatId = `${sanitizedNumber}@c.us`;

  try {
    await client.sendMessage(chatId, message);
    console.log(`Message sent to ${chatId}`);
    res.json({ success: true, message: 'Message sent successfully.' });
  } catch (error) {
    console.error(`Error sending message to ${chatId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to send message.', errorDetails: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('Frontend client connected via Socket.IO');

  // Envia o estado atual assim que o frontend se conectar
  socket.emit('qr_code', currentQR);
  socket.emit('status_update', {
    status: botReady ? 'online' : (currentQR ? 'pending_qr' : 'offline'),
    message: statusMessage
  });

  socket.on('disconnect', () => {
    console.log('Frontend client disconnected from Socket.IO');
  });
});

const PORT = process.env.BACKEND_PORT || 3001;
server.listen(PORT, () => {
  console.log(`WhatsApp Bot SAAS Backend rodando na porta ${PORT}`);
  console.log(`Frontend (Vite) deve estar rodando em http://localhost:8080`);
});