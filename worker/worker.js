/**
 * agent.andrzey-jankowski.workers.dev — OpenAI-compatible chat-completions proxy
 * --------------------------------------------------------------------------
 * Used by the PageAgent bundle (github.com/workszop/agent and any site that embeds
 * it) as `baseURL`. Keeps provider API keys server-side; the browser never sees them.
 *
 * Routes by the `model` field in the request body:
 *   - "gemini*"        -> Google Gemini via its OpenAI-compatible endpoint
 *   - "gpt*"            -> OpenAI (e.g. gpt-6-luna, the current cheapest GPT tier)
 *
 * Deploy: wrangler deploy
 * Secrets: wrangler secret put GEMINI_API_KEY
 *          wrangler secret put OPENAI_API_KEY
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Default model per provider when the caller doesn't specify one.
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function pickUpstream(model) {
  const m = (model || '').toLowerCase();
  if (m.startsWith('gpt') || m.includes('luna')) {
    return { url: OPENAI_ENDPOINT, keyName: 'OPENAI_API_KEY', fallbackModel: DEFAULT_OPENAI_MODEL };
  }
  // Default to Gemini for "gemini*" models and anything unrecognized.
  return { url: GEMINI_ENDPOINT, keyName: 'GEMINI_API_KEY', fallbackModel: DEFAULT_GEMINI_MODEL };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response('Invalid JSON body', { status: 400, headers: corsHeaders() });
    }

    const { url, keyName, fallbackModel } = pickUpstream(body.model);
    const apiKey = env[keyName];
    if (!apiKey) {
      return new Response(`Missing ${keyName} on this Worker`, { status: 500, headers: corsHeaders() });
    }
    if (!body.model) body.model = fallbackModel;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
