import { spawn } from 'child_process';
import { resolve } from 'path';

export interface AudioConfig {
  narration?: string;        // Path to MP3 file
  narrationDelay?: number;   // Delay in milliseconds before narration starts
  background?: string;       // Path to MP3 file  
  backgroundVolume?: number; // 0.0 to 1.0, default 0.3
}

export interface MergeOptions {
  videoPath: string;
  outputPath: string;
  audio?: AudioConfig;
}

// Import ffmpeg-static dynamically to avoid type issues
async function getFfmpegPath(): Promise<string | null> {
  try {
    const module: any = await import('ffmpeg-static');
    return module.default as string | null;
  } catch {
    return null;
  }
}

/**
 * Merge video with audio files using FFmpeg
 */
export async function mergeAudioVideo(options: MergeOptions): Promise<string> {
  const { videoPath, outputPath, audio } = options;
  
  if (!audio || (!audio.narration && !audio.background)) {
    // No audio to process, just copy video
    return videoPath;
  }
  
  const ffmpegPath = await getFfmpegPath();
  
  if (!ffmpegPath) {
    throw new Error('FFmpeg binary not found. Please ensure ffmpeg-static is installed correctly.');
  }
  
  // Change output to MP4 format when mixing audio (WebM doesn't support AAC)
  const mp4OutputPath = outputPath.replace(/\.webm$/i, '.mp4');
  
  const args = buildFfmpegArgs(videoPath, mp4OutputPath, audio);
  
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stderr = '';
    
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(mp4OutputPath);
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (err: Error) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

function buildFfmpegArgs(
  videoPath: string, 
  outputPath: string, 
  audio: AudioConfig
): string[] {
  const args: string[] = [
    '-y',  // Overwrite output file
    '-i', videoPath,  // Video input
  ];
  
  let filterComplex = '';
  const narrationDelay = audio.narrationDelay ?? 0;
  
  // Add narration if provided
  if (audio.narration) {
    args.push('-i', audio.narration);
  }
  
  // Add background music if provided
  if (audio.background) {
    args.push('-i', audio.background);
  }
  
  // Build filter complex for mixing
  if (audio.narration && audio.background) {
    // Both narration and background
    const bgVolume = audio.backgroundVolume ?? 0.3;
    
    if (narrationDelay > 0) {
      // Delay the narration
      const delayMs = narrationDelay;
      filterComplex = `[1:a]adelay=${delayMs}|${delayMs}[delayed];[delayed]volume=1[narr];[2:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=first:dropout_transition=0[out]`;
    } else {
      filterComplex = `[1:a]volume=1[narr];[2:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=first:dropout_transition=0[out]`;
    }
    
    args.push(
      '-filter_complex', filterComplex,
      '-map', '0:v',  // Video from first input
      '-map', '[out]' // Mixed audio
    );
  } else if (audio.background) {
    // Only background music
    const bgVolume = audio.backgroundVolume ?? 0.3;
    args.push(
      '-filter_complex', `[1:a]volume=${bgVolume}[aout]`,
      '-map', '0:v',
      '-map', '[aout]'
    );
  } else if (audio.narration && narrationDelay > 0) {
    // Only narration with delay
    const delayMs = narrationDelay;
    args.push(
      '-filter_complex', `[1:a]adelay=${delayMs}|${delayMs}[aout]`,
      '-map', '0:v',
      '-map', '[aout]'
    );
  }
  // If only narration without delay, no filter needed - FFmpeg will auto-map
  
  // Output settings - re-encode to H.264 for MP4 compatibility
  args.push(
    '-c:v', 'libx264',  // Re-encode video to H.264 (compatible with MP4)
    '-preset', 'fast',  // Encoding speed/quality tradeoff
    '-crf', '23',       // Quality (lower = better, 23 is default)
    '-c:a', 'aac',      // AAC audio codec
    '-b:a', '192k',     // Audio bitrate
    '-movflags', '+faststart',  // Enable web streaming
    outputPath
  );
  
  return args;
}

/**
 * Check if FFmpeg is available
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  const path = await getFfmpegPath();
  return !!path;
}

/**
 * Resolve audio paths relative to config file
 */
export function resolveAudioPaths(
  audio: AudioConfig | undefined,
  configDir: string
): AudioConfig | undefined {
  if (!audio) return undefined;
  
  const resolved: AudioConfig = {
    backgroundVolume: audio.backgroundVolume ?? 0.3
  };
  
  if (audio.narration) {
    resolved.narration = resolve(configDir, audio.narration);
  }
  if (audio.background) {
    resolved.background = resolve(configDir, audio.background);
  }
  
  return resolved;
}
