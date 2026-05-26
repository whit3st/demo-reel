export type Point = {
  x: number;
  y: number;
};

export type MouseState = {
  initialized: boolean;
  position: Point;
};

export interface SceneTimestamp {
  sceneIndex: number;
  narration: string;
  isIntro: boolean;
  startMs: number;
  endMs: number;
}
