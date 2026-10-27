import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './app/AppContext'
import { AuthProvider } from './app/AuthContext'
import { registerServiceWorker } from './app/pwa'
import { App } from './App'
import './styles/global.css'

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider><AppProvider><App /></AppProvider></AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
