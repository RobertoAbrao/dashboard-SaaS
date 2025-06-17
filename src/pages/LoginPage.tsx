// src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/components/ui/use-toast";
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
// NOVO: Importações do Firebase
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase'; // Importa a instância de auth

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // ALTERADO: A lógica de fetch foi substituída pela chamada direta ao Firebase
      await signInWithEmailAndPassword(auth, email, password);
      
      toast({
        title: "Login Bem-sucedido!",
        description: "Você será redirecionado para o painel.",
      });
      navigate('/'); // O App.tsx irá lidar com o estado de autenticação e redirecionar
    
    } catch (error: unknown) { // Tratamento de erro do Firebase
      let errorMessage = "Credenciais inválidas ou erro de conexão.";
      if (error instanceof Error) {
        if (error.message.includes('auth/invalid-credential')) {
            errorMessage = 'E-mail ou senha inválidos. Por favor, tente novamente.';
        } else {
            errorMessage = error.message;
        }
      }
      toast({
        title: "Erro no Login",
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
          <Lock className="mx-auto h-10 w-10 text-purple-600" />
          <CardTitle className="text-3xl font-bold mt-2">Acessar Painel</CardTitle>
          <CardDescription>Faça login para continuar na Abrão Tech</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-sm text-center flex flex-col gap-2">
          <p>Não tem uma conta?{' '}
            <Link to="/register" className="text-blue-600 hover:underline">
              Cadastre-se
            </Link>
          </p>
          <Link to="#" className="text-sm text-gray-500 hover:underline">
            Esqueceu a senha?
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginPage;