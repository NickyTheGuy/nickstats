import { createRoot } from 'react-dom/client';
import Analyzer from './Analyzer.jsx';
const host = document.getElementById('analyzerApp');
if (host) createRoot(host).render(<Analyzer />);
