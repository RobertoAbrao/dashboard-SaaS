// src/components/BotStatus.tsx
import { Badge } from '@/components/ui/badge';
import { Activity, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useWhatsAppConnection, WhatsAppConnectionStatus } from '@/hooks/useWhatsAppConnection';

const BotStatus = () => {
  const { status } = useWhatsAppConnection();

  const isConnecting = status === 'initializing' || status === 'connecting_socket' || status === 'socket_authenticated';

  const getStatusConfig = () => {
    switch (status) {
      case 'online':
        return {
          icon: Wifi,
          label: 'Bot Online',
          dotColor: 'bg-green-500',
          iconColor: 'text-green-600',
          badgeColor: 'bg-green-100 text-green-800 border-green-200'
        };
      case 'qr_ready':
      case 'pairing':
        return {
          icon: Activity,
          label: 'Aguardando Ação',
          dotColor: 'bg-yellow-500',
          iconColor: 'text-yellow-600',
          badgeColor: 'bg-yellow-100 text-yellow-800 border-yellow-200'
        };
      case 'initializing':
      case 'socket_authenticated':
      case 'connecting_socket':
        return {
          icon: Loader2,
          label: 'Conectando...',
          dotColor: 'bg-blue-500',
          iconColor: 'text-blue-600',
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-200'
        };
      case 'auth_failed':
        return {
          icon: WifiOff,
          label: 'Falha na Auth',
          dotColor: 'bg-red-500',
          iconColor: 'text-red-600',
          badgeColor: 'bg-red-100 text-red-800 border-red-200'
        };
      default:
        return {
          icon: WifiOff,
          label: 'Bot Offline',
          dotColor: 'bg-red-500',
          iconColor: 'text-red-600',
          badgeColor: 'bg-red-100 text-red-800 border-red-200'
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 ${config.dotColor} rounded-full ${isConnecting ? 'animate-pulse' : ''}`}></div>
        <StatusIcon className={`h-5 w-5 ${config.iconColor} ${isConnecting ? 'animate-spin' : ''}`} />
      </div>
      <Badge variant="secondary" className={config.badgeColor}>
        <Activity className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    </div>
  );
};

export default BotStatus;