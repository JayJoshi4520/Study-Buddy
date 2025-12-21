import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Bot,
  Cpu,
  User,
  MessagesSquare,
  Mic,
  MessageSquare,
  Copy,
  Check,
} from "lucide-react";
import {
  queryDocuments,
  switchModel,
  saveChatMessage,
  getChatMessages,
} from "../api";
import VoiceChatInterface from "./VoiceChatInterface";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import "highlight.js/styles/github.css";

export default function ChatInterface({
  sessionUuid,
  sessionData,
  onSwitchToVoice,
  onEndVoiceSession,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [switchingModel, setSwitchingModel] = useState(false);
  const [viewMode, setViewMode] = useState("text");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (sessionData?.session_type === "voice") {
      setViewMode("voice");
    } else {
      setViewMode("text");
    }
  }, [sessionData]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!sessionUuid || viewMode === "voice") return;

      try {
        const existingMessages = await getChatMessages(sessionUuid);
        const formattedMessages = [];
        for (const msg of existingMessages) {
          formattedMessages.push({
            type: "user",
            content: msg.message_content,
          });

          if (msg.response_content) {
            formattedMessages.push({
              type: "assistant",
              content: msg.response_content,
              model: msg.model_provider,
            });
          }
        }
        setMessages(formattedMessages);
      } catch (error) {
        console.error("Error loading chat messages:", error);
      }
    };
    loadMessages();
  }, [sessionUuid, viewMode]);

  const handleModelSwitch = async (provider) => {
    if (provider === selectedModel || isLoading || switchingModel) return;
    try {
      setSwitchingModel(true);
      await switchModel(provider);
      setSelectedModel(provider);
    } catch (error) {
      console.error("Error switching model:", error);
    } finally {
      setSwitchingModel(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput("");
    setIsLoading(true);

    setMessages((prev) => [...prev, { type: "user", content: question }]);

    const startTime = Date.now();
    let messageSaved = false;

    try {
      let assistantMessage = "";
      setMessages((prev) => [
        ...prev,
        { type: "assistant", content: "", loading: true },
      ]);

      const response = await queryDocuments(
        question,
        3,
        selectedModel,
        sessionUuid,
      );
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "error") {
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { type: "error", content: data.content },
                ]);
                break;
              } else if (data.type === "response") {
                assistantMessage += data.content;
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  {
                    type: "assistant",
                    content: assistantMessage,
                    model: data.provider,
                  },
                ]);
              } else if (data.type === "done") {
                if (sessionUuid && assistantMessage.trim() && !messageSaved) {
                  const processingTime = Date.now() - startTime;
                  await saveChatMessage(
                    sessionUuid,
                    question,
                    assistantMessage.trim(),
                    selectedModel,
                    null,
                    processingTime,
                  );
                  messageSaved = true;
                }
                break;
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        { type: "error", content: "Failed to get response." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceModeToggle = () => {
    if (sessionData?.session_type === "voice") {
      setViewMode(viewMode === "voice" ? "text" : "voice");
    } else {
      onSwitchToVoice?.();
    }
  };

  const cleanMarkdown = (raw) => {
    if (!raw && raw !== "") return "";
    let s = String(raw || "").replace(/\r\n/g, "\n");
    s = s.replace(/^\s*([*•-])\s*$(?:\r?\n)?/gm, "");
    s = s.replace(/\n{3,}/g, "\n\n");
    return s.trim();
  };

  const CodeBlock = ({ children, className }) => {
    const [copied, setCopied] = useState(false);
    const codeText = String(children).replace(/\n$/, "");

    const handleCopy = async () => {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="relative group my-4">
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-zinc-600"
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre
          className={`${className} rounded-lg bg-zinc-900 p-4 overflow-x-auto text-zinc-100 font-mono text-sm`}
        >
          <code>{children}</code>
        </pre>
      </div>
    );
  };

  const MessageBubble = ({ message }) => {
    const isUser = message.type === "user";
    const isError = message.type === "error";

    return (
      <div
        className={`w-full py-8 ${isUser ? "bg-transparent" : "bg-muted/30 border-y border-border/50"}`}
      >
        <div className="mx-auto max-w-3xl px-4 flex space-x-4 md:space-x-6">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded shadow-sm ${
              isUser
                ? "bg-primary"
                : "bg-gradient-to-br from-emerald-500 to-teal-600"
            }`}
          >
            {isUser ? (
              <User className="h-5 w-5 text-primary-foreground" />
            ) : (
              <Bot className="h-5 w-5 text-white" />
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-hidden">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              {isUser ? "You" : message.model || "Study Buddy"}
            </p>

            <div
              className={`prose prose-slate dark:prose-invert max-w-none break-words leading-relaxed ${isUser ? "text-input" : ""}`}
            >
              {message.loading ? (
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm italic">Thinking...</span>
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[
                    rehypeKatex,
                    rehypeRaw,
                    rehypeSanitize,
                    rehypeHighlight,
                  ]}
                  components={{
                    p: ({ children }) => (
                      <p className="mb-4 last:mb-0 leading-7">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc ml-6 space-y-2 mb-4">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal ml-6 space-y-2 mb-4">
                        {children}
                      </ol>
                    ),
                    code: ({ inline, className, children }) =>
                      inline ? (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">
                          {children}
                        </code>
                      ) : (
                        <CodeBlock className={className}>{children}</CodeBlock>
                      ),
                  }}
                >
                  {cleanMarkdown(message.content)}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const isVoiceSession = sessionData?.session_type === "voice";

  if (!sessionUuid) {
    return (
      <div
        className="flex h-full items-center justify-center bg-card font-sans"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <div className="text-center px-6">
          <MessagesSquare className="mx-auto h-16 w-16 text-muted-foreground/30 mb-6" />
          <h3 className="text-2xl font-bold text-foreground mb-3">
            No Chat Selected
          </h3>
          <p className="text-muted-foreground max-w-xs mx-auto">
            Select a project or create a new session to start learning.
          </p>
        </div>
      </div>
    );
  }

  // FIX: If it's a voice session, ALWAYS render the VoiceChatInterface
  // unless the user manually toggled back to text view
  if (isVoiceSession && viewMode === "voice") {
    return (
      <div
        className="flex-1 h-full bg-card"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <VoiceChatInterface
          sessionUuid={sessionUuid}
          onEndSession={onEndVoiceSession}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col bg-card"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-bold tracking-tight text-input uppercase">
              {sessionData?.session_type === "voice"
                ? "Voice Session"
                : "Text Session"}
            </h2>
            {sessionData?.session_type === "voice" && (
              <span className="flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <Mic className="h-3 w-3 mr-1" /> LIVE
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleModelSwitch("ollama")}
              disabled={switchingModel}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${
                selectedModel === "ollama"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "hover:bg-accent text-muted-foreground"
              }`}
            >
              <Cpu className="h-3.5 w-3.5" /> OLLAMA
            </button>
            <button
              onClick={() => handleModelSwitch("gemini")}
              disabled={switchingModel}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${
                selectedModel === "gemini"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "hover:bg-accent text-muted-foreground"
              }`}
            >
              <Bot className="h-3.5 w-3.5" /> GEMINI
            </button>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col">
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}
          <div ref={messagesEndRef} className="h-20" />
        </div>
      </main>

      {/* Input Area */}
      <footer className="p-4 md:p-6 bg-gradient-to-t from-card via-card to-transparent">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative group">
            <div className="absolute inset-0 bg-primary/5 rounded-xl blur transition group-focus-within:bg-primary/10" />
            <div className="relative flex items-end bg-background border rounded-xl shadow-lg focus-within:border-primary/50 transition-all p-2">
              <textarea
                rows="1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  (e.preventDefault(), handleSubmit(e))
                }
                placeholder={`Message ${selectedModel === "gemini" ? "Gemini" : "Ollama"}...`}
                className="flex-1 bg-transparent border-0 focus:ring-0 text-sm py-3 px-4 resize-none max-h-48 text-input"
                disabled={isLoading || switchingModel}
              />
              <div className="flex gap-2 p-1">
                <button
                  type="button"
                  onClick={handleVoiceModeToggle}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Mic className="h-5 w-5" />
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shadow-sm"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-3">
              Study Buddy may provide inaccurate information. Verify technical
              details.
            </p>
          </form>
        </div>
      </footer>
    </div>
  );
}
