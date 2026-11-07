import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/fonts.js';
import './theme/tokens.css';
import './styles/layout.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
