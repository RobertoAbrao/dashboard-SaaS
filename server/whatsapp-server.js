// server/whatsapp-server.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const axios = require('axios');
const fs = require('node:fs');
const path = require('node:path');
const cors = require('cors'); // Garantir que cors está importado

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Variáveis globais
let qrCodeBase64 = null; // Para a rota /qrcode (HTML) e /api/whatsapp/events (React)
let isConnected = false; // Status simplificado para a rota /qrcode
let clientStatus = 'offline'; // Status detalhado para /api/whatsapp/events (React)
let clientsSSE = []; // Array para TODOS os clientes SSE (tanto de /qrcode quanto /api/whatsapp/events)

let currentSessionId = 'default';

// --- Configuração para Controle de Atendimento com Arquivos JSON ---
const ATENDIMENTO_HUMANO_DIR = path.join(__dirname, 'chats_em_atendimento_humano');
const FRASE_INTERVENCAO_HUMANA = "Olá, tudo bem? Vou dar continuidade no seu atendimento";
const COMANDO_REATIVAR_BOT = "/bot reativar";

function garantirDiretorioAtendimentoHumano() {
  if (!fs.existsSync(ATENDIMENTO_HUMANO_DIR)) {
    fs.mkdirSync(ATENDIMENTO_HUMANO_DIR, { recursive: true });
    console.log(`📁 Diretório para controle de atendimento criado em: ${ATENDIMENTO_HUMANO_DIR}`);
  }
}
garantirDiretorioAtendimentoHumano();

function getCaminhoArquivoControleChat(chatId) {
  const nomeArquivoSanitizado = chatId.replace(/[^a-zA-Z0-9.-_]/g, '_') + '.json';
  return path.join(ATENDIMENTO_HUMANO_DIR, nomeArquivoSanitizado);
}

async function isChatEmAtendimentoHumano(chatId) {
  const caminhoArquivo = getCaminhoArquivoControleChat(chatId);
  try {
    await fs.promises.access(caminhoArquivo);
    return true;
  } catch (error) {
    return false;
  }
}

async function marcarAtendimentoHumano(chatId) {
  const caminhoArquivo = getCaminhoArquivoControleChat(chatId);
  try {
    const conteudoArquivo = JSON.stringify({ status: 'em_atendimento_humano', desde: new Date().toISOString() });
    await fs.promises.writeFile(caminhoArquivo, conteudoArquivo, 'utf-8');
    console.log(`🧑‍💻 Chat ${chatId} marcado para atendimento humano.`);
  } catch (error) {
    console.error(`❌ Erro ao marcar atendimento humano para ${chatId}:`, error);
  }
}

async function desmarcarAtendimentoHumano(chatId) {
  const caminhoArquivo = getCaminhoArquivoControleChat(chatId);
  try {
    await fs.promises.unlink(caminhoArquivo);
    console.log(`🤖 Chat ${chatId} desmarcado do atendimento humano. Bot pode reassumir.`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`❌ Erro ao desmarcar atendimento humano para ${chatId}:`, error);
    } else {
      console.log(`🤖 Chat ${chatId} já estava desmarcado.`);
    }
  }
}
// --- Fim da Configuração para Controle de Atendimento ---

const getPuppeteerConfig = () => ({
  headless: false, // <<< IMPORTANTE: MUDADO PARA FALSE PARA VER O NAVEGADOR
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // <<< AJUSTE ESTE CAMINHO SE NECESSÁRIO!
                                                                              // Verifique também 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
                                                                              // ou 'C:\\Users\\<SeuUsuario>\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
  dumpio: true, // <<< IMPORTANTE: Para mais logs do navegador no console Node.js
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu', // Tente manter, mas pode ser removido se suspeitar de problemas de GPU
    '--window-size=1280,800', // Define um tamanho de janela para visualização
    '--disable-extensions', // Desabilita extensões que poderiam interferir
    // '--disable-blink-features=AutomationControlled', // Linha de teste, pode ajudar
    // '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36' // Linha de teste
  ],
  // defaultViewport: null, // Permite que o navegador use o tamanho da janela
  timeout: 180000, // Aumentado para 3 minutos para dar mais tempo
  ignoreHTTPSErrors: true,
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false
});

