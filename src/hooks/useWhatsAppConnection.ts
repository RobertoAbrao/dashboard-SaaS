// src/hooks/useWhatsAppConnection.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAuth } from '@/App';

// Tipos...
export type WhatsAppConnectionStatus = 'offline' | 'connecting_socket' | 'socket_authenticated' | 'initializing' | 'qr_ready' | 'online' | 'auth_failed' | 'disconnected_whatsapp' | 'pairing';
export interface ActivityLogEntry { message: string; timestamp: string; }
export interface DashboardData { messagesSent: number; connections: number; botStatus: WhatsAppConnectionStatus; recentActivity: ActivityLogEntry[]; }

interface WhatsAppState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  pairingCode: string | null;
  message: string | null;
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
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  const [whatsAppState, setWhatsAppState] = useState<WhatsAppState>({
    status: 'offline',
    qrCode: null,
    pairingCode: null,
    message: 'Aguardando autenticação...',
    dashboardData: initialDashboardData,
  });

  const connectSocket = useCallback(async () => {
    if (!user || socketRef.current?.connected) return;

    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', async () => {
      const token = await user.getIdToken();
      socket.emit('authenticate', token);
      setWhatsAppState(prev => ({ ...prev, status: 'socket_authenticated' }));
    });

    socket.on('disconnect', () => {
      setWhatsAppState(prev => ({...prev, status: 'offline', message: 'Desconectado do servidor.'}));
    });
    
    // Listeners de eventos
    socket.on('qr', (qr: string) => setWhatsAppState(prev => ({...prev, status: 'qr_ready', qrCode: qr, pairingCode: null})));
    socket.on('ready', () => setWhatsAppState(prev => ({...prev, status: 'online', qrCode: null, pairingCode: null, message: 'Conectado!' })));
    socket.on('disconnected', (reason: string) => setWhatsAppState(prev => ({...prev, status: 'disconnected_whatsapp', message: `Sessão encerrada: ${reason}` })));
    socket.on('pairing_code', (code: string) => setWhatsAppState(prev => ({...prev, status: 'pairing', pairingCode: code, qrCode: null, message: 'Aguardando confirmação no celular.'})));
    socket.on('dashboard_update', (data: DashboardData) => setWhatsAppState(prev => ({...prev, dashboardData: data, status: data.botStatus })));

  }, [user]);

  useEffect(() => {
    if (user) {
      connectSocket();
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setWhatsAppState({ status: 'offline', qrCode: null, pairingCode: null, message: 'Usuário deslogado.', dashboardData: initialDashboardData });
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user, connectSocket]);

  const restartConnection = useCallback(async () => {
    if (!user) return;
    setWhatsAppState(prev => ({...prev, status: 'initializing'}));
    const token = await user.getIdToken();
    await fetch('http://localhost:3001/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
  }, [user]);

  const requestPairingCode = useCallback(async (phoneNumber: string) => {
    if (!user) return;
    setWhatsAppState(prev => ({...prev, status: 'initializing', message: 'Gerando código...'}));
    const token = await user.getIdToken();
    await fetch('http://localhost:3001/api/whatsapp/request-pairing-code', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phoneNumber })
    });
  }, [user]);

  return {
    ...whatsAppState,
    socketRef, // CORREÇÃO: Adicionando o socketRef ao objeto retornado
    restartConnection,
    requestPairingCode,
  };
};
