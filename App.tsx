import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { AppMode } from './types';
import { ImageGenerator } from './features/ImageGenerator';
import { ImageEditor } from './features/ImageEditor';
import { ChatInterface } from './features/Chat';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.GENERATE);

  const renderContent = () => {
    switch (mode) {
      case AppMode.GENERATE:
        return <ImageGenerator />;
      case AppMode.EDIT:
        return <ImageEditor />;
      case AppMode.CHAT:
        return <ChatInterface />;
      default:
        return <ImageGenerator />;
    }
  };

  return (
    <Layout currentMode={mode} onModeChange={setMode}>
      {renderContent()}
    </Layout>
  );
};

export default App;