
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let whatsappClient = null;
let currentQR = null;
let clientStatus = 'offline';
let clients = new Set(); // Para SSE connections
let initializationTimeout = null;
let retryCount = 0;
const MAX_RETRIES = 3;
let isShuttingDown = false;

// Enhanced Puppeteer configuration for better stability
const getPuppeteerConfig = () => ({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-images',
    '--disable-javascript',
    '--disable-default-apps',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-field-trial-config',
    '--disable-back-forward-cache',
    '--disable-ipc-flooding-protection'
  ],
  timeout: 120000, // Increased timeout
  ignoreHTTPSErrors: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false
});

// Initialize WhatsApp client with enhanced error handling and retry logic
const initializeClient = async (isRetry = false) => {
  if (isShuttingDown) {
    console.log('Shutdown in progress, skipping initialization');
    return;
  }

  try {
    // Cleanup previous client
    if (whatsappClient) {
      try {
        await whatsappClient.destroy();
      } catch (error) {
        console.log('Error destroying previous client:', error.message);
      }
      whatsappClient = null;
    }

    if (initializationTimeout) {
      clearTimeout(initializationTimeout);
    }

    clientStatus = 'initializing';
    broadcastUpdate();
    
    console.log(`Initializing WhatsApp client (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);

    whatsappClient = new Client({
      authStrategy: new LocalAuth({
        dataPath: './session'
      }),
      puppeteer: getPuppeteerConfig()
    });

    // Set timeout for initialization
    initializationTimeout = setTimeout(async () => {
      console.log('Client initialization timeout');
      clientStatus = 'timeout';
      currentQR = null;
      broadcastUpdate();
      
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`Retrying initialization (${retryCount}/${MAX_RETRIES})...`);
        setTimeout(() => initializeClient(true), 5000);
      } else {
        console.log('Max retries reached. Client initialization failed.');
        clientStatus = 'auth_failed';
        broadcastUpdate();
      }
    }, 90000); // 90 seconds timeout

    whatsappClient.on('qr', async (qr) => {
      console.log('QR Code received');
      clearTimeout(initializationTimeout);
      retryCount = 0; // Reset retry count on successful QR generation
      
      try {
        currentQR = await QRCode.toDataURL(qr);
        clientStatus = 'qr_ready';
        broadcastUpdate();
        
        // Set QR expiration timeout
        setTimeout(() => {
          if (clientStatus === 'qr_ready') {
            console.log('QR Code expired, restarting...');
            initializeClient(true);
          }
        }, 45000); // QR codes expire after ~45 seconds
        
      } catch (error) {
        console.error('Error generating QR code:', error);
        clientStatus = 'auth_failed';
        currentQR = null;
        broadcastUpdate();
      }
    });

    whatsappClient.on('ready', () => {
      console.log('WhatsApp client is ready!');
      clearTimeout(initializationTimeout);
      currentQR = null;
      clientStatus = 'online';
      retryCount = 0;
      broadcastUpdate();
    });

    whatsappClient.on('authenticated', () => {
      console.log('WhatsApp client authenticated');
      clearTimeout(initializationTimeout);
      clientStatus = 'authenticated';
      broadcastUpdate();
    });

    whatsappClient.on('auth_failure', (msg) => {
      console.error('Authentication failed:', msg);
      clearTimeout(initializationTimeout);
      currentQR = null;
      clientStatus = 'auth_failed';
      broadcastUpdate();
      
      // Retry after auth failure
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        setTimeout(() => initializeClient(true), 10000);
      }
    });

    whatsappClient.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected:', reason);
      clearTimeout(initializationTimeout);
      currentQR = null;
      clientStatus = 'offline';
      broadcastUpdate();
      
      // Auto-reconnect unless shutting down
      if (!isShuttingDown && retryCount < MAX_RETRIES) {
        retryCount++;
        setTimeout(() => initializeClient(true), 5000);
      }
    });

    // Handle browser crashes
    whatsappClient.pupPage?.on('error', (error) => {
      console.error('Puppeteer page error:', error);
      if (!isShuttingDown) {
        setTimeout(() => initializeClient(true), 3000);
      }
    });

    await whatsappClient.initialize();

  } catch (error) {
    console.error('Error creating WhatsApp client:', error);
    clearTimeout(initializationTimeout);
    clientStatus = 'auth_failed';
    currentQR = null;
    broadcastUpdate();
    
    // Retry on initialization failure
    if (!isShuttingDown && retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(() => initializeClient(true), 5000);
    }
  }
};

// Broadcast updates to all SSE clients
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
      console.error('Error sending SSE data:', error);
      clients.delete(client);
    }
  });
};

// SSE endpoint for real-time updates
app.get('/api/whatsapp/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  clients.add(res);

  // Send current status immediately
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

// Get current status
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: clientStatus,
    qrCode: currentQR,
    timestamp: new Date().toISOString(),
    retryCount: retryCount
  });
});

// Restart client (generate new QR)
app.post('/api/whatsapp/restart', async (req, res) => {
  try {
    console.log('Manual restart requested...');
    retryCount = 0; // Reset retry count on manual restart
    
    if (initializationTimeout) {
      clearTimeout(initializationTimeout);
    }
    
    if (whatsappClient) {
      try {
        await whatsappClient.destroy();
      } catch (error) {
        console.log('Error destroying previous client:', error.message);
      }
    }
    
    currentQR = null;
    clientStatus = 'initializing';
    broadcastUpdate();
    
    // Wait a bit before reinitializing
    setTimeout(() => {
      initializeClient(false);
    }, 2000);

    res.json({ message: 'Client restarting...' });
  } catch (error) {
    console.error('Error restarting client:', error);
    clientStatus = 'auth_failed';
    currentQR = null;
    broadcastUpdate();
    res.status(500).json({ error: 'Failed to restart client' });
  }
});

// Send message endpoint
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!whatsappClient || clientStatus !== 'online') {
      return res.status(400).json({ error: 'WhatsApp client not ready' });
    }

    const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
    await whatsappClient.sendMessage(chatId, message);

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    clientStatus: clientStatus,
    timestamp: new Date().toISOString(),
    retryCount: retryCount
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Graceful shutdown...`);
  isShuttingDown = true;
  
  if (initializationTimeout) {
    clearTimeout(initializationTimeout);
  }
  
  if (whatsappClient) {
    try {
      console.log('Destroying WhatsApp client...');
      await whatsappClient.destroy();
    } catch (error) {
      console.log('Error during shutdown:', error.message);
    }
  }
  
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (!isShuttingDown) {
    setTimeout(() => {
      if (whatsappClient) {
        initializeClient(true);
      }
    }, 3000);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (!isShuttingDown) {
    setTimeout(() => {
      if (whatsappClient) {
        initializeClient(true);
      }
    }, 3000);
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp server running on port ${PORT}`);
  console.log('Initializing WhatsApp client...');
  
  // Add delay before initialization to ensure server is ready
  setTimeout(() => {
    initializeClient(false);
  }, 2000);
});
