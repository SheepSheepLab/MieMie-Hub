// Private visual tuning, not an Extension API or a theme schema.
// Structural one/two-column ordering stays in honeycombLayout.
export const LAUNCHER_TUNING = Object.freeze({
  hubScale:1.18, edgeScaleAmount:.52, edgeScaleCurve:1.6, horizontalCompression:.4,
  resistanceMax:64, resistanceDistance:160, returnDecayMs:80, restThreshold:.1,
  dragThreshold:7, focusBand:.32,
  openMs:520, closeMs:440, labelCloseMs:220, easing:'cubic-bezier(.22,.8,.25,1)',
  hubEnterMs:95, closeCollapsedScale:.04, fanCloseSpan:.72,
  collapsedScale:.12, labelCollapsedScale:.05, bloomStaggerMs:14, bloomStaggerMaxMs:75,
  bloomMidpoint:.4, bloomMidScale:.57, bloomOvershoot:1.025, bloomBlur:4,
  rippleMs:540, rippleStartScale:.9, rippleEndScale:3.9, returnBrightness:1.3,
});
export const SURFACE_TUNING = Object.freeze({
  contentEnterStart:.18, contentEnterEnd:.62, contentExitEnd:.48,
  faceEnterEnd:.42, faceExitStart:.45, faceExitEnd:.86,
  fallbackScale:.96, fallbackOffset:12,
});
