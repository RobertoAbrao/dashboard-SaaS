// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Substitua pelas credenciais da sua aplicação web do Firebase
// Você encontra isso no Console do Firebase > Configurações do Projeto > Geral > Seus apps
const firebaseConfig = {
  apiKey: "AIzaSyDKWM4qSPlFFm0xhQFMHLytmKL_ELqXe3k",
  authDomain: "dashboard-saas-612db.firebaseapp.com",
  projectId: "dashboard-saas-612db",
  storageBucket: "dashboard-saas-612db.firebasestorage.app",
  messagingSenderId: "4996722374",
  appId: "1:4996722374:web:b00d7bbc34002efc68b1c7",
  measurementId: "G-HMXM1LYZE2"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços que você vai usar
export const auth = getAuth(app);
export const db = getFirestore(app);