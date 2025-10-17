// Single place to call an LLM (mocked for now)
export async function askLLM(prompt: string): Promise<string> {
  // TODO: swap to real provider; for now return a stub
  return `（AI Response）${prompt.slice(0, 48)}...`;
}
