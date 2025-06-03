// src/pages/Index.tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // CardDescription adicionada de volta
import { Button } from '@/components/ui/button'; // <<< --- ADICIONADO AQUI
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QrCode, MessageCircle, Activity, Settings, Send, Smartphone, Users, BarChart3 } from 'lucide-react';
import QRCodeSection from '@/components/QRCodeSection';
import MessageSender from '@/components/MessageSender';
import BotStatus from '@/components/BotStatus';
import Dashboard from '@/components/Dashboard';
import { useWhatsAppConnection, DashboardData } from '@/hooks/useWhatsAppConnection';

const Index = () => {
  const { status: currentStatus, dashboardData, message: hookMessage } = useWhatsAppConnection();

  const botDisplayStatus = dashboardData.botStatus || currentStatus;

  const getStatusValue = (statusValue: typeof botDisplayStatus) => {
    switch (statusValue) {
      case 'online': return 'Online';
      case 'qr_ready': return 'Aguardando QR';
      case 'initializing':
      case 'socket_connected':
      case 'connecting_socket':
      case 'authenticated': return 'Conectando';
      case 'auth_failed': return 'Falha';
      case 'disconnected_whatsapp': return 'Desconectado';
      default: return 'Offline';
    }
  };

  const getStatusColors = (statusValue: typeof botDisplayStatus) => {
    switch (statusValue) {
      case 'online': return { color: 'text-green-600', bgColor: 'bg-green-50' };
      case 'qr_ready': return { color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
      case 'initializing':
      case 'socket_connected':
      case 'connecting_socket':
      case 'authenticated': return { color: 'text-blue-600', bgColor: 'bg-blue-50' };
      case 'auth_failed':
      case 'disconnected_whatsapp': return { color: 'text-red-600', bgColor: 'bg-red-50' };
      default: return { color: 'text-gray-600', bgColor: 'bg-gray-50' };
    }
  };
  
  const statusColors = getStatusColors(botDisplayStatus);

  const stats = [
    {
      title: "Status do Bot",
      value: getStatusValue(botDisplayStatus),
      icon: Activity,
      color: statusColors.color,
      bgColor: statusColors.bgColor,
    },
    {
      title: "Mensagens Enviadas Hoje",
      value: dashboardData.messagesSent.toString(),
      icon: MessageCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: "Conexões Ativas",
      value: dashboardData.connections.toString(),
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: "Uptime (Placeholder)",
      value: "99.9%", 
      icon: BarChart3,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
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
            <BotStatus />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 bg-white shadow-sm">
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="qrcode" className="flex items-center space-x-2">
              <QrCode className="h-4 w-4" />
              <span>QR Code</span>
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
              messagesSent={dashboardData.messagesSent}
              connections={dashboardData.connections}
              botStatus={dashboardData.botStatus}
              recentActivityData={dashboardData.recentActivity}
            />
          </TabsContent>

          <TabsContent value="qrcode">
            <QRCodeSection />
          </TabsContent>

          <TabsContent value="messages">
            <MessageSender 
              onMessageSent={() => {}}
              botStatus={botDisplayStatus as 'online' | 'offline'}
            />
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Configurações do Bot</span>
                </CardTitle>
                <CardDescription> {/* Adicionada CardDescription de volta */}
                  Configure as opções do seu bot WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Configurações Gerais</h3>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">URL do Webhook</label>
                      <input 
                        type="url" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="https://seu-webhook.com/api"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Timeout (segundos)</label>
                      <input 
                        type="number" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        defaultValue="30"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Configurações Avançadas</h3>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Rate Limit (msg/min)</label>
                      <input 
                        type="number" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        defaultValue="60"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Retry Attempts</label>
                      <input 
                        type="number" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        defaultValue="3"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button className="bg-green-600 hover:bg-green-700"> {/* Esta é a linha 214 aproximada */}
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