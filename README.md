# WhatsApp Bot SaaS - Dashboard de Automação

Uma aplicação full-stack que fornece um dashboard para gerenciar e automatizar interações do WhatsApp, utilizando Baileys no backend e React com Vite no frontend.

## 🚀 Principais Funcionalidades

- **Conexão com WhatsApp:** Autenticação via QR Code ou código de pareamento numérico para mais estabilidade.
- **Dashboard em Tempo Real:** Visualização de status, estatísticas e atividades recentes (via Socket.IO).
- **Autenticação de Usuários:** Sistema completo de registro e login com Firebase Auth.
- **Painel Kanban:** Gerenciamento visual de tickets/conversas, com status de "Aguardando", "Em Atendimento" e "Concluído".
- **Chat Integrado:** Responda conversas diretamente pelo painel através de um modal de chat.
- **Envio de Mensagens:** Interface para envio de mensagens de texto e mídia (imagens, áudio) para qualquer contato.
- **Respostas Automáticas Configuráveis:**
  - **Modo IA (Google Gemini):** Responde usuários com base em um prompt de sistema e um arquivo de FAQ.
  - **Modo Menu (Respostas Customizadas):** Responde com base em palavras-chave exatas.
  - **Pausa do Bot:** Pausa a automação para um contato específico através de uma palavra-chave para permitir atendimento humano.
- **Suporte Multi-Sessão:** A arquitetura é projetada para gerenciar múltiplas sessões de WhatsApp, uma para cada usuário cadastrado.

## 📦 Tecnologias Utilizadas

<details>
  <summary><strong>Frontend</strong></summary>
  
  - **Framework/Lib:** React
  - **Build Tool:** Vite
  - **Linguagem:** TypeScript
  - **Estilização:** Tailwind CSS
  - **Componentes UI:** shadcn/ui (Radix UI)
  - **Comunicação Real-time:** Socket.IO Client
  - **Roteamento:** React Router
  - **Gerenciamento de Estado de Servidor:** TanStack Query
  - **Autenticação:** Firebase Auth
  - **Drag and Drop:** @hello-pangea/dnd (para o Kanban)
</details>

<details>
  <summary><strong>Backend</strong></summary>
  
  - **Ambiente:** Node.js
  - **Framework:** Express.js
  - **WhatsApp API (Não-Oficial):** Baileys (`@whiskeysockets/baileys`)
  - **Comunicação Real-time:** Socket.IO
  - **Banco de Dados (ORM):** Firebase
  - **Autenticação e Firestore:** Firebase Admin
  - **Tokens de Autenticação:** JSON Web Token (JWT)
  - **Segurança:** bcryptjs para hash de senhas
</details>

## 📂 Estrutura do Projeto

O projeto é um monorepo com duas partes principais:

- **`/` (root):** Contém a aplicação frontend feita em React/Vite.
- **`/server`:** Contém o servidor backend em Node.js/Express, responsável por toda a lógica de negócio, incluindo a conexão com o WhatsApp e a comunicação com o banco de dados.

## ⚙️ Configuração de Ambiente

Antes de executar, você precisa configurar as variáveis de ambiente e chaves de serviço.

1.  **Firebase (Backend):**
    - Renomeie o arquivo de exemplo ou crie `server/firebase-service-account-key.json`.
    - Insira as credenciais da sua conta de serviço do Firebase neste arquivo. Elas são necessárias para o backend verificar a autenticação dos usuários.
    - O arquivo está no `.gitignore` para não ser enviado ao seu repositório.

2.  **Banco de Dados (Backend):**
    - Crie um arquivo chamado `.env` na pasta `/server`.
    - Adicione a sua connection string do PostgreSQL:
      ```env
      DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
      ```

## 🚀 Como Executar o Projeto

Siga estes passos para executar a aplicação completa localmente.

### Pré-requisitos

- **Node.js:** Versão 16 ou superior.
- **Navegador Web:** Chrome, Firefox, ou similar.
- **Banco de Dados:** Uma instância do PostgreSQL rodando.

### Passo a Passo