let whatsappClient = null; // Declarar aqui, inicializar depois
let retryCount = 0;
const MAX_RETRIES = 3;
let isShuttingDown = false;


function createAndInitializeClient(sessionId) {
  console.log('📦 Usando sessão:', sessionId);

  if (whatsappClient) {
      console.log('Tentando destruir cliente existente antes de criar um novo...');
      whatsappClient.destroy().catch(e => console.warn("Erro ao destruir cliente antigo na recriação:", e.message));
      whatsappClient = null;
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: './auth_data'
    }),
    puppeteer: getPuppeteerConfig(),
    qrTimeout: 60000, // 60 segundos
  });

  client.on('qr', async (qr) => {
    console.log('🔄 Novo QR Code gerado!');
    try {
        qrCodeBase64 = await qrcode.toDataURL(qr);
        clientStatus = 'qr_ready';
        isConnected = false; // Ainda não totalmente conectado
        notifyClientsSSE();
    } catch (error) {
        console.error("❌ Erro ao converter QR para DataURL:", error);
        qrCodeBase64 = null;
        clientStatus = 'auth_failure'; // Ou um status de erro de QR
        notifyClientsSSE();
    }
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp conectado!');
    isConnected = true;
    qrCodeBase64 = null;
    clientStatus = 'online';
    retryCount = 0; // Resetar retentativas no sucesso
    notifyClientsSSE();
  });

  client.on('authenticated', () => {
    console.log('🔒 WhatsApp client authenticated');
    isConnected = true; // Considerar autenticado como conectado para alguns propósitos
    qrCodeBase64 = null;
    clientStatus = 'authenticated';
    notifyClientsSSE();
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    isConnected = false;
    qrCodeBase64 = null;
    clientStatus = 'auth_failed';
    notifyClientsSSE();
    // Não tentar recriar o cliente aqui, deixar a lógica de restart/disconnect tratar
  });

  client.on('disconnected', async (reason) => {
    console.log(`❌ Bot desconectado: ${reason}`);
    const previousStatus = clientStatus;
    isConnected = false;
    qrCodeBase64 = null;
    clientStatus = 'offline';
    notifyClientsSSE();

    if (isShuttingDown) return;

    if (reason === 'LOGOUT' || reason === 'NAVIGATION' || reason === 'Max qrcode retries reached') {
      console.log(`Sessão invalidada (${reason}). Limpando e reiniciando com sessão 'default'.`);
      const previousSessionId = client.options.authStrategy.clientId || 'default';
      
      // Destruir cliente atual antes de limpar a sessão
      if (client) { // Verificar se client não é null
        try {
          await client.destroy();
        } catch (e) {
          console.warn(`Erro ao destruir cliente (${previousSessionId}) após disconnect:`, e.message);
        }
      }
      whatsappClient = null; // Garantir que a referência global seja limpa

      const sessionDir = path.join(__dirname, 'auth_data');
      const sessionFileOrFolderPath = path.join(sessionDir, `session-${previousSessionId}`);
      
      fs.rm(sessionFileOrFolderPath, { recursive: true, force: true }, (err) => {
        if (err) console.error(`Erro ao remover sessão antiga (${previousSessionId}):`, err.message);
        else console.log(`🧹 Sessão antiga (${previousSessionId}) removida com sucesso.`);
        
        currentSessionId = 'default';
        retryCount = 0;
        console.log(`Reinicializando com sessão '${currentSessionId}'...`);
        whatsappClient = createAndInitializeClient(currentSessionId); // Atribuir à variável global
      });
    } else if (previousStatus !== 'offline' && previousStatus !== 'qr_ready' && retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`Tentando reconectar (${retryCount}/${MAX_RETRIES})...`);
      setTimeout(() => {
        if (!isShuttingDown && client) { // Verificar client novamente
          client.initialize().catch(err => {
            console.error("Erro na tentativa de reinicialização pós-disconnect:", err);
            // Pode chamar createAndInitializeClient aqui se a reinicialização falhar completamente
          });
        }
      }, 5000 + Math.random() * 2000);
    } else if (retryCount >= MAX_RETRIES) {
        console.log("Máximo de retentativas de reconexão atingido.");
    }
  });
  
  client.on('message', async (msg) => {
    // Sua lógica de tratamento de mensagens (atendimento humano, n8n)
    const chatIdOrigem = msg.from;
    const chatIdDestino = msg.to;
    const chatIdEfetivo = msg.fromMe ? chatIdDestino : chatIdOrigem;

    if (msg.fromMe) {
      const mensagemHumano = msg.body.trim().toLowerCase();
      if (mensagemHumano === FRASE_INTERVENCAO_HUMANA.trim().toLowerCase()) {
        if (!(await isChatEmAtendimentoHumano(chatIdEfetivo))) {
          await marcarAtendimentoHumano(chatIdEfetivo);
        } else {
          console.log(`🧑‍💻 Chat ${chatIdEfetivo} já está em atendimento humano.`);
        }
        return;
      } else if (mensagemHumano === COMANDO_REATIVAR_BOT.toLowerCase()) {
        await desmarcarAtendimentoHumano(chatIdEfetivo);
        return;
      }
      return;
    }

    const emAtendimentoHumano = await isChatEmAtendimentoHumano(chatIdEfetivo);
    if (emAtendimentoHumano) {
      console.log(`🗣️ Chat ${chatIdEfetivo} em atendimento humano. Mensagem do usuário ignorada pelo bot.`);
      return;
    }

    // try {
    //   const payload = { /* ... seu payload para o n8n ... */ };
    //   // await axios.post('http://127.0.0.1:5678/webhook/whatsapp', payload);
    //   // console.log(`📩 Mensagem de ${chatIdEfetivo} enviada ao n8n`);
    // } catch (err) {
    //   console.error('❌ Erro ao enviar mensagem ao n8n:', err.message);
    // }
  });

  console.log(`Tentando inicializar cliente para sessão: ${sessionId}`);
  client.initialize().catch(err => {
    console.error(`Falha crítica na inicialização do cliente (${sessionId}):`, err);
    clientStatus = 'auth_failure';
    isConnected = false;
    qrCodeBase64 = null;
    notifyClientsSSE();
    // Considerar retentativa aqui também, ou deixar o 'disconnected' tratar
    if (!isShuttingDown && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`Retentativa de inicialização após falha crítica (${retryCount}/${MAX_RETRIES})`);
        setTimeout(() => {
            whatsappClient = createAndInitializeClient(sessionId); // Atribuir à variável global
        }, 10000);
    }
  });

  return client;
}

