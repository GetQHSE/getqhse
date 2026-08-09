export type PromptDefinition<TInput> = {
  key: string;
  version: number;
  build(input: TInput): { system: string; context: string };
};
