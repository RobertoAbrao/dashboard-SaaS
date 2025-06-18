// src/components/KanbanBoard.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Phone, CheckCircle, Clock, Calendar, MessageSquare, XCircle, Loader2, Play, Send, File, Music, Image as ImageIcon, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection';
import { cn } from '@/lib/utils';

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

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'contact';
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  url?: string;
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
  const [history, setHistory] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !user) return;

    setIsLoadingHistory(true);
    const messagesRef = collection(db, 'users', user.uid, 'kanban_tickets', ticket.id, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const messageHistory = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setHistory(messageHistory);
      setIsLoadingHistory(false);
    }, (error) => {
      console.error("Erro ao buscar histórico:", error);
      toast({ title: "Erro", description: "Não foi possível carregar o histórico da conversa.", variant: "destructive" });
      setIsLoadingHistory(false);
    });

    return () => unsubscribe();
  }, [isOpen, user, ticket.id, toast]);

  useEffect(() => {
    setTimeout(() => {
       if (scrollAreaRef.current) {
         const scrollableNode = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
         if (scrollableNode) {
            scrollableNode.scrollTop = scrollableNode.scrollHeight;
         }
       }
    }, 100);
  }, [history]);

  const handleSendReply = async () => {
    if (!replyMessage.trim()) return;
    setIsSending(true);
    try {
      await onSendMessage(ticket.phoneNumber, replyMessage);
      setReplyMessage('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
      toast({ title: "Erro ao Enviar", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const renderMessageContent = (msg: Message) => {
    switch (msg.type) {
        case 'image':
            return (
                <a href={msg.url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={msg.url} alt={msg.text || 'Imagem enviada'} className="max-w-full h-auto rounded-md cursor-pointer" />
                    {msg.text && <p className="text-sm mt-1">{msg.text}</p>}
                </a>
            );
        case 'audio':
            return (
                <div className="flex flex-col items-start w-full">
                    <audio controls src={msg.url} className="w-full">
                        Seu navegador não suporta o elemento de áudio.
                    </audio>
                    <a href={msg.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 flex items-center">
                        <Download className="w-3 h-3 mr-1" />
                        Baixar áudio
                    </a>
                </div>
            );
        case 'video':
            return <video controls src={msg.url} className="max-w-full h-auto rounded-md" />;
        case 'document':
             return (
                <a href={msg.url} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 p-2 bg-gray-200 rounded-md hover:bg-gray-300">
                    <File className="w-5 h-5" />
                    <span>{msg.text || 'Documento'}</span>
                </a>
             );
        default:
            return msg.text;
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl flex flex-col h-[80vh] max-h-[800px]">
        <DialogHeader>
          <DialogTitle>Conversa com {ticket.contactName || ticket.phoneNumber}</DialogTitle>
          <DialogDescription>Responda ao cliente abaixo.</DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-grow bg-gray-50 p-4 rounded-md border" ref={scrollAreaRef}>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((msg) => (
                <div key={msg.id} className={cn("flex w-full", msg.sender === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn("max-w-[75%] p-2 px-3 rounded-lg text-sm flex flex-col", msg.sender === 'user' ? 'bg-green-200' : 'bg-white shadow-sm')}>
                    {renderMessageContent(msg)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="mt-auto pt-4">
          <div className="flex items-center space-x-2">
            <Textarea
              placeholder="Digite sua resposta aqui..."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              rows={1}
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              className="resize-none"
            />
            <Button type="submit" size="icon" onClick={handleSendReply} disabled={isSending || !replyMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- Componente Principal do Kanban (sem alterações) ---
const KanbanBoard = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { sendMessage } = useWhatsAppConnection();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

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