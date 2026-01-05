document.addEventListener('DOMContentLoaded', () => {
  const chatContainer = document.createElement('div');
  chatContainer.id = 'chat-container';
  chatContainer.style.position = 'fixed';
  chatContainer.style.bottom = '20px';
  chatContainer.style.right = '20px';
  chatContainer.style.width = '300px';
  chatContainer.style.height = '400px';
  chatContainer.style.backgroundColor = 'white';
  chatContainer.style.border = '1px solid #ccc';
  chatContainer.style.borderRadius = '8px';
  chatContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
  chatContainer.style.display = 'flex';
  chatContainer.style.flexDirection = 'column';
  chatContainer.style.zIndex = '10000';

  const messagesDiv = document.createElement('div');
  messagesDiv.id = 'chat-messages';
  messagesDiv.style.flexGrow = '1';
  messagesDiv.style.padding = '10px';
  messagesDiv.style.overflowY = 'auto';
  messagesDiv.style.borderBottom = '1px solid #eee';

  const inputContainer = document.createElement('div');
  inputContainer.style.display = 'flex';
  inputContainer.style.padding = '10px';
  inputContainer.style.borderTop = '1px solid #eee';

  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.placeholder = 'Napisz wiadomość...';
  chatInput.style.flexGrow = '1';
  chatInput.style.padding = '8px';
  chatInput.style.border = '1px solid #ccc';
  chatInput.style.borderRadius = '4px';

  const sendButton = document.createElement('button');
  sendButton.textContent = 'Wyślij';
  sendButton.style.marginLeft = '10px';
  sendButton.style.padding = '8px 15px';
  sendButton.style.backgroundColor = '#007bff';
  sendButton.style.color = 'white';
  sendButton.style.border = 'none';
  sendButton.style.borderRadius = '4px';
  sendButton.style.cursor = 'pointer';

  chatContainer.appendChild(messagesDiv);
  inputContainer.appendChild(chatInput);
  inputContainer.appendChild(sendButton);
  chatContainer.appendChild(inputContainer);
  document.body.appendChild(chatContainer);

  let sessionId = localStorage.getItem('chatSessionId');
  if (!sessionId) {
    sessionId = 'session_' + Date.now(); // Simple unique ID
    localStorage.setItem('chatSessionId', sessionId);
  }

  const sendMessage = async () => {
    const message = chatInput.value.trim();
    if (message) {
      appendMessage('Ty: ' + message, 'user');
      chatInput.value = '';

      try {
        const response = await fetch('/apps/chat/api/chat/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId,
            message: message
          }),
        });
        const data = await response.json();
        appendMessage('Asystent: ' + data.response, 'assistant');
      } catch (error) {
        console.error('Błąd wysyłania wiadomości:', error);
        appendMessage('Błąd: Nie udało się wysłać wiadomości.', 'error');
      }
    }
  };

  sendButton.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  function appendMessage(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.textContent = text;
    messageElement.style.marginBottom = '5px';
    if (sender === 'user') {
      messageElement.style.textAlign = 'right';
      messageElement.style.color = '#007bff';
    } else if (sender === 'assistant') {
      messageElement.style.textAlign = 'left';
      messageElement.style.color = '#333';
    } else if (sender === 'error') {
        messageElement.style.textAlign = 'center';
        messageElement.style.color = 'red';
    }
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
  }

  // Example of initial message or previous session messages loading
  appendMessage('Witaj w czacie z asystentem!', 'assistant');

