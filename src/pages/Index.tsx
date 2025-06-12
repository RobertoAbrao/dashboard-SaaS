// src/pages/Index.tsx
import React, { useState, useEffect, ChangeEvent, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QrCode, MessageCircle, Activity, Settings, Send, Smartphone, Users, BarChart3, KeyRound, FileText, Brain, Loader2, ListTodo } from 'lucide-react';
import QRCodeSection from '@/components/QRCodeSection';
import MessageSender from '@/components/MessageSender';
import BotStatus from '@/components/BotStatus';
import Dashboard from '@/components/Dashboard';
import { useWhatsAppConnection, DashboardData, WhatsAppConnectionStatus } from '@/hooks/useWhatsAppConnection'; // Importado WhatsAppConnectionStatus
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/components/ui/use-toast";
import KanbanBoard from '@/components/KanbanBoard'; // Importar o novo componente KanbanBoard

interface BotConfig {
  geminiApiKey: string;
  systemPrompt: string;
  faqText: string;
}


const Index = () => {
  const { status: currentStatus, dashboardData, message: hookMessage, socketRef } = useWhatsAppConnection();
  const { toast } = useToast();

  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [faqFile, setFaqFile] = useState<File | null>(null);
  const [faqFileName, setFaqFileName] = useState<string>('Nenhum arquivo selecionado');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    if (socketRef?.current && socketRef.current.connected) {
      console.log("Solicitando configurações do bot do servidor...");
      socketRef.current.emit('get_bot_config', (response: { success: boolean, data?: Partial<BotConfig> & { faqFilename?: string }, message?: string }) => {
        if (response.success && response.data) {
          console.log("Configurações recebidas:", response.data);
          setGeminiApiKey(response.data.geminiApiKey || '');
          setSystemPrompt(response.data.systemPrompt || 'Você é um assistente prestativo.');
          if (response.data.faqFilename) {
            setFaqFileName(response.data.faqFilename);
          }
          toast({ title: "Configurações do Bot Carregadas", description: "Suas configurações anteriores foram carregadas." });
        } else {
          toast({ title: "Erro ao Carregar Configurações", description: response.message || "Não foi possível buscar as configurações.", variant: "destructive" });
        }
      });
    }
  }, [socketRef, toast]);


  const handleFaqFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name === 'faq.txt' && file.type === 'text/plain') {
        setFaqFile(file);
        setFaqFileName(file.name);
      } else {
        toast({
          title: "Arquivo Inválido",
          description: "Por favor, selecione um arquivo chamado 'faq.txt' e do tipo texto (.txt).",
          variant: "destructive",
        });
        event.target.value = '';
        setFaqFile(null);
        setFaqFileName('Nenhum arquivo selecionado');
      }
    }
  };

  const handleSaveConfig = async () => {
    if (!socketRef?.current) {
      toast({ title: "Erro de Conexão", description: "Não foi possível conectar ao servidor para salvar.", variant: "destructive" });
      return;
    }
    if (!geminiApiKey) {
      toast({ title: "API Key Faltando", description: "Por favor, insira a API Key do Gemini.", variant: "destructive" });
      return;
    }
     if (!systemPrompt) {
      toast({ title: "Prompt do Sistema Faltando", description: "Por favor, defina o prompt de comportamento do bot.", variant: "destructive" });
      return;
    }

    setIsSavingConfig(true);
    let faqTextContent = '';
    if (faqFile) {
      try {
        faqTextContent = await faqFile.text();
      } catch (error: unknown) { // Modificado para unknown
        console.error("Erro ao ler arquivo FAQ:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({ title: "Erro ao Ler FAQ", description: `Não foi possível ler o arquivo: ${errorMessage}`, variant: "destructive" });
        setIsSavingConfig(false);
        return;
      }
    }

    const configToSave: Partial<BotConfig> = {
      geminiApiKey,
      systemPrompt,
      ...(faqFile && { faqText: faqTextContent }),
    };
    
    console.log("Enviando para salvar config:", configToSave);

    socketRef.current.emit('save_bot_config', configToSave, (response: { success: boolean, message: string }) => {
      setIsSavingConfig(false);
      if (response.success) {
        toast({ title: "Sucesso!", description: response.message });
      } else {
        toast({ title: "Erro ao Salvar", description: response.message, variant: "destructive" });
      }
    });
  };

  // Usa o status do hook diretamente, que já considera o status do bot no dashboardData
  const botDisplayStatus: WhatsAppConnectionStatus = dashboardData.botStatus || currentStatus;
  
  const getStatusValue = (statusValue: WhatsAppConnectionStatus) => { // Tipado o parâmetro
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

  const getStatusColors = (statusValue: WhatsAppConnectionStatus) => { // Tipado o parâmetro
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
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="bg-green-600 p-2 rounded-lg">
                <Smartphone className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Abrão Tech - SaaS</h1>
                <p className="text-sm text-gray-500">Automação profissional para WhatsApp</p>
              </div>
            </div>
            <BotStatus />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 lg:grid-cols-5 bg-white shadow-sm"> {/* Adicionado lg:grid-cols-5 */}
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
            <TabsTrigger value="kanban" className="flex items-center space-x-2"> {/* Nova aba Kanban */}
              <ListTodo className="h-4 w-4" />
              <span>Kanban</span>
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
              botStatus={dashboardData.botStatus} // botStatus é do tipo WhatsAppConnectionStatus
              recentActivityData={dashboardData.recentActivity}
            />
          </TabsContent>
          <TabsContent value="qrcode"> <QRCodeSection /> </TabsContent>
          <TabsContent value="messages">
            {/* A prop botStatus foi removida daqui pois o componente MessageSender a obtém do hook */}
            <MessageSender 
              onMessageSent={() => {
                // Você pode querer atualizar algum estado aqui se necessário, 
                // ou deixar o feedback por conta dos toasts no MessageSender
                console.log("onMessageSent callback no Index.tsx");
              }}
            />
          </TabsContent>

          <TabsContent value="kanban"> {/* Conteúdo da nova aba Kanban */}
            <KanbanBoard />
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  <span>Configurações do Bot Inteligente</span>
                </CardTitle>
                <CardDescription>
                  Personalize o comportamento e a base de conhecimento do seu assistente IA.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="geminiApiKey" className="flex items-center text-sm font-medium text-gray-700">
                    <KeyRound className="h-4 w-4 mr-2 text-gray-500" />
                    API Key do Gemini
                  </label>
                  <Input
                    id="geminiApiKey"
                    type="password" 
                    placeholder="Cole sua API Key do Google Gemini aqui"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="w-full"
                  />
                   <p className="text-xs text-gray-500">Sua chave será armazenada de forma segura no servidor.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="systemPrompt" className="flex items-center text-sm font-medium text-gray-700">
                    <FileText className="h-4 w-4 mr-2 text-gray-500" />
                    Prompt de Comando do Bot (Comportamento)
                  </label>
                  <Textarea
                    id="systemPrompt"
                    placeholder="Ex: Você é um assistente virtual da Loja X, especializado em responder dúvidas sobre produtos e horários de funcionamento. Seja sempre cordial e prestativo..."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    className="w-full resize-none"
                  />
                   <p className="text-xs text-gray-500">Descreva como o bot deve se comportar, seu tom e sua persona.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="faqFile" className="flex items-center text-sm font-medium text-gray-700">
                    <FileText className="h-4 w-4 mr-2 text-gray-500" />
                    Arquivo de FAQ (faq.txt)
                  </label>
                  <Input
                    id="faqFile"
                    type="file"
                    accept=".txt"
                    onChange={handleFaqFileChange}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Forneça um arquivo de texto simples (`faq.txt`) com perguntas e respostas para treinar o bot. 
                    Arquivo atual: <span className="font-semibold">{faqFileName}</span>
                  </p>
                </div>
                
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSaveConfig} 
                    disabled={isSavingConfig}
                    className="bg-green-600 hover:bg-green-700 flex items-center"
                  >
                    {isSavingConfig ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Settings className="mr-2 h-4 w-4" />
                        Salvar Configurações do Bot
                      </>
                    )}
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