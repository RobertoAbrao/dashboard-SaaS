// src/components/MessageSender.tsx
import React, { useState, ChangeEvent, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageCircle, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWhatsAppConnection, MediaInfo } from '@/hooks/useWhatsAppConnection';
import { useAuth } from '@/hooks/useAuth';

interface MessageSenderProps {
  onMessageSent: () => void; 
}

const MessageSender = ({ onMessageSent }: MessageSenderProps) => {
  const { status: botStatus, sendMessage } = useWhatsAppConnection(); 
  const { user } = useAuth();
  const { toast } = useToast();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [messageText, setMessageText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setImagePreview(null);
    }
  }, [selectedFile]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
        setSelectedFile(file);
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
              setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
      } else {
        toast({
          title: "Arquivo Inválido",
          description: "Por favor, selecione um arquivo de imagem ou áudio.",
          variant: "destructive",
        });
        setSelectedFile(null);
        setImagePreview(null);
        event.target.value = ''; 
      }
    } else {
      setSelectedFile(null);
      setImagePreview(null);
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    const fileInput = document.getElementById('mediaUpload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleSendMessage = async () => {
    if (!user) {
        toast({ title: "Erro de Autenticação", description: "Usuário não encontrado.", variant: "destructive" });
        return;
    }
    if (!phoneNumber) {
      toast({
        title: "Número obrigatório",
        description: "Por favor, preencha o número do destinatário.",
        variant: "destructive",
      });
      return;
    }

    if (!messageText && !selectedFile) {
        toast({
          title: "Conteúdo obrigatório",
          description: "Por favor, digite uma mensagem ou selecione um arquivo.",
          variant: "destructive",
        });
        return;
    }

    if (botStatus !== 'online') {
      toast({
        title: "Bot offline",
        description: "Conecte o bot primeiro para enviar mensagens.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    let mediaInfoToSend: MediaInfo | undefined = undefined;

    if (selectedFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('mediaFile', selectedFile);

      try {
        const token = await user.getIdToken();
        const uploadResponse = await fetch('/api/whatsapp/upload-media', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });

        const uploadResult = await uploadResponse.json();
        setIsUploading(false);

        if (!uploadResponse.ok || !uploadResult.success) {
          throw new Error(uploadResult.message || 'Falha no upload da imagem.');
        }
        
        mediaInfoToSend = {
          serverFilePath: uploadResult.filePath,
          originalName: uploadResult.originalName,
          mimetype: uploadResult.mimetype
        };
        console.log("Informações da mídia após upload:", mediaInfoToSend);

      } catch (error: unknown) {
        setIsUploading(false);
        setIsSending(false);
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({
          title: "Erro no Upload",
          description: errorMessage || "Não foi possível fazer upload do arquivo.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      // --- INÍCIO DA ALTERAÇÃO NECESSÁRIA ---

      // 1. Limpa o número de qualquer formatação para obter apenas os dígitos
      const cleanedNumber = phoneNumber.replace(/\D/g, '');

      let finalNumber;
      // 2. Verifica se o número limpo já começa com 55 (código do Brasil)
      if (cleanedNumber.startsWith('55')) {
          finalNumber = cleanedNumber; // Se sim, usa o número como está
      } else {
          finalNumber = '55' + cleanedNumber; // Se não, adiciona o 55 no início
      }
      
      // 3. Usa o número final e corrigido para enviar a mensagem
      await sendMessage(finalNumber, messageText, mediaInfoToSend);
      
      // --- FIM DA ALTERAÇÃO NECESSÁRIA ---
      
      onMessageSent(); 
      toast({
        title: "Mensagem enviada!",
        description: `Sua mensagem para ${finalNumber} foi enviada para a fila.`,
        variant: "default",
      });
      
      setPhoneNumber('');
      setMessageText('');
      handleRemoveImage();

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Erro ao Enviar",
        description: errorMessage || "Não foi possível enviar a mensagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  };

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    
    // Formato para celular com 9º dígito: (XX) XXXXX-XXXX
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{2})/, '($1)')
        .replace(/(\(\d{2}\))(\d{5})/, '$1 $2')
        .replace(/(\d{5})-(\d{4})/, '$1$2')
        .replace(/(\d{4})$/, '-$1');
    }
    // Mantém o valor como está se for maior, para números internacionais
    return value.substring(0, 15); 
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <span>Enviar Mensagem</span>
          </CardTitle>
          <CardDescription>
            Envie mensagens de texto ou com mídia diretamente pelo seu bot WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

          <div className="space-y-4">
            <div>
              <Label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Número do WhatsApp (com DDD)
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="(11) 99999-9999"
                value={phoneNumber}
                onChange={handlePhoneChange}
                disabled={botStatus === 'offline' || isSending}
                className="w-full"
              />
            </div>

            <div>
              <Label htmlFor="messageText" className="block text-sm font-medium text-gray-700 mb-1">
                Mensagem / Legenda da Mídia
              </Label>
              <Textarea
                id="messageText"
                placeholder="Digite sua mensagem ou legenda aqui..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                disabled={botStatus === 'offline' || isSending}
                rows={selectedFile ? 2 : 5} 
                className="w-full resize-none"
              />
            </div>

            <div>
              <Label htmlFor="mediaUpload" className="block text-sm font-medium text-gray-700 mb-1">
                Anexar Mídia (Opcional)
              </Label>
              <Input
                id="mediaUpload"
                type="file"
                accept="image/*,audio/*" 
                onChange={handleFileChange}
                disabled={botStatus === 'offline' || isSending || isUploading}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
              />
            </div>

            {imagePreview && (
              <div className="mt-4 p-2 border rounded-md relative">
                <img src={imagePreview} alt="Pré-visualização" className="max-h-48 rounded-md mx-auto" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full h-6 w-6"
                  onClick={handleRemoveImage}
                  disabled={isSending || isUploading}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            )}
              {selectedFile && !imagePreview && (
                <div className="mt-4 p-3 border rounded-md relative bg-gray-100 text-sm flex items-center justify-between">
                    <span>{selectedFile.name}</span>
                    <Button
                    variant="ghost"
                    size="icon"
                    className="bg-red-500 hover:bg-red-600 text-white rounded-full h-6 w-6"
                    onClick={handleRemoveImage}
                    disabled={isSending || isUploading}
                    >
                    <XCircle className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <Button
              onClick={handleSendMessage}
              disabled={isSending || isUploading || botStatus === 'offline' || !phoneNumber || (!messageText && !selectedFile)}
              className="w-full bg-green-600 hover:bg-green-700 flex items-center justify-center space-x-2"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando Arquivo...</span>
                </>
              ) : isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando Mensagem...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>{selectedFile ? "Enviar com Mídia" : "Enviar Mensagem"}</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>💡 Dicas e Exemplos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Envio com Mídia</h4>
            <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
              <li>Selecione uma imagem ou áudio.</li>
              <li>A mensagem de texto se tornará a legenda.</li>
              <li>O limite de tamanho para upload é de 16MB.</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Formato do Número</h4>
            <div className="text-xs text-gray-600 space-y-1">
              <p>✅ (11) 99999-9999</p>
              <p>✅ 5511999999999 (com código do país)</p>
              <p>❌ 11999999999 (sem código do país pode falhar)</p>
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h5 className="text-xs font-semibold text-blue-800 mb-1">Atenção</h5>
            <p className="text-xs text-blue-600">
              Certifique-se que o bot está "Online" antes de tentar enviar.
              O envio de mídia pode levar alguns segundos a mais.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MessageSender;