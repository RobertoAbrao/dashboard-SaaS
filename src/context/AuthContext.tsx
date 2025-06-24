// src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, ReactNode } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth"; // NOVO: importado o signOut
import { auth } from "../lib/firebase";

// Interface para o tipo de valor do contexto
interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>; // NOVO: Adicionada a função logout
}

// O contexto agora espera um valor que corresponda à nova interface
export const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true,
  logout: () => Promise.resolve(), // valor padrão
});

// Componente Provedor do Contexto
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // NOVO: Função de logout que encapsula o signOut do Firebase
  const logout = async () => {
    await signOut(auth);
  };

  // Fornecemos o usuário, o status de loading E a função de logout para os componentes filhos
  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};