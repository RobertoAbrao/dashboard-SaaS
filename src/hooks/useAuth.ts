import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

// O hook agora vive em seu próprio arquivo.
export const useAuth = () => {
  return useContext(AuthContext);
};