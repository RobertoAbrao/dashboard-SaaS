// src/hooks/useWhatsAppConnection.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

export type WhatsAppConnectionStatus =
  | 'offline'
  | 'connecting_socket' // Conectando ao servidor Socket.IO
  | 'socket_connected'  // Socket.IO conectado, aguardando status do WhatsApp
  | 'initializing'      // Pediu para conectar ao WhatsApp, aguardando QR ou ready
  | 'qr_ready'
  | 'authenticated'     // Autenticado, quase online
  | 'online'
  | 'auth_failed'
  | 'disconnected_whatsapp'; // WhatsApp desconectado por algum motivo (diferente de offline inicial)

export interface ActivityLogEntry { // Exportar para uso no Dashboard.tsx
    message: string;
    timestamp: string;
}

export interface DashboardData { // Exportar para uso no Index.tsx
  messagesSent: number;
  connections: number;
  botStatus: WhatsAppConnectionStatus;
  recentActivity: ActivityLogEntry[];
}

interface WhatsAppState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  message: string | null;
  lastEventTimestamp: string;
  dashboardData: DashboardData;
}

const SOCKET_SERVER_URL = 'http://localhost:3001';

const initialDashboardData: DashboardData = {
    messagesSent: 0,
    connections: 0,
    botStatus: 'offline',
    recentActivity: [],
};

