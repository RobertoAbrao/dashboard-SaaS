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

interface WhatsAppState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  message: string | null; // Para mensagens de status/erro
  lastEventTimestamp: string;
}

const SOCKET_SERVER_URL = 'http://localhost:3001';

export const useWhatsAppConnection = () => {
  const [whatsAppState, setWhatsAppState] = useState<WhatsAppState>({
    status: 'offline', // Estado inicial padrão
    qrCode: null,
    message: 'Aguardando conexão...',
    lastEventTimestamp: new Date().toISOString(),
  });
  const [isProcessingWhatsAppAction, setIsProcessingWhatsAppAction] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);

  const updateState = useCallback((partialState: Partial<WhatsAppState>) => {
    setWhatsAppState(prevState => ({
      ...prevState,
      ...partialState,
      lastEventTimestamp: new Date().toISOString(),
    }));
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
      // Não mude o status do WhatsApp aqui ainda, espere o servidor enviar o estado atual
      updateState({ 
        // Mantemos um estado genérico ou 'offline' até o servidor confirmar
        status: 'socket_connected', // Ou 'offline' se preferir que o botão já apareça
        message: 'Conectado ao servidor. Aguardando status do WhatsApp...' 
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO desconectado do servidor:', reason);
      updateState({ status: 'offline', qrCode: null, message: `Desconectado do servidor de automação: ${reason}` });
      setIsProcessingWhatsAppAction(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Falha na conexão Socket.IO:', error);
      updateState({ status: 'offline', qrCode: null, message: `Falha ao conectar ao servidor: ${error.message}` });
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
    
    // Este listener trata o evento 'disconnected' emitido pelo *servidor Baileys*
    // para indicar o estado da conexão WhatsApp.
    socket.on('disconnected', (reason?: string) => {
        console.log('Evento "disconnected" (do WhatsApp) recebido do servidor Baileys:', reason);
        setIsProcessingWhatsAppAction(false); // Reseta o estado de processamento
        if (reason === 'qr_ready') {
            updateState({ status: 'qr_ready', message: 'Aguardando escaneamento do QR Code.'});
        } else if (reason === 'initializing') {
            updateState({ status: 'initializing', qrCode: null, message: 'Inicializando conexão com WhatsApp...'});
        } else if (reason === 'offline') { // Quando o servidor nos diz que está offline
            updateState({ status: 'offline', qrCode: null, message: 'WhatsApp está offline. Clique para conectar.' });
        } else if (reason && (typeof reason === 'string' && (reason.includes('loggedOut') || reason.includes('Usuário deslogado')))) {
            updateState({ status: 'auth_failed', qrCode: null, message: `Sessão do WhatsApp deslogada. ${reason}` });
        } else {
            // Para outras razões de desconexão do WhatsApp ou se a razão for genérica
            updateState({ status: 'disconnected_whatsapp', qrCode: null, message: `WhatsApp desconectado. ${reason || 'Verifique o servidor.'}` });
        }
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
        socketRef.current.off('disconnected'); // Listener para o evento 'disconnected' do Baileys
        socketRef.current.off('connection_error');
        socketRef.current.off('message_sent_status');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [updateState]);

  const restartConnection = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      console.log('Solicitando inicialização/reinício da conexão WhatsApp...');
      setIsProcessingWhatsAppAction(true);
      updateState({ status: 'initializing', qrCode: null, message: 'Iniciando conexão com WhatsApp...' });
      socketRef.current.emit('initialize-connection');
    } else {
      console.error('Socket.IO não conectado. Tentando reconectar o socket...');
      updateState({ status: 'offline', message: 'Servidor de automação desconectado. Tentando reconectar...' });
      socketRef.current?.connect();
    }
  }, [updateState]);

  const disconnectWhatsAppClient = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      console.log('Solicitando logout do cliente WhatsApp...');
      setIsProcessingWhatsAppAction(true);
      updateState({ status: 'initializing', message: 'Desconectando do WhatsApp...' });
      socketRef.current.emit('disconnect-client');
    } else {
      console.error('Socket.IO não conectado.');
    }
  }, [updateState]);

  const sendMessage = useCallback(async (number: string, messageText: string) => {
    if (socketRef.current && socketRef.current.connected && whatsAppState.status === 'online') {
      console.log(`Enviando mensagem para ${number} via Socket.IO...`);
      socketRef.current.emit('send-message', { to: number, message: messageText });
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
    restartConnection,
    disconnectWhatsAppClient,
    sendMessage,
    lastUpdate: whatsAppState.lastEventTimestamp,
  };
};