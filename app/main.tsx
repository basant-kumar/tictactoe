import { createRoot } from 'react-dom/client';

import './globals.css';
import Home from './page';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('The application root element is missing.');
}

createRoot(rootElement).render(<Home />);
