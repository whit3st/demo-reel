export type Point = {
  x: number;
  y: number;
};

export type MouseState = {
  initialized: boolean;
  position: Point;
  /**
   * Fired with every synthetic pointer position so a camera can follow the
   * cursor. Fire-and-forget by contract: observers must not block or throw
   * into the motion loop.
   */
  onPointerMove?: (point: Point) => void;
};

export interface SceneTimestamp {
  sceneIndex: number;
  narration: string;
  isIntro: boolean;
  startMs: number;
  endMs: number;
}
