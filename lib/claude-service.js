import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is required');
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export function buildSystemPrompt(injectedVersions) {
  const assetBlocks = injectedVersions.map(v =>
    `## ${v.assetName} (${v.assetType})\n\n${v.content}`
  ).join('\n\n---\n\n');

  return `You are an expert marketing strategist with access to the following canonical strategic documents from this organization. All your outputs should be consistent with these documents and the organization's established strategy, positioning, and brand identity.

${assetBlocks}

Use these canonical documents as the authoritative source of truth for all strategic decisions, recommendations, and content you produce in this session.`;
}

export async function sendMessage({ systemPrompt, history, newUserMessage }) {
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: newUserMessage }
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: systemPrompt,
    messages
  });

  return {
    content: response.content[0].text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
  };
}
