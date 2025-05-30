import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'; // Adicionado Loader2
import { useState, useEffect } from 'react';

interface QRCodeSectionProps {
  qrCode: string | null;
  botStatus: 'online' | 'offline';
  statusMessage: string; // Nova prop para a mensagem de status detalhada
}

const QRCodeSection = ({ qrCode, botStatus, statusMessage }: QRCodeSectionProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false); // Manter para um futuro botão de refresh

  // Simulação de lógica de refresh, pode ser adaptada para chamar uma API no futuro
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Aqui você poderia, por exemplo, emitir um evento via socket para o backend solicitar um novo QR
    console.log("Solicitando novo QR Code ao backend..."); // Placeholder
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  const getQrCardDescription = () => {
    if (botStatus === 'online') {
      return 'Seu bot está conectado e funcionando!';
    }
    if (qrCode) {
      return statusMessage || 'Escaneie o QR Code abaixo com seu WhatsApp.';
    }
    return statusMessage || 'Aguardando QR Code ou status do bot...';
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
            {getQrCardDescription()}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6 min-h-[300px] justify-center">
          {botStatus === 'online' ? (
            <div className="text-center space-y-4">
              <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-800">✅ Conectado com Sucesso!</h3>
                <p className="text-sm text-gray-600 mt-1">{statusMessage}</p>
              </div>
            </div>
          ) : qrCode ? (
            <div className="text-center space-y-4">
              <div className="bg-white p-2 rounded-lg shadow-lg inline-block">
                <img
                  src={qrCode}
                  alt="QR Code para conectar WhatsApp"
                  className="w-48 h-48 md:w-56 md:h-56 mx-auto" // Aumentado um pouco
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold">📱 Escaneie com WhatsApp</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Abra o WhatsApp → Configurações → Dispositivos conectados → Conectar um aparelho
                </p>
              </div>
              <Button
                onClick={handleRefresh}
                variant="outline"
                disabled={isRefreshing} // Desabilitar se o backend não tiver refresh manual
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? "Atualizando..." : "Atualizar QR Code"}</span>
              </Button>
               <p className="text-xs text-gray-500 mt-2 px-4">
                Se o QR Code não aparecer ou parecer inválido, tente atualizar.
              </p>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center">
                <Loader2 className="h-16 w-16 text-gray-400 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-600">Aguardando Conexão...</h3>
                <p className="text-sm text-gray-500 mt-1">{statusMessage}</p>
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
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <div>
                <h4 className="font-semibold">Abra o WhatsApp no seu celular</h4>
                <p className="text-sm text-gray-600">Certifique-se de que está atualizado.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <div>
                <h4 className="font-semibold">Vá para "Dispositivos Conectados"</h4>
                <p className="text-sm text-gray-600">No menu (⋮ ou Configurações).</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">3</div>
              <div>
                <h4 className="font-semibold">Toque em "Conectar um aparelho"</h4>
                <p className="text-sm text-gray-600">Pode ser necessário autenticar.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">4</div>
              <div>
                <h4 className="font-semibold">Escaneie o QR Code</h4>
                <p className="text-sm text-gray-600">Aponte a câmera para o código exibido nesta tela.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <h5 className="font-semibold text-blue-800">Dica Importante</h5>
                <p className="text-sm text-blue-600">
                  Mantenha seu celular conectado à internet para que o bot funcione corretamente.
                  Se a conexão cair, o QR Code poderá ser exibido novamente.
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