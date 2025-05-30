import { Badge } from '@/components/ui/badge';
import { Activity, Wifi, WifiOff, Loader2, QrCode } from 'lucide-react'; // Importado QrCode que estava faltando
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BotStatusProps {
  status: 'online' | 'offline'; // Mantemos este status simplificado para a lógica principal de cores/ícones
  message?: string; // Mensagem de status detalhada para o tooltip e lógica condicional
}

const BotStatus = ({ status, message }: BotStatusProps) => {
  let statusText = "Offline";
  let IconComponent = WifiOff;
  let badgeClass = "bg-red-100 text-red-800 border-red-200";
  let pulseClass = "bg-red-500 animate-pulse";
  let iconColorClass = "text-red-600";
  let iconShouldAnimatePulse = true;
  let iconShouldSpin = false;

  // Determina o status visual com base na prop 'status' e na 'message'
  if (status === 'online') {
    statusText = "Online";
    IconComponent = Wifi;
    badgeClass = "bg-green-100 text-green-800 border-green-200";
    pulseClass = "bg-green-500 animate-pulse";
    iconColorClass = "text-green-600";
  } else { // Se não está 'online', verificamos a mensagem para mais detalhes
    if (message?.toLowerCase().includes('qr code') || message?.toLowerCase().includes('scan')) {
      statusText = "Aguardando QR";
      IconComponent = QrCode;
      badgeClass = "bg-yellow-100 text-yellow-800 border-yellow-200";
      pulseClass = "bg-yellow-500 animate-pulse";
      iconColorClass = "text-yellow-600";
    } else if (message?.toLowerCase().includes('initializing') || message?.toLowerCase().includes('loading') || message?.toLowerCase().includes('aguardando')) {
      statusText = "Carregando";
      IconComponent = Loader2;
      badgeClass = "bg-blue-100 text-blue-800 border-blue-200";
      pulseClass = "bg-blue-500"; // Loader já tem sua própria animação
      iconColorClass = "text-blue-600";
      iconShouldAnimatePulse = false; // Não precisa de pulse para o loader
      iconShouldSpin = true; // Faz o loader girar
    } else if (message?.toLowerCase().includes('failure') || message?.toLowerCase().includes('error')) {
      statusText = "Falha";
      // Mantém as classes de offline/vermelho
    }
    // Se nenhuma das condições acima, mantém o padrão offline
  }


  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="flex items-center space-x-3 cursor-default">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${pulseClass} ${iconShouldAnimatePulse ? 'animate-pulse' : ''} ${iconShouldSpin ? 'animate-spin' : ''}`}></div>
              <IconComponent className={`h-5 w-5 ${iconColorClass} ${iconShouldSpin ? 'animate-spin' : ''}`} />
            </div>
            <Badge variant="secondary" className={badgeClass}>
              <Activity className="w-3 h-3 mr-1" />
              Bot {statusText}
            </Badge>
          </div>
        </TooltipTrigger>
        {message && (
          <TooltipContent>
            <p>{message}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

export default BotStatus;