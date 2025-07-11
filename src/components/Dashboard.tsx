// src/components/Dashboard.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Clock, AlertTriangle, Activity as ActivityIcon, CheckCircle, Wifi, Zap } from 'lucide-react';
import type { ActivityLogEntry, WhatsAppConnectionStatus } from '@/hooks/useWhatsAppConnection';

interface DashboardProps {
  messagesSent: number;
  messagesPending: number;
  messagesFailed: number;
  connections: number;
  botStatus: WhatsAppConnectionStatus;
  recentActivityData: ActivityLogEntry[];
  deliveryRate: number;
  avgResponseTime: number; // em segundos
  uptimePercentage: number;
}

const messageDataPlaceholder = [
  { time: '00:00', messages: 0 }, { time: '04:00', messages: 0 },
  { time: '08:00', messages: 0 }, { time: '12:00', messages: 0 },
  { time: '16:00', messages: 0 }, { time: '20:00', messages: 0 },
];

const dailyDataPlaceholder = [
  { day: 'Seg', messages: 0 }, { day: 'Ter', messages: 0 }, { day: 'Qua', messages: 0 },
  { day: 'Qui', messages: 0 }, { day: 'Sex', messages: 0 }, { day: 'Sáb', messages: 0 },
  { day: 'Dom', messages: 0 },
];

const Dashboard = ({ 
  messagesSent, 
  messagesPending, 
  messagesFailed, 
  recentActivityData,
  deliveryRate,
  avgResponseTime,
  uptimePercentage
 }: DashboardProps) => {
  
  const totalMessagesForPie = messagesSent + messagesPending + messagesFailed || 1;

  const statusPieData = [
    { name: 'Enviadas', value: messagesSent, color: '#10B981' },
    { name: 'Pendentes', value: messagesPending, color: '#F59E0B' },
    { name: 'Falhas', value: messagesFailed, color: '#EF4444' },
  ];

  const formattedRecentActivity = recentActivityData.map(log => {
    const date = new Date(log.timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return {
      time: `${hours}:${minutes}`,
      action: log.message,
      status: log.message.toLowerCase().includes('erro') || log.message.toLowerCase().includes('falha') 
              ? 'warning' 
              : (log.message.toLowerCase().includes('conectado') || log.message.toLowerCase().includes('enviada') || log.message.toLowerCase().includes('sucesso')
                ? 'success' 
                : 'info'),
    };
  }).slice(-5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <span>Mensagens por Hora (Placeholder)</span>
            </CardTitle>
            <CardDescription>
              Distribuição de mensagens enviadas ao longo do dia (dados de exemplo)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={messageDataPlaceholder}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="messages" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mensagens por Dia (Placeholder)</CardTitle>
            <CardDescription>
              Volume de mensagens enviadas nos últimos 7 dias (dados de exemplo)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyDataPlaceholder}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="messages" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status das Mensagens</CardTitle>
            <CardDescription>
              Distribuição do status das mensagens enviadas hoje.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* ALTERAÇÃO 1: Adicionando margem ao container do gráfico */}
            <ResponsiveContainer width="100%" height={200}>
              <PieChart margin={{ top: 0, right: 40, bottom: 0, left: 40 }}>
                <Pie 
                  data={statusPieData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={40} 
                  outerRadius={80} 
                  paddingAngle={5} 
                  dataKey="value" 
                  labelLine={false} 
                  // ALTERAÇÃO 2: Lógica para não mostrar o rótulo se o valor for zero
                  label={({ name, value, percent }) => {
                    if (value === 0) return null;
                    return `${name} ${((percent ?? 0) * 100).toFixed(0)}%`;
                  }}
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value} (${(value / totalMessagesForPie * 100 || 0).toFixed(1)}%)`, name]}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center space-x-4 mt-4">
              {statusPieData.map((item, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-xs text-gray-600">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-600" />
              <span>Atividade Recente</span>
            </CardTitle>
            <CardDescription>
              Últimas ações e eventos do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {formattedRecentActivity.length > 0 ? formattedRecentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                   <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    activity.status === 'success' ? 'bg-green-500' :
                    activity.status === 'warning' ? 'bg-yellow-500' :
                    'bg-blue-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{activity.action}</p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                  {activity.status === 'warning' && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  )}
                </div>
              )) : (
                <div className="text-center text-gray-500 py-10">
                  <ActivityIcon className="h-10 w-10 mx-auto mb-2 text-gray-400"/>
                  Nenhuma atividade recente registrada.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Métricas de Performance</CardTitle>
          <CardDescription>
            Indicadores de desempenho do seu bot WhatsApp no dia de hoje
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            
            <div className="bg-green-50 p-4 rounded-lg flex flex-col items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600 mb-2"/>
              <div className="text-2xl font-bold text-green-800">{deliveryRate.toFixed(1)}%</div>
              <div className="text-sm font-medium text-green-700">Taxa de Entrega</div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg flex flex-col items-center justify-center">
               <Clock className="h-6 w-6 text-blue-600 mb-2"/>
              <div className="text-2xl font-bold text-blue-800">{avgResponseTime.toFixed(1)}s</div>
              <div className="text-sm font-medium text-blue-700">Tempo de Resposta</div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg flex flex-col items-center justify-center">
               <Zap className="h-6 w-6 text-purple-600 mb-2"/>
              <div className="text-2xl font-bold text-purple-800">{messagesSent}</div>
              <div className="text-sm font-medium text-purple-700">Mensagens Hoje</div>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg flex flex-col items-center justify-center">
              <Wifi className="h-6 w-6 text-orange-600 mb-2"/>
              <div className="text-2xl font-bold text-orange-800">{uptimePercentage.toFixed(1)}%</div>
              <div className="text-sm font-medium text-orange-700">Uptime</div>
            </div>

          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;