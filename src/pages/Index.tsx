
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QrCode, MessageCircle, Activity, Settings, Send, Smartphone, Users, BarChart3 } from 'lucide-react';
import QRCodeSection from '@/components/QRCodeSection';
import MessageSender from '@/components/MessageSender';
import BotStatus from '@/components/BotStatus';
import Dashboard from '@/components/Dashboard';

const Index = () => {
  const [botStatus, setBotStatus] = useState<'online' | 'offline'>('offline');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [messagesSent, setMessagesSent] = useState(0);
  const [connections, setConnections] = useState(0);

  // Simular dados para demo
  useEffect(() => {
    // Simulação de SSE para demonstração
    const interval = setInterval(() => {
      const isOnline = Math.random() > 0.3;
      setBotStatus(isOnline ? 'online' : 'offline');
      
      if (isOnline) {
        setQrCode(null);
        setConnections(prev => Math.max(1, prev + Math.floor(Math.random() * 3) - 1));
      } else {
        // QR Code simulado (base64 de um QR simples)
        setQrCode('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
        setConnections(0);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const stats = [
    {
      title: "Status do Bot",
      value: botStatus === 'online' ? 'Online' : 'Offline',
      icon: Activity,
      color: botStatus === 'online' ? 'text-green-600' : 'text-red-600',
      bgColor: botStatus === 'online' ? 'bg-green-50' : 'bg-red-50'
    },
    {
      title: "Mensagens Enviadas",
      value: messagesSent.toString(),
      icon: MessageCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: "Conexões Ativas",
      value: connections.toString(),
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: "Uptime",
      value: "98.5%",
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
            <BotStatus status={botStatus} />
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
              messagesSent={messagesSent}
              connections={connections}
              botStatus={botStatus}
            />
          </TabsContent>

          <TabsContent value="qrcode">
            <QRCodeSection 
              qrCode={qrCode} 
              botStatus={botStatus} 
            />
          </TabsContent>

          <TabsContent value="messages">
            <MessageSender 
              onMessageSent={() => setMessagesSent(prev => prev + 1)}
              botStatus={botStatus}
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
                  <Button className="bg-green-600 hover:bg-green-700">
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
