const OpenAI = require('openai');
const knowledge = require('../data/chatbot-knowledge.json');

const MAX_MESSAGE_LENGTH = 700;
const MAX_HISTORY_ITEMS = 8;
const MAX_SUGGESTIONS = 4;
const MAX_LINKS = 4;
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const ENABLE_MODERATION = String(process.env.CHATBOT_ENABLE_MODERATION || 'true') === 'true';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token && token.length > 2);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item.role,
      content: String(item.content || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_MESSAGE_LENGTH)
    }))
    .filter((item) => item.content);
}

function scoreEntry(entry, queryTokens, normalizedQuery) {
  const haystacks = [
    normalizeText(entry.title),
    normalizeText(entry.content),
    normalizeText((entry.tags || []).join(' '))
  ];

  let score = entry.priority || 0;

  queryTokens.forEach((token) => {
    haystacks.forEach((haystack, index) => {
      if (haystack.includes(token)) {
        score += index === 0 ? 5 : index === 1 ? 2 : 3;
      }
    });
  });

  (entry.tags || []).forEach((tag) => {
    if (normalizedQuery.includes(normalizeText(tag))) {
      score += 4;
    }
  });

  return score;
}

function selectRelevantEntries(message, knowledge) {
  const normalizedQuery = normalizeText(message);
  const queryTokens = tokenize(message);
  const validatedEntries = (knowledge.entries || []).filter((entry) => entry.validated);

  const ranked = validatedEntries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, queryTokens, normalizedQuery)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const selected = ranked.slice(0, 5).map((item) => item.entry);

  if (selected.length > 0) {
    return selected;
  }

  return validatedEntries
    .slice()
    .sort((left, right) => (right.priority || 0) - (left.priority || 0))
    .slice(0, 3);
}

function detectDynamicTopic(message) {
  return /(deadline|date|calendar|when apply|when should i apply|tuition|fees|cost|application|inscription|candidature|application platform|mon master|monmaster|campus france|visa|scholarship|housing)/i.test(
    String(message || '')
  );
}

function buildContext(entries) {
  return entries
    .map((entry) => {
      const links = (entry.links || [])
        .map((link) => `- ${link.label}: ${link.url}`)
        .join('\n');

      return [
        `Section: ${entry.title}`,
        `Priority: ${entry.priority}`,
        `Tags: ${(entry.tags || []).join(', ')}`,
        `Content: ${entry.content}`,
        links ? `Links:\n${links}` : ''
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

function buildConversation(history, message) {
  const lines = history.map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`);
  lines.push(`User: ${message}`);
  return lines.join('\n');
}

function buildInstructions(hasDynamicTopic, locale) {
  const parts = [
    'You are the Master Transitions Numeriques guide for Universite Paris 8.',
    'Only answer from the validated context you receive.',
    'If the answer is not clearly supported by the validated context, say that you cannot confirm it and redirect to an official link.',
    'Reply in the same language as the user when clear. If the language is ambiguous, reply in English.',
    'Keep answers concise, warm, and practical for prospective or international students.',
    'When useful, mention official French names and give a short explanation in the reply language.',
    'Do not invent dates, fees, deadlines, scholarship rules, visa rules, or administrative procedures.'
  ];

  if (hasDynamicTopic) {
    parts.push('The current question looks time-sensitive or administrative. Explicitly avoid specific dates or changing rules unless they are directly present in the validated context.');
  }

  if (locale) {
    parts.push(`Browser locale hint: ${locale}.`);
  }

  return parts.join(' ');
}

function collectLinks(entries, knowledge, hasDynamicTopic) {
  const links = [];

  entries.forEach((entry) => {
    (entry.links || []).forEach((link) => links.push(link));
  });

  if (hasDynamicTopic) {
    (knowledge.importantLinks || [])
      .filter((link) => /admission|application|enrol|international/i.test(link.label))
      .forEach((link) => links.push(link));
  }

  return uniqueBy(links, (item) => item.url).slice(0, MAX_LINKS);
}

function collectSuggestions(entries, knowledge) {
  const suggestions = [];

  entries.forEach((entry) => {
    (entry.suggestions || []).forEach((suggestion) => suggestions.push(suggestion));
  });

  (knowledge.ui?.defaultSuggestions || []).forEach((suggestion) => suggestions.push(suggestion));

  return uniqueBy(
    suggestions.map((item) => ({ label: item })),
    (item) => item.label
  )
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => item.label);
}

function extractOutputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return '';
  }

  return response.output
    .flatMap((item) => item.content || [])
    .map((content) => content.text || content.output_text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildFallbackAnswer(knowledge) {
  return knowledge.ui?.fallbackMessage || 'Please check the official links for the most reliable information.';
}

async function maybeModerate(client, message) {
  if (!ENABLE_MODERATION) {
    return { flagged: false };
  }

  const result = await client.moderations.create({
    model: 'omni-moderation-latest',
    input: message
  });

  return result.results && result.results[0] ? result.results[0] : { flagged: false };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 503;
    res.end(
      JSON.stringify({
        error: 'Chatbot backend is not configured yet.',
        answer: 'The chatbot is not connected yet. Add OPENAI_API_KEY in Vercel environment variables to enable responses.',
        links: [],
        suggestions: [],
        sourceSections: [],
        fallback: true
      })
    );
    return;
  }

  try {
    const message = String(req.body?.message || '').trim();
    const locale = String(req.body?.locale || '').trim();
    const history = sanitizeHistory(req.body?.history);

    if (!message) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Message is required' }));
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` }));
      return;
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const moderation = await maybeModerate(client, message);
    if (moderation.flagged) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          answer:
            'I can help with questions about the programme and Paris 8, but I cannot respond to that request. Please ask about the master, admissions guidance, campus access, or student life.',
          links: [],
          suggestions: knowledge.ui?.defaultSuggestions || [],
          sourceSections: [],
          fallback: true
        })
      );
      return;
    }

    const hasDynamicTopic = detectDynamicTopic(message);
    const relevantEntries = selectRelevantEntries(message, knowledge);
    const promptInput = [
      'Validated knowledge base:',
      buildContext(relevantEntries),
      '',
      'Conversation:',
      buildConversation(history, message)
    ].join('\n');

    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      store: false,
      max_output_tokens: 450,
      reasoning: {
        effort: 'low'
      },
      instructions: buildInstructions(hasDynamicTopic, locale),
      input: promptInput
    });

    const answer = extractOutputText(response) || buildFallbackAnswer(knowledge);
    const links = collectLinks(relevantEntries, knowledge, hasDynamicTopic);
    const suggestions = collectSuggestions(relevantEntries, knowledge);

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        answer,
        links,
        suggestions,
        sourceSections: relevantEntries.map((entry) => entry.title),
        fallback: answer === buildFallbackAnswer(knowledge)
      })
    );
  } catch (error) {
    const statusCode = error?.status || 500;
    const safeMessage =
      statusCode === 429
        ? 'The assistant is temporarily busy. Please retry in a moment.'
        : 'The assistant could not answer right now. Please try again or use the official links.';

    res.statusCode = statusCode;
    res.end(
      JSON.stringify({
        error: error?.message || 'Unexpected error',
        answer: safeMessage,
        links: [],
        suggestions: [],
        sourceSections: [],
        fallback: true
      })
    );
  }
};
