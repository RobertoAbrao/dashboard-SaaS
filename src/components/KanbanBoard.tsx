// src/components/KanbanBoard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Phone, CheckCircle, Clock, Calendar, MessageSquare, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';

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

// --- Componente Principal ---

const KanbanBoard = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true); // NOVO: Estado de carregamento

  // Efeito para buscar os tickets do Firestore em tempo real
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const ticketsCollectionRef = collection(db, 'users', user.uid, 'kanban_tickets');
    const q = query(ticketsCollectionRef, orderBy('lastMessageTimestamp', 'desc'));

    // O onSnapshot cria um listener em tempo real para o banco de dados
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        const ticketsData = querySnapshot.docs.map(doc => doc.data() as Ticket);
        setTickets(ticketsData);
        setIsLoading(false); // Desativa o loading após carregar
      },
      (error) => {
        // NOVO: Tratamento de erro para o listener
        console.error("[Firestore Listener Error]", error);
        toast({
            title: "Erro ao Carregar Tickets",
            description: "Não foi possível buscar os dados do Kanban. Verifique permissões do Firestore.",
            variant: "destructive"
        });
        setIsLoading(false);
      }
    );

    // Função de limpeza que remove o listener ao desmontar o componente
    return () => unsubscribe();

  }, [user, toast]);

  // Função chamada ao finalizar o arraste de um ticket
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || !user) return;

    const newStatus = destination.droppableId as Ticket['status'];
    
    // Atualização otimista da UI para resposta rápida
    const originalTickets = [...tickets];
    setTickets(prevTickets => 
      prevTickets.map(ticket => 
        ticket.id === draggableId ? { ...ticket, status: newStatus } : ticket
      )
    );

    const ticketDocRef = doc(db, 'users', user.uid, 'kanban_tickets', draggableId);
    try {
      await updateDoc(ticketDocRef, { status: newStatus });
      toast({ title: "Ticket Movido", description: `Ticket movido para ${statusMap[newStatus]}.` });
    } catch (error) {
      toast({ title: "Erro ao Mover", description: "Não foi possível atualizar o ticket.", variant: "destructive" });
      // Reverte a mudança na UI em caso de erro
      setTickets(originalTickets);
    }
  };
  
  // Função para remover um ticket concluído
  const handleCloseTicket = useCallback(async (ticketId: string) => {
    if (!user) return;

    // MELHORIA: Atualização otimista para remoção
    const originalTickets = [...tickets];
    setTickets(prevTickets => prevTickets.filter(ticket => ticket.id !== ticketId));

    const ticketDocRef = doc(db, 'users', user.uid, 'kanban_tickets', ticketId);
    try {
        await deleteDoc(ticketDocRef);
        toast({ title: "Ticket Removido", description: "O ticket foi removido do painel." });
    } catch (error) {
        toast({ title: "Erro ao Remover", description: "Não foi possível remover o ticket.", variant: "destructive" });
        // Reverte a remoção na UI em caso de erro
        setTickets(originalTickets);
    }
  }, [user, toast, tickets]);
  
  // Função para renderizar cada coluna do Kanban
  const renderColumn = (status: Ticket['status'], title: string) => {
    const columnTickets = tickets.filter(ticket => ticket.status === status);

    return (
      <Droppable droppableId={status}>
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="flex-1 bg-gray-50 p-4 rounded-lg shadow-inner min-h-[500px] border border-gray-200 flex flex-col"
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
              {title} <Badge variant="secondary" className="ml-2 px-2 py-0.5 rounded-full">{columnTickets.length}</Badge>
            </h3>
            <div className="flex-grow space-y-3 overflow-y-auto pr-2">
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
                          {new Date(ticket.lastMessageTimestamp || ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(ticket.lastMessageTimestamp || ticket.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                        <Badge className={`mt-1 ${statusColors[ticket.status]}`}>
                          {statusMap[ticket.status]}
                        </Badge>
                      </CardContent>
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
  
  // NOVO: Renderização do estado de carregamento
  if (isLoading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Painel Kanban de Atendimento</h2>
        <div className="flex items-center justify-center min-h-[300px] text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          Carregando tickets...
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
    </div>
  );
};

export default KanbanBoard;