import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api';
import App from './App.tsx';
import './index.css';

// 조회 결과를 보관하는 저장소. 앱 전체가 하나를 함께 쓴다
const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>,
);
