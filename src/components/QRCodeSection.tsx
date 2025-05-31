// src/components/QRCodeSection.tsx
import { useEffect, useState } from 'react'; // Adicionado useEffect e useState
import QRCode from 'qrcode'; // Importar a biblioteca qrcode
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode as QrCodeIcon, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'; // Renomeado QrCode para QrCodeIcon para evitar conflito
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection';

const QRCodeSection = () => {
  const { status, qrCode: qrCodeStringFromHook, isConnecting, message, restartConnection } = useWhatsAppConnection();
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string | null>(null); // Estado para o Data URL da imagem

  useEffect(() => {
    if (qrCodeStringFromHook && status === 'qr_ready') {
      QRCode.toDataURL(qrCodeStringFromHook, { width: 256, margin: 1, errorCorrectionLevel: 'L' }, (err, url) => {
        if (err) {
          console.error('Erro ao gerar QR Code Data URL:', err);
          setQrCodeDataURL(null);
        } else {
          setQrCodeDataURL(url);
        }
      });
    } else {
      setQrCodeDataURL(null); // Limpa se não houver string de QR ou status não for qr_ready
    }
  }, [qrCodeStringFromHook, status]); // Re-executa quando a string do QR ou o status mudam

  const getStatusDisplay = () => {
    switch (status) {
      case 'online':
        return {
          icon: CheckCircle,
          title: '✅ Conectado com Sucesso!',
          description: message || 'Seu bot está ativo e pronto.',
          bgColor: 'bg-green-100',
          iconColor: 'text-green-600'
        };
      case 'qr_ready':
        return {
          icon: QrCodeIcon, // Usando o ícone renomeado
          title: '📱 Escaneie com WhatsApp',
          description: message || 'Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo',
          bgColor: 'bg-blue-100',
          iconColor: 'text-blue-600'
        };
      case 'initializing':
      case 'connecting_socket':
      case 'socket_connected': // Estados onde o QR ainda não está pronto
        return {
          icon: Loader2,
          title: '🔄 Conectando...',
          description: message || 'Aguarde enquanto preparamos a conexão.',
          bgColor: 'bg-gray-100',
          iconColor: 'text-gray-600'
        };
      case 'authenticated':
        return {
          icon: Loader2,
          title: '🔐 Autenticando...',
          description: message || 'Finalizando processo de autenticação.',
          bgColor: 'bg-yellow-100',
          iconColor: 'text-yellow-600'
        };
      case 'auth_failed':
      case 'disconnected_whatsapp': // Tratar desconexão do WhatsApp também
        return {
          icon: AlertCircle,
          title: status === 'auth_failed' ? '❌ Falha na Conexão' : '🔌 Desconectado do WhatsApp',
          description: message || 'Clique em "Gerar QR Code" para tentar novamente.',
          bgColor: 'bg-red-100',
          iconColor: 'text-red-600'
        };
      default: // offline
        return {
          icon: AlertCircle,
          title: '🔄 Desconectado',
          description: message || 'Clique em "Gerar QR Code" para conectar.',
          bgColor: 'bg-gray-100',
          iconColor: 'text-gray-400'
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* QR Code Card */}
      <Card className="lg:col-span-1">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center space-x-2">
            <QrCodeIcon className="h-6 w-6 text-green-600" /> {/* Usando o ícone renomeado */}
            <span>Conectar WhatsApp</span>
          </CardTitle>
          <CardDescription>
            {status === 'online' 
              ? 'Seu bot está conectado e funcionando!'
              : status === 'qr_ready' && qrCodeDataURL
              ? 'Escaneie o QR Code abaixo com seu WhatsApp'
              : statusDisplay.description 
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6 min-h-[300px] justify-center">
          {status === 'online' ? (
            <div className="text-center space-y-4">
              <div className={`w-32 h-32 ${statusDisplay.bgColor} rounded-full flex items-center justify-center`}>
                <StatusIcon className={`h-16 w-16 ${statusDisplay.iconColor}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-800">{statusDisplay.title}</h3>
                <p className="text-sm text-gray-600 mt-2">
                  {statusDisplay.description}
                </p>
              </div>
            </div>
          ) : status === 'qr_ready' && qrCodeDataURL ? ( // Verifica se qrCodeDataURL está pronto
            <div className="text-center space-y-4">
              <div className="bg-white p-2 rounded-lg shadow-lg inline-block"> {/* Diminuído padding se necessário */}
                <img 
                  src={qrCodeDataURL} 
                  alt="QR Code para conectar WhatsApp" 
                  className="w-56 h-56 mx-auto" // Ajuste o tamanho conforme necessário
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{statusDisplay.title}</h3>
                <p className="text-sm text-gray-600 mt-2">
                  {statusDisplay.description}
                </p>
              </div>
              <Button 
                onClick={restartConnection}
                variant="outline"
                disabled={isConnecting}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isConnecting ? 'animate-spin' : ''}`} />
                <span>Gerar Novo QR Code</span>
              </Button>
            </div>
          ) : ( // Para 'offline', 'initializing', 'auth_failed', 'disconnected_whatsapp', ou 'qr_ready' sem qrCodeDataURL ainda
            <div className="text-center space-y-4">
              <div className={`w-32 h-32 ${statusDisplay.bgColor} rounded-full flex items-center justify-center`}>
                <StatusIcon className={`h-16 w-16 ${statusDisplay.iconColor} ${(status === 'initializing' || status === 'authenticated' || status === 'connecting_socket' || status === 'socket_connected' || (status === 'qr_ready' && !qrCodeDataURL)) ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-600">{statusDisplay.title}</h3>
                <p className="text-sm text-gray-500 mt-2">
                  {statusDisplay.description}
                </p>
              </div>
              {(status === 'offline' || status === 'auth_failed' || status === 'disconnected_whatsapp') && (
                <Button 
                  onClick={restartConnection}
                  disabled={isConnecting}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
                >
                  <RefreshCw className={`h-4 w-4 ${isConnecting ? 'animate-spin' : ''}`} />
                  <span>Gerar QR Code</span>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions Card (mantém o mesmo) */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Como Conectar</CardTitle>
          <CardDescription>
            Siga estes passos simples para conectar seu WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                1
              </div>
              <div>
                <h4 className="font-semibold">Abra o WhatsApp no seu celular</h4>
                <p className="text-sm text-gray-600">Certifique-se de estar usando a versão mais recente</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div>
                <h4 className="font-semibold">Vá para "Dispositivos Conectados"</h4>
                <p className="text-sm text-gray-600">Menu → Dispositivos conectados (ou ⋮ → WhatsApp Web)</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div>
                <h4 className="font-semibold">Toque em "Conectar dispositivo"</h4>
                <p className="text-sm text-gray-600">Selecione a opção para escanear QR Code</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                4
              </div>
              <div>
                <h4 className="font-semibold">Escaneie o QR Code</h4>
                <p className="text-sm text-gray-600">Aponte a câmera para o código exibido ao lado</p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h5 className="font-semibold text-blue-800">Dica Importante</h5>
                <p className="text-sm text-blue-600">
                  Mantenha seu celular próximo e com boa conexão de internet para garantir 
                  que o bot funcione corretamente.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QRCodeSection;