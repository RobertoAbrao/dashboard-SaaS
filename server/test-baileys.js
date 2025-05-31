// server/test-baileys.js
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');

async function runTest() {
    console.log('--- INICIANDO TESTE MÍNIMO DO BAILEYS ---');
    console.log(`Versão do Node.js: ${process.version}`);

    try {
        // Teste explícito do módulo crypto
        console.log('Testando importação do módulo crypto nativo...');
        const cryptoNode = require('crypto');
        if (cryptoNode && typeof cryptoNode.createHash === 'function') {
            console.log('Módulo crypto do Node.js carregado com sucesso e createHash está disponível.');
            const hash = cryptoNode.createHash('sha256').update('test-crypto').digest('hex');
            console.log('Hash de teste Crypto (SHA256 de "test-crypto"):', hash);
        } else {
            console.error('ERRO CRÍTICO: Módulo crypto do Node.js NÃO está funcionando como esperado neste script!');
            return;
        }

        const AUTH_TEST_FOLDER_PATH = path.join(__dirname, 'baileys_auth_test_minimal');
        console.log(`Usando pasta de autenticação para teste: ${AUTH_TEST_FOLDER_PATH}`);

        if (fs.existsSync(AUTH_TEST_FOLDER_PATH)) {
            fs.rmSync(AUTH_TEST_FOLDER_PATH, { recursive: true, force: true });
            console.log('Pasta de autenticação de teste anterior limpa.');
        }
        fs.mkdirSync(AUTH_TEST_FOLDER_PATH, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_TEST_FOLDER_PATH);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Usando WhatsApp Web v${version.join('.')} no teste, é a mais recente: ${isLatest}`);

        console.log('Tentando chamar makeWASocket com configuração mínima...');
        const sockTest = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true, // Imprimir QR diretamente no terminal para este teste
            // Omitindo logger e browser para máxima simplicidade
        });

        sockTest.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;
            console.log('[Teste Mínimo] Evento connection.update:', update);
            if (qr) {
                console.log('--- [Teste Mínimo] QR Code Recebido ---');
                // O QR já foi impresso pelo printQRInTerminal: true
            }
            if (connection === 'open') {
                console.log('--- [Teste Mínimo] Conexão Aberta! Teste bem-sucedido. Deslogando... ---');
                setTimeout(() => sockTest.logout(), 3000); // Desconecta após 3s para finalizar
            } else if (connection === 'close') {
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || 'Desconhecido';
                console.log(`--- [Teste Mínimo] Conexão Fechada. Razão: ${reason} ---`);
            }
        });

        sockTest.ev.on('creds.update', saveCreds);

        console.log('makeWASocket chamado no teste, aguardando eventos...');

    } catch (error) {
        console.error('--- ERRO NO TESTE MÍNIMO DO BAILEYS ---');
        console.error(error);
    }
}

runTest();