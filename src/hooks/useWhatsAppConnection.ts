
import { useState, useEffect, useRef } from 'react';

interface WhatsAppStatus {
  status: 'offline' | 'initializing' | 'qr_ready' | 'authenticated' | 'online' | 'auth_failed';
  qrCode: string | null;
  timestamp: string;
}

// Mock QR Code para desenvolvimento
const MOCK_QR_CODE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const useWhatsAppConnection = () => {
  const [connectionData, setConnectionData] = useState<WhatsAppStatus>({
    status: 'offline',
    qrCode: null,
    timestamp: new Date().toISOString()
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Detectar se está em desenvolvimento
  const isDevelopment = window.location.hostname === 'localhost' || 
                       window.location.hostname.includes('lovableproject.com') ||
                       !window.location.hostname.includes('localhost:3001');

  const connectToSSE = () => {
    // Se estiver em desenvolvimento, usar dados mock
    if (isDevelopment) {
      console.log('Modo desenvolvimento detectado - usando dados mock');
      setIsConnecting(true);
      
      // Simular inicialização
      setTimeout(() => {
        setConnectionData({
          status: 'initializing',
          qrCode: null,
          timestamp: new Date().toISOString()
        });
      }, 1000);

      // Simular QR code após 3 segundos
      setTimeout(() => {
        setConnectionData({
          status: 'qr_ready',
          qrCode: generateMockQRCode(),
          timestamp: new Date().toISOString()
        });
        setIsConnecting(false);
      }, 3000);
      
      return;
    }

    // Código original para produção
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

  const generateMockQRCode = () => {
    // Gerar um QR code simples para demonstração
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Criar um padrão simples que simula um QR code
      ctx.fillStyle = '#000000';
      for (let i = 0; i < 200; i += 10) {
        for (let j = 0; j < 200; j += 10) {
          if (Math.random() > 0.5) {
            ctx.fillRect(i, j, 8, 8);
          }
        }
      }
      
      // Adicionar bordas
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, 200, 200);
      ctx.strokeRect(10, 10, 30, 30);
      ctx.strokeRect(160, 10, 30, 30);
      ctx.strokeRect(10, 160, 30, 30);
    }
    
    return canvas.toDataURL();
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
      
      if (isDevelopment) {
        // Simular restart em desenvolvimento
        setConnectionData({
          status: 'initializing',
          qrCode: null,
          timestamp: new Date().toISOString()
        });
        
        setTimeout(() => {
          setConnectionData({
            status: 'qr_ready',
            qrCode: generateMockQRCode(),
            timestamp: new Date().toISOString()
          });
          setIsConnecting(false);
        }, 2000);
        
        return;
      }

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
      if (isDevelopment) {
        // Simular envio em desenvolvimento
        console.log(`[MOCK] Enviando mensagem para ${number}: ${message}`);
        return { success: true, message: 'Mensagem enviada (simulação)' };
      }

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
    lastUpdate: connectionData.timestamp,
    isDevelopment
  };
};