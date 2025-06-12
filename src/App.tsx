// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom"; // Adicionado Navigate, Outlet
import React from "react"; // Importar React
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage"; // Importar LoginPage
import RegisterPage from "./pages/RegisterPage"; // Importar RegisterPage

const queryClient = new QueryClient();

// Componente de Rota Protegida
const ProtectedRoute = () => {
  const isAuthenticated = localStorage.getItem('authToken'); // Verifica se o token existe

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />; // Renderiza o componente filho da rota
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Rotas Protegidas */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Index />} />
            {/* Outras rotas protegidas viriam aqui */}
          </Route>

          {/* Rota catch-all para 404 - deve vir por último */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;