// Inicializa o cliente global
whatsappClient = createAndInitializeClient(currentSessionId);


// Rota /qrcode (para HTML servido pelo Express)
app.get('/qrcode', (req, res) => {
  res.send(`
    <html>
      <body style="display:flex;flex-direction:column;align-items:center;padding:30px;font-family:sans-serif;text-align:center;">
        <h2 id="status">Carregando status...</h2>
        <h3 id="tituloQR" style="display:none;">Escaneie o QR Code para conectar</h3>
        <img id="qrImage" style="max-width:400px; display:none; margin:20px 0;" />
        <p id="mensagemQR">Aguardando QR Code...</p>
        <script>
          const statusEl = document.getElementById('status');
          const qrImg = document.getElementById('qrImage');
          const msgQR = document.getElementById('mensagemQR');
          const tituloQR = document.getElementById('tituloQR');

          const evtSource = new EventSource('/events'); // Consome a rota SSE /events
          evtSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            console.log("SSE data received in browser (/qrcode page):", data);

            if (data.status === 'online' || data.status === 'authenticated') {
              statusEl.innerHTML = '🟢 Bot Online';
              qrImg.src = ''; // Limpar src
              qrImg.style.display = 'none';
              tituloQR.style.display = 'none';
              msgQR.innerHTML = '✅ Bot ativo!';
            } else if (data.status === 'qr_ready' && data.qr) {
              statusEl.innerHTML = '📱 Escaneie o QR Code';
              qrImg.src = data.qr;
              qrImg.style.display = 'block';
              tituloQR.style.display = 'block';
              msgQR.style.display = 'none';
            } else {
              statusEl.innerHTML = data.status === 'initializing' ? '⚪ Inicializando...' : 
                                   data.status === 'auth_failure' ? '⚠️ Falha na Autenticação' : 
                                   '🔴 Bot Offline';
              qrImg.src = ''; // Limpar src
              qrImg.style.display = 'none';
              tituloQR.style.display = 'none';
              msgQR.innerHTML = data.status === 'initializing' ? 'Inicializando, aguarde...' : 
                                 data.status === 'auth_failure' ? 'Falha. Tente recarregar ou aguarde um novo QR.' :
                                 'QR Code ainda não está disponível. Aguarde...';
            }
          };
          evtSource.onerror = function(err) {
            console.error("EventSource for /qrcode failed:", err);
            statusEl.innerHTML = '⚠️ Erro de conexão SSE.';
            qrImg.style.display = 'none';
            tituloQR.style.display = 'none';
            msgQR.innerHTML = 'Não foi possível conectar ao servidor de eventos.';
          };
        </script>
      </body>
    </html>
  `);
});

// Rota /events SSE (para a página HTML /qrcode)
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clientsSSE.push(res); // Adiciona à lista de clientes SSE (Array)
  console.log('Novo cliente SSE conectado à rota /events. Total:', clientsSSE.length);

  // Envia o estado atual imediatamente
  const payload = JSON.stringify({ status: clientStatus, qr: qrCodeBase64 });
  res.write(`data: ${payload}\n\n`);

  req.on('close', () => {
    clientsSSE = clientsSSE.filter(c => c !== res); // Remove da lista
    console.log('Cliente SSE da rota /events desconectado. Total:', clientsSSE.length);
  });
});

// Rota /api/whatsapp/events SSE (para o frontend React)
app.get('/api/whatsapp/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  clientsSSE.push(res); // Adiciona à MESMA lista de clientes SSE (Array)
  console.log(`Novo cliente SSE React conectado (/api/whatsapp/events). Total clientsSSE: ${clientsSSE.length}`);

  const currentData = {
    status: clientStatus,     // O frontend React espera 'status'
    qrCode: qrCodeBase64,    // O frontend React espera 'qrCode'
    timestamp: new Date().toISOString(),
  };
  res.write(`data: ${JSON.stringify(currentData)}\n\n`);

  req.on('close', () => {
    clientsSSE = clientsSSE.filter(c => c !== res); // Remove da lista
    console.log(`Cliente SSE React desconectado (/api/whatsapp/events). Total clientsSSE: ${clientsSSE.length}`);
  });
});

// Função unificada para notificar TODOS os clientes SSE
function notifyClientsSSE() {
  const payloadForEventsRoute = JSON.stringify({ status: clientStatus, qr: qrCodeBase64 });
  const payloadForApiEventsRoute = JSON.stringify({
    status: clientStatus,
    qrCode: qrCodeBase64,
    timestamp: new Date().toISOString()
  });

  // console.log("Notificando clientes SSE:", { status: clientStatus, qrDefined: !!qrCodeBase64 });

  // Iterar de trás para frente permite remover elementos da lista durante a iteração de forma segura
  for (let i = clientsSSE.length - 1; i >= 0; i--) {
    const clientRes = clientsSSE[i];
    try {
      // Identificar a rota pela qual o cliente se conectou pode ser complexo aqui
      // Uma solução mais simples é enviar um payload que sirva para ambos,
      // ou o frontend do React pode ignorar o campo 'qr' se 'qrCode' estiver presente.
      // Por ora, vamos enviar o payload mais completo para o React e o mais simples para /events
      if (clientRes.req && clientRes.req.url === '/api/whatsapp/events') {
        clientRes.write(`data: ${payloadForApiEventsRoute}\n\n`);
      } else if (clientRes.req && clientRes.req.url === '/events') {
        clientRes.write(`data: ${payloadForEventsRoute}\n\n`);
      } else {
        // Fallback se não conseguirmos identificar a rota (pode acontecer se 'res' for adicionado diretamente sem 'req')
        // Ou, se você armazenar objetos {id, res, type} em clientsSSE, pode usar o 'type'
        clientRes.write(`data: ${payloadForApiEventsRoute}\n\n`); // Enviar o mais completo como fallback
      }
    } catch (error) {
      console.warn('Error sending SSE data to a client, removing client:', error.message);
      clientsSSE.splice(i, 1); // Remove o cliente que falhou
    }
  }
}


