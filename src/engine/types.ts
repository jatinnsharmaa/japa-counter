/** One 20 ms analysis frame: 12 cepstral coefficients and frame energy in dB. */
export interface Frame {
  v: Float32Array;
  db: number;
}

/** A recorded sample turned into a template: trimmed, mean-normalised frames. */
export interface Take {
  frames: Float32Array[];
  mean: Float32Array;
  dur: number; // seconds
  start: number; // first kept frame index in the source frames
  end: number; // last kept frame index in the source frames (inclusive)
}

export interface MatchResult {
  score: number;
  ts: number; // start frame of the match in the live stream
  te: number; // end frame of the match in the live stream
}

export interface Calibration {
  base: number;
  mean: number;
  sd: number;
  max: number;
  perAvg: number[];
}
