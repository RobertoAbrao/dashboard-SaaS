import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection';

const QRCodeSection = () => {
  const { status, qrCode, isConnecting, restartConnection } = useWhatsAppConnection();

  const getStatusDisplay = () => {
    switch (status) {
      case 'online':
        return {
          icon: CheckCircle,
          title: '✅ Conectado com Sucesso!',
          description: 'Seu bot está ativo e pronto para enviar mensagens',
          bgColor: 'bg-green-100',
          iconColor: 'text-green-600'
        };
      case 'qr_ready':
        return {
          icon: QrCode,
          title: '📱 Escaneie com WhatsApp',
          description: 'Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo',
          bgColor: 'bg-blue-100',
          iconColor: 'text-blue-600'
        };
      case 'initializing':
        return {
          icon: Loader2,
          title: '🔄 Inicializando...',
          description: 'Preparando conexão com WhatsApp',
          bgColor: 'bg-gray-100',
          iconColor: 'text-gray-600'
        };
      case 'authenticated':
        return {
          icon: Loader2,
          title: '🔐 Autenticando...',
          description: 'Finalizando processo de autenticação',
          bgColor: 'bg-yellow-100',
          iconColor: 'text-yellow-600'
        };
      case 'auth_failed':
        return {
          icon: AlertCircle,
          title: '❌ Falha na Autenticação',
          description: 'Erro ao conectar. Clique em "Gerar Novo QR Code" para tentar novamente',
          bgColor: 'bg-red-100',
          iconColor: 'text-red-600'
        };
      default:
        return {
          icon: AlertCircle,
          title: '🔄 Desconectado',
          description: 'Clique em "Gerar QR Code" para conectar',
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
            <QrCode className="h-6 w-6 text-green-600" />
            <span>Conectar WhatsApp</span>
          </CardTitle>
          <CardDescription>
            {status === 'online' 
              ? 'Seu bot está conectado e funcionando!'
              : 'Escaneie o QR Code abaixo com seu WhatsApp'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
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
          ) : qrCode && status === 'qr_ready' ? (
            <div className="text-center space-y-4">
              <div className="bg-white p-4 rounded-lg shadow-lg inline-block">
                <img 
                  src={qrCode} 
                  alt="QR Code para conectar WhatsApp" 
                  className="w-48 h-48 mx-auto"
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
          ) : (
            <div className="text-center space-y-4">
              <div className={`w-32 h-32 ${statusDisplay.bgColor} rounded-full flex items-center justify-center`}>
                <StatusIcon className={`h-16 w-16 ${statusDisplay.iconColor} ${status === 'initializing' || status === 'authenticated' ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-600">{statusDisplay.title}</h3>
                <p className="text-sm text-gray-500 mt-2">
                  {statusDisplay.description}
                </p>
              </div>
              {(status === 'offline' || status === 'auth_failed') && (
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

      {/* Instructions Card */}
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
