document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFaqCarousel();
  initRevealAnimations();
  initChatbot();
});

function initNav() {
  const toggle = document.querySelector('.nav__toggle');
  const menu = document.querySelector('.nav__list');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    menu.classList.toggle('is-open');
  });

  menu.addEventListener('click', (e) => {
    if (e.target.classList.contains('nav__link')) {
      toggle.setAttribute('aria-expanded', 'false');
      menu.classList.remove('is-open');
    }
  });
}

function initFaqCarousel() {
  const faqSection = document.querySelector('.faq');
  if (!faqSection) {
    return;
  }

  const track = faqSection.querySelector('.faq__track');
  const allCards = Array.from(track.querySelectorAll('.faq__card'));
  const prevBtn = faqSection.querySelector('.faq__nav--prev');
  const nextBtn = faqSection.querySelector('.faq__nav--next');
  const searchInput = faqSection.querySelector('.faq__search-input');

  let visibleCards = [...allCards];
  let currentIndex = 0;
  let debounceTimer = null;

  function getVisibleCount() {
    const width = window.innerWidth;
    if (width >= 1024) return 4;
    if (width >= 768) return 2;
    return 1;
  }

  function getMaxIndex() {
    return Math.max(0, visibleCards.length - getVisibleCount());
  }

  function updateNav() {
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= getMaxIndex();
  }

  function goTo(index) {
    const maxIndex = getMaxIndex();
    let nextIndex = index;

    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex > maxIndex) nextIndex = maxIndex;
    currentIndex = nextIndex;

    if (visibleCards.length > 0 && visibleCards[0]) {
      const cardWidth = visibleCards[0].getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(track).gap) || 0;
      const offset = currentIndex * (cardWidth + gap);
      track.style.transform = `translateX(-${offset}px)`;
    } else {
      track.style.transform = 'translateX(0)';
    }

    updateNav();
  }

  function filterCards(query) {
    const normalizedQuery = query.trim().toLowerCase();

    allCards.forEach((card) => {
      const match = !normalizedQuery || card.getAttribute('data-question').includes(normalizedQuery);
      card.style.display = match ? '' : 'none';
    });

    visibleCards = allCards.filter((card) => card.style.display !== 'none');
    currentIndex = 0;

    if (visibleCards.length > 0) {
      goTo(0);
    } else {
      track.style.transform = 'translateX(0)';
      updateNav();
    }
  }

  prevBtn.addEventListener('click', () => goTo(currentIndex - 1));
  nextBtn.addEventListener('click', () => goTo(currentIndex + 1));

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => filterCards(searchInput.value), 200);
  });

  faqSection.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      goTo(currentIndex - 1);
      event.preventDefault();
    }

    if (event.key === 'ArrowRight') {
      goTo(currentIndex + 1);
      event.preventDefault();
    }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      goTo(Math.min(currentIndex, getMaxIndex()));
    }, 150);
  });

  updateNav();
}

function initRevealAnimations() {
  const revealSections = document.querySelectorAll('.reveal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (revealSections.length > 0 && !reduceMotion) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '-50px'
      }
    );

    revealSections.forEach((section) => revealObserver.observe(section));
  } else {
    revealSections.forEach((section) => section.classList.add('reveal--visible'));
  }
}

