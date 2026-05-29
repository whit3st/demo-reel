export {
  getFfmpegPath,
  getFfprobePath,
  runFFmpeg,
  runFfprobe,
  measureAudioDuration,
  wavToMp3,
  generateSilence,
  concatenateAudio,
  mergeAudioVideo,
  buildFfmpegArgs,
  isFfmpegAvailable,
  resolveAudioPaths,
} from "./ffmpeg/utils.js";
export type { AudioConfig, NarrationPlacement, MergeOptions } from "./ffmpeg/utils.js";
