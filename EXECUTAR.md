
# Como Executar o WhatsApp Bot SAAS

## Passo a Passo Simples

### 1. Primeiro, instalar dependências do frontend:
```bash
npm install
```

### 2. Fazer build do frontend:
```bash
npm run build
```

### 3. Ir para a pasta do servidor:
```bash
cd server
```

### 4. Instalar dependências do servidor:
```bash
npm install
```

### 5. Rodar o servidor (que serve tudo):
```bash
npm start
```

### 6. Abrir no navegador:
```
http://localhost:3001
```

## Script Rápido (tudo de uma vez):
```bash
npm install && npm run build && cd server && npm install && npm start
```

## O que acontece:
1. O servidor Express roda na porta 3001
2. Ele serve o frontend React buildado
3. As APIs do WhatsApp estão no mesmo servidor
4. Não há problemas de CORS
5. O QR Code aparece automaticamente quando o bot inicializa

## Logs importantes:
- "Servidor rodando na porta 3001" - servidor iniciado
- "Inicializando cliente WhatsApp..." - bot inicializando
- "QR Code recebido" - QR gerado
- "QR Code gerado com sucesso" - QR pronto para escaneamento
- "Cliente WhatsApp pronto!" - bot conectado

Se algo der errado, pare o servidor (Ctrl+C) e rode novamente `npm start` na pasta server.
