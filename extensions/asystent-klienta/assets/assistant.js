

  document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('epir-assistant-section');
    if (!section) return;

    const toggle = document.getElementById('assistant-toggle-button');
    const content = document.getElementById('assistant-content');
    const form = document.getElementById('assistant-form');
    const input = document.getElementById('assistant-input');
    const messagesEl = document.getElementById('assistant-messages');

    // App Proxy URL (zgodne z Gateway -> /apps/chat -> /api/chat)
    const endpoint = '/apps/chat/api/chat/send';

    // Ensure header title exists and add a connection status indicator
    const titleEl = document.querySelector('.assistant-title');
    if (titleEl) {
      if (!titleEl.textContent || titleEl.textContent.trim() === '') {
        titleEl.textContent = 'Epir AI Assistant';
      }
      const statusEl = document.createElement('span');
      statusEl.className = 'assistant-status';
      statusEl.setAttribute('aria-hidden', 'true');
      statusEl.textContent = '•';
      statusEl.title = 'Status połączenia nieznany';
      titleEl.parentElement && titleEl.parentElement.appendChild(statusEl);
    }

    const setStatus = (ok) => {
      const s = document.querySelector('.assistant-status');
      if (!s) return;
      if (ok === true) {
        s.textContent = '●';
        s.style.color = '#16a34a'; // green
        s.title = 'Połączono z usługą czatu';
      } else if (ok === false) {
        s.textContent = '●';
        s.style.color = '#ef4444';
        s.title = 'Brak połączenia z usługą czatu';
      } else {
        s.textContent = '•';
        s.style.color = '';
        s.title = 'Status połączenia nieznany';
      }
    };

    const appendMessage = (text, type, extraHtml) => {
      const div = document.createElement('div');
      div.className = `msg msg-${type}`;
      if (extraHtml) {
        div.innerHTML = `${text} ${extraHtml}`;
      } else {
        div.textContent = text;
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

    if (toggle && content) {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        content.classList.toggle('is-closed');
        const isClosed = content.classList.contains('is-closed');
        toggle.setAttribute('aria-expanded', (!isClosed).toString());
      });
    }

    // Ping endpoint (OPTIONS) to set initial status; non-blocking
    (async () => {
      try {
        const res = await fetch(endpoint, { method: 'OPTIONS' });
        setStatus(res.ok);
      } catch (e) {
        setStatus(false);
      }
    })();

    if (form && input && messagesEl) {
      const doSend = async (text) => {
        appendMessage(text, 'user');
        input.value = '';
        messagesEl.classList.add('is-loading');

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content: text })
          });

          if (!res.ok) {
            setStatus(false);
            const errHtml = `<button class="assistant-retry" data-text="${encodeURIComponent(text)}">Spróbuj ponownie</button>`;
            appendMessage(`Błąd połączenia (status: ${res.status}).`, 'error', errHtml);
            return;
          }

          setStatus(true);
          const data = await res.json();
          const assistantMsg = data.messages?.filter(m => m.role === 'assistant').slice(-1)[0]?.content || data.response || 'Brak odpowiedzi.';
          appendMessage(assistantMsg, 'assistant');
        } catch (err) {
          console.error('[Assistant] Fetch error', err);
          setStatus(false);
          const errHtml = `<button class="assistant-retry" data-text="${encodeURIComponent(text)}">Spróbuj ponownie</button>`;
          appendMessage('Błąd połączenia. Sprawdź konfigurację app proxy i działanie serwera.', 'error', errHtml);
        } finally {
          messagesEl.classList.remove('is-loading');
        }
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        await doSend(text);
      });

      // Delegate retry click to re-send message
      messagesEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.assistant-retry');
        if (btn) {
          const text = decodeURIComponent(btn.getAttribute('data-text') || '');
          if (text) doSend(text);
        }
      });
    }

    // --- Logika publikacji zdarzeń DOM i Custom Heatmap ---
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
          const target = event.target;
          const newValueLen = (target && (target.value != null)) ? target.value.length : 0;
          window.Shopify.analytics.publish('input_changed', {
            targetId: target.id || target.name || 'anonymous_input',
            elementType: target.tagName,
            newValueLength: newValueLen,
            pageUrl: window.location.href,
          });
        }
      });

      // 5. DOM Event: form_submitted (global)
      document.addEventListener('submit', (event) => {
        const target = event.target;
        const formId = (target && (target.id || target.name)) ? (target.id || target.name) : 'anonymous_form';
        window.Shopify.analytics.publish('form_submitted', {
          formId,
          pageUrl: window.location.href,
        });
      });

      // 7. Custom Heatmap Event: epir:scroll_depth
      let lastScrollDepth = 0;
      window.addEventListener('scroll', () => {
        const scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
        if (scrollPercent > lastScrollDepth && scrollPercent % 10 === 0) {
          window.Shopify.analytics.publish('epir:scroll_depth', {
            depthPercent: scrollPercent,
            pageUrl: window.location.href,
          });
          lastScrollDepth = scrollPercent;
        }
      });

      // 8. Custom Heatmap Event: epir:page_exit
      let pageEntryTime = Date.now();
      window.addEventListener('beforeunload', () => {
        const timeSpentSeconds = Math.round((Date.now() - pageEntryTime) / 1000);
        window.Shopify.analytics.publish('epir:page_exit', {
          timeSpentSeconds: timeSpentSeconds,
          pageUrl: window.location.href,
        });
      });

      // 9. Custom Heatmap Event: epir:mouse_sample
      let mouseMoveCount = 0;
      let lastMouseSampleTime = Date.now();
      window.addEventListener('mousemove', () => {
        mouseMoveCount++;
        if (Date.now() - lastMouseSampleTime > 5000) {
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
  });
