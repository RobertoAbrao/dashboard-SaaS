// src/hooks/useWhatsAppConnection.ts
import { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

// Define os possíveis status da conexão que o frontend vai usar
export type WhatsAppConnectionStatus = 
  | 'offline' 
  | 'initializing' // Novo estado para quando o cliente pede para conectar
  | 'qr_ready' 
  | 'authenticated' // Pode ser um estado breve antes de 'online'
  | 'online' 
  | 'auth_failed'
  | 'connecting_socket'; // Estado para quando o socket está tentando conectar

interface WhatsAppState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  lastMessage: string | null; // Para mensagens de erro ou status do servidor
  timestamp: string;
}

// URL do servidor Socket.IO (mesma porta se tudo roda junto)
const SOCKET_SERVER_URL = 'http://localhost:3001';

export const useWhatsAppConnection = () => {
  const [connectionState, setConnectionState] = useState<WhatsAppState>({
    status: 'offline',
    qrCode: null,
    lastMessage: null,
    timestamp: new Date().toISOString(),
  });
  const [isConnecting, setIsConnecting] = useState(false); // Usado para desabilitar botões durante ações
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Conectar ao Socket.IO quando o hook montar
    console.log('Tentando conectar ao servidor Socket.IO...');
    setConnectionState(prev => ({ ...prev, status: 'connecting_socket', lastMessage: 'Conectando ao servidor...' }));

    const socket = io(SOCKET_SERVER_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.IO conectado com o servidor:', socket.id);
      // Ao conectar o socket, o estado inicial do WhatsApp ainda é 'offline'
      // até que uma ação seja tomada ou o servidor envie um status.
      // Se o servidor Baileys já tiver um QR ou estiver pronto, ele pode emitir imediatamente.
      setConnectionState(prev => ({ 
        ...prev, 
        // Mantém 'offline' até receber um evento específico do WhatsApp
        // ou pode mudar para 'initializing' se quisermos que o cliente peça para conectar automaticamente
        status: prev.status === 'connecting_socket' ? 'offline' : prev.status, 
        lastMessage: 'Conectado ao servidor. Aguardando status do WhatsApp.',
        timestamp: new Date().toISOString() 
      }));
      setIsConnecting(false); // Socket conectado, não necessariamente o WhatsApp
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO desconectado:', reason);
      setConnectionState({
        status: 'offline',
        qrCode: null,
        lastMessage: `Desconectado do servidor: ${reason}`,
        timestamp: new Date().toISOString(),
      });
      setIsConnecting(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Erro de conexão Socket.IO:', error);
      setConnectionState({
        status: 'offline',
        qrCode: null,
        lastMessage: `Falha ao conectar ao servidor: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      setIsConnecting(false);
    });

    // Eventos do WhatsApp vindos do servidor Baileys
    socket.on('qr', (qr: string) => {
      console.log('QR Code recebido via Socket.IO:', qr);
      setConnectionState({
        status: 'qr_ready',
        qrCode: qr,
        lastMessage: 'QR Code recebido. Escaneie com seu WhatsApp.',
        timestamp: new Date().toISOString(),
      });
      setIsConnecting(false);
    });

    socket.on('ready', () => {
      console.log('Cliente WhatsApp pronto (online) via Socket.IO');
      setConnectionState({
        status: 'online',
        qrCode: null, // Limpa o QR code pois já conectou
        lastMessage: 'WhatsApp conectado e online!',
        timestamp: new Date().toISOString(),
      });
      setIsConnecting(false);
    });

    socket.on('disconnected', (reason?: string) => {
      console.log('Cliente WhatsApp desconectado via Socket.IO:', reason);
      let newStatus: WhatsAppConnectionStatus = 'offline';
      let message = `WhatsApp desconectado.`;
      if (reason === 'loggedOut' || (typeof reason === 'string' && reason.includes('loggedOut'))) {
        newStatus = 'auth_failed'; // Ou 'offline', dependendo de como quer tratar
        message = 'Sessão do WhatsApp foi deslogada.';
      } else if (reason) {
        message += ` Motivo: ${reason}`;
      }
      
      setConnectionState({
        status: newStatus,
        qrCode: null,
        lastMessage: message,
        timestamp: new Date().toISOString(),
      });
      setIsConnecting(false);
    });
    
    socket.on('connection-error', (errorMessage: string) => {
        console.error('Erro de conexão WhatsApp do servidor:', errorMessage);
        setConnectionState(prev => ({
            ...prev,
            status: 'auth_failed',
            qrCode: null,
            lastMessage: `Falha na conexão com WhatsApp: ${errorMessage}`,
            timestamp: new Date().toISOString(),
        }));
        setIsConnecting(false);
    });
    
    socket.on('message-sent', (data: { to: string, message: string, status: string, error?: string }) => {
      if (data.status === 'success') {
        console.log(`Mensagem para ${data.to} enviada com sucesso.`);
        // Você pode usar um toast aqui se quiser, ou apenas logar.
      } else {
        console.error(`Erro ao enviar mensagem para ${data.to}: ${data.error}`);
      }
    });


    // Limpeza ao desmontar o hook
    return () => {
      if (socketRef.current) {
        console.log('Desconectando Socket.IO...');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []); // Executa apenas uma vez na montagem

  // Função para o frontend solicitar (re)inicialização da conexão WhatsApp
  const restartConnection = () => {
    if (socketRef.current && socketRef.current.connected) {
      console.log('Solicitando inicialização/reinicialização da conexão WhatsApp...');
      setIsConnecting(true);
      // Mudamos o status localmente para 'initializing' para feedback imediato
      setConnectionState(prev => ({ 
        ...prev, 
        status: 'initializing', 
        qrCode: null, 
        lastMessage: 'Iniciando conexão com WhatsApp...',
        timestamp: new Date().toISOString()
      }));
      socketRef.current.emit('initialize-connection');
    } else {
      console.error('Socket.IO não conectado. Não é possível reiniciar a conexão WhatsApp.');
      setConnectionState(prev => ({ 
        ...prev, 
        status: 'offline', 
        lastMessage: 'Servidor desconectado. Tente recarregar a página.',
        timestamp: new Date().toISOString() 
      }));
      // Tentar reconectar o socket se não estiver conectado
      if (socketRef.current?.disconnected) {
        socketRef.current.connect();
      }
    }
  };

  // Função para o frontend solicitar logout do cliente WhatsApp
  const disconnectWhatsAppClient = () => {
    if (socketRef.current && socketRef.current.connected) {
      console.log('Solicitando logout do cliente WhatsApp...');
      setIsConnecting(true); // Pode ser usado para desabilitar o botão
      socketRef.current.emit('disconnect-client');
    } else {
      console.error('Socket.IO não conectado. Não é possível deslogar.');
    }
  };
  
  const sendMessage = async (number: string, messageText: string) => {
    if (socketRef.current && socketRef.current.connected && connectionState.status === 'online') {
      console.log(`Enviando mensagem para ${number} via Socket.IO...`);
      socketRef.current.emit('send-message', { to: number, message: messageText });
      // A confirmação ou erro será tratada pelo listener 'message-sent'
    } else {
      console.error('Não é possível enviar mensagem: WhatsApp não está online ou socket desconectado.');
      throw new Error('WhatsApp não está online ou servidor desconectado.');
    }
  };

  return {
    status: connectionState.status,
    qrCode: connectionState.qrCode,
    isConnecting, // Para feedback na UI enquanto uma ação está em progresso
    lastMessage: connectionState.lastMessage,
    restartConnection,
    disconnectWhatsAppClient, // Adicione se tiver um botão de logout no frontend
    sendMessage, // Adicionado para enviar mensagens
    lastUpdate: connectionState.timestamp,
  };
};