1.  **Instalar dependências do Frontend:**
    Na pasta raiz do projeto, instale as dependências do React.
    ```bash
    npm install
    ```

2.  **Fazer o Build do Frontend:**
    Ainda na raiz, gere a versão de produção do frontend.
    ```bash
    npm run build
    ```
    Isso criará uma pasta `dist` que será servida pelo backend.

3.  **Acessar a pasta do Servidor:**
    Navegue para a pasta do backend.
    ```bash
    cd server
    ```

4.  **Instalar dependências do Servidor:**
    Instale as dependências do Node.js, como Express e Baileys.
    ```bash
    npm install
    ```

5.  **Executar as Migrations do Banco de Dados:**
    Aplique o schema do Prisma ao seu banco de dados.
    ```bash
    npx prisma migrate dev
    ```

6.  **Iniciar o Servidor:**
    Este comando inicia o servidor Express, que por sua vez serve o frontend e ativa a API do WhatsApp.
    ```bash
    npm start
    ```

7.  **Abrir no Navegador:**
    Acesse a aplicação no seu navegador. O QR Code para conexão aparecerá na tela.
    ```
    http://localhost:3001
    ```
   

---
### Script Rápido (Executa tudo de uma vez)
A partir da pasta raiz:
```bash
npm install && npm run build && cd server && npm install && npx prisma migrate dev && npm start
```


---

## 📺 Roadmap do Projeto (Visão Futura)

### Visão Geral por Fases

| Fase            | Objetivo Principal                      | Foco Técnico                             |
| --------------- | --------------------------------------- | ---------------------------------------- |
| 1. Alicerce 🗷️ | Bot funcional + Dashboard ao vivo (MVP) | Baileys, WebSocket, QR Code, UI base     |
| 2. Expansão 📈  | Dados persistentes + Estatísticas       | Redis/Firebase, Gráficos, Configs      |
| 3. Produção 🚀  | Segurança + Deploy VPS                  | Docker, Autenticação, SSL, VPS           |
| 4. SaaS ☁️      | Multiusuário + Recursos Premium         | Multi-tenant, pagamentos, escalabilidade |
| 5. Sustentar 🌱 | Manutenção e evolução contínua          | Monitoramento, Correções, Novas features |

---

## 📌 Detalhamento das Fases

### ✅ Fase 1: Alicerce

**Objetivo:** Ter um bot funcional com dashboard em tempo real.

**Tarefas:**

* 🤖 Conexão com WhatsApp (Baileys)  
* 📊 Dashboard com dados ao vivo  
* 💬 Envio de mensagens com feedback
* 📱 QR Code funcional e renovável
* ⚠️ Tratamento básico de erros

---

### 📈 Fase 2: Expansão

**Objetivo:** Armazenar dados históricos e permitir configurações.

**Tarefas:**

* 💾 Persistência (Redis e banco relacional)
* 📊 Gráficos no dashboard
* ⚙️ Aba de configurações

---

### 🚀 Fase 3: Produção

**Objetivo:** Pronto para produção com segurança.

**Tarefas:**

* 🔒 Autenticação no dashboard
* 🎨 UX refinado e responsivo
* 💠 Logs detalhados
* 🐳 Docker + docker-compose
* 🌐 VPS (Node.js, Redis, NGINX, SSL)
* 🧪 Testes funcionais

---

### ☁️ Fase 4: SaaS & Escale

**Objetivo:** Tornar-se um SaaS escalável.

**Tarefas:**

* 👥 Multiusuário (multi-tenancy opcional)
* ✨ Recursos avançados (agendamento, automações)
* 💳 Integração com pagamentos
* ⚖️ Escalabilidade (load balancer, workers)
* 📡 Monitoramento e alertas

---

### 🌱 Fase 5: Sustentar

**Objetivo:** Manter a estabilidade e evoluir com o tempo.

**Tarefas contínuas:**

* 🩺 Monitoramento
* 🐛 Correção de bugs
* 🔄 Atualização de dependências
* 💡 Novas funcionalidades
* ⚡ Otimizações