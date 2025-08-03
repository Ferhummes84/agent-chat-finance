import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Plus, User, Settings, LogOut, Loader2 } from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { useToast } from "@/components/ui/use-toast";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const ChatHistory = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session) {
      loadConversations();
    }
  }, [session]);

  const loadConversations = async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, title, created_at, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar conversas:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar o histórico",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createNewConversation = async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          user_id: session.user.id,
          title: `Nova Conversa ${new Date().toLocaleDateString('pt-BR')}`
        })
        .select()
        .single();

      if (error) throw error;

      navigate(`/chat?conversation=${data.id}`);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível criar nova conversa",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const openConversation = (conversationId: string) => {
    navigate(`/chat?conversation=${conversationId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 trading-card p-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg trading-gradient flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Agente Trader</h1>
              <p className="text-sm text-muted-foreground">Histórico de conversas</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              onClick={createNewConversation}
              className="trading-gradient text-primary-foreground hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Conversa
            </Button>
            <Button variant="outline" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6">
        {conversations.length === 0 ? (
          <div className="text-center py-12 space-y-6">
            <MessageSquare className="w-20 h-20 text-muted-foreground mx-auto opacity-50" />
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Nenhuma conversa ainda
              </h3>
              <p className="text-muted-foreground mb-6">
                Comece sua primeira conversa com o Agente Trader sobre investimentos e estratégias financeiras.
              </p>
              <Button
                onClick={createNewConversation}
                className="trading-gradient text-primary-foreground hover:opacity-90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Iniciar Primeira Conversa
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Suas Conversas ({conversations.length})
              </h2>
            </div>
            
            <div className="grid gap-4">
              {conversations.map((conversation) => (
                <Card
                  key={conversation.id}
                  className="trading-card border-border/50 hover:border-primary/30 smooth-transition cursor-pointer"
                  onClick={() => openConversation(conversation.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-foreground">
                        {conversation.title}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {new Date(conversation.updated_at).toLocaleDateString('pt-BR')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      Última atividade: {new Date(conversation.updated_at).toLocaleString('pt-BR')}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHistory;