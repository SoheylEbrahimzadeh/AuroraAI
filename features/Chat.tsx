import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/gemini';
import { ChatMessage } from '../types';
import { Button } from '../components/Button';
import { GenerateContentResponse } from '@google/genai';

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinkingMode, setIsThinkingMode] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    const userText = inputValue;
    setInputValue('');
    setIsStreaming(true);

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: userText
    };

    setMessages(prev => [...prev, newUserMsg]);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const modelMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: modelMsgId,
        role: 'model',
        text: '',
        isThinking: isThinkingMode
      }]);

      const stream = await sendChatMessage(history, userText, isThinkingMode ? 'thinking' : 'fast');

      let accumulatedText = '';

      for await (const chunk of stream) {
        const chunkText = (chunk as GenerateContentResponse).text;
        if (chunkText) {
          accumulatedText += chunkText;
          setMessages(prev => prev.map(msg => 
            msg.id === modelMsgId ? { ...msg, text: accumulatedText } : msg
          ));
        }
      }

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: 'Sorry, I encountered an error processing your request.'
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-bg relative">
      {/* Top Bar */}
      <div className="h-14 border-b border-dark-border bg-[#181818] flex items-center px-6 justify-between flex-shrink-0 z-10 shadow-sm">
        <h2 className="text-sm font-semibold text-dark-text tracking-wide">Assistant</h2>
        <div className="flex items-center gap-4 bg-dark-surface px-3 py-1.5 rounded-full border border-dark-border">
          <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${!isThinkingMode ? 'text-blue-400' : 'text-dark-muted'}`}>Fast</span>
          <button 
            onClick={() => setIsThinkingMode(!isThinkingMode)}
            className={`w-10 h-5 rounded-full p-0.5 transition-all duration-300 ease-in-out ${isThinkingMode ? 'bg-purple-600' : 'bg-gray-600'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-300 ${isThinkingMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${isThinkingMode ? 'text-purple-400' : 'text-dark-muted'}`}>Reasoning</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-dark-muted opacity-60">
            <div className="w-16 h-16 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center mb-6">
                 <i className="fa-solid fa-sparkles text-2xl text-dark-muted"></i>
            </div>
            <p className="text-lg font-medium text-dark-text">How can I create with you today?</p>
            <div className="flex gap-2 mt-6">
                 <button onClick={() => setInputValue("Give me ideas for a surreal landscape")} className="text-xs bg-dark-surface hover:bg-dark-panel px-4 py-2 rounded-full border border-dark-border text-dark-muted transition-colors">Creative ideas</button>
                 <button onClick={() => setInputValue("How do I improve lighting in my photos?")} className="text-xs bg-dark-surface hover:bg-dark-panel px-4 py-2 rounded-full border border-dark-border text-dark-muted transition-colors">Photography tips</button>
            </div>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] lg:max-w-[70%] px-6 py-5 rounded-2xl shadow-sm ${
              msg.role === 'user' 
                ? 'bg-dark-panel text-white border border-dark-border' 
                : 'bg-transparent text-dark-text pl-0'
            }`}>
              {msg.role === 'model' && (
                <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-wider opacity-60 text-dark-muted">
                   <i className={`fa-solid ${msg.isThinking ? 'fa-brain text-purple-400' : 'fa-bolt text-blue-400'}`}></i>
                   {msg.isThinking ? 'Gemini 3 Pro' : 'Gemini 2.5 Flash'}
                </div>
              )}
              <div className="prose prose-invert prose-sm whitespace-pre-wrap leading-relaxed text-gray-300">
                {msg.text || (isStreaming && msg.role === 'model' ? <span className="animate-pulse text-dark-muted">Thinking...</span> : '')}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-dark-bg border-t border-dark-border">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative">
          <div className="relative">
             <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isThinkingMode ? "Ask complex questions..." : "Send a message..."}
                className="relative w-full bg-[#1E1E1E] border border-dark-border text-white rounded-full pl-6 pr-14 py-4 focus:outline-none focus:border-gray-500 transition-all placeholder-gray-500 shadow-lg"
                disabled={isStreaming}
            />
            <button 
                type="submit"
                disabled={!inputValue.trim() || isStreaming}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-firefly-gradient rounded-full text-white flex items-center justify-center disabled:opacity-50 disabled:bg-gray-700 transition-all hover:scale-105"
            >
                {isStreaming ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                <i className="fa-solid fa-arrow-up text-sm"></i>
                )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};