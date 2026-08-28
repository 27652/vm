
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import App_p1 from './App-p1.tsx'

createRoot(document.getElementById('root')!).render(
<>
    <App />,
    <App_p1 /></>
,
)
