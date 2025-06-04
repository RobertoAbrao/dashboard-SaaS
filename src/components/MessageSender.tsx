// src/components/MessageSender.tsx
import React, { useState, ChangeEvent, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageCircle, AlertTriangle, CheckCircle, Paperclip, Image as ImageIcon, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWhatsAppConnection, MediaInfo } from '@/hooks/useWhatsAppConnection';

interface MessageSenderProps {
  onMessageSent: () => void; 
}

const MessageSender = ({ onMessageSent }: MessageSenderProps) => {
  const { status: botStatus, sendMessage } = useWhatsAppConnection(); 
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
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        toast({
          title: "Arquivo Inválido",
          description: "Por favor, selecione um arquivo de imagem (ex: JPG, PNG).",
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
    const fileInput = document.getElementById('imageUpload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleSendMessage = async () => {
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
          description: "Por favor, digite uma mensagem ou selecione uma imagem.",
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
        const uploadResponse = await fetch('/api/whatsapp/upload-media', {
          method: 'POST',
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
          mimetype: uploadResult.mimetype,
          caption: messageText, 
        };
        console.log("Informações da mídia após upload:", mediaInfoToSend);

      } catch (error: unknown) { // Modificado para unknown
        setIsUploading(false);
        setIsSending(false);
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({
          title: "Erro no Upload",
          description: errorMessage || "Não foi possível fazer upload da imagem.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const messageToSend = mediaInfoToSend ? mediaInfoToSend.caption : messageText;
      await sendMessage(phoneNumber, messageToSend || '', mediaInfoToSend); 
      
      onMessageSent(); 
      toast({
        title: "Mensagem enviada!",
        description: `Sua mensagem para ${phoneNumber} foi enviada para a fila.`,
      });
      
      setPhoneNumber('');
      setMessageText('');
      setSelectedFile(null);
      setImagePreview(null);
      handleRemoveImage(); 

    } catch (error: unknown) { // Modificado para unknown
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
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (match, p1, p2, p3) => {
        let formatted = '';
        if (p1) formatted += `(${p1}`;
        if (p2) formatted += `) ${p2}`;
        if (p3) formatted += `-${p3}`;
        return formatted;
      });
    }
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
            Envie mensagens de texto ou com imagem diretamente pelo seu bot WhatsApp.
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
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Número do WhatsApp
              </label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="(11) 99999-9999"
                value={phoneNumber}
                onChange={handlePhoneChange}
                disabled={botStatus === 'offline' || isSending}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Digite o número com DDD.
              </p>
            </div>

            <div>
              <label htmlFor="messageText" className="block text-sm font-medium text-gray-700 mb-1">
                Mensagem / Legenda da Imagem
              </label>
              <Textarea
                id="messageText"
                placeholder="Digite sua mensagem ou legenda aqui..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                disabled={botStatus === 'offline' || isSending}
                rows={selectedFile ? 2 : 5} 
                className="w-full resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                {messageText.length}/1024 caracteres (limite do WhatsApp para legendas)
              </p>
            </div>

            <div>
              <label htmlFor="imageUpload" className="block text-sm font-medium text-gray-700 mb-1">
                Anexar Imagem (Opcional)
              </label>
              <Input
                id="imageUpload"
                type="file"
                accept="image/*" 
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

            <Button
              onClick={handleSendMessage}
              disabled={isSending || isUploading || botStatus === 'offline' || !phoneNumber || (!messageText && !selectedFile)}
              className="w-full bg-green-600 hover:bg-green-700 flex items-center justify-center space-x-2"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando Imagem...</span>
                </>
              ) : isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando Mensagem...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>{selectedFile ? "Enviar com Imagem" : "Enviar Mensagem"}</span>
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
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Envio com Imagem</h4>
            <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
              <li>Selecione uma imagem (JPG, PNG, GIF).</li>
              <li>A mensagem de texto se tornará a legenda da imagem.</li>
              <li>O limite de tamanho para upload é de 10MB.</li>
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
