import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import './index.css'
import App from './App.tsx'
import { chooseShowcase } from './storage'

const showcase = chooseShowcase()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App showcase={showcase.index} showcaseError={showcase.error} />
  </StrictMode>,
)
