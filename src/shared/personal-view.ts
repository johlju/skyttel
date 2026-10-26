export type Position = { x: number; y: number; z: number };
export type PersonalPosition = Position & { id: string; version: number };
export type ViewSettings = {
  invertX: boolean;
  invertY: boolean;
  axisCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  axisPinned: boolean;
  background: boolean;
  lightBackground: 'pearl' | 'dawn' | 'ocean';
  darkBackground: 'atmosphere' | 'mist' | 'universe' | 'ocean';
  panStrength: number;
  zoomStrength: number;
  layerDistance: number;
  allLabels: boolean;
  zeroReferenceVariant: 'square' | 'oval' | 'circle' | 'lines';
  zeroReferenceWeight: 'subtle' | 'original' | 'prominent';
  zeroReferenceAlwaysVisible: boolean;
  zeroReferenceOnMovement: boolean;
  zeroReferenceTint: number;
  /** Legacy schema38 field retained for API/archive compatibility; has no display effect. */
  zeroReferenceKeepSize: boolean;
};
export const defaultViewSettings: ViewSettings = {
  invertX: false,
  invertY: false,
  axisCorner: 'bottom-right',
  axisPinned: false,
  background: true,
  lightBackground: 'pearl',
  darkBackground: 'atmosphere',
  panStrength: 0.7,
  zoomStrength: 0.7,
  layerDistance: 1,
  allLabels: false,
  zeroReferenceVariant: 'circle',
  zeroReferenceWeight: 'subtle',
  zeroReferenceAlwaysVisible: false,
  zeroReferenceOnMovement: false,
  zeroReferenceTint: 0,
  zeroReferenceKeepSize: false,
};
export type PersonalView = {
  contentVersion: number;
  positions: PersonalPosition[];
  settings: ViewSettings & { version: number };
};
