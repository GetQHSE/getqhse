export type AudioTranscriptionResult = {
  text: string;
  language: string | null;
  durationMs: number | null;
  model: string;
};

export abstract class AudioTranscriptionPort {
  abstract transcribe(audio: Uint8Array): Promise<AudioTranscriptionResult>;
}
