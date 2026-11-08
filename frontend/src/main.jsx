import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

function fetchNow() {
  // custom event to trigger reload in App if needed (not used here)
  window.dispatchEvent(new Event('fetchNow'));
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