// Rota /api/whatsapp/status (para o frontend React)
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: clientStatus,
    qrCode: qrCodeBase64,
    timestamp: new Date().toISOString(),
  });
});

// Rota /api/whatsapp/restart (para o frontend React)
app.post('/api/whatsapp/restart', async (req, res) => {
  console.log('Manual restart requested via API...');
  retryCount = 0; 
  
  const currentAuthId = whatsappClient?.options?.authStrategy?.clientId || 'default';

  if (whatsappClient) {
    console.log(`Destruindo cliente existente (sessão: ${currentAuthId}) para restart...`);
    try {
      await whatsappClient.destroy();
    } catch (error) {
      console.warn(`Erro ao destruir cliente (${currentAuthId}) para restart:`, error.message);
    }
    whatsappClient = null;
  }
  
  // Limpar a pasta de sessão específica
  const sessionPath = path.join(__dirname, 'auth_data', `session-${currentAuthId}`);
  console.log(`Tentando remover pasta de sessão para restart: ${sessionPath}`);
  fs.rm(sessionPath, { recursive: true, force: true }, (err) => {
    if (err) console.error(`Erro ao remover sessão (${currentAuthId}) para restart:`, err.message);
    else console.log(`🧹 Sessão (${currentAuthId}) removida para restart.`);
    
    currentSessionId = 'default'; // Sempre voltar para 'default' no restart manual para forçar novo QR
    console.log(`Reinicializando cliente com sessão '${currentSessionId}' após restart manual...`);
    qrCodeBase64 = null; // Limpar QR
    clientStatus = 'initializing';
    notifyClientsSSE(); // Notificar imediatamente que está reiniciando
    whatsappClient = createAndInitializeClient(currentSessionId); // Criar e inicializar novo cliente
  });

  res.json({ message: 'Client restarting...' });
});

// Rota para enviar mensagens (do seu index.js, adaptada)
app.post('/api/whatsapp/send-message', async (req, res) => { // Mudado para /api/whatsapp/send-message
  const { number, message } = req.body; // frontend React envia 'number'
  if (!number || !message) return res.status(400).json({ error: 'Faltando dados: "number" e "message" são obrigatórios.'});
  
  if (!whatsappClient || clientStatus !== 'online') {
    return res.status(400).json({ error: 'Cliente WhatsApp não está pronto ou online.' });
  }
  try {
    // O frontend envia o número sem @c.us, então precisamos adicionar
    const chatId = number.includes('@c.us') ? number : `${number.replace(/\D/g, '')}@c.us`;
    await whatsappClient.sendMessage(chatId, message);
    res.json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem via /api/whatsapp/send-message:', err.message);
    res.status(500).json({ error: '❌ Erro ao enviar mensagem' });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Graceful shutdown...`);
  isShuttingDown = true;
  
  clientsSSE.forEach(clientRes => {
      try { clientRes.end(); } catch(e) { /* ignore */ }
  });
  clientsSSE = [];

  if (whatsappClient) {
    try {
      console.log('Destroying WhatsApp client during shutdown...');
      await whatsappClient.destroy();
      console.log('WhatsApp client destroyed during shutdown.');
    } catch (error) {
      console.warn('Error destroying client during shutdown:', error.message);
    }
  }
  
  console.log('Exiting process...');
  setTimeout(() => process.exit(0), 500); 
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

process.on('uncaughtException', (error) => {
  console.error('CRITICAL: Uncaught Exception:', error);
  // Aqui, pode ser uma boa ideia tentar um graceful shutdown também,
  // ou pelo menos logar e sair para evitar comportamento indefinido.
  if (!isShuttingDown) {
    gracefulShutdown('uncaughtException').then(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
  if (!isShuttingDown) {
    gracefulShutdown('unhandledRejection').then(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando. Acesse http://localhost:${PORT}/qrcode para o QR Code (HTML).`);
  console.log(`🔌 Frontend React deve conectar via SSE em http://localhost:${PORT}/api/whatsapp/events`);

  const authDataPath = path.join(__dirname, 'auth_data');
  if (!fs.existsSync(authDataPath)) {
    fs.mkdirSync(authDataPath, { recursive: true });
    console.log(`📁 Diretório para dados de autenticação criado em: ${authDataPath}`);
  }
});