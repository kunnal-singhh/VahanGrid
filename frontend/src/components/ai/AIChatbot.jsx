import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, User, Loader2, Zap, BatteryCharging, ShieldCheck } from 'lucide-react';
import { aiService } from '../../services/aiService';
import ChatSuggestions from './ChatSuggestions';
import evBanner from '../../assets/ev_banner.png';

export default function AIChatbot({
  userSoc = 75,
  selectedVehicle,
  balance = 0,
}) {
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: "Namaste! I am your **VahanGrid Mobility Copilot** ⚡🇮🇳\n\nAsk me about EV range feasibility, highway corridor charging stops, tariff comparisons, or VahanPass cross-network roaming rules.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (customPrompt) => {
    const queryText = (customPrompt || input).trim();
    if (!queryText) return;

    setMessages((prev) => [...prev, { role: 'user', text: queryText }]);
    setInput('');
    setIsTyping(true);

    const reply = await aiService.queryCopilot({
      query: queryText,
      userSoc,
      vehicle: selectedVehicle,
    });

    setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
    setIsTyping(false);
  };

  const renderFormattedText = (text) => {
    // Basic markdown parsing for headers, bold, bullets
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-xs font-bold text-sky-400 mt-2 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }
      if (line.startsWith('• ') || line.startsWith('- ')) {
        return (
          <li key={idx} className="ml-4 list-disc text-slate-300 text-xs my-0.5">
            {formatBold(line.replace(/^[•-]\s*/, ''))}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p key={idx} className="text-xs text-slate-200 leading-relaxed my-0.5">
          {formatBold(line)}
        </p>
      );
    });
  };

  const formatBold = (str) => {
    const parts = str.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <em key={i} className="italic text-sky-300">
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Banner */}
      <div className="relative rounded-2xl overflow-hidden glass border-white/[.08] flex items-center justify-between p-4 md:p-6 min-h-[110px] md:min-h-[130px]">
        <div className="relative z-10 flex items-start gap-3 md:gap-4 max-w-xl">
          <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
            <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-black text-white">
                VahanGrid Mobility Copilot
              </h2>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Phase 1 Preview
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Intelligent EV Highway Assistant for India Corridors
            </p>
            <div className="hidden sm:flex items-center gap-4 mt-2.5 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <BatteryCharging className="w-3 h-3 text-emerald-400" /> Active SoC: {userSoc}%
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-sky-400" /> {selectedVehicle?.name || 'Tata Nexon EV Max'}
              </span>
            </div>
          </div>
        </div>

        {/* Right side banner image */}
        <div className="absolute right-0 top-0 bottom-0 w-[40%] overflow-hidden pointer-events-none hidden md:block">
          <div className="absolute inset-0 banner-gradient z-10" />
          <img
            src={evBanner}
            alt="EV Charging"
            className="w-full h-full object-cover object-center opacity-70"
          />
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="glass rounded-2xl border border-white/[.08] p-4 md:p-5 flex flex-col h-[520px] md:h-[580px]">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={index}
                className={`flex gap-3 items-start animate-fade-in ${
                  isUser ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-sky-500 text-white'
                      : 'bg-white/[.06] border border-white/[.1] text-sky-400'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`rounded-2xl p-3.5 max-w-[85%] sm:max-w-[75%] ${
                    isUser
                      ? 'bg-sky-600/90 text-white rounded-tr-none shadow-md shadow-sky-600/20'
                      : 'bg-white/[.03] border border-white/[.06] rounded-tl-none'
                  }`}
                >
                  {isUser ? (
                    <p className="text-xs">{msg.text}</p>
                  ) : (
                    <div>{renderFormattedText(msg.text)}</div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex gap-3 items-center text-slate-400 text-xs animate-pulse">
              <div className="w-8 h-8 rounded-xl bg-white/[.06] border border-white/[.1] flex items-center justify-center text-sky-400 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="glass rounded-2xl px-4 py-2 text-xs flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                <span>Copilot is formulating route recommendations...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="pt-3 pb-2 border-t border-white/[.06]">
          <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">
            Suggested Inquiries
          </div>
          <ChatSuggestions onSelectPrompt={(p) => handleSend(p)} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="pt-2 flex items-center gap-2"
        >
          <div className="flex-1 flex items-center bg-white/[.04] border border-white/[.08] rounded-xl px-3.5 py-2.5 focus-within:border-sky-500/40">
            <input
              type="text"
              placeholder="Ask Copilot about corridor range, CPO tariffs, or offline edge mode..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="h-10 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:from-sky-400 hover:to-emerald-400 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-500/10"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
}
