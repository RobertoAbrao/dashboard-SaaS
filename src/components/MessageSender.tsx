
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MessageSenderProps {
  onMessageSent: () => void;
  botStatus: 'online' | 'offline';
}

const MessageSender = ({ onMessageSent, botStatus }: MessageSenderProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleSendMessage = async () => {
    if (!phoneNumber || !message) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha o número e a mensagem.",
        variant: "destructive",
      });
      return;
    }

    if (botStatus === 'offline') {
      toast({
        title: "Bot offline",
        description: "Conecte o bot primeiro para enviar mensagens.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      // Simulação de envio de mensagem
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      onMessageSent();
      toast({
        title: "Mensagem enviada!",
        description: `Mensagem enviada para ${phoneNumber} com sucesso.`,
      });
      
      setPhoneNumber('');
      setMessage('');
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description: "Não foi possível enviar a mensagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatPhoneNumber = (value: string) => {
    // Remove tudo que não for número
    const numbers = value.replace(/\D/g, '');
    
    // Formata como (XX) XXXXX-XXXX
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (match, p1, p2, p3) => {
        let formatted = '';
        if (p1) formatted += `(${p1}`;
        if (p2) formatted += `) ${p2}`;
        if (p3) formatted += `-${p3}`;
        return formatted;
      });
    }
    
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Message Form */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <span>Enviar Mensagem</span>
          </CardTitle>
          <CardDescription>
            Envie mensagens diretamente pelo seu bot WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Alert */}
          {botStatus === 'offline' && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="text-sm text-red-800">
                Bot desconectado. Conecte o bot primeiro na aba "QR Code".
              </span>
            </div>
          )}

          {botStatus === 'online' && (
            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm text-green-800">
                Bot conectado e pronto para envio!
              </span>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Número do WhatsApp
              </label>
              <Input
                type="tel"
                placeholder="(11) 99999-9999"
                value={phoneNumber}
                onChange={handlePhoneChange}
                disabled={botStatus === 'offline'}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Digite o número com DDD (incluindo 9 para celulares)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mensagem
              </label>
              <Textarea
                placeholder="Digite sua mensagem aqui..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={botStatus === 'offline'}
                rows={6}
                className="w-full resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                {message.length}/1000 caracteres
              </p>
            </div>

            <Button
              onClick={handleSendMessage}
              disabled={isSending || botStatus === 'offline' || !phoneNumber || !message}
              className="w-full bg-green-600 hover:bg-green-700 flex items-center justify-center space-x-2"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Enviar Mensagem</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tips and Examples */}
      <Card>
        <CardHeader>
          <CardTitle>💡 Dicas e Exemplos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Formato do Número</h4>
            <div className="text-xs text-gray-600 space-y-1">
              <p>✅ (11) 99999-9999</p>
              <p>✅ 5511999999999</p>
              <p>❌ 11999999999 (sem código do país)</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Exemplos de Mensagens</h4>
            <div className="space-y-2">
              <button 
                onClick={() => setMessage('Olá! Esta é uma mensagem de teste do nosso bot WhatsApp.')}
                className="w-full text-left p-2 text-xs bg-gray-50 rounded border hover:bg-gray-100 transition-colors"
                disabled={botStatus === 'offline'}
              >
                Mensagem de teste
              </button>
              <button 
                onClick={() => setMessage('Obrigado pelo seu contato! Retornaremos em breve.')}
                className="w-full text-left p-2 text-xs bg-gray-50 rounded border hover:bg-gray-100 transition-colors"
                disabled={botStatus === 'offline'}
              >
                Resposta automática
              </button>
              <button 
                onClick={() => setMessage('Sua mensagem foi recebida e está sendo processada. Aguarde.')}
                className="w-full text-left p-2 text-xs bg-gray-50 rounded border hover:bg-gray-100 transition-colors"
                disabled={botStatus === 'offline'}
              >
                Confirmação de recebimento
              </button>
            </div>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h5 className="text-xs font-semibold text-blue-800 mb-1">Limite de Envio</h5>
            <p className="text-xs text-blue-600">
              Respeitamos os limites do WhatsApp para evitar bloqueios. 
              Máximo de 60 mensagens por minuto.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MessageSender;
