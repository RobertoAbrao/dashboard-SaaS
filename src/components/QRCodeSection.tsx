// src/components/QRCodeSection.tsx
import { useState, useEffect } from 'react'; // ALTERADO: Importando useEffect
import QRCode from 'qrcode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, Smartphone, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection';
import { useAuth } from '@/App';
import { useToast } from '@/components/ui/use-toast';

const QRCodeSection = () => {
  const { status, qrCode, message, pairingCode, requestPairingCode, restartConnection } = useWhatsAppConnection();
  const { user } = useAuth(); // Este hook não está sendo usado, mas pode ser útil no futuro.
  const { toast } = useToast();
  
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isRequestingCode, setIsRequestingCode] = useState(false);

  // CORRIGIDO: Troca de useState para useEffect para lidar com a geração do QR Code.
  // Isso é um "efeito colateral" que deve ocorrer quando o `qrCode` mudar.
  useEffect(() => {
    if (qrCode) {
      QRCode.toDataURL(qrCode, { width: 256, margin: 1 })
        .then(setQrCodeDataURL)
        .catch(err => console.error('Erro ao gerar QR Code:', err));
    } else {
      setQrCodeDataURL(null);
    }
  }, [qrCode]); // A dependência [qrCode] garante que isso rode sempre que um novo QR chegar.

  const handleRequestPairingCode = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
        toast({ title: "Número Inválido", description: "Por favor, insira um número de WhatsApp válido com DDD.", variant: "destructive" });
        return;
    }
    setIsRequestingCode(true);
    await requestPairingCode(phoneNumber);
    setIsRequestingCode(false);
  };

  const getStatusDisplay = () => {
    switch (status) {
      case 'online':
        return { icon: CheckCircle, title: 'Conectado com Sucesso!', description: message || 'Seu bot está ativo.', bgColor: 'bg-green-100', iconColor: 'text-green-600' };
      case 'pairing':
         return { icon: Loader2, title: 'Aguardando Código...', description: 'Digite o código no seu celular.', bgColor: 'bg-blue-100', iconColor: 'text-blue-600', spin: true };
      case 'qr_ready':
        return { icon: QrCode, title: 'Escaneie com WhatsApp', description: 'Abra o WhatsApp e escaneie o código.', bgColor: 'bg-blue-100', iconColor: 'text-blue-600' };
      case 'initializing':
      case 'socket_authenticated':
        return { icon: Loader2, title: 'Conectando...', description: message || 'Aguarde...', bgColor: 'bg-gray-100', iconColor: 'text-gray-600', spin: true };
      default: // offline, auth_failed, disconnected_whatsapp
        return { icon: AlertCircle, title: 'Desconectado', description: message || 'Inicie a conexão para começar.', bgColor: 'bg-red-100', iconColor: 'text-red-600' };
    }
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center space-x-2">
            <Smartphone className="h-6 w-6 text-green-600" />
            <span>Conectar WhatsApp</span>
          </CardTitle>
          <CardDescription>Use o código de pareamento para uma conexão mais estável.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6 min-h-[300px] justify-center">
          {status === 'online' ? (
             <div className="text-center space-y-4">
              <div className={`w-32 h-32 ${statusDisplay.bgColor} rounded-full flex items-center justify-center`}>
                <StatusIcon className={`h-16 w-16 ${statusDisplay.iconColor}`} />
              </div>
              <h3 className="text-lg font-semibold text-green-800">{statusDisplay.title}</h3>
            </div>
          ) : pairingCode ? (
            <div className="text-center space-y-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">No seu celular, vá em Aparelhos Conectados &gt; Conectar com número e insira o código abaixo:</p>
                <div className="bg-white p-4 rounded-lg shadow-inner">
                    <p className="text-4xl font-bold tracking-widest text-blue-600">{pairingCode}</p>
                </div>
                <p className="text-xs text-gray-500">Aguardando confirmação no celular...</p>
            </div>
          ) : qrCodeDataURL ? (
            <div className="text-center space-y-4">
              <img src={qrCodeDataURL} alt="QR Code" className="w-56 h-56 mx-auto rounded-lg shadow-md" />
              <p className="text-sm text-gray-600">Ou escaneie o QR Code, se preferir.</p>
            </div>
          ) : (
            <div className="w-full max-w-sm space-y-4">
              <p className="text-center text-sm text-gray-600">
                Digite o número do WhatsApp (com DDD) que você usará para o bot e clique em gerar código.
              </p>
              <div>
                <Input
                  type="tel"
                  placeholder="Ex: 11999998888"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                  disabled={isRequestingCode || status === 'initializing'}
                />
              </div>
              <Button onClick={handleRequestPairingCode} disabled={isRequestingCode || !phoneNumber || status === 'initializing'} className="w-full bg-blue-600 hover:bg-blue-700">
                {isRequestingCode || status === 'initializing' ? <Loader2 className="animate-spin mr-2" /> : <QrCode className="mr-2" />}
                {isRequestingCode || status === 'initializing' ? 'Gerando Código...' : 'Gerar Código de Conexão'}
              </Button>
              <Button onClick={restartConnection} variant="outline" className="w-full">
                <RefreshCw className="mr-2" />
                Tentar Reconectar Sessão Existente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Card de Instruções */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Como Conectar (Novo Método)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
              <div>
                <h4 className="font-semibold">Digite o Número do Bot</h4>
                <p className="text-sm text-gray-600">No campo ao lado, insira o número do WhatsApp (com DDD) que será automatizado.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
              <div>
                <h4 className="font-semibold">Gere o Código</h4>
                <p className="text-sm text-gray-600">Clique em "Gerar Código". Um código de 8 dígitos aparecerá na tela.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
              <div>
                <h4 className="font-semibold">Abra o WhatsApp no Celular</h4>
                <p className="text-sm text-gray-600">Vá em Configurações &gt; Aparelhos Conectados.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">4</div>
              <div>
                <h4 className="font-semibold">Conecte com Número</h4>
                <p className="text-sm text-gray-600">Toque em "Conectar um aparelho" e depois em "Conectar com número de telefone". Digite o código gerado.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QRCodeSection;
