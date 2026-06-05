import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  sender: 'AI' | 'USER';
  text: string;
}

interface AIChatSidebarProps {
  onSendMessage: (text: string) => Promise<string>;
}

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({ onSendMessage }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'AI',
      text: '👋 **Hello! I\'m your Solana AI Analyst Bot.**\n\nI have a live feed linked to Binance SOL/USDT market stream.\n\nHere are some topics you can ask me about:\n* **"Analyze SOL indicators"** - Get live RSI, MACD, and Bollinger Bands analysis.\n* **"Should I buy SOL now?"** - Confluence buying score calculations.\n* **"How does the Grid strategy look?"** - Boundaries and recommendations.\n\nAsk me anything!'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'Analyze SOL indicators',
    'Should I buy SOL now?',
    'Grid strategy status',
    'Backtest RSI strategy'
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'USER',
      text: textToSend
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    try {
      const responseText = await onSendMessage(textToSend);
      
      // Add AI response message
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'AI',
        text: responseText
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'AI',
        text: '❌ Sorry, I encountered an issue reaching the analyst engine. Please verify the backend service is running.'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // Basic markdown bold/list renderer
  const renderMessageContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Check for lists
      if (line.startsWith('* ')) {
        const parsedLine = parseInlineStyles(line.substring(2));
        return <li key={i} style={{ marginLeft: '12px', listStyleType: 'disc' }}>{parsedLine}</li>;
      }
      if (line.startsWith('📊 ') || line.startsWith('📐 ') || line.startsWith('💡 ') || line.startsWith('👋 ')) {
        return <h4 key={i} style={{ marginTop: '8px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>{parseInlineStyles(line)}</h4>;
      }
      return <p key={i} style={{ minHeight: line.trim() === '' ? '8px' : '0', marginBottom: '4px' }}>{parseInlineStyles(line)}</p>;
    });
  };

  const parseInlineStyles = (text: string) => {
    const boldRegex = /\*\*(.*?)\*\*/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(<strong key={match.index}>{match[1]}</strong>);
      lastIndex = boldRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="chat-panel">
      <div className="card-header" style={{ margin: 0, padding: '16px', borderBottom: '1px solid var(--border-color)', height: '54px', flexShrink: 0 }}>
        <div className="card-title text-ai" style={{ fontSize: '0.9rem' }}>
          <Sparkles size={16} />
          SOLANA AI TRADING CO-PILOT
        </div>
      </div>

      <div className="chat-messages">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`chat-bubble ${msg.sender === 'USER' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              {msg.sender === 'USER' ? (
                <>
                  <User size={10} />
                  <span>Trader</span>
                </>
              ) : (
                <>
                  <Bot size={10} />
                  <span className="text-ai">AI Analyst</span>
                </>
              )}
            </div>
            <div>{renderMessageContent(msg.text)}</div>
          </div>
        ))}
        {isTyping && (
          <div className="chat-bubble chat-bubble-ai">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <Bot size={10} />
              <span>Analyzing market data...</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
              <div style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', animation: 'bounce 1s infinite alternate' }}></div>
              <div style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', animation: 'bounce 1s infinite alternate 0.2s' }}></div>
              <div style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', animation: 'bounce 1s infinite alternate 0.4s' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-prompts">
        {quickPrompts.map((prompt, i) => (
          <button
            key={i}
            className="quick-prompt-btn"
            onClick={() => handleSend(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="chat-input-area"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(inputValue);
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask AI analyst about indicators, buys..."
          className="chat-input"
          disabled={isTyping}
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '8px 12px' }} disabled={isTyping}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