export const useWhatsAppConnection = () => {
  const [whatsAppState, setWhatsAppState] = useState<WhatsAppState>({
    status: 'offline',
    qrCode: null,
    message: 'Aguardando conexão...',
    lastEventTimestamp: new Date().toISOString(),
    dashboardData: initialDashboardData,
  });
  const [isProcessingWhatsAppAction, setIsProcessingWhatsAppAction] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);

  const updateState = useCallback((partialState: Partial<Omit<WhatsAppState, 'dashboardData'>> & { dashboardData?: Partial<DashboardData> }) => {
    setWhatsAppState(prevState => {
      const newStatus = partialState.status || prevState.status;
      return {
        ...prevState,
        ...partialState,
        // Se o dashboardData for atualizado, use-o, caso contrário, mantenha o antigo, mas atualize botStatus nele se o status principal mudou
        dashboardData: {
          ...prevState.dashboardData,
          ...(partialState.dashboardData || {}),
          botStatus: newStatus, // Garante que botStatus no dashboardData reflita o status principal
          connections: newStatus === 'online' ? 1 : 0, // Atualiza conexões baseado no status
        },
        lastEventTimestamp: new Date().toISOString(),
      };
    });
  }, []);
  

  useEffect(() => {
    updateState({ status: 'connecting_socket', message: 'Conectando ao servidor de automação...' });
    
    const socket = io(SOCKET_SERVER_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.IO conectado ao servidor:', socket.id);
      updateState({ 
        status: 'socket_connected', 
        message: 'Conectado ao servidor. Aguardando status do WhatsApp...' 
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO desconectado do servidor:', reason);
      updateState({ status: 'offline', qrCode: null, message: `Desconectado do servidor de automação: ${reason}`, dashboardData: initialDashboardData });
      setIsProcessingWhatsAppAction(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Falha na conexão Socket.IO:', error);
      updateState({ status: 'offline', qrCode: null, message: `Falha ao conectar ao servidor: ${error.message}`, dashboardData: initialDashboardData });
      setIsProcessingWhatsAppAction(false);
    });

    socket.on('qr', (qr: string) => {
      console.log('QR Code recebido:', qr);
      updateState({ status: 'qr_ready', qrCode: qr, message: 'Escaneie o QR Code com seu WhatsApp.' });
      setIsProcessingWhatsAppAction(false);
    });

    socket.on('ready', () => {
      console.log('Cliente WhatsApp conectado e pronto (online).');
      updateState({ status: 'online', qrCode: null, message: 'WhatsApp conectado e online!' });
      setIsProcessingWhatsAppAction(false);
    });
    
    socket.on('authenticated', () => {
      console.log('Cliente WhatsApp autenticado.');
      updateState({ status: 'authenticated', qrCode: null, message: 'Autenticado, finalizando conexão...' });
    });

    socket.on('auth_failed', (reason?: string) => {
      console.error('Falha na autenticação WhatsApp:', reason);
      updateState({ status: 'auth_failed', qrCode: null, message: `Falha na autenticação: ${reason || 'Erro desconhecido'}` });
      setIsProcessingWhatsAppAction(false);
    });
    
    socket.on('disconnected', (reason?: string) => { // Evento 'disconnected' do Baileys (estado do WhatsApp)
        console.log('Evento "disconnected" (do WhatsApp) recebido do servidor Baileys:', reason);
        setIsProcessingWhatsAppAction(false); 
        let newStatus: WhatsAppConnectionStatus = 'disconnected_whatsapp';
        let newMessage = `WhatsApp desconectado. ${reason || 'Verifique o servidor.'}`;

        if (reason === 'qr_ready') {
            newStatus = 'qr_ready';
            newMessage = 'Aguardando escaneamento do QR Code.';
        } else if (reason === 'initializing') {
            newStatus = 'initializing';
            newMessage = 'Inicializando conexão com WhatsApp...';
            updateState({ status: newStatus, qrCode: null, message: newMessage}); // Limpa QR code explicitamente
            return; // Evita o updateState genérico abaixo
        } else if (reason === 'offline') { 
            newStatus = 'offline';
            newMessage = 'WhatsApp está offline. Clique para conectar.';
        } else if (reason && (typeof reason === 'string' && (reason.includes('loggedOut') || reason.includes('Usuário deslogado')))) {
            newStatus = 'auth_failed'; // Ou um novo status 'logged_out'
            newMessage = `Sessão do WhatsApp deslogada. ${reason}`;
        }
        
        updateState({ status: newStatus, qrCode: newStatus === 'qr_ready' ? whatsAppState.qrCode : null, message: newMessage });
    });

    socket.on('disconnected_whatsapp', (reason?: string) => { // Evento customizado para desconexões inesperadas do WhatsApp
        console.log('Evento "disconnected_whatsapp" recebido:', reason);
        updateState({ status: 'disconnected_whatsapp', qrCode: null, message: `WhatsApp foi desconectado: ${reason || 'Razão desconhecida'}` });
        setIsProcessingWhatsAppAction(false);
    });


    socket.on('connection_error', (errorMessage: string) => { // Erro de conexão do Baileys
        console.error('Erro na conexão com WhatsApp (do servidor):', errorMessage);
        updateState({ status: 'auth_failed', qrCode: null, message: `Erro na conexão WhatsApp: ${errorMessage}` });
        setIsProcessingWhatsAppAction(false);
    });

    socket.on('message_sent_status', (data: { to: string, message: string, status: string, error?: string, info?: string }) => {
      if (data.status === 'success') {
        console.log(`Status envio para ${data.to}: Sucesso - ${data.info}`);
        // Toast de sucesso é tratado no MessageSender.tsx
      } else {
        console.error(`Status envio para ${data.to}: Falha - ${data.error}`);
        // Toast de erro é tratado no MessageSender.tsx
      }
    });

    // Novo listener para atualizações do dashboard
    socket.on('dashboard_update', (data: DashboardData) => {
      console.log('Dashboard update recebido:', data);
      // Atualiza o estado principal e o dashboardData aninhado.
      // O status principal (online, offline, etc.) deve vir de 'dashboardData.botStatus'
      // para manter a consistência, ou podemos ter um evento de status separado.
      // Por simplicidade, vamos deixar o status principal ser atualizado por seus próprios eventos
      // e apenas atualizar o `dashboardData` aqui.
      // Se o `botStatus` em `data` for diferente do `whatsAppState.status`, pode causar confusão.
      // Idealmente, `dashboardData.botStatus` deve sempre refletir `whatsAppState.status`.
      // A função updateState já cuida disso.
      updateState({ dashboardData: data, status: data.botStatus });
    });

    socket.on('dashboard_error', (errorMessage: string) => {
        console.error('Erro no dashboard (do servidor):', errorMessage);
        updateState({ message: `Dashboard Error: ${errorMessage}` });
    });


    return () => {
      if (socketRef.current) {
        console.log('Limpando listeners e desconectando Socket.IO...');
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('connect_error');
        socketRef.current.off('qr');
        socketRef.current.off('ready');
        socketRef.current.off('authenticated');
        socketRef.current.off('auth_failed');
        socketRef.current.off('disconnected');
        socketRef.current.off('disconnected_whatsapp');
        socketRef.current.off('connection_error');
        socketRef.current.off('message_sent_status');
        socketRef.current.off('dashboard_update'); 
        socketRef.current.off('dashboard_error');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [updateState, whatsAppState.qrCode]); // Adicionado whatsAppState.qrCode para que o updateState tenha o valor mais recente de qrCode ao limpar

  const restartConnection = useCallback(() => {
    if (isProcessingWhatsAppAction) {
        console.log("Ação de conexão já em processamento.");
        return;
    }
    if (socketRef.current && socketRef.current.connected) {
      console.log('Solicitando inicialização/reinício da conexão WhatsApp...');
      setIsProcessingWhatsAppAction(true);
      updateState({ status: 'initializing', qrCode: null, message: 'Iniciando conexão com WhatsApp...' });
      socketRef.current.emit('initialize-connection');
      // O servidor deve responder com 'qr' ou 'ready' ou 'auth_failed'
      // e o estado de isProcessingWhatsAppAction será resetado nesses listeners.
      // Adicionar um timeout para resetar isProcessingWhatsAppAction caso o servidor não responda.
      setTimeout(() => {
        if(isProcessingWhatsAppAction) { // Checa se ainda está processando (não recebeu resposta)
            setIsProcessingWhatsAppAction(false);
            // Poderia atualizar o status para offline ou um erro de timeout aqui se desejado
            // updateState({status: 'offline', message: 'Timeout ao tentar (re)conectar.'});
        }
      }, 20000); // Timeout de 20 segundos
    } else {
      console.error('Socket.IO não conectado. Tentando reconectar o socket...');
      updateState({ status: 'offline', message: 'Servidor de automação desconectado. Tentando reconectar...' });
      socketRef.current?.connect(); // Tenta reconectar o socket
      setIsProcessingWhatsAppAction(false); // Reseta pois a ação principal (WhatsApp) não foi enviada
    }
  }, [updateState, isProcessingWhatsAppAction]);

  const disconnectWhatsAppClient = useCallback(() => {
    if (isProcessingWhatsAppAction) {
        console.log("Ação de conexão já em processamento.");
        return;
    }
    if (socketRef.current && socketRef.current.connected) {
      console.log('Solicitando logout do cliente WhatsApp...');
      setIsProcessingWhatsAppAction(true);
      // O status 'initializing' pode não ser o mais adequado aqui, mas é temporário
      updateState({ status: 'initializing', message: 'Desconectando do WhatsApp...' }); 
      socketRef.current.emit('disconnect-client');
       // O servidor deve responder com 'disconnected' e o status 'offline'
       // e o estado de isProcessingWhatsAppAction será resetado no listener de 'disconnected'
      setTimeout(() => {
        if(isProcessingWhatsAppAction) {
            setIsProcessingWhatsAppAction(false);
        }
      }, 10000); // Timeout de 10 segundos
    } else {
      console.error('Socket.IO não conectado.');
      setIsProcessingWhatsAppAction(false);
    }
  }, [updateState, isProcessingWhatsAppAction]);

  const sendMessage = useCallback(async (number: string, messageText: string) => {
    if (socketRef.current && socketRef.current.connected && whatsAppState.status === 'online') {
      console.log(`Enviando mensagem para ${number} via Socket.IO...`);
      return new Promise((resolve, reject) => {
        socketRef.current.emit('send-message', { to: number, message: messageText }, (response: { status: string; error?: string; info?: string}) => {
            if (response && response.status === 'success') {
                resolve(response.info || 'Mensagem enviada para a fila do servidor.');
            } else {
                reject(new Error(response?.error || 'Falha ao enviar mensagem para o servidor.'));
            }
        });
        // Adiciona um timeout para a resposta do servidor
        setTimeout(() => {
            reject(new Error('Timeout: Servidor não respondeu à solicitação de envio de mensagem.'));
        }, 10000); // 10 segundos de timeout
      });
    } else {
      const errorMsg = 'Não é possível enviar mensagem: WhatsApp não está online ou servidor desconectado.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }, [whatsAppState.status]);

  return {
    status: whatsAppState.status,
    qrCode: whatsAppState.qrCode,
    isConnecting: isProcessingWhatsAppAction,
    message: whatsAppState.message,
    dashboardData: whatsAppState.dashboardData,
    lastUpdate: whatsAppState.lastEventTimestamp,
    restartConnection,
    disconnectWhatsAppClient,
    sendMessage,
  };
};