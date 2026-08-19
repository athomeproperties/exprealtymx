/* exprealtymx.com — AI Chat Widget
   Drop this file in and add: <script src="chat-widget.js"></script> before </body>
   Talks to the backend at https://smartposter.win/api/exprealtymx-chat
*/
(function () {
  const API_URL = 'https://smartposter.win/api/exprealtymx-chat';

  const STRINGS = {
    es: { title: 'Asistente Virtual', placeholder: 'Escribe tu pregunta...', greeting: '¡Hola! Soy el asistente de At Home Realty. ¿En qué puedo ayudarte hoy?', send: 'Enviar', error: 'Hubo un problema. Intenta de nuevo o escríbenos por WhatsApp.' },
    en: { title: 'Virtual Assistant', placeholder: 'Type your question...', greeting: "Hi! I'm At Home Realty's assistant. How can I help you today?", send: 'Send', error: 'Something went wrong. Please try again or reach us on WhatsApp.' },
    fr: { title: 'Assistant Virtuel', placeholder: 'Écrivez votre question...', greeting: "Bonjour ! Je suis l'assistant d'At Home Realty. Comment puis-je vous aider ?", send: 'Envoyer', error: "Un problème est survenu. Réessayez ou contactez-nous sur WhatsApp." }
  };

  // Detect language: checks <html lang="">, falls back to Spanish (site default)
  function detectLang() {
    const htmlLang = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    if (STRINGS[htmlLang]) return htmlLang;
    return 'es';
  }
  const lang = detectLang();
  const t = STRINGS[lang];

  const css = `
    #ahr-chat-launcher {
      position: fixed; right: 24px; bottom: 96px; z-index: 9998;
      width: 58px; height: 58px; border-radius: 50%;
      background: #0F1F35; border: 2px solid #C9A227;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.28);
      transition: transform .2s;
    }
    #ahr-chat-launcher:hover { transform: scale(1.06); }
    #ahr-chat-launcher svg { width: 26px; height: 26px; }

    #ahr-chat-panel {
      position: fixed; right: 24px; bottom: 168px; z-index: 9999;
      width: 360px; max-width: calc(100vw - 32px);
      height: 500px; max-height: calc(100vh - 200px);
      background: #fff; border-radius: 12px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,.28);
      display: none; flex-direction: column;
      font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    #ahr-chat-panel.open { display: flex; }

    #ahr-chat-header {
      background: #0F1F35; color: #fff; padding: 16px 18px;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #C9A227;
    }
    #ahr-chat-header .title {
      font-family: Georgia, 'Playfair Display', serif; font-size: 17px; letter-spacing: .01em;
    }
    #ahr-chat-header .sub { font-size: 11px; color: #A9C4DE; letter-spacing: .08em; text-transform: uppercase; margin-top: 2px; }
    #ahr-chat-close { background: none; border: none; color: #D7E3F0; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px; }

    #ahr-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; background: #F7F8FA;
      display: flex; flex-direction: column; gap: 10px;
    }
    .ahr-msg { max-width: 82%; padding: 10px 13px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
    .ahr-msg.user { align-self: flex-end; background: #0F1F35; color: #fff; border-bottom-right-radius: 3px; }
    .ahr-msg.bot { align-self: flex-start; background: #fff; color: #202631; border: 1px solid #E4E7EC; border-bottom-left-radius: 3px; }
    .ahr-msg.bot a { color: #A8811A; }
    .ahr-msg.typing { align-self: flex-start; background: #fff; border: 1px solid #E4E7EC; color: #97A0AD; font-style: italic; }

    #ahr-chat-inputrow {
      display: flex; gap: 8px; padding: 12px; border-top: 1px solid #E4E7EC; background: #fff;
    }
    #ahr-chat-input {
      flex: 1; border: 1px solid #D9DEE5; border-radius: 8px; padding: 10px 12px;
      font-size: 14px; font-family: inherit; resize: none; outline: none;
    }
    #ahr-chat-input:focus { border-color: #C9A227; }
    #ahr-chat-send {
      background: #C9A227; color: #0F1F35; border: none; border-radius: 8px;
      padding: 0 16px; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    #ahr-chat-send:disabled { opacity: .5; cursor: default; }

    @media (max-width: 480px) {
      #ahr-chat-panel { right: 16px; bottom: 152px; }
      #ahr-chat-launcher { right: 16px; }
    }
  `;

  const styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  const launcher = document.createElement('div');
  launcher.id = 'ahr-chat-launcher';
  launcher.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  document.body.appendChild(launcher);

  const panel = document.createElement('div');
  panel.id = 'ahr-chat-panel';
  panel.innerHTML = `
    <div id="ahr-chat-header">
      <div>
        <div class="title">${t.title}</div>
        <div class="sub">At Home Realty</div>
      </div>
      <button id="ahr-chat-close" aria-label="Close">&times;</button>
    </div>
    <div id="ahr-chat-messages"></div>
    <div id="ahr-chat-inputrow">
      <textarea id="ahr-chat-input" rows="1" placeholder="${t.placeholder}"></textarea>
      <button id="ahr-chat-send">${t.send}</button>
    </div>
  `;
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#ahr-chat-messages');
  const inputEl = panel.querySelector('#ahr-chat-input');
  const sendBtn = panel.querySelector('#ahr-chat-send');
  const closeBtn = panel.querySelector('#ahr-chat-close');

  let history = [];
  let opened = false;

  function addBubble(text, cls) {
    const div = document.createElement('div');
    div.className = 'ahr-msg ' + cls;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function toggle() {
    panel.classList.toggle('open');
    if (!opened) {
      opened = true;
      addBubble(t.greeting, 'bot');
    }
  }
  launcher.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.disabled = true;

    addBubble(text, 'user');
    history.push({ role: 'user', content: text });

    const typingEl = addBubble('...', 'typing bot');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });
      const data = await res.json();
      typingEl.remove();
      if (data.reply) {
        addBubble(data.reply, 'bot');
        history.push({ role: 'assistant', content: data.reply });
      } else {
        addBubble(t.error, 'bot');
      }
    } catch (err) {
      typingEl.remove();
      addBubble(t.error, 'bot');
    }
    sendBtn.disabled = false;
    inputEl.focus();
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();
