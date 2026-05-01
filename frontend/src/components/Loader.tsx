import React from 'react';
import { Shield } from 'lucide-react';
import '../styles/_base.scss'; // For spin animation if needed, but we'll use local styles for perfection

import { AuthIndicator } from "./AuthIndicator";

interface LoaderProps {
  message?: string;
  fullPage?: boolean;
}

export const Loader: React.FC<LoaderProps> = ({ 
  message = "Securing Environment...", 
  fullPage = true 
}) => {
  const containerStyle: React.CSSProperties = fullPage ? {
    height: '100vh',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 9999,
  } : {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    gap: '1rem',
  };

  return (
    <div style={containerStyle} className="loader-container">
      <div style={{ width: '300px', marginBottom: '20px' }}>
        <AuthIndicator />
      </div>
      <div style={{
        position: 'relative',
        width: '80px',
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Modern Pulse Ring */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '4px solid #3b82f6',
          opacity: 0.1,
        }} />
        
        {/* Rotating Outer Ring */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '4px solid transparent',
          borderTopColor: '#3b82f6',
          animation: 'spin 1s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite',
        }} />

        {/* Inner Shield Icon */}
        <Shield 
          size={32} 
          color="#3b82f6" 
          style={{ 
            position: 'relative',
            zIndex: 1,
            animation: 'pulse 2s ease-in-out infinite'
          }} 
        />
      </div>

      {message && (
        <p style={{
          marginTop: '1.5rem',
          fontWeight: 700,
          color: '#0f172a',
          fontSize: '0.9375rem',
          letterSpacing: '-0.01em',
          fontFamily: 'Outfit, sans-serif'
        }}>
          {message}
        </p>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
};
