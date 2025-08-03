import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { Session } from "@supabase/supabase-js";

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
}

interface DatabaseMessage {
  id: string;
  content: string;
  role: string;
  created_at: string;
  conversation_id: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

const Chat = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      createOrLoadConversation();
    }
  }, [session]);

  useEffect(() => {
    // Scroll to bottom when new messages are added
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const createOrLoadConversation = async () => {
    if (!session?.user) return;

    try {
      // Try to get the most recent conversation
      const { data: conversations, error: fetchError } = await supabase
        .from('conversations')
        .select('id, title, created_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      let conversationId: string;

      if (conversations && conversations.length > 0) {
        // Use existing conversation
        conversationId = conversations[0].id;
        setCurrentConversation(conversationId);
        
        // Load messages for this conversation
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (messagesError) throw messagesError;
        setMessages((messages || []).map(msg => ({
          ...msg,
          role: msg.role as 'user' | 'assistant'
        })));
      } else {
        // Create new conversation
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            user_id: session.user.id,
            title: 'Nova Conversa'
          })
          .select()
          .single();

        if (createError) throw createError;
        
        conversationId = newConversation.id;
        setCurrentConversation(conversationId);
        setMessages([]);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar a conversa",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() || !currentConversation || !session?.user) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage("");
    setIsLoading(true);

    try {
      // Add user message to database
      const { data: userMessageData, error: userError } = await supabase
        .from('messages')
        .insert({
          conversation_id: currentConversation,
          content: userMessage,
          role: 'user'
        })
        .select()
        .single();

      if (userError) throw userError;

      // Add user message to local state
      setMessages(prev => [...prev, {
        ...userMessageData,
        role: userMessageData.role as 'user' | 'assistant'
      }]);

      // Send message to webhook
      const response = await fetch('https://n8n.automabot.net.br/webhook/trader', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          user_id: session.user.id,
          conversation_id: currentConversation
        }),
      });

      if (!response.ok) {
        throw new Error('Erro na comunicação com o agente');
      }

      const aiResponse = await response.text();

      // Add AI response to database
      const { data: aiMessageData, error: aiError } = await supabase
        .from('messages')
        .insert({
          conversation_id: currentConversation,
          content: aiResponse,
          role: 'assistant'
        })
        .select()
        .single();

      if (aiError) throw aiError;

      // Add AI response to local state
      setMessages(prev => [...prev, {
        ...aiMessageData,
        role: aiMessageData.role as 'user' | 'assistant'
      }]);

      // Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentConversation);

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível enviar a mensagem",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border/50 trading-card p-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg trading-gradient flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">Agente Trader</h1>
            <p className="text-sm text-muted-foreground">Seu assistente financeiro IA</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-4">
              <Bot className="w-16 h-16 text-primary mx-auto opacity-50" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Bem-vindo ao Agente Trader!</h3>
                <p className="text-muted-foreground">
                  Comece uma conversa sobre investimentos, análises de mercado ou estratégias financeiras.
                </p>
              </div>
            </div>
          )}
          
          {messages.map((message) => (
            <div key={message.id} className={`flex items-start space-x-3 ${
              message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'trading-gradient text-primary-foreground'
              }`}>
                {message.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              
              <div className={`max-w-[80%] rounded-2xl p-4 animate-slide-up ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'trading-card border border-border/50'
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                <span className="text-xs opacity-70 mt-2 block">
                  {new Date(message.created_at).toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full trading-gradient flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="trading-card border border-border/50 rounded-2xl p-4">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Pensando...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border/50 p-4 bg-card/50">
        <div className="flex items-end space-x-3 max-w-3xl mx-auto">
          <div className="flex-1">
            <Input
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua mensagem sobre investimentos..."
              className="bg-input border-border/50 focus:border-primary resize-none"
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={!currentMessage.trim() || isLoading}
            className="trading-gradient text-primary-foreground hover:opacity-90 smooth-transition h-10 w-10 p-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Chat;