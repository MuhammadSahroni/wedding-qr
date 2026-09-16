import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import SelfCheckin from './SelfCheckin.jsx'
import './index.css'

function Root() {
  const [isSelfCheckin, setIsSelfCheckin] = useState(() => {
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return (
      path.includes('self-checkin') ||
      path.includes('mandiri') ||
      search.includes('self') ||
      search.includes('mandiri') ||
      hash.includes('self-checkin') ||
      hash.includes('mandiri')
    );
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      setIsSelfCheckin(
        path.includes('self-checkin') ||
        path.includes('mandiri') ||
        search.includes('self') ||
        search.includes('mandiri') ||
        hash.includes('self-checkin') ||
        hash.includes('mandiri')
      );
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  return isSelfCheckin ? <SelfCheckin /> : <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
