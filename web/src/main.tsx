import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import { queryClient } from '@/lib/queryClient';
import { bootstrapAuth } from '@/store/auth';
import { bootstrapTheme } from '@/store/ui';
import '@/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Element racine introuvable.');

const root = createRoot(container);

/** La session persistée est restaurée avant le premier rendu. */
const start = () => {
  bootstrapTheme();

  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <RealtimeProvider>
            <App />
          </RealtimeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
};

void bootstrapAuth().then(start);
