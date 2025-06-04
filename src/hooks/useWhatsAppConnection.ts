// src/hooks/useWhatsAppConnection.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

export type WhatsAppConnectionStatus =
  | 'offline'
  | 'connecting_socket'
  | 'socket_connected'
  | 'initializing'
  | 'qr_ready'
  | 'authenticated'
  | 'online'
  | 'auth_failed'
  | 'disconnected_whatsapp';

export interface ActivityLogEntry {
    message: string;
    timestamp: string;
}

export interface DashboardData {
  messagesSent: number;
  connections: number;
  botStatus: WhatsAppConnectionStatus;
  recentActivity: ActivityLogEntry[];
}

// Nova interface para informações de mídia
export interface MediaInfo {
  serverFilePath: string; // Caminho do arquivo no servidor, retornado pelo endpoint de upload
  originalName: string;   // Nome original do arquivo
  mimetype: string;       // Mimetype do arquivo
  caption?: string;        // Legenda para a mídia
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
        dashboardData: {
          ...prevState.dashboardData,
          ...(partialState.dashboardData || {}),
          botStatus: newStatus, 
          connections: newStatus === 'online' ? 1 : 0,
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
    
    socket.on('disconnected', (reason?: string) => {
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
            updateState({ status: newStatus, qrCode: null, message: newMessage});
            return;
        } else if (reason === 'offline') { 
            newStatus = 'offline';
            newMessage = 'WhatsApp está offline. Clique para conectar.';
        } else if (reason && (typeof reason === 'string' && (reason.includes('loggedOut') || reason.includes('Usuário deslogado')))) {
            newStatus = 'auth_failed';
            newMessage = `Sessão do WhatsApp deslogada. ${reason}`;
        }
        
        updateState({ status: newStatus, qrCode: newStatus === 'qr_ready' ? whatsAppState.qrCode : null, message: newMessage });
    });

    socket.on('disconnected_whatsapp', (reason?: string) => {
        console.log('Evento "disconnected_whatsapp" recebido:', reason);
        updateState({ status: 'disconnected_whatsapp', qrCode: null, message: `WhatsApp foi desconectado: ${reason || 'Razão desconhecida'}` });
        setIsProcessingWhatsAppAction(false);
    });

    socket.on('connection_error', (errorMessage: string) => {
        console.error('Erro na conexão com WhatsApp (do servidor):', errorMessage);
        updateState({ status: 'auth_failed', qrCode: null, message: `Erro na conexão WhatsApp: ${errorMessage}` });
        setIsProcessingWhatsAppAction(false);
    });

    socket.on('message_sent_status', (data: { to: string, message: string, status: string, error?: string, info?: string }) => {
      if (data.status === 'success') {
        console.log(`Status envio para ${data.to}: Sucesso - ${data.info}`);
      } else {
        console.error(`Status envio para ${data.to}: Falha - ${data.error}`);
      }
    });

    socket.on('dashboard_update', (data: DashboardData) => {
      console.log('Dashboard update recebido:', data);
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
  }, [updateState, whatsAppState.qrCode]);

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
      setTimeout(() => {
        if(isProcessingWhatsAppAction) {
            setIsProcessingWhatsAppAction(false);
        }
      }, 20000);
    } else {
      console.error('Socket.IO não conectado. Tentando reconectar o socket...');
      updateState({ status: 'offline', message: 'Servidor de automação desconectado. Tentando reconectar...' });
      socketRef.current?.connect();
      setIsProcessingWhatsAppAction(false);
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
      updateState({ status: 'initializing', message: 'Desconectando do WhatsApp...' }); 
      socketRef.current.emit('disconnect-client');
      setTimeout(() => {
        if(isProcessingWhatsAppAction) {
            setIsProcessingWhatsAppAction(false);
        }
      }, 10000);
    } else {
      console.error('Socket.IO não conectado.');
      setIsProcessingWhatsAppAction(false);
    }
  }, [updateState, isProcessingWhatsAppAction]);

  // MODIFICADO: sendMessage agora aceita mediaInfo opcional
  const sendMessage = useCallback(async (number: string, messageText: string, mediaInfo?: MediaInfo) => {
    if (socketRef.current && socketRef.current.connected && whatsAppState.status === 'online') {
      const payload = {
        to: number,
        message: messageText, // Esta será a legenda se mediaInfo for fornecido, ou a mensagem principal
        mediaInfo: mediaInfo // Contém serverFilePath, originalName, mimetype, caption (caption aqui pode ser redundante se messageText for usado como legenda)
      };
      console.log(`Enviando mensagem para ${number} via Socket.IO com payload:`, payload);
      
      return new Promise((resolve, reject) => {
        socketRef.current.emit('send-message', payload, (response: { status: string; error?: string; info?: string}) => {
            if (response && response.status === 'success') {
                resolve(response.info || 'Mensagem enviada para a fila do servidor.');
            } else {
                reject(new Error(response?.error || 'Falha ao enviar mensagem para o servidor.'));
            }
        });
        // Timeout para a resposta do servidor
        setTimeout(() => {
            reject(new Error('Timeout: Servidor não respondeu à solicitação de envio de mensagem.'));
        }, 15000); // Aumentado o timeout para acomodar possível processamento de mídia
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
    socketRef,
    restartConnection,
    disconnectWhatsAppClient,
    sendMessage, // sendMessage agora está atualizado
  };
};
