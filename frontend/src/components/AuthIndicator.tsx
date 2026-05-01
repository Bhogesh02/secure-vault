import React from 'react';

export const AuthIndicator: React.FC = () => {
  return (
    <div className="microsoft-auth-indicator">
      <div className="dot"></div>
      <div className="dot"></div>
      <div className="dot"></div>
      <div className="dot"></div>
      <div className="dot"></div>
      
      <style>{`
        .microsoft-auth-indicator {
          position: relative;
          width: 100%;
          height: 4px;
          overflow: hidden;
          background: transparent;
          margin-bottom: 24px;
        }

        .dot {
          position: absolute;
          width: 4px;
          height: 4px;
          background-color: #3b82f6;
          border-radius: 50%;
          opacity: 0;
          animation: move 2.5s infinite cubic-bezier(0.2, 0.6, 0.8, 0.4);
        }

        .dot:nth-child(1) { animation-delay: 0s; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
        .dot:nth-child(4) { animation-delay: 0.6s; }
        .dot:nth-child(5) { animation-delay: 0.8s; }

        @keyframes move {
          0% {
            left: 0%;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            left: 100%;
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
