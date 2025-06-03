**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

🗺️ Roadmap Visual do Projeto: WhatsApp Bot SAAS
Visão Geral das Fases
Fase 🏁	Objetivo Principal 🎯	Foco Principal 💡
1: Alicerce	Bot funcional com dashboard básico em tempo real (MVP).	Conexão Baileys estável, Dashboard com dados live, Envio de mensagens.
2: Expansão	Persistência de dados, estatísticas avançadas e configurações.	Banco de Dados/Redis, Gráficos históricos, Configurações do bot.
3: Produção	Refinamento, segurança e prontidão para implantação na VPS.	Autenticação, UI/UX, Docker, Preparação da VPS.
4: SaaS & Escale	Recursos para modelo SaaS e capacidade de crescimento.	Multi-tenancy (se aplicável), Funcionalidades avançadas do bot, Escalabilidade.
5: Sustentar	Manutenção contínua e evolução do produto.	Monitoramento, Correções, Novas features.

Exportar para as Planilhas
Detalhamento das Fases
Fase 1: Alicerce 🏗️ - Funcionalidade Essencial (MVP)
Objetivo: 🎯 Ter um bot funcional com um dashboard que exibe informações em tempo real e permite operações básicas.

Principais Entregáveis & Tarefas:

🤖 Conexão Estável com WhatsApp (Baileys):
[ ] Garantir robustez na conexão e reconexão.
[ ] Feedback claro de status da conexão no frontend.
📊 Dashboard com Dados em Tempo Real:
Backend:
[ ] Emitir status real do bot.
[ ] Emitir contador de mensagens enviadas.
[ ] Emitir log de atividades recentes.
Frontend:
[ ] useWhatsAppConnection.ts para gerenciar dados.
Dashboard.tsx e Index.tsx para exibir dados dinâmicos.
💬 Funcionalidade de Envio de Mensagens:
[ ] Garantir funcionamento e feedback adequado.
📱 Gerenciamento de QR Code:
[ ] Assegurar exibição e renovação operacional.
⚠️ Tratamento Básico de Erros:
[ ] Mensagens de erro claras no frontend.
Fase 2: Expansão 📈 - Persistência e Estatísticas Avançadas
Objetivo: 🎯 Armazenar dados importantes para análise histórica e implementar funcionalidades de configuração.

Principais Entregáveis & Tarefas:

💾 Implementar Persistência de Dados (Backend):
[ ] Escolher e implementar tecnologia (Redis para contadores/cache; SQLite/PostgreSQL para dados históricos).
[ ] Persistir contadores e logs de atividades.
📈 Dashboard com Gráficos Funcionais e Históricos:
[ ] Backend: Coletar e agregar dados para gráficos (mensagens por hora/dia, etc.).
[ ] Frontend: Dashboard.tsx para consumir e exibir dados agregados nos gráficos.
⚙️ Configurações do Bot:
[ ] Backend: Definir e armazenar configurações (webhook, timeouts, etc.).
[ ] Frontend: Interface para visualizar e salvar configurações na aba "Configurações".
Fase 3: Produção 🚀 - Refinamento, Segurança e Implantação
Objetivo: 🎯 Refinar o produto, adicionar segurança e prepará-lo para ser hospedado na VPS.

Principais Entregáveis & Tarefas:

🔒 Autenticação e Autorização:
[ ] Implementar sistema de login (se necessário para proteger o dashboard).
🎨 Melhorias de UI/UX:
[ ] Refinar interface e usabilidade.
[ ] Adicionar mais feedback visual.
🛠️ Tratamento Avançado de Erros e Logs:
[ ] Logging detalhado e estruturado no backend.
[ ] Aumentar resiliência do bot.
🐳 Dockerização (Recomendado):
[ ] Dockerfile para o backend.
[ ] docker-compose.yml para orquestrar backend, frontend (se aplicável) e Redis.
🌐 Configuração do Ambiente de Produção (VPS Hostinger):
[ ] Instalar dependências (Node.js, Redis, Nginx).
[ ] Configurar domínio, SSL/TLS, firewall.
[ ] Variáveis de ambiente para produção.
🧪 Testes:
[ ] Testes funcionais das principais features.
Fase 4: SaaS & Escale ☁️ - Recursos para Modelo SaaS e Crescimento
Objetivo: 🎯 Expandir as funcionalidades para um modelo SaaS e garantir que a arquitetura possa escalar.

Principais Entregáveis & Tarefas:

👥 Gerenciamento de Múltiplos Clientes/Instâncias (Opcional):
[ ] Arquitetar para multi-tenancy (se for o objetivo do SaaS).
✨ Recursos Avançados do Bot:
[ ] Respostas automáticas configuráveis.
[ ] Agendamento de mensagens.
[ ] Integrações com outras APIs.
💳 Planos de Assinatura e Pagamento (Opcional):
[ ] Integração com gateway de pagamento.
[ ] Gerenciamento de planos e acesso a features.
⚖️ Escalabilidade do Backend:
[ ] Estratégias para balanceamento de carga, múltiplas instâncias, etc.
📡 Monitoramento e Alertas em Produção:
[ ] Ferramentas de monitoramento de performance, erros e uso.
[ ] Configuração de alertas críticos.
Fase 5: Sustentar 🌱 - Manutenção e Evolução Contínua
Objetivo: 🎯 Manter o sistema saudável e adicionar novas funcionalidades com base no feedback e nas necessidades do mercado.

Tarefas Contínuas:

[ ] 🩺 Monitoramento constante.
[ ] 🐛 Correção de bugs.
[ ] 🔄 Atualização de dependências.
[ ] 💡 Desenvolvimento de novas funcionalidades.
[ ] ⚡ Otimizações de performance.
