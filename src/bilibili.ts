export type { TranscriptLine as SubtitleLine } from "./transcript/model";
export type { PlatformTranscriptResult as TranscriptResult } from "./platforms/types";
export { getBiliVideoId } from "./platforms/bilibili/api";
export { getBilibiliTranscript as getBiliTranscript } from "./platforms/bilibili/adapter";
