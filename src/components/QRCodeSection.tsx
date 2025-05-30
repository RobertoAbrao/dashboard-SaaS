
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface QRCodeSectionProps {
  qrCode: string | null;
  botStatus: 'online' | 'offline';
}

const QRCodeSection = ({ qrCode, botStatus }: QRCodeSectionProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

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
            {botStatus === 'online' 
              ? 'Seu bot está conectado e funcionando!'
              : 'Escaneie o QR Code abaixo com seu WhatsApp'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          {botStatus === 'online' ? (
            <div className="text-center space-y-4">
              <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-800">✅ Conectado com Sucesso!</h3>
                <p className="text-sm text-gray-600 mt-2">
                  Seu bot está ativo e pronto para enviar mensagens
                </p>
              </div>
            </div>
          ) : qrCode ? (
            <div className="text-center space-y-4">
              <div className="bg-white p-4 rounded-lg shadow-lg inline-block">
                <img 
                  src={qrCode} 
                  alt="QR Code para conectar WhatsApp" 
                  className="w-48 h-48 mx-auto"
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold">📱 Escaneie com WhatsApp</h3>
                <p className="text-sm text-gray-600 mt-2">
                  Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
                </p>
              </div>
              <Button 
                onClick={handleRefresh}
                variant="outline"
                disabled={isRefreshing}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Atualizar QR Code</span>
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-16 w-16 text-gray-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-600">🔄 Gerando QR Code...</h3>
                <p className="text-sm text-gray-500 mt-2">
                  Aguarde enquanto preparamos a conexão
                </p>
              </div>
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
