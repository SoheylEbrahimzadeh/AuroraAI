import React from 'react';
import { AppMode } from '../types';

interface LayoutProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentMode, onModeChange, children }) => {
  const navItems = [
    { mode: AppMode.GENERATE, icon: 'fa-wand-magic-sparkles', label: 'Text to Image' },
    { mode: AppMode.EDIT, icon: 'fa-eraser', label: 'Generative Fill' },
    { mode: AppMode.CHAT, icon: 'fa-comment-dots', label: 'AI Assistant' },
  ];

  return (
    <div className="flex h-dvh bg-dark-bg text-dark-text overflow-hidden font-sans selection:bg-blue-500 selection:text-white">
      {/* Minimal Sidebar */}
      <div className="w-16 bg-[#181818] border-r border-dark-border flex-shrink-0 flex flex-col items-center py-6 z-30 shadow-2xl">
        {/* Logo */}
        <div className="w-10 h-10 rounded-xl bg-firefly-gradient flex items-center justify-center shadow-lg mb-8 cursor-pointer hover:scale-105 transition-transform group relative">
           <svg className="w-6 h-6 text-white drop-shadow-sm transform group-hover:-translate-y-0.5 transition-transform" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M12 2L2 22H22L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.2)"/>
             <path d="M12 6L7 18H17L12 6Z" fill="currentColor"/>
           </svg>
        </div>

        <nav className="flex-1 flex flex-col gap-6 w-full items-center">
          {navItems.map((item) => (
            <button
              key={item.mode}
              onClick={() => onModeChange(item.mode)}
              className={`group flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 relative
                ${currentMode === item.mode 
                  ? 'bg-dark-panel text-white' 
                  : 'text-dark-muted hover:text-dark-text hover:bg-dark-panel'}`}
              title={item.label}
            >
              <i className={`fa-solid ${item.icon} text-lg ${currentMode === item.mode ? 'bg-clip-text text-transparent bg-firefly-gradient' : ''}`}></i>
              {currentMode === item.mode && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-r-full -ml-[1px]"></div>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4 items-center">
           {/* Credit */}
           <div className="writing-mode-vertical text-[9px] text-dark-muted opacity-50 tracking-widest transform rotate-180 whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
              SOHEYL EBRAHIMZADEH
           </div>
           {/* User Profile Mockup */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 border border-gray-500 flex items-center justify-center text-xs text-gray-200">
             <i className="fa-solid fa-user"></i>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col bg-dark-bg">
        {children}
      </main>
    </div>
  );
};