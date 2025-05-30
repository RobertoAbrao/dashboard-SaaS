import { useState, useEffect } from 'react';
import { io, Socket } from "socket.io-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// import { Badge } from '@/components/ui/badge'; // Removido se não usado diretamente aqui
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QrCode, MessageCircle, Activity, Settings, Send, Smartphone, Users, BarChart3, HelpCircle } from 'lucide-react';
import QRCodeSection from '@/components/QRCodeSection';
import MessageSender from '@/components/MessageSender';
import BotStatus from '@/components/BotStatus';
import Dashboard from '@/components/Dashboard';
import { toast } from "@/components/ui/use-toast"; // Shadcn Toaster

// Definindo a URL do backend
const BACKEND_URL = "http://localhost:3001"; // Porta definida no backend/server.js

interface BackendStatus {
  status: 'online' | 'offline' | 'pending_qr' | 'authenticating' | 'loading';
  message: string;
  percent?: number;
}

const Index = () => {
  // Estado para o status geral do bot (simplificado para os componentes filhos)
  const [botDisplayStatus, setBotDisplayStatus] = useState<'online' | 'offline'>('offline');
  // Estado para a mensagem detalhada do status vinda do backend
  const [botStatusMessage, setBotStatusMessage] = useState<string>('Conectando ao servidor...');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [messagesSent, setMessagesSent] = useState(0);
  const [connections, setConnections] = useState(0); // Manter se for usar para algo real no futuro

  useEffect(() => {
    const socket: Socket = io(BACKEND_URL);

    socket.on("connect", () => {
      console.log("Conectado ao servidor Socket.IO do backend!");
      setBotStatusMessage("Conectado ao servidor. Aguardando status do bot...");
      // O backend deve enviar o status atual ao conectar
    });

    socket.on("disconnect", () => {
      console.log("Desconectado do servidor Socket.IO.");
      setBotDisplayStatus("offline");
      setQrCode(null);
      setBotStatusMessage("Desconectado do servidor. Tentando reconectar...");
      toast({
        title: "Desconectado do Servidor",
        description: "A conexão com o backend foi perdida.",
        variant: "destructive",
      });
    });

    socket.on("qr_code", (qrDataUrl: string | null) => {
      console.log("QR Code recebido/atualizado:", qrDataUrl ? "Sim" : "Não");
      setQrCode(qrDataUrl);
      if (qrDataUrl) {
        setBotDisplayStatus("offline"); // Se tem QR, está offline para conexão
        // botStatusMessage será atualizado pelo evento 'status_update'
      }
    });

    socket.on("status_update", (backendStatus: BackendStatus) => {
      console.log("Status do backend recebido:", backendStatus);
      setBotStatusMessage(backendStatus.message);

      if (backendStatus.status === 'online') {
        setBotDisplayStatus('online');
        setQrCode(null); // Garante que o QR sumiu
        setConnections(1); // Simula uma conexão ativa
      } else {
        setBotDisplayStatus('offline');
        if (backendStatus.status !== 'pending_qr') {
             // Se não for 'pending_qr' e estiver offline, não deve haver QR visível (o backend controla isso via 'qr_code' event)
        }
      }

      // Lógica para toast de status, se desejar
      // Exemplo:
      // if (backendStatus.status === 'online' && botDisplayStatus !== 'online') {
      //   toast({ title: "Bot Conectado!", description: backendStatus.message });
      // } else if (backendStatus.status === 'offline' && botDisplayStatus === 'online') {
      //   toast({ title: "Bot Desconectado", description: backendStatus.message, variant: 'destructive' });
      // }
    });
    
    // Para simular Uptime e Conexões Ativas (já que o backend não envia isso ainda)
    // Você pode remover ou adaptar isso conforme integra mais funcionalidades
    const demoInterval = setInterval(() => {
      if (botDisplayStatus === 'online') {
        setConnections(prev => Math.max(1, prev + Math.floor(Math.random() * 3) - 1));
      } else {
        setConnections(0);
      }
    }, 15000);


    // Limpeza ao desmontar o componente
    return () => {
      console.log("Desconectando Socket.IO...");
      socket.disconnect();
      clearInterval(demoInterval);
    };
  }, []); // Array de dependências vazio para rodar apenas uma vez na montagem

  const stats = [
    {
      title: "Status do Bot",
      value: botDisplayStatus === 'online' ? 'Online' : 'Offline',
      description: botStatusMessage, // Adicionando a mensagem detalhada aqui
      icon: Activity,
      color: botDisplayStatus === 'online' ? 'text-green-600' : 'text-red-600',
      bgColor: botDisplayStatus === 'online' ? 'bg-green-50' : 'bg-red-50'
    },
    {
      title: "Mensagens Enviadas",
      value: messagesSent.toString(),
      icon: MessageCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: "Conexões Ativas", // Pode ser a conexão do bot com o WhatsApp
      value: connections.toString(),
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: "Uptime (Simulado)",
      value: "99.8%", // Simulado por enquanto
      icon: BarChart3,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="bg-green-600 p-2 rounded-lg">
                <Smartphone className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">WhatsApp Bot SAAS</h1>
                <p className="text-sm text-gray-500">Automação profissional para WhatsApp</p>
              </div>
            </div>
            <BotStatus status={botDisplayStatus} message={botStatusMessage} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow duration-200">
              <CardHeader className="pb-2"> {/* Ajuste de padding se necessário */}
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
                  <div className={`p-2 rounded-full ${stat.bgColor}`}> {/* Ajustado padding do ícone */}
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                {stat.description && (
                  <p className="text-xs text-gray-500 mt-1 truncate" title={stat.description}>
                    {stat.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="qrcode" className="space-y-6"> {/* Alterado para qrcode como padrão */}
          <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 bg-white shadow-sm">
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="qrcode" className="flex items-center space-x-2">
              <QrCode className="h-4 w-4" />
              <span>Conexão</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center space-x-2">
              <Send className="h-4 w-4" />
              <span>Enviar Mensagens</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Configurações</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard
              messagesSent={messagesSent}
              connections={connections} // Você pode querer usar um valor mais real aqui
              botStatus={botDisplayStatus}
            />
          </TabsContent>

          <TabsContent value="qrcode">
            <QRCodeSection
              qrCode={qrCode}
              botStatus={botDisplayStatus} // Usando o botDisplayStatus
              statusMessage={botStatusMessage} // Passando a mensagem detalhada
            />
          </TabsContent>

          <TabsContent value="messages">
            <MessageSender
              onMessageSent={() => setMessagesSent(prev => prev + 1)}
              botStatus={botDisplayStatus} // Usando o botDisplayStatus
            />
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Configurações do Bot</span>
                </CardTitle>
                <CardDescription>
                  Configure as opções do seu bot WhatsApp (funcionalidade futura)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* ... conteúdo das configurações ... */}
                 <div className="text-center text-gray-500 py-8">
                  <HelpCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-semibold">Em Desenvolvimento</p>
                  <p className="text-sm">Esta seção de configurações ainda não está implementada.</p>
                </div>
                {/* Removido o formulário antigo de Configurações para simplificar */}
                <div className="flex justify-end pt-4">
                  <Button className="bg-green-600 hover:bg-green-700" disabled>
                    Salvar Configurações
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;