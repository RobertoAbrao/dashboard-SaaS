import React, { createContext, useState, useEffect, ReactNode, useContext } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase";

// Interface para o tipo de valor do contexto
interface AuthContextType {
  user: User | null;
  loading: boolean;
}

// ALTERADO: Agora exportamos o AuthContext para que o hook possa usá-lo
export const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

// REMOVIDO: O hook `useAuth` não será mais exportado deste arquivo.

// Componente Provedor do Contexto
interface AuthProviderProps {
  children: ReactNode;
}

// Voltamos a usar 'export const' para manter a consistência
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

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};