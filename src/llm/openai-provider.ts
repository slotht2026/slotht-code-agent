import type {
  LLMProvider,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMProviderConfig,
} from './types.js';

/**
 * OpenAI 兼容 Provider（支持 OpenAI / Azure / 本地兼容 API）
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private config: LLMProviderConfig & { model: string; baseUrl: string };

  constructor(config: LLMProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      model: config.model || 'gpt-4o',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.1,
      timeoutMs: config.timeoutMs || 120_000,
      maxRetries: config.maxRetries || 3,
    };
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = options.model || this.config.model;
    const maxTokens = options.maxTokens || this.config.maxTokens;
    const temperature = options.temperature ?? this.config.temperature;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.config.maxRetries!; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs!);

        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: options.messages,
            max_tokens: maxTokens,
            temperature,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`LLM API 错误 (${response.status}): ${errorText}`);

          // 429 / 5xx 可重试
          if (response.status === 429 || response.status >= 500) {
            lastError = error;
            const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw error;
        }

        const data = (await response.json()) as {
          choices: { message: { content: string }; finish_reason: string }[];
          model: string;
          usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        const choice = data.choices[0];
        return {
          content: choice?.message?.content || '',
          model: data.model,
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
          },
          finishReason: choice?.finish_reason || 'stop',
        };
      } catch (error: any) {
        if (error.name === 'AbortError') {
          lastError = new Error(`LLM 请求超时 (${this.config.timeoutMs}ms)`);
        } else {
          lastError = error;
        }
        // 非 HTTP 错误也重试
        if (attempt < this.config.maxRetries! - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }
    throw lastError || new Error('LLM 请求失败');
  }

  async *stream(options: LLMRequestOptions): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const model = options.model || this.config.model;
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM stream 错误 (${response.status}): ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法获取 stream reader');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              yield { content, done: false };
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async validate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