function initChatbot() {
  const root = document.querySelector('[data-chatbot]');
  if (!root) {
    return;
  }

  const launcher = root.querySelector('[data-chatbot-launcher]');
  const teaser = root.querySelector('[data-chatbot-teaser]');
  const panel = root.querySelector('[data-chatbot-panel]');
  const closeBtn = root.querySelector('[data-chatbot-close]');
  const form = root.querySelector('[data-chatbot-form]');
  const input = root.querySelector('[data-chatbot-input]');
  const sendBtn = root.querySelector('[data-chatbot-send]');
  const messages = root.querySelector('[data-chatbot-messages]');
  const suggestionsContainer = root.querySelector('[data-chatbot-suggestions]');
  const status = root.querySelector('[data-chatbot-status]');
  const teaserStorageKey = 'p8-chatbot-teaser-seen';
  const historyStorageKey = 'p8-chatbot-history';
  const sessionStorageKey = 'p8-chatbot-session-id';
  const maxStoredMessages = 8;

  const state = {
    isOpen: false,
    isLoading: false,
    sessionId: getOrCreateSessionId(),
    history: loadHistory(),
    suggestions: readSuggestionButtons()
  };

  render();
  setupTeaser();

  launcher.addEventListener('click', () => {
    if (state.isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  closeBtn.addEventListener('click', closePanel);
  teaser.addEventListener('click', () => {
    openPanel();
    hideTeaser(true);
  });

  suggestionsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chatbot-suggestion]');
    if (!button || state.isLoading) {
      return;
    }

    const question = button.textContent.trim();
    input.value = question;
    resizeInput();
    submitQuestion(question);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitQuestion(input.value);
  });

  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuestion(input.value);
    }
  });

  resizeInput();
  closePanel();

  function readSuggestionButtons() {
    return Array.from(root.querySelectorAll('[data-chatbot-suggestion]'))
      .map((button) => button.textContent.trim())
      .filter(Boolean);
  }

  function getOrCreateSessionId() {
    const existing = localStorage.getItem(sessionStorageKey);
    if (existing) {
      return existing;
    }

    const nextId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(sessionStorageKey, nextId);
    return nextId;
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(historyStorageKey);
      const parsed = JSON.parse(raw || '[]');
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
        .slice(-maxStoredMessages);
    } catch (error) {
      return [];
    }
  }

  function saveHistory() {
    sessionStorage.setItem(historyStorageKey, JSON.stringify(state.history.slice(-maxStoredMessages)));
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  function setupTeaser() {
    if (sessionStorage.getItem(teaserStorageKey)) {
      teaser.hidden = true;
      return;
    }

    window.setTimeout(() => {
      if (state.isOpen) {
        return;
      }

      teaser.hidden = false;
      teaser.classList.add('is-visible');
    }, 1200);
  }

  function hideTeaser(markSeen) {
    teaser.classList.remove('is-visible');

    if (markSeen) {
      sessionStorage.setItem(teaserStorageKey, 'true');
    }

    window.setTimeout(() => {
      teaser.hidden = true;
    }, 280);
  }

  function openPanel() {
    state.isOpen = true;
    root.dataset.chatbotState = 'open';
    launcher.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    hideTeaser(true);
    render();
    window.setTimeout(() => input.focus(), 80);
  }

  function closePanel() {
    state.isOpen = false;
    root.dataset.chatbotState = 'closed';
    launcher.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
  }

  function setLoading(isLoading) {
    state.isLoading = isLoading;
    sendBtn.disabled = isLoading;
    input.disabled = isLoading;
    status.textContent = isLoading ? 'Thinking...' : '';
    render();
  }

  function render() {
    messages.innerHTML = '';

    if (state.history.length === 0) {
      renderMessage({
        role: 'assistant',
        content: root.dataset.greeting || '',
        links: []
      });
    } else {
      state.history.forEach(renderMessage);
    }

    if (state.isLoading) {
      const wrapper = document.createElement('div');
      wrapper.className = 'chatbot__message chatbot__message--assistant';

      const bubble = document.createElement('div');
      bubble.className = 'chatbot__bubble';
      bubble.innerHTML = '<span class="chatbot__typing"><span></span><span></span><span></span></span>';

      wrapper.appendChild(bubble);
      messages.appendChild(wrapper);
    }

    renderSuggestions();
    messages.scrollTop = messages.scrollHeight;
  }

  function renderMessage(message) {
    const wrapper = document.createElement('div');
    wrapper.className = `chatbot__message chatbot__message--${message.role}`;

    const bubble = document.createElement('div');
    bubble.className = 'chatbot__bubble';
    bubble.setAttribute('dir', 'auto');

    if (message.role === 'assistant') {
      bubble.appendChild(renderRichText(message.content));
    } else {
      bubble.textContent = message.content;
    }

    wrapper.appendChild(bubble);

    if (message.role === 'assistant' && Array.isArray(message.links) && message.links.length > 0) {
      const links = document.createElement('div');
      links.className = 'chatbot__links';

      message.links.forEach((link) => {
        const anchor = document.createElement('a');
        anchor.className = 'chatbot__link';
        anchor.href = link.url;
        anchor.textContent = link.label;

        if (/^https?:/i.test(link.url)) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        }

        links.appendChild(anchor);
      });

      bubble.appendChild(links);
    }

    messages.appendChild(wrapper);
  }

  function renderRichText(text) {
    const fragment = document.createDocumentFragment();
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();

    if (!normalized) {
      return fragment;
    }

    const blocks = normalized.split(/\n{2,}/);

    blocks.forEach((block) => {
      const trimmed = block.trim();
      if (!trimmed) {
        return;
      }

      const lines = trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const isBulletList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));

      if (isBulletList) {
        const list = document.createElement('ul');
        list.className = 'chatbot__text-list';

        lines.forEach((line) => {
          const item = document.createElement('li');
          appendInlineNodes(item, line.replace(/^[-*]\s+/, ''));
          list.appendChild(item);
        });

        fragment.appendChild(list);
        return;
      }

      const paragraph = document.createElement('p');
      paragraph.className = 'chatbot__text-paragraph';
      appendInlineNodes(paragraph, trimmed);
      fragment.appendChild(paragraph);
    });

    return fragment;
  }

  function appendInlineNodes(container, text) {
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+))/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const token = match[0];
      let node = null;

      if (token.startsWith('**') && token.endsWith('**')) {
        node = document.createElement('strong');
        node.textContent = token.slice(2, -2);
      } else if (token.startsWith('*') && token.endsWith('*')) {
        node = document.createElement('em');
        node.textContent = token.slice(1, -1);
      } else if (token.startsWith('[')) {
        const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (linkMatch) {
          node = document.createElement('a');
          node.href = linkMatch[2];
          node.textContent = linkMatch[1];
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
          node.className = 'chatbot__inline-link';
        }
      } else if (/^https?:\/\//.test(token)) {
        node = document.createElement('a');
        node.href = token;
        node.textContent = token;
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
        node.className = 'chatbot__inline-link';
      }

      container.appendChild(node || document.createTextNode(token));
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderSuggestions() {
    suggestionsContainer.innerHTML = '';

    state.suggestions.slice(0, 4).forEach((suggestion) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chatbot__suggestion';
      button.setAttribute('data-chatbot-suggestion', '');
      button.textContent = suggestion;
      suggestionsContainer.appendChild(button);
    });
  }

  async function submitQuestion(rawQuestion) {
    const question = rawQuestion.trim();
    if (!question || state.isLoading) {
      return;
    }

    const previousHistory = state.history.slice(-maxStoredMessages);
    state.history.push({ role: 'user', content: question });
    state.history = state.history.slice(-maxStoredMessages);
    saveHistory();
    render();

    input.value = '';
    resizeInput();
    openPanel();
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: question,
          history: previousHistory,
          locale: navigator.language || 'en',
          sessionId: state.sessionId
        })
      });

      const data = await response.json();

      state.history.push({
        role: 'assistant',
        content: data.answer || root.dataset.fallback || 'Please try again.',
        links: Array.isArray(data.links) ? data.links : []
      });
      state.history = state.history.slice(-maxStoredMessages);
      state.suggestions =
        Array.isArray(data.suggestions) && data.suggestions.length > 0
          ? data.suggestions
          : readSuggestionButtons();
      saveHistory();
    } catch (error) {
      state.history.push({
        role: 'assistant',
        content:
          root.dataset.fallback ||
          'I can only answer from validated programme content and official links. Please try again later.',
        links: []
      });
      state.history = state.history.slice(-maxStoredMessages);
      saveHistory();
    } finally {
      setLoading(false);
      render();
    }
  }
}
