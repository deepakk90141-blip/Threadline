import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import ChatList from "../components/ChatList";
import ChatWindow from "../components/ChatWindow";
import EmptyChat from "../components/EmptyChat";
import CallOverlay from "../components/CallOverlay";
import { useChat } from "../context/ChatContext";

export default function Chat() {
  const { activeConversation, closeConversation } = useChat();
  // Only matters on small screens, where list and window are shown one at a time.
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Whenever a conversation becomes active (clicked in the list, started
  // from search, ...) show the chat window on mobile.
  useEffect(() => {
    setMobileShowChat(Boolean(activeConversation));
  }, [activeConversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = () => {
    closeConversation();
    setMobileShowChat(false);
  };

  return (
    <div className="app-shell">
      <Navbar />
      <div className="chat-layout">
        <aside className={`sidebar ${mobileShowChat ? "sidebar--hidden-mobile" : ""}`}>
          <ChatList onSelectConversation={() => setMobileShowChat(true)} />
        </aside>
        <main className={`chat-main ${mobileShowChat ? "chat-main--visible-mobile" : ""}`}>
          {activeConversation ? <ChatWindow onBack={handleBack} /> : <EmptyChat />}
        </main>
      </div>
      <CallOverlay />
    </div>
  );
}
