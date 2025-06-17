// src/pages/RegisterPage.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/components/ui/use-toast";
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
// NOVO: Importações do Firebase
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase'; // Importa a instância de auth

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: "Erro de Cadastro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);

    try {
      // ALTERADO: A lógica de fetch foi substituída pela chamada direta ao Firebase
      await createUserWithEmailAndPassword(auth, email, password);

      toast({
        title: "Cadastro Realizado!",
        description: "Sua conta foi criada. Agora você pode fazer login.",
      });
      navigate('/login'); // Redireciona para a página de login após o sucesso
    
    } catch (error: unknown) { // Tratamento de erro do Firebase
      let errorMessage = "Ocorreu um erro desconhecido.";
      if (error instanceof Error) {
        // Mapeia os erros comuns do Firebase para mensagens amigáveis
        if (error.message.includes('auth/email-already-in-use')) {
          errorMessage = 'Este e-mail já está em uso.';
        } else if (error.message.includes('auth/weak-password')) {
          errorMessage = 'A senha deve ter pelo menos 6 caracteres.';
        } else {
            errorMessage = error.message;
        }
      }
      toast({
        title: "Erro no Cadastro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <UserPlus className="mx-auto h-10 w-10 text-blue-600" />
          <CardTitle className="text-3xl font-bold mt-2">Criar Conta</CardTitle>
          <CardDescription>Junte-se à Abrão Tech e automatize seu WhatsApp!</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seuemail@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmar Senha</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="********"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Cadastrando...' : 'Cadastrar'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-sm text-center flex flex-col gap-2">
          <p>Já tem uma conta?{' '}
            <Link to="/login" className="text-blue-600 hover:underline">
              Faça login
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default RegisterPage;