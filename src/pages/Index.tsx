// src/pages/Index.tsx
import React, { useState, useEffect, ChangeEvent, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QrCode, MessageCircle, Activity, Settings, Send, Smartphone, Users, BarChart3, KeyRound, FileText, Brain, Loader2, ListTodo, PlusCircle, Trash2, XCircle, Handshake, LogOut } from 'lucide-react'; // Importar LogOut
import QRCodeSection from '@/components/QRCodeSection';
import MessageSender from '@/components/MessageSender';
import BotStatus from '@/components/BotStatus';
import Dashboard from '@/components/Dashboard';
import { useWhatsAppConnection, DashboardData, WhatsAppConnectionStatus } from '@/hooks/useWhatsAppConnection';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/components/ui/use-toast";
import KanbanBoard from '@/components/KanbanBoard';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from 'react-router-dom'; // Importar useNavigate

interface BotConfig {
  geminiApiKey: string;
  systemPrompt: string;
  faqText: string;
  useGeminiAI: boolean;
  useCustomResponses: boolean;
  customResponses?: { [key: string]: ResponseMessage[] };
  pauseBotKeyword?: string;
}

interface ResponseMessage {
  text: string;
  delay: number;
  link?: string;
  image?: string;
}

const Index = () => {
  const { status: currentStatus, dashboardData, message: hookMessage, socketRef } = useWhatsAppConnection();
  const { toast } = useToast();
  const navigate = useNavigate(); // Inicializar useNavigate

  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [faqFile, setFaqFile] = useState<File | null>(null);
  const [faqFileName, setFaqFileName] = useState<string>('Nenhum arquivo selecionado');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [useGeminiAI, setUseGeminiAI] = useState(true);
  const [useCustomResponses, setUseCustomResponses] = useState(false);
  const [customResponses, setCustomResponses] = useState<{ [key: string]: ResponseMessage[] }>({});
  const [pauseBotKeyword, setPauseBotKeyword] = useState<string>('');

  useEffect(() => {
    // Captura o valor atual do socketRef.current no início do efeito
    const currentSocket = socketRef.current;

    if (currentSocket && currentSocket.connected) {
      const fetchConfig = () => {
        console.log("Solicitando configurações do bot do servidor...");
        currentSocket.emit('get_bot_config', (response: { success: boolean, data?: Partial<BotConfig> & { faqFilename?: string }, message?: string }) => {
          if (response.success && response.data) {
            console.log("Configurações recebidas:", response.data);
            setGeminiApiKey(response.data.geminiApiKey || '');
            setSystemPrompt(response.data.systemPrompt || 'Você é um assistente prestativo.');
            if (response.data.faqFilename) {
              setFaqFileName(response.data.faqFilename);
            }
            setUseGeminiAI(response.data.useGeminiAI ?? true);
            setUseCustomResponses(response.data.useCustomResponses ?? false);
            setCustomResponses(response.data.customResponses || {});
            setPauseBotKeyword(response.data.pauseBotKeyword || '');
            toast({ title: "Configurações do Bot Carregadas", description: "Suas configurações anteriores foram carregadas." });
          } else {
            toast({ title: "Erro ao Carregar Configurações", description: response.message || "Não foi possível buscar as configurações.", variant: "destructive" });
          }
        });
      };

      if (currentStatus === 'socket_authenticated' || currentStatus === 'online') {
        fetchConfig();
      } else {
        const handleReady = () => fetchConfig();
        currentSocket.on('ready', handleReady);
        // A função de limpeza agora usa a variável capturada 'currentSocket'
        return () => {
          if (currentSocket) {
            currentSocket.off('ready', handleReady);
          }
        };
      }
    }
  }, [socketRef, toast, currentStatus]);


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
    if (!useGeminiAI && !useCustomResponses) {
        toast({ title: "Modo de Atendimento", description: "Pelo menos um modo de atendimento (IA ou Respostas Personalizadas) deve estar ativo.", variant: "destructive" });
        return;
    }
    if (useGeminiAI && !geminiApiKey) {
      toast({ title: "API Key Faltando", description: "Por favor, insira a API Key do Gemini.", variant: "destructive" });
      return;
    }
     if (useGeminiAI && !systemPrompt) {
      toast({ title: "Prompt do Sistema Faltando", description: "Por favor, defina o prompt de comportamento do bot.", variant: "destructive" });
      return;
    }
    if (useCustomResponses && Object.keys(customResponses).length === 0) {
        toast({ title: "Respostas Personalizadas Vazias", description: "Você ativou respostas personalizadas, mas não adicionou nenhuma opção.", variant: "destructive" });
        return;
    }

    if (useCustomResponses) {
      const emptyKeys = Object.keys(customResponses).filter(key => key.trim() === '');
      if (emptyKeys.length > 0) {
        toast({ title: "Palavra-chave Vazia", description: "Todas as opções de menu de respostas personalizadas devem ter uma palavra-chave.", variant: "destructive" });
        return;
      }
      const emptyMessages = Object.values(customResponses).some(messages => messages.some(msg => msg.text.trim() === ''));
      if (emptyMessages) {
          toast({ title: "Mensagem Vazia", description: "Todas as mensagens em respostas personalizadas devem ter um texto.", variant: "destructive" });
          return;
      }
    }


    setIsSavingConfig(true);
    let faqTextContent = '';
    if (faqFile) {
      try {
        faqTextContent = await faqFile.text();
      } catch (error: unknown) {
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
      faqText: faqTextContent,
      useGeminiAI,
      useCustomResponses,
      customResponses,
      pauseBotKeyword,
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

  // customResponses foi removido das dependências, pois a atualização é funcional
  const handleAddOption = useCallback(() => {
    setCustomResponses(prev => {
      const existingKeys = Object.keys(prev);
      let newKey = `Nova Opção`;
      let counter = 1;

      if (existingKeys.length === 0) {
        newKey = "menu";
        if (existingKeys.some(k => k.toLowerCase() === newKey.toLowerCase())) {
            newKey = `Nova Opção ${counter++}`;
        }
      } else {
        while (existingKeys.some(k => k.toLowerCase() === newKey.toLowerCase())) {
            newKey = `Nova Opção ${counter++}`;
        }
      }

      const newState = { ...prev, [newKey]: [{ text: '', delay: 1000 }] };

      if (newKey === "menu" && Object.keys(newState).length > 1) {
          const menuOption = newState["menu"];
          delete newState["menu"];
          return { "menu": menuOption, ...newState };
      }

      return newState;
    });
  }, []); // customResponses removido daqui


  const handleRemoveOption = useCallback((keyToRemove: string) => {
    setCustomResponses(prev => {
      const newState = { ...prev };
      delete newState[keyToRemove];
      return newState;
    });
  }, []);

  const handleUpdateOptionKey = useCallback((oldKey: string, newKey: string) => {
    setCustomResponses(prev => {
      const trimmedNewKey = newKey.trim();
      if (oldKey === trimmedNewKey) return prev;
      if (!trimmedNewKey) {
        return prev;
      }
      if (Object.keys(prev).some(k => k.toLowerCase() === trimmedNewKey.toLowerCase() && k.toLowerCase() !== oldKey.toLowerCase())) {
        toast({ title: "Palavra-chave Duplicada", description: `A palavra-chave "${trimmedNewKey}" já existe.`, variant: "destructive" });
        return prev;
      }

      const newState: { [key: string]: ResponseMessage[] } = {};
      const orderedKeys = Object.keys(prev).sort((a,b) => a.localeCompare(b));

      orderedKeys.forEach(key => {
        if (key === oldKey) {
          newState[trimmedNewKey] = prev[oldKey];
        } else {
          newState[key] = prev[key];
        }
      });
      return newState;
    });
  }, [toast]);


  const handleAddMessageToOption = useCallback((optionKey: string) => {
    setCustomResponses(prev => ({
      ...prev,
      [optionKey]: [...(prev[optionKey] || []), { text: '', delay: 1000 }]
    }));
  }, []);

  const handleRemoveMessageFromOption = useCallback((optionKey: string, messageIndex: number) => {
    setCustomResponses(prev => ({
      ...prev,
      [optionKey]: prev[optionKey].filter((_, i) => i !== messageIndex)
    }));
  }, []);

  const handleMessageChange = useCallback((
    optionKey: string,
    messageIndex: number,
    field: keyof ResponseMessage,
    value: string | number
  ) => {
    setCustomResponses(prev => ({
      ...prev,
      [optionKey]: prev[optionKey].map((msg, i) =>
        i === messageIndex ? { ...msg, [field]: value } : msg
      )
    }));
  }, []);


  const botDisplayStatus: WhatsAppConnectionStatus = dashboardData.botStatus || currentStatus;

  const getStatusValue = (statusValue: WhatsAppConnectionStatus) => {
    switch (statusValue) {
      case 'online': return 'Online';
      case 'qr_ready': return 'Aguardando QR';
      case 'initializing':
      case 'socket_authenticated':
      case 'connecting_socket': return 'Conectando';
      case 'auth_failed': return 'Falha';
      case 'disconnected_whatsapp': return 'Desconectado';
      default: return 'Offline';
    }
  };

  const getStatusColors = (statusValue: WhatsAppConnectionStatus) => {
    switch (statusValue) {
      case 'online': return { color: 'text-green-600', bgColor: 'bg-green-50' };
      case 'qr_ready': return { color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
      case 'initializing':
      case 'socket_authenticated':
      case 'connecting_socket': return { color: 'text-blue-600', bgColor: 'bg-blue-50' };
      case 'auth_failed':
      case 'disconnected_whatsapp': return { color: 'text-red-600', bgColor: 'bg-red-50' };
      default: return { color: 'text-gray-600', bgColor: 'bg-gray-50' };
    }
  };

  const stats = [
    {
      title: "Status do Bot",
      value: getStatusValue(botDisplayStatus),
      icon: Activity,
      color: getStatusColors(botDisplayStatus).color,
      bgColor: getStatusColors(botDisplayStatus).bgColor,
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

  const handleLogout = () => {
    localStorage.removeItem('authToken'); // Remove o token
    navigate('/login'); // Redireciona para a página de login
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
  };

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
            <div className="flex items-center space-x-4"> {/* Adicionado um contêiner flexível para status e botão */}
              <BotStatus />
              <Button onClick={handleLogout} variant="outline" className="flex items-center space-x-2">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            </div>
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
          <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 lg:grid-cols-5 bg-white shadow-sm">
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
            <TabsTrigger value="kanban" className="flex items-center space-x-2">
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
              botStatus={dashboardData.botStatus}
              recentActivityData={dashboardData.recentActivity}
            />
          </TabsContent>
          <TabsContent value="qrcode"> <QRCodeSection /> </TabsContent>
          <TabsContent value="messages">
            <MessageSender
              onMessageSent={() => {
                console.log("onMessageSent callback no Index.tsx");
              }}
            />
          </TabsContent>

          <TabsContent value="kanban">
            <KanbanBoard />
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  <span>Configurações do Bot Inteligente e Respostas</span>
                </CardTitle>
                <CardDescription>
                  Personalize o comportamento e a base de conhecimento do seu assistente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Seção de Ativação/Desativação da IA */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-3">
                        <Brain className="h-5 w-5 text-purple-600" />
                        <div>
                            <h4 className="font-semibold text-gray-800">Usar Bot Inteligente (Google Gemini)</h4>
                            <p className="text-sm text-gray-600">Ativa ou desativa a inteligência artificial para responder automaticamente.</p>
                        </div>
                    </div>
                    <Switch
                        checked={useGeminiAI}
                        onCheckedChange={(checked) => {
                            setUseGeminiAI(checked);
                            if (checked) {
                                setUseCustomResponses(false);
                            }
                        }}
                        id="toggle-gemini-ai"
                    />
                </div>

                {useGeminiAI && (
                    <>
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
                            <p className="text-xs text-gray-500">Descreva como o bot deve se comportar, seu tone e sua persona.</p>
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
                        </div >
                    </>
                )}

                {/* Seção de Respostas Personalizadas */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-3">
                        <ListTodo className="h-5 w-5 text-blue-600" />
                        <div>
                            <h4 className="font-semibold text-gray-800">Usar Respostas Personalizadas (Menu)</h4>
                            <p className="text-sm text-gray-600">Define respostas automáticas baseadas em palavras-chave exatas.</p>
                        </div>
                    </div>
                    <Switch
                        checked={useCustomResponses}
                        onCheckedChange={(checked) => {
                            setUseCustomResponses(checked);
                            if (checked) {
                                setUseGeminiAI(false);
                            }
                        }}
                        id="toggle-custom-responses"
                    />
                </div>

                {useCustomResponses && (
                    <div className="space-y-4 border p-4 rounded-lg bg-white">
                        <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                            Editor de Menu de Respostas
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAddOption}
                                className="ml-auto flex items-center space-x-1"
                            >
                                <PlusCircle className="h-4 w-4" />
                                <span>Adicionar Opção</span>
                            </Button>
                        </h4>
                        <p className="text-sm text-gray-600 mb-4">
                            Defina palavras-chave (ex: "1", "menu", "horário") e as mensagens que o bot deve enviar em resposta.
                        </p>

                        {/* Campo para configurar a palavra-chave que pausa o bot */}
                        <div className="space-y-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                          <label htmlFor="pauseBotKeyword" className="flex items-center text-sm font-medium text-gray-700">
                              <Handshake className="h-4 w-4 mr-2 text-yellow-600" />
                              Palavra-chave para Transferir para Atendente (Pausar Bot)
                          </label>
                          <Input
                              id="pauseBotKeyword"
                              placeholder="Ex: '3', 'atendente', 'falar com alguém'"
                              value={pauseBotKeyword}
                              onChange={(e) => setPauseBotKeyword(e.target.value)}
                              className="w-full"
                          />
                          <p className="text-xs text-gray-500">
                            Quando o cliente digitar esta palavra-chave, o bot pausará as respostas automáticas para esse contato.
                            O atendimento poderá ser retomado manualmente via Kanban.
                          </p>
                        </div>

                        {Object.keys(customResponses).length === 0 && (
                            <p className="text-center text-gray-500 py-4">Nenhuma resposta personalizada adicionada ainda. Clique em "Adicionar Opção" para começar.</p>
                        )}

                        {Object.keys(customResponses).sort((a,b) => a.localeCompare(b)).map((key) => (
                            <Card key={`option-${key}`} className="p-4 border-l-4 border-blue-500 shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between p-0 pb-2">
                                    <Input
                                        value={key}
                                        onChange={(e) => handleUpdateOptionKey(key, e.target.value)}
                                        placeholder="Digite a palavra-chave (ex: '1', 'menu')"
                                        className="text-base font-semibold border-b border-gray-300 focus:border-blue-500 px-0 py-0 h-auto flex-1 mr-2"
                                    />
                                    <Button variant="ghost" size="sm" onClick={() => handleRemoveOption(key)}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-3 p-0 pt-2">
                                    {customResponses[key].map((msg, messageIndex) => (
                                        <div key={messageIndex} className="relative p-3 border rounded-md bg-slate-50">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Textarea
                                                    placeholder="Texto da mensagem"
                                                    value={msg.text}
                                                    onChange={(e) => handleMessageChange(key, messageIndex, 'text', e.target.value)}
                                                    rows={2}
                                                    className="flex-grow resize-none"
                                                />
                                                <Input
                                                    type="number"
                                                    placeholder="Delay (ms)"
                                                    value={msg.delay}
                                                    onChange={(e) => handleMessageChange(key, messageIndex, 'delay', parseInt(e.target.value) || 0)}
                                                    className="w-24"
                                                />
                                            </div>
                                            <Input
                                                placeholder="Link (opcional)"
                                                value={msg.link || ''}
                                                onChange={(e) => handleMessageChange(key, messageIndex, 'link', e.target.value)}
                                                className="mb-2"
                                            />
                                            <Input
                                                placeholder="URL da Imagem (opcional)"
                                                value={msg.image || ''}
                                                onChange={(e) => handleMessageChange(key, messageIndex, 'image', e.target.value)}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="absolute top-1 right-1 h-6 w-6 p-0"
                                                onClick={() => handleRemoveMessageFromOption(key, messageIndex)}
                                            >
                                                <XCircle className="h-4 w-4 text-gray-500" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleAddMessageToOption(key)}
                                        className="w-full mt-2"
                                    >
                                        <PlusCircle className="h-4 w-4 mr-2" /> Adicionar Mensagem
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}


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