import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { App } from '@/app'
import { AuthProvider } from '@/lib/auth'
import { adminRouterBase } from '@/lib/admin-entry'
import './index.css'

const routerBase = adminRouterBase()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={routerBase}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
