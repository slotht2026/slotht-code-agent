/**
 * LLM Provider 统一抽象层
 */

/** LLM 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant';

/** LLM 消息 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/** LLM 请求配置 */
export interface LLMRequestOptions {
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

/** LLM 响应 */
export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

/** LLM Stream Chunk */
export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

/** LLM Provider 接口 */
export interface LLMProvider {
  readonly name: string;
  complete(options: LLMRequestOptions): Promise<LLMResponse>;
  stream(options: LLMRequestOptions): AsyncGenerator<LLMStreamChunk, void, unknown>;
  validate(): Promise<boolean>;
}

/** Provider 配置 */
export interface LLMProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}
