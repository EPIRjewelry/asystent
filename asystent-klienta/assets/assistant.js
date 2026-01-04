(function() {
  const SESSION_STORAGE_KEY = 'epir_ai_session_id';

  function getOrCreateSessionId() {
    let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
    return sessionId;
  }

  function renderChatWidget() {
    const root = document.getElementById('epir-chat-root');
    if (!root) return;

    root.innerHTML = `
      <div id="chat-container" style="position: fixed; bottom: 20px; right: 20px; width: 350px; border: 1px solid #ccc; border-radius: 10px; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); display: flex; flex-direction: column; height: 500px;">
        <div id="chat-header" style="padding: 10px; background: #f1f1f1; border-bottom: 1px solid #ccc; font-weight: bold; border-top-left-radius: 10px; border-top-right-radius: 10px;">Epir AI Assistant</div>
        <div id="chat-messages" style="flex: 1; padding: 10px; overflow-y: auto;"></div>
        <div id="chat-input-container" style="padding: 10px; border-top: 1px solid #ccc;">
          <input type="text" id="chat-input" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 5px;" placeholder="Type a message...">
          <button id="chat-send" style="width: 100%; padding: 10px; margin-top: 5px; background: #000; color: #fff; border: none; border-radius: 5px; cursor: pointer;">Send</button>
        </div>
      </div>
    `;

    const sendButton = document.getElementById('chat-send');
    const input = document.getElementById('chat-input');
    const messagesContainer = document.getElementById('chat-messages');

    sendButton.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });

    async function sendMessage() {
      const message = input.value.trim();
      if (!message) return;

      appendMessage('user', message);
      input.value = '';
      
      const sessionId = getOrCreateSessionId();
      const proxyUrl = `/apps/chat/api/chat/send?sessionId=${sessionId}`;

      try {
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'user', content: message })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const assistantMessage = data.messages[data.messages.length - 1];
        if (assistantMessage && assistantMessage.role === 'assistant') {
          appendMessage('assistant', assistantMessage.content);
        }

      } catch (error) {
        console.error('Error sending message:', error);
        appendMessage('assistant', 'Sorry, I am having trouble connecting.');
      }
    }

    function appendMessage(role, content) {
      const messageEl = document.createElement('div');
      messageEl.style.marginBottom = '10px';
      messageEl.style.textAlign = role === 'user' ? 'right' : 'left';
      
      const bubble = document.createElement('div');
      bubble.textContent = content;
      bubble.style.padding = '10px';
      bubble.style.borderRadius = '10px';
      bubble.style.display = 'inline-block';
      bubble.style.maxWidth = '80%';
      bubble.style.background = role === 'user' ? '#007bff' : '#f1f1f1';
      bubble.style.color = role === 'user' ? '#fff' : '#000';

      messageEl.appendChild(bubble);
      messagesContainer.appendChild(messageEl);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  document.addEventListener('DOMContentLoaded', renderChatWidget);
})();
