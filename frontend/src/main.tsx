import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './modules/app/index.js';
import { AuthProvider } from './modules/auth/AuthContext.js';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing root element');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
