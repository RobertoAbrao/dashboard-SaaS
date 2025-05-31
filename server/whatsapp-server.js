
const express = require('express');
const cors = require('cors');
const path = require('path');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../dist')));

let whatsappSocket = null;
let currentQR = null;
let clientStatus = 'offline';
let clients = new Set();
let retryCount = 0;
const MAX_RETRIES = 3;

// Inicializar cliente WhatsApp com Baileys
const initializeClient = async () => {
  try {
    if (whatsappSocket) {
      try {
        whatsappSocket.end();
      } catch (error) {
        console.log('Erro ao fechar socket anterior:', error.message);
      }
      whatsappSocket = null;
    }

    clientStatus = 'initializing';
    broadcastUpdate();
    
    console.log('Inicializando cliente WhatsApp com Baileys...');

    // Usar autenticação multi-arquivo
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, './baileys_auth'));

    whatsappSocket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatsApp Bot SAAS', 'Chrome', '1.0.0']
    });

    // Event handlers
    whatsappSocket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('QR Code recebido');
        try {
          currentQR = await QRCode.toDataURL(qr);
          clientStatus = 'qr_ready';
          retryCount = 0;
          broadcastUpdate();
          console.log('QR Code gerado com sucesso');
        } catch (error) {
          console.error('Erro ao gerar QR code:', error);
          clientStatus = 'auth_failed';
          currentQR = null;
          broadcastUpdate();
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Conexão fechada devido a ', lastDisconnect?.error, ', reconectando ', shouldReconnect);
        
        currentQR = null;
        
        if (shouldReconnect) {
          clientStatus = 'offline';
          broadcastUpdate();
          
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            setTimeout(() => {
              initializeClient();
            }, 3000);
          } else {
            clientStatus = 'auth_failed';
            broadcastUpdate();
          }
        } else {
          clientStatus = 'auth_failed';
          broadcastUpdate();
        }
      } else if (connection === 'open') {
        console.log('Cliente WhatsApp conectado com sucesso!');
        currentQR = null;
        clientStatus = 'online';
        retryCount = 0;
        broadcastUpdate();
      }
    });

    whatsappSocket.ev.on('creds.update', saveCreds);

  } catch (error) {
    console.error('Erro ao criar cliente WhatsApp:', error);
    clientStatus = 'auth_failed';
    currentQR = null;
    broadcastUpdate();
    
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(() => {
        initializeClient();
      }, 5000);
    }
  }
};

// Broadcast para clientes SSE
const broadcastUpdate = () => {
  const data = {
    status: clientStatus,
    qrCode: currentQR,
    timestamp: new Date().toISOString(),
    retryCount: retryCount
  };

  clients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      clients.delete(client);
    }
  });
};

// Endpoint SSE para atualizações em tempo real
app.get('/api/whatsapp/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  clients.add(res);

  // Enviar status atual imediatamente
  const currentData = {
    status: clientStatus,
    qrCode: currentQR,
    timestamp: new Date().toISOString(),
    retryCount: retryCount
  };
  res.write(`data: ${JSON.stringify(currentData)}\n\n`);

  req.on('close', () => {
    clients.delete(res);
  });
});

// Status atual
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: clientStatus,
    qrCode: currentQR,
    timestamp: new Date().toISOString(),
    retryCount: retryCount
  });
});

// Reiniciar cliente
app.post('/api/whatsapp/restart', async (req, res) => {
  try {
    console.log('Reinicialização manual solicitada...');
    retryCount = 0;
    
    currentQR = null;
    clientStatus = 'initializing';
    broadcastUpdate();
    
    setTimeout(() => {
      initializeClient();
    }, 1000);

    res.json({ message: 'Cliente reiniciando...' });
  } catch (error) {
    console.error('Erro ao reiniciar cliente:', error);
    clientStatus = 'auth_failed';
    currentQR = null;
    broadcastUpdate();
    res.status(500).json({ error: 'Falha ao reiniciar cliente' });
  }
});

// Enviar mensagem
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!whatsappSocket || clientStatus !== 'online') {
      return res.status(400).json({ error: 'Cliente WhatsApp não está pronto' });
    }

    // Formatar número para Baileys
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
    
    await whatsappSocket.sendMessage(jid, { text: message });

    res.json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Falha ao enviar mensagem' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    clientStatus: clientStatus,
    timestamp: new Date().toISOString()
  });
});

// Servir a aplicação React para todas as outras rotas
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Shutdown gracioso
const gracefulShutdown = async (signal) => {
  console.log(`Recebido ${signal}. Desligando graciosamente...`);
  
  if (whatsappSocket) {
    try {
      console.log('Fechando socket WhatsApp...');
      whatsappSocket.end();
    } catch (error) {
      console.log('Erro durante desligamento:', error.message);
    }
  }
  
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log('Inicializando cliente WhatsApp com Baileys...');
  
  // Inicializar após 2 segundos
  setTimeout(() => {
    initializeClient();
  }, 2000);
});