// ...existing code...

    // --- Logika publikacji zdarzeń DOM i Custom Heatmap ---
    // Te zdarzenia są publikowane przez Theme App Extension, aby Web Pixel mógł je subskrybować.
    // Wymaga, aby Shopify.analytics było dostępne.

    if (window.Shopify && window.Shopify.analytics && typeof window.Shopify.analytics.publish === 'function') {
        console.log('[Assistant.js] Initializing DOM and Heatmap event publishing.');

        // 1. DOM Event: click
        document.addEventListener('click', (event) => {
            window.Shopify.analytics.publish('clicked', {
                target: event.target ? event.target.tagName : 'unknown',
                id: event.target ? event.target.id : '',
                className: event.target ? event.target.className : '',
                x: event.clientX,
                y: event.clientY,
                pageUrl: window.location.href,
            });
        });

        // 2. DOM Event: input_focused
        document.addEventListener('focusin', (event) => {
            if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
                window.Shopify.analytics.publish('input_focused', {
                    targetId: event.target.id || event.target.name || 'anonymous_input',
                    elementType: event.target.tagName,
                    pageUrl: window.location.href,
                });
            }
        });

        // 3. DOM Event: input_blurred
        document.addEventListener('focusout', (event) => {
            if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
                window.Shopify.analytics.publish('input_blurred', {
                    targetId: event.target.id || event.target.name || 'anonymous_input',
                    elementType: event.target.tagName,
                    pageUrl: window.location.href,
                });
            }
        });

        // 4. DOM Event: input_changed
        document.addEventListener('change', (event) => {
            if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT')) {
                window.Shopify.analytics.publish('input_changed', {
                    targetId: event.target.id || event.target.name || 'anonymous_input',
                    elementType: event.target.tagName,
                    newValueLength: (event.target as HTMLInputElement).value.length,
                    pageUrl: window.location.href,
                });
            }
        });

        // 5. DOM Event: form_submitted
        document.addEventListener('submit', (event) => {
            window.Shopify.analytics.publish('form_submitted', {
                formId: event.target ? (event.target as HTMLFormElement).id || (event.target as HTMLFormElement).name || 'anonymous_form' : 'unknown_form',
                pageUrl: window.location.href,
            });
        });

        // 6. Custom Heatmap Event: epir:click_with_position (przykład, realne dane mogą być bogatsze)
        // Już obsłużone przez 'clicked' powyżej, ale można rozszerzyć o specyficzne dane heatmapy jeśli 'clicked' to za mało
        // Można też agregować dane w tle i publikować co X sekund, aby nie spamować eventami.

        // 7. Custom Heatmap Event: epir:scroll_depth
        let lastScrollDepth = 0;
        window.addEventListener('scroll', () => {
            const scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
            if (scrollPercent > lastScrollDepth && scrollPercent % 10 === 0) { // Publikuj co 10% przy przewijaniu w dół
                window.Shopify.analytics.publish('epir:scroll_depth', {
                    depthPercent: scrollPercent,
                    pageUrl: window.location.href,
                });
                lastScrollDepth = scrollPercent;
            }
        });

        // 8. Custom Heatmap Event: epir:page_exit (mierzone przy opuszczaniu strony)
        let pageEntryTime = Date.now();
        window.addEventListener('beforeunload', () => {
            const timeSpentSeconds = Math.round((Date.now() - pageEntryTime) / 1000);
            window.Shopify.analytics.publish('epir:page_exit', {
                timeSpentSeconds: timeSpentSeconds,
                pageUrl: window.location.href,
            });
        });

        // 9. Custom Heatmap Event: epir:mouse_sample (próbkowanie ruchu myszy - przykład, może wymagać bardziej zaawansowanej logic
        // Ta logika może być bardzo intensywna. Zamiast publikować każdy ruch, można co jakiś czas agregować i publikować 'heatmap'
        let mouseMoveCount = 0;
        let lastMouseSampleTime = Date.now();
        window.addEventListener('mousemove', () => {
            mouseMoveCount++;
            if (Date.now() - lastMouseSampleTime > 5000) { // Publikuj próbkę co 5 sekund
                window.Shopify.analytics.publish('epir:mouse_sample', {
                    moveCount: mouseMoveCount,
                    pageUrl: window.location.href,
                });
                mouseMoveCount = 0;
                lastMouseSampleTime = Date.now();
            }
        });

    } else {
        console.warn('[Assistant.js] Shopify.analytics.publish not available. DOM and Heatmap events will not be published.');
    }


    document.addEventListener('submit', (event) => {
      const target = event.target as HTMLFormElement;
      if (target && target.tagName === 'FORM') {
        Shopify.analytics.publish('form_submitted', {
          formId: target.id,
          formAction: target.action,
          formMethod: target.method,
          timestamp: new Date().toISOString(),
        });
      }
    });

  } else {
    console.warn('Shopify.analytics.publish not available. DOM and custom heatmap events will not be sent.');
  }
});