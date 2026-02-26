import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { socketService, type Session } from './services/socket';
import './App.css';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const fetchSessions = async () => {
    try {
      const list = await socketService.getSessionList();
      setSessions(list);
      if (list.length > 0 && !activeSessionId) {
        setActiveSessionId(list[0].sessionId);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleCreateSession = async () => {
    const newSession = await socketService.createSession();
    setActiveSessionId(newSession.sessionId);
    fetchSessions(); // Refresh list to get the new session at the top
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    // On mobile, you might want to auto-close the sidebar here
  };

  const handleDeleteSession = async (id: string) => {
    const success = await socketService.clearSession(id);
    if (success) {
      if (activeSessionId === id) {
        setActiveSessionId(null);
      }
      fetchSessions();
    } else {
      console.error('Failed to delete session');
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="app-container">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onCreateSession={handleCreateSession}
        isOpen={isSidebarOpen}
        onToggle={toggleSidebar}
        onDeleteSession={handleDeleteSession}
      />

      <main className="main-content">
        {activeSessionId ? (
          <ChatArea
            sessionId={activeSessionId}
            onToggleSidebar={toggleSidebar}
            isSidebarOpen={isSidebarOpen}
          />
        ) : (
          <div className="empty-state">
            <h1>BaobaoLong Assistant</h1>
            <p>Select a chat or start a new conversation.</p>
            <button className="new-chat-btn-large" onClick={handleCreateSession}>
              New Chat
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
