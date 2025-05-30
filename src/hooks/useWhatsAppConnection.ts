
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

    const eventSource = new EventSource('http://localhost:3001/api/whatsapp/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connection opened');
      setIsConnecting(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setConnectionData(data);
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setIsConnecting(false);
      
      // Reconnect after 5 seconds
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          connectToSSE();
        }
      }, 5000);
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
      const response = await fetch('http://localhost:3001/api/whatsapp/restart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to restart connection');
      }

      const result = await response.json();
      console.log(result.message);
    } catch (error) {
      console.error('Error restarting connection:', error);
      setIsConnecting(false);
    }
  };

  const sendMessage = async (number: string, message: string) => {
    try {
      const response = await fetch('http://localhost:3001/api/whatsapp/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number, message }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
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
