import type { LLMProvider, LLMProviderConfig } from './types.js';
import { OpenAIProvider } from './openai-provider.js';

export type ProviderType = 'openai' | 'azure' | 'ollama';

/**
 * LLM Provider 工厂
 */
export function createLLMProvider(
  type: ProviderType = 'openai',
  config: LLMProviderConfig
): LLMProvider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'azure':
      // Azure 使用相同的 OpenAI 兼容接口，baseUrl 格式不同
      return new OpenAIProvider({
        ...config,
        baseUrl: config.baseUrl || 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
      });
    case 'ollama':
      return new OpenAIProvider({
        ...config,
        baseUrl: config.baseUrl || 'http://localhost:11434/v1',
        model: config.model || 'llama3',
      });
    default:
      throw new Error(`不支持的 LLM Provider: ${type}`);
  }
}

/**
 * 从环境变量自动创建 Provider
 */
export function createProviderFromEnv(): LLMProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 OPENAI_API_KEY 环境变量');
  }

  const providerType = (process.env.LLM_PROVIDER || 'openai') as ProviderType;

  return createLLMProvider(providerType, {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '120000'),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3'),
  });
}
