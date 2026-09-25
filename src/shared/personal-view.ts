export type Position = { x: number; y: number; z: number };
export type PersonalPosition = Position & { id: string; version: number };
export type ViewSettings = {
  invertX: boolean;
  invertY: boolean;
  axisCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  axisPinned: boolean;
  stars: boolean;
  allLabels: boolean;
};
export const defaultViewSettings: ViewSettings = {
  invertX: false,
  invertY: false,
  axisCorner: 'bottom-right',
  axisPinned: false,
  stars: false,
  allLabels: false,
};
export type PersonalView = {
  contentVersion: number;
  positions: PersonalPosition[];
  settings: ViewSettings & { version: number };
};
