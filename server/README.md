
# WhatsApp Bot Server

Backend server para o WhatsApp Bot SAAS usando Baileys.

## Instalação

1. Navegue até a pasta do servidor:
```bash
cd server
```

2. Instale as dependências:
```bash
npm install
```

## Execução

### Modo de desenvolvimento:
```bash
npm run dev
```

### Modo de produção:
```bash
npm start
```

O servidor será executado na porta 3001.

## Endpoints

- `GET /api/whatsapp/events` - SSE para atualizações em tempo real
- `GET /api/whatsapp/status` - Status atual da conexão
- `POST /api/whatsapp/restart` - Reiniciar cliente e gerar novo QR
- `POST /api/whatsapp/send-message` - Enviar mensagem
- `GET /api/health` - Health check

## Funcionamento

1. O servidor inicializa automaticamente o cliente WhatsApp com Baileys
2. Gera QR Code quando necessário
3. Envia atualizações em tempo real via SSE
4. Mantém sessão autenticada usando multi-file auth

## Vantagens do Baileys

- Mais estável e eficiente que whatsapp-web.js
- Não depende de Puppeteer/Chrome
- Suporte nativo para multi-device
- Melhor performance e menor uso de recursos
- Reconexão automática mais robusta

## Requisitos

- Node.js 16+
- Conexão estável com internet
