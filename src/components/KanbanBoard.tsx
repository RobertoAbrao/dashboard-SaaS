// src/components/KanbanBoard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Phone, Play, CheckCircle, Clock, Calendar, MessageSquare, ExternalLink, XCircle, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

// NOVO: Importações do Firebase e do nosso AuthProvider
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '@/App'; // Usando o contexto de autenticação

// Interfaces (permanecem as mesmas)
interface Ticket {
  id: string;
  phoneNumber: string;
  contactName?: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  messagePreview: string;
  lastMessageTimestamp?: string;
}

// ... (statusMap e statusColors permanecem os mesmos)
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
  const { user } = useAuth(); // Pega o usuário logado do contexto
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // ... (outros estados do modal permanecem os mesmos)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  
  // ALTERADO: useEffect para escutar o Firestore em tempo real
  useEffect(() => {
    if (!user) return; // Se não há usuário, não faz nada

    // Cria uma referência para a subcoleção 'kanban_tickets' do usuário logado
    const ticketsCollectionRef = collection(db, 'users', user.uid, 'kanban_tickets');
    
    // Cria uma query para ordenar os tickets pelo último timestamp
    const q = query(ticketsCollectionRef, orderBy('lastMessageTimestamp', 'desc'));

    // onSnapshot é o listener em tempo real do Firestore
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const ticketsData = querySnapshot.docs.map(doc => doc.data() as Ticket);
      setTickets(ticketsData);
      console.log("Tickets carregados do Firestore:", ticketsData);
    });

    // Função de limpeza para remover o listener quando o componente for desmontado
    return () => unsubscribe();

  }, [user]); // Roda o efeito sempre que o usuário mudar

  // ALTERADO: onDragEnd agora atualiza o documento no Firestore
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || !user) return;

    const newStatus = destination.droppableId as Ticket['status'];
    
    // Atualiza o estado local imediatamente para uma UI mais rápida
    setTickets(prevTickets => 
      prevTickets.map(ticket => 
        ticket.id === draggableId ? { ...ticket, status: newStatus } : ticket
      )
    );

    // Atualiza o documento no Firestore
    const ticketDocRef = doc(db, 'users', user.uid, 'kanban_tickets', draggableId);
    try {
      await updateDoc(ticketDocRef, { status: newStatus });
      toast({ title: "Ticket Movido", description: `Ticket movido para ${statusMap[newStatus]}.` });
    } catch (error) {
      toast({ title: "Erro ao Mover", description: "Não foi possível atualizar o ticket.", variant: "destructive" });
      // Reverte o estado local em caso de erro
      setTickets(prevTickets => 
        prevTickets.map(ticket => 
          ticket.id === draggableId ? { ...ticket, status: source.droppableId as Ticket['status'] } : ticket
        )
      );
    }
  };
  
  // ALTERADO: handleCloseTicket agora deleta o documento do Firestore
  const handleCloseTicket = useCallback(async (ticketId: string) => {
    if (!user) return;
    const ticketDocRef = doc(db, 'users', user.uid, 'kanban_tickets', ticketId);
    try {
        await deleteDoc(ticketDocRef);
        toast({ title: "Ticket Removido", description: "O ticket foi removido do painel." });
    } catch (error) {
        toast({ title: "Erro ao Remover", description: "Não foi possível remover o ticket.", variant: "destructive" });
    }
  }, [user, toast]);
  
  // O restante das funções (handleStartChat, handleMarkAsComplete, renderColumn, etc.)
  // pode permanecer o mesmo, pois elas interagem com o estado local 'tickets' ou chamam
  // outras funções que já foram adaptadas.

  // ... (cole o resto do seu componente KanbanBoard.tsx aqui, a lógica de renderização não muda)
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
    </div>
  );
};

export default KanbanBoard;