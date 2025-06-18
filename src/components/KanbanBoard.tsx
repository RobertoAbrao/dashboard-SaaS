// src/components/KanbanBoard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Phone, CheckCircle, Clock, Calendar, MessageSquare, XCircle, Loader2, Play, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
// NOVO: Importando o hook de conexão para poder enviar mensagens
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection';

// --- Interfaces e Constantes ---

interface Ticket {
  id: string;
  phoneNumber: string;
  contactName?: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  messagePreview: string;
  lastMessageTimestamp?: string;
}

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

// --- Componente do Modal de Chat ---

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket;
  onSendMessage: (phoneNumber: string, message: string) => Promise<void>;
}

const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose, ticket, onSendMessage }) => {
  const [replyMessage, setReplyMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleSendReply = async () => {
    if (!replyMessage.trim()) return;

    setIsSending(true);
    try {
      await onSendMessage(ticket.phoneNumber, replyMessage);
      toast({ title: "Mensagem Enviada!", description: `Sua resposta para ${ticket.contactName || ticket.phoneNumber} foi enviada.` });
      setReplyMessage('');
      onClose(); // Fecha o modal após o envio
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
      toast({ title: "Erro ao Enviar", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Conversa com {ticket.contactName || ticket.phoneNumber}</DialogTitle>
          <DialogDescription>
            Envie uma resposta diretamente para o cliente. O histórico completo da conversa não está disponível aqui.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="p-3 bg-gray-50 rounded-md border">
            <p className="text-sm font-medium">Última mensagem recebida:</p>
            <p className="text-sm text-gray-600 mt-1">"{ticket.messagePreview}"</p>
          </div>
          <Textarea
            placeholder="Digite sua resposta aqui..."
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
            rows={4}
            disabled={isSending}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSending}>Cancelar</Button>
          <Button type="submit" onClick={handleSendReply} disabled={isSending || !replyMessage.trim()}>
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {isSending ? 'Enviando...' : 'Enviar Resposta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// --- Componente Principal do Kanban ---

const KanbanBoard = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { sendMessage } = useWhatsAppConnection(); // NOVO: Obtém a função de enviar mensagem
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false); // NOVO: Estado para controlar o modal
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null); // NOVO: Estado para o ticket selecionado

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const ticketsCollectionRef = collection(db, 'users', user.uid, 'kanban_tickets');
    const q = query(ticketsCollectionRef, orderBy('lastMessageTimestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const ticketsData = querySnapshot.docs.map(doc => doc.data() as Ticket);
      setTickets(ticketsData);
      setIsLoading(false);
    }, (error) => {
      console.error("[Firestore Listener Error]", error);
      toast({
        title: "Erro ao Carregar Tickets",
        description: "Não foi possível buscar os dados do Kanban. Verifique permissões do Firestore.",
        variant: "destructive"
      });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user, toast]);

  // NOVO: Função genérica para mudar o status de um ticket
  const handleStatusChange = async (ticketId: string, newStatus: Ticket['status']) => {
    if (!user) return;

    const originalTickets = [...tickets];
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));

    const ticketDocRef = doc(db, 'users', user.uid, 'kanban_tickets', ticketId);
    try {
        await updateDoc(ticketDocRef, { status: newStatus });
        toast({ title: "Status Alterado", description: `Ticket movido para ${statusMap[newStatus]}.` });
    } catch (error) {
        toast({ title: "Erro ao Alterar Status", description: "Não foi possível atualizar o ticket.", variant: "destructive" });
        setTickets(originalTickets);
    }
  };

  // NOVO: Função para abrir o modal de chat
  const handleOpenChat = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };
  
  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || !user) return;
    const newStatus = destination.droppableId as Ticket['status'];
    handleStatusChange(draggableId, newStatus);
  };
  
  const handleCloseTicket = useCallback(async (ticketId: string) => {
    if (!user) return;
    const originalTickets = [...tickets];
    setTickets(prevTickets => prevTickets.filter(ticket => ticket.id !== ticketId));
    const ticketDocRef = doc(db, 'users', user.uid, 'kanban_tickets', ticketId);
    try {
        await deleteDoc(ticketDocRef);
        toast({ title: "Ticket Removido", description: "O ticket foi removido do painel." });
    } catch (error) {
        toast({ title: "Erro ao Remover", description: "Não foi possível remover o ticket.", variant: "destructive" });
        setTickets(originalTickets);
    }
  }, [user, toast, tickets]);
  
  const renderColumn = (status: Ticket['status'], title: string) => {
    const columnTickets = tickets.filter(ticket => ticket.status === status);

    return (
      <Droppable droppableId={status}>
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 bg-gray-50 p-4 rounded-lg shadow-inner min-h-[500px] border border-gray-200 flex flex-col">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
              {title} <Badge variant="secondary" className="ml-2 px-2 py-0.5 rounded-full">{columnTickets.length}</Badge>
            </h3>
            <ScrollArea className="flex-grow pr-2">
              <div className="space-y-3">
                {columnTickets.map((ticket, index) => (
                  <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                    {(provided) => (
                      <Card ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="relative hover:shadow-md transition-shadow duration-200 flex flex-col">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span className="flex items-center">
                              <Phone className="w-4 h-4 mr-2 text-green-500" />
                              {ticket.contactName || ticket.phoneNumber}
                            </span>
                            {ticket.status === 'completed' && (
                               <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleCloseTicket(ticket.id); }} className="h-6 w-6 p-0 text-gray-400 hover:text-red-500">
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
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{new Date(ticket.lastMessageTimestamp || ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{new Date(ticket.lastMessageTimestamp || ticket.createdAt).toLocaleDateString('pt-BR')}</span>
                          <Badge className={`mt-1 ${statusColors[ticket.status]}`}>{statusMap[ticket.status]}</Badge>
                        </CardContent>
                        {/* NOVO: Footer com os botões de ação */}
                        <CardFooter className="p-3 pt-3 mt-auto justify-end">
                            {ticket.status === 'pending' && (
                                <Button size="sm" onClick={() => handleStatusChange(ticket.id, 'in_progress')}>
                                    <Play className="w-4 h-4 mr-2" /> Iniciar Atendimento
                                </Button>
                            )}
                            {ticket.status === 'in_progress' && (
                                <div className="flex space-x-2">
                                    <Button size="sm" variant="outline" onClick={() => handleOpenChat(ticket)}>
                                         <MessageSquare className="w-4 h-4 mr-2" /> Responder
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => handleStatusChange(ticket.id, 'completed')}>
                                        <CheckCircle className="w-4 h-4 mr-2" /> Finalizar
                                    </Button>
                                </div>
                            )}
                        </CardFooter>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            </ScrollArea>
          </div>
        )}
      </Droppable>
    );
  };
  
  if (isLoading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Painel Kanban de Atendimento</h2>
        <div className="flex items-center justify-center min-h-[300px] text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin mr-3" /> Carregando tickets...
        </div>
      </div>
    );
  }

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

      {/* NOVO: Renderiza o modal de chat quando um ticket for selecionado */}
      {selectedTicket && (
        <ChatModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          ticket={selectedTicket}
          onSendMessage={sendMessage}
        />
      )}
    </div>
  );
};

export default KanbanBoard;