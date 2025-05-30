
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Clock, AlertTriangle } from 'lucide-react';

interface DashboardProps {
  messagesSent: number;
  connections: number;
  botStatus: 'online' | 'offline';
}

const Dashboard = ({ messagesSent, connections, botStatus }: DashboardProps) => {
  // Dados fictícios para os gráficos
  const messageData = [
    { time: '00:00', messages: 12 },
    { time: '04:00', messages: 8 },
    { time: '08:00', messages: 45 },
    { time: '12:00', messages: 67 },
    { time: '16:00', messages: 89 },
    { time: '20:00', messages: 34 },
  ];

  const dailyData = [
    { day: 'Seg', messages: 234 },
    { day: 'Ter', messages: 189 },
    { day: 'Qua', messages: 298 },
    { day: 'Qui', messages: 345 },
    { day: 'Sex', messages: 267 },
    { day: 'Sáb', messages: 123 },
    { day: 'Dom', messages: 89 },
  ];

  const statusData = [
    { name: 'Entregues', value: 85, color: '#10B981' },
    { name: 'Pendentes', value: 10, color: '#F59E0B' },
    { name: 'Falhas', value: 5, color: '#EF4444' },
  ];

  const recentActivity = [
    { time: '14:30', action: 'Mensagem enviada para (11) 99999-9999', status: 'success' },
    { time: '14:25', action: 'Bot reconectado automaticamente', status: 'info' },
    { time: '14:20', action: 'Mensagem enviada para (21) 88888-8888', status: 'success' },
    { time: '14:15', action: 'Erro temporário de conexão', status: 'warning' },
    { time: '14:10', action: 'Mensagem enviada para (31) 77777-7777', status: 'success' },
  ];

  return (
    <div className="space-y-6">
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <span>Mensagens por Hora (Hoje)</span>
            </CardTitle>
            <CardDescription>
              Distribuição de mensagens enviadas ao longo do dia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={messageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="messages" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weekly Messages */}
        <Card>
          <CardHeader>
            <CardTitle>Mensagens por Dia (Esta Semana)</CardTitle>
            <CardDescription>
              Volume de mensagens enviadas nos últimos 7 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyData}>
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
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Status das Mensagens</CardTitle>
            <CardDescription>
              Distribuição do status das mensagens enviadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center space-x-4 mt-4">
              {statusData.map((item, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-xs text-gray-600">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
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
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.status === 'success' ? 'bg-green-500' :
                    activity.status === 'warning' ? 'bg-yellow-500' :
                    'bg-blue-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{activity.action}</p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                  {activity.status === 'warning' && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Métricas de Performance</CardTitle>
          <CardDescription>
            Indicadores de desempenho do seu bot WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">98.5%</div>
              <div className="text-sm text-green-800">Taxa de Entrega</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">1.2s</div>
              <div className="text-sm text-blue-800">Tempo Médio de Resposta</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{messagesSent}</div>
              <div className="text-sm text-purple-800">Mensagens Hoje</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">99.2%</div>
              <div className="text-sm text-orange-800">Uptime (30 dias)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
