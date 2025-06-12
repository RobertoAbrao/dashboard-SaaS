// src/components/KanbanBoard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Phone, Play, CheckCircle, Clock, Calendar, MessageSquare, ExternalLink, XCircle, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

// Definição da interface para um Ticket
interface Ticket {
  id: string;
  phoneNumber: string;
  contactName?: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string; // ISO string
  messagePreview: string;
  lastMessageTimestamp?: string;
}

// Definição da interface para uma Mensagem no Histórico
interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string; // ISO string
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  fromMe: boolean;
}

// Mapeamento de status para nomes de exibição
const statusMap = {
  pending: 'Aguardando Atendimento',
  in_progress: 'Em Atendimento',
  completed: 'Concluído',
};

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
};

const KanbanBoard = () => {
  const { toast } = useToast();
  const { socketRef } = useWhatsAppConnection();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const fetchTickets = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('get_kanban_tickets', (response: { success: boolean, tickets?: Ticket[], message?: string }) => {
        if (response.success && response.tickets) {
          const sortedTickets = response.tickets.sort((a, b) => {
            const statusOrder = { pending: 1, in_progress: 2, completed: 3 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
              return statusOrder[a.status] - statusOrder[b.status];
            }
            return new Date(b.lastMessageTimestamp || b.createdAt).getTime() - new Date(a.lastMessageTimestamp || a.createdAt).getTime();
          });
          setTickets(sortedTickets);
        } else {
          toast({ title: "Erro ao Carregar Tickets", description: response.message || "Não foi possível carregar os tickets do servidor.", variant: "destructive" });
        }
      });
    }
  }, [socketRef, toast]);

  useEffect(() => {
    fetchTickets();

    const currentSocket = socketRef.current;
    if (currentSocket) {
      currentSocket.on('kanban_tickets_update', (updatedTickets: Ticket[]) => {
        console.log("Atualização de tickets recebida via Socket.IO:", updatedTickets);
        const sortedTickets = updatedTickets.sort((a, b) => {
          const statusOrder = { pending: 1, in_progress: 2, completed: 3 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
              return statusOrder[a.status] - statusOrder[b.status];
            }
            return new Date(b.lastMessageTimestamp || b.createdAt).getTime() - new Date(a.lastMessageTimestamp || a.createdAt).getTime();
        });
        setTickets(sortedTickets);
        toast({
          title: "Tickets Atualizados",
          description: "A lista de tickets Kanban foi atualizada.",
          duration: 3000,
        });
      });

      currentSocket.on('new_message_for_kanban_ticket', (message: Message) => {
        if (selectedTicket && message.from === selectedTicket.id) {
          setMessageHistory((prevHistory) => [...prevHistory, message]);
          console.log("Nova mensagem para ticket selecionado:", message);
          // Rola para o final do chat quando uma nova mensagem é recebida
          setTimeout(() => {
            const chatContainer = document.getElementById('chat-history-scroll-area');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }, 0);
        }
      });


      return () => {
        currentSocket.off('kanban_tickets_update');
        currentSocket.off('new_message_for_kanban_ticket');
      };
    }
  }, [socketRef, fetchTickets, toast, selectedTicket]);


  const moveTicket = useCallback((ticketId: string, newStatus: Ticket['status']) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('update_ticket_status', { ticketId, newStatus }, (response: { success: boolean, message?: string }) => {
        if (!response.success) {
          toast({ title: "Erro ao Mover Ticket", description: response.message || "Não foi possível atualizar o status do ticket no servidor.", variant: "destructive" });
          fetchTickets();
        }
      });
    }
  }, [socketRef, toast, fetchTickets]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) {
      return;
    }

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    setTickets((prevTickets) => {
      const draggedTicket = prevTickets.find((ticket) => ticket.id === draggableId);
      if (!draggedTicket) return prevTickets;

      const newStatus = destination.droppableId as Ticket['status'];

      const updatedTickets = prevTickets.map(ticket =>
        ticket.id === draggableId ? { ...ticket, status: newStatus } : ticket
      );

      const reorderedTickets = updatedTickets.sort((a, b) => {
        const statusOrder = { pending: 1, in_progress: 2, completed: 3 };
          if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
          }
          return new Date(b.lastMessageTimestamp || b.createdAt).getTime() - new Date(a.lastMessageTimestamp || a.createdAt).getTime();
      });

      moveTicket(draggableId, newStatus);
      return reorderedTickets;
    });
  };

  const fetchMessageHistory = useCallback(async (phoneNumber: string) => {
    setIsLoadingHistory(true);
    setMessageHistory([]);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('get_message_history', { phoneNumber }, (response: { success: boolean, history?: Message[], message?: string }) => {
        setIsLoadingHistory(false);
        if (response.success && response.history) {
          const sortedHistory = response.history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          setMessageHistory(sortedHistory);
          // Rola para o final do chat assim que o histórico é carregado
          setTimeout(() => {
            const chatContainer = document.getElementById('chat-history-scroll-area');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }, 0);
        } else {
          toast({ title: "Erro ao Carregar Histórico", description: response.message || "Não foi possível carregar o histórico de mensagens.", variant: "destructive" });
        }
      });
    } else {
      setIsLoadingHistory(false);
      toast({ title: "Erro de Conexão", description: "Socket.IO não conectado para buscar histórico.", variant: "destructive" });
    }
  }, [socketRef, toast]);


  const handleStartChat = useCallback(async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
    await fetchMessageHistory(ticket.phoneNumber);

    moveTicket(ticket.id, 'in_progress');
    toast({
      title: "Atendimento Iniciado",
      description: `Modal de conversa com ${ticket.phoneNumber} aberto.`,
    });
  }, [moveTicket, toast, fetchMessageHistory]);


  const handleMarkAsComplete = useCallback((ticketId: string) => {
    moveTicket(ticketId, 'completed');
    toast({
      title: "Atendimento Concluído",
      description: "Ticket movido para a coluna 'Concluído'.",
    });
  }, [moveTicket, toast]);

  const handleCloseTicket = useCallback((ticketId: string) => {
    if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('remove_kanban_ticket', { ticketId }, (response: { success: boolean, message?: string }) => {
            if (response.success) {
                toast({ title: "Ticket Fechado", description: "O ticket foi removido do Kanban." });
                fetchTickets();
            } else {
                toast({ title: "Erro ao Fechar Ticket", description: response.message || "Não foi possível remover o ticket.", variant: "destructive" });
            }
        });
    }
}, [socketRef, toast, fetchTickets]);

  const handleSendMessage = useCallback(async () => {
    if (!selectedTicket || !currentMessage.trim()) {
      toast({ title: "Mensagem Vazia", description: "Por favor, digite uma mensagem para enviar.", variant: "default" }); // Corrigido de "warning" para "default"
      return;
    }

    if (!socketRef.current || !socketRef.current.connected) {
      toast({ title: "Erro de Conexão", description: "Não foi possível conectar ao servidor para enviar a mensagem.", variant: "destructive" });
      return;
    }

    setIsSendingMessage(true);
    const messageToSend = currentMessage;
    setCurrentMessage('');

    socketRef.current.emit('send-message', {
      to: selectedTicket.phoneNumber,
      message: messageToSend,
      mediaInfo: null
    }, (response: { status: string, error?: string, info?: string, messageId?: string }) => {
      setIsSendingMessage(false);
      if (response.status === 'success') {
        toast({ title: "Mensagem Enviada", description: "Mensagem enviada com sucesso!" });
        
        setMessageHistory((prevHistory) => [
          ...prevHistory,
          {
            id: response.messageId || `sent-${Date.now()}`,
            from: 'me',
            to: selectedTicket.phoneNumber,
            content: messageToSend,
            timestamp: new Date().toISOString(),
            type: 'text',
            fromMe: true,
          },
        ]);
        setTimeout(() => {
            const chatContainer = document.getElementById('chat-history-scroll-area');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }, 0);

      } else {
        toast({ title: "Erro ao Enviar", description: response.error || "Não foi possível enviar a mensagem.", variant: "destructive" });
      }
    });
  }, [selectedTicket, currentMessage, socketRef, toast]);


  const renderColumn = (status: Ticket['status'], title: string) => {
    const columnTickets = tickets.filter(ticket => ticket.status === status);

    return (
      <Droppable droppableId={status}>
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="flex-1 bg-gray-50 p-4 rounded-lg shadow-inner min-h-[300px] border border-gray-200 flex flex-col"
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
              {title} <Badge variant="secondary" className="ml-2 px-2 py-0.5 rounded-full">{columnTickets.length}</Badge>
            </h3>
            <div className="flex-grow space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {columnTickets.map((ticket, index) => (
                <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                  {(provided) => (
                    <Card
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className="relative hover:shadow-md transition-shadow duration-200"
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span className="flex items-center">
                            <Phone className="w-4 h-4 mr-2 text-green-500" />
                            {ticket.contactName || ticket.phoneNumber}
                          </span>
                          {ticket.status === 'completed' && (
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={(e) => { e.stopPropagation(); handleCloseTicket(ticket.id); }}
                               className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                             >
                               <XCircle className="w-4 h-4" />
                             </Button>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs flex items-center">
                          <MessageSquare className="w-3 h-3 mr-1 text-gray-400" />
                          {ticket.messagePreview ? `${ticket.messagePreview.substring(0, 50)}${ticket.messagePreview.length > 50 ? '...' : ''}` : 'Nenhuma prévia da mensagem.'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 pt-0">
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                        <Badge className={`mt-1 ${statusColors[ticket.status]}`}>
                          {statusMap[ticket.status]}
                        </Badge>
                      </CardContent>
                      <CardFooter className="flex justify-end gap-2 pt-2">
                        {ticket.status === 'pending' && (
                          <Button size="sm" onClick={() => handleStartChat(ticket)} className="bg-blue-500 hover:bg-blue-600">
                            <Play className="w-4 h-4 mr-1" />
                            Iniciar Atendimento
                          </Button>
                        )}
                         {ticket.status === 'in_progress' && (
                          <Button size="sm" variant="outline" onClick={() => handleStartChat(ticket)} className="text-blue-600 border-blue-600 hover:bg-blue-50">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Visualizar Chat
                          </Button>
                        )}
                        {(ticket.status === 'in_progress' || ticket.status === 'pending') && (
                          <Button size="sm" variant="secondary" onClick={() => handleMarkAsComplete(ticket.id)} className="bg-green-500 hover:bg-green-600 text-white">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Finalizar
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          </div>
        )}
      </Droppable>
    );
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Painel Kanban de Atendimento</h2>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {renderColumn('pending', 'Aguardando Atendimento')}
          {renderColumn('in_progress', 'Em Atendimento')}
          {renderColumn('completed', 'Concluído')}
        </div>
      </DragDropContext>

      {/* Modal de Histórico de Mensagens */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-[600px] lg:max-w-[800px] flex flex-col h-[90vh]">
          <DialogHeader>
            <DialogTitle>Conversa com {selectedTicket?.contactName || selectedTicket?.phoneNumber}</DialogTitle>
            <DialogDescription>
              Interaja diretamente com o cliente aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow py-4 overflow-hidden flex flex-col">
            {isLoadingHistory ? (
              <p className="text-center text-gray-500">Carregando histórico...</p>
            ) : messageHistory.length === 0 ? (
              <p className="text-center text-gray-500">Nenhuma mensagem encontrada para este contato.</p>
            ) : (
              <ScrollArea id="chat-history-scroll-area" className="flex-grow pr-4">
                <div className="space-y-4 pb-4">
                  {messageHistory.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                          msg.fromMe
                            ? 'bg-blue-500 text-white rounded-br-none'
                            : 'bg-gray-200 text-gray-800 rounded-bl-none'
                        }`}
                      >
                        <p className="text-xs text-gray-600 mb-1">
                          {msg.fromMe ? 'Você' : (selectedTicket?.contactName || selectedTicket?.phoneNumber)} -{' '}
                          {new Date(msg.timestamp).toLocaleString('pt-BR')}
                        </p>
                        <p className="text-sm">
                           {msg.content || `[${msg.type === 'image' ? 'Imagem' : msg.type === 'video' ? 'Vídeo' : 'Mídia'}]`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={2}
              className="flex-grow resize-none"
              disabled={isSendingMessage}
            />
            <Button onClick={handleSendMessage} disabled={!currentMessage.trim() || isSendingMessage}>
              {isSendingMessage ? (
                <span className="flex items-center">
                  <span className="animate-spin mr-2">⚙️</span> Enviando...
                </span>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" /> Enviar
                </>
              )}
            </Button>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Fechar Conversa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KanbanBoard;