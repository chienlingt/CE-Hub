/**
 * A1.3 — LLM Delivery Remark Parser
 *
 * Supports two providers (set LLM_PROVIDER in .env):
 *   groq   — Free, fast, recommended for FYP (console.groq.com)
 *   gemini — Google Gemini (aistudio.google.com)
 *
 * Parses unstructured Odoo delivery remarks to extract:
 *   - Delivery address  (priority over SO address — FR-01-004)
 *   - Contact phone number
 *   - Contact person name
 *   - Driver instructions / notes
 */

const PROMPT = (remarks, defaultAddress, defaultPhone) => `
You are a Malaysian logistics assistant. A customer left a delivery remark on their order.
Extract structured delivery information from it.

The remark may be in English, Malay, or a mix of both.
Only extract what is clearly delivery-related. Ignore irrelevant content.

Delivery remark: "${remarks}"
Current default delivery address: "${defaultAddress || 'Not provided'}"
Current default phone number: "${defaultPhone || 'Not provided'}"

Extract the following. Return null if you are not confident:
1. delivery_address — Specific delivery address/unit/location in the remark (NOT the default unless restated)
2. phone — Contact phone number in the remark (Malaysian: 01x-xxxxxxx). NOT the default unless restated.
3. contact_name — Name of person to contact at delivery
4. driver_notes — Important driver instructions (access, timing, special handling). Exclude address and phone.
5. has_address — true if a delivery address was clearly found, false otherwise
6. has_phone — true if a phone number was clearly found, false otherwise

Return ONLY valid JSON, no markdown, no explanation:
{"delivery_address":null,"phone":null,"contact_name":null,"driver_notes":null,"has_address":false,"has_phone":false}
`;

// ── Groq provider ─────────────────────────────────────────────────────────────
async function callGroq(remarks, defaultAddress, defaultPhone) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || apiKey === 'YOUR_GROQ_KEY_HERE') {
    throw new Error('GROQ_API_KEY not configured. Get free key at console.groq.com');
  }

  const Groq   = require('groq-sdk');
  const client = new Groq({ apiKey });

  const response = await client.chat.completions.create({
    model:           'llama-3.3-70b-versatile',
    messages:        [{ role: 'user', content: PROMPT(remarks, defaultAddress, defaultPhone) }],
    response_format: { type: 'json_object' },
    temperature:     0.1,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned empty response');
  return JSON.parse(text);
}

// ── Gemini provider ───────────────────────────────────────────────────────────
async function callGemini(remarks, defaultAddress, defaultPhone) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'YOUR_NEW_KEY_HERE') {
    throw new Error('GOOGLE_GEMINI_API_KEY not configured. Get free key at aistudio.google.com');
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const client    = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const model     = client.getGenerativeModel({ model: modelName });

  const result  = await model.generateContent(PROMPT(remarks, defaultAddress, defaultPhone));
  const rawText = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(rawText);
}

// ── Main export ───────────────────────────────────────────────────────────────
async function parseDeliveryRemarks(remarks, defaultAddress = '', defaultPhone = '') {
  if (!remarks?.trim()) {
    return {
      delivery_address: null, phone: null,
      contact_name:     null, driver_notes: null,
      has_address: false,     has_phone: false,
      applied_address: defaultAddress,
      applied_phone:   defaultPhone,
      source: 'default',
    };
  }

  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  console.log(`[LLM Parser] Using provider: ${provider}`);

  let parsed;
  try {
    parsed = provider === 'gemini'
      ? await callGemini(remarks, defaultAddress, defaultPhone)
      : await callGroq(remarks, defaultAddress, defaultPhone);
  } catch (err) {
    throw new Error(`[${provider.toUpperCase()}] ${err.message}`);
  }

  // FR-01-004: remarks address/phone takes priority over SO defaults
  const applied_address = parsed.has_address && parsed.delivery_address
    ? parsed.delivery_address : defaultAddress;

  const applied_phone = parsed.has_phone && parsed.phone
    ? parsed.phone : defaultPhone;

  return {
    ...parsed,
    applied_address,
    applied_phone,
    source:      (parsed.has_address || parsed.has_phone) ? 'remarks' : 'default',
    raw_remarks: remarks,
    provider,
  };
}

module.exports = { parseDeliveryRemarks };
