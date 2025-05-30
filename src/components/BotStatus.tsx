
import { Badge } from '@/components/ui/badge';
import { Activity, Wifi, WifiOff } from 'lucide-react';

interface BotStatusProps {
  status: 'online' | 'offline';
}

const BotStatus = ({ status }: BotStatusProps) => {
  return (
    <div className="flex items-center space-x-3">
      {status === 'online' ? (
        <>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <Wifi className="h-5 w-5 text-green-600" />
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
            <Activity className="w-3 h-3 mr-1" />
            Bot Online
          </Badge>
        </>
      ) : (
        <>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <WifiOff className="h-5 w-5 text-red-600" />
          </div>
          <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">
            <Activity className="w-3 h-3 mr-1" />
            Bot Offline
          </Badge>
        </>
      )}
    </div>
  );
};

export default BotStatus;
