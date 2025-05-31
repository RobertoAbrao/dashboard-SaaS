
import { useState, useEffect, useRef } from 'react';

interface WhatsAppStatus {
  status: 'offline' | 'initializing' | 'qr_ready' | 'authenticated' | 'online' | 'auth_failed';
  qrCode: string | null;
  timestamp: string;
}

export const useWhatsAppConnection = () => {
  const [connectionData, setConnectionData] = useState<WhatsAppStatus>({
    status: 'offline',
    qrCode: null,
    timestamp: new Date().toISOString()
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connectToSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('Conectando ao SSE...');
    const eventSource = new EventSource('/api/whatsapp/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('Conexão SSE aberta');
      setIsConnecting(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Dados SSE recebidos:', data);
        setConnectionData(data);
      } catch (error) {
        console.error('Erro ao analisar dados SSE:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Erro SSE:', error);
      setIsConnecting(false);
      
      // Reconectar após 3 segundos
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          console.log('Tentando reconectar SSE...');
          connectToSSE();
        }
      }, 3000);
    };
  };

  useEffect(() => {
    setIsConnecting(true);
    connectToSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const restartConnection = async () => {
    try {
      setIsConnecting(true);
      console.log('Reiniciando conexão...');
      
      const response = await fetch('/api/whatsapp/restart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao reiniciar conexão');
      }

      const result = await response.json();
      console.log(result.message);
    } catch (error) {
      console.error('Erro ao reiniciar conexão:', error);
      setIsConnecting(false);
    }
  };

  const sendMessage = async (number: string, message: string) => {
    try {
      const response = await fetch('/api/whatsapp/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number, message }),
      });

      if (!response.ok) {
        throw new Error('Falha ao enviar mensagem');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      throw error;
    }
  };

  return {
    status: connectionData.status,
    qrCode: connectionData.qrCode,
    isConnecting,
    restartConnection,
    sendMessage,
    lastUpdate: connectionData.timestamp
  };
};
