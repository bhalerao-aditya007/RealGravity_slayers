import { Item } from './layout';

export interface Part {
  g: 'box' | 'cyl' | 'sph';
  s: [number, number, number]; // box: full size; cyl: [r, h, r]; sph: [r, r, r]
  p: [number, number, number]; // local offset, y-up
  m: string; // material key; 'dept' resolves to dept_<dept>, 'accent' to accent
  ry?: number;
}
export const BLOCKED = new Set([
  'wsDesk', 'wchair', 'leadDesk', 'execDesk', 'execChair', 'visitorChair', 'meetTable', 'meetChair',
  'mealTable', 'mealChair', 'counter', 'coffeeMachine', 'fridge', 'cooler', 'stoolTable', 'stool',
  'sofa', 'beanbag', 'rack', 'serverDesk', 'receptionDesk', 'serviceBlock', 'cabinet', 'printer', 'plant', 'glassPanel',
]);
export const CHAIR_TYPES = new Set(['wchair', 'execChair', 'visitorChair', 'meetChair', 'mealChair', 'stool']);

const legSet = (w: number, d: number): Part[] => [
  { g: 'box', s: [0.08, 0.72, 0.08], p: [w / 2 - 0.1, 0.36, d / 2 - 0.1], m: 'metal' },
  { g: 'box', s: [0.08, 0.72, 0.08], p: [-w / 2 + 0.1, 0.36, d / 2 - 0.1], m: 'metal' },
  { g: 'box', s: [0.08, 0.72, 0.08], p: [w / 2 - 0.1, 0.36, -d / 2 + 0.1], m: 'metal' },
  { g: 'box', s: [0.08, 0.72, 0.08], p: [-w / 2 + 0.1, 0.36, -d / 2 + 0.1], m: 'metal' },
];
const chairParts = (m: string): Part[] => [
  { g: 'cyl', s: [0.03, 0.32, 0.03], p: [0, 0.16, 0], m: 'metal' },
  { g: 'cyl', s: [0.26, 0.04, 0.26], p: [0, 0.02, 0], m: 'metal' },
  { g: 'box', s: [0.46, 0.07, 0.44], p: [0, 0.36, 0], m },
  { g: 'box', s: [0.44, 0.5, 0.07], p: [0, 0.66, 0.2], m },
];
const plantParts = (): Part[] => [
  { g: 'cyl', s: [0.22, 0.34, 0.22], p: [0, 0.17, 0], m: 'clay' },
  { g: 'sph', s: [0.34, 0.42, 0.34], p: [0, 0.62, 0], m: 'leaf' },
  { g: 'sph', s: [0.2, 0.26, 0.2], p: [0.12, 0.86, 0.05], m: 'leaf' },
];
// An open laptop facing the chair (+z). `y` lifts it onto the desk top (wsDesk top = 0.765).
const laptopParts = (y = 0): Part[] => [
  { g: 'box', s: [0.34, 0.016, 0.23], p: [0, 0.773 + y, 0.10], m: 'steel' },        // base
  { g: 'box', s: [0.30, 0.002, 0.11], p: [0, 0.7815 + y, 0.13], m: 'charcoal' },     // keyboard deck
  { g: 'box', s: [0.34, 0.21, 0.012], p: [0, 0.886 + y, -0.015], m: 'steel' },       // lid
  { g: 'box', s: [0.30, 0.18, 0.008], p: [0, 0.886 + y, -0.0065], m: 'screen' },     // screen, faces +z
];
const monitorParts = (): Part[] => [
  { g: 'box', s: [0.05, 0.28, 0.05], p: [0, 0.14, 0.02], m: 'metal' },
  { g: 'box', s: [0.06, 0.3, 0.18], p: [0, 0.02, 0], m: 'metal' },
  { g: 'box', s: [0.56, 0.34, 0.04], p: [0, 0.44, 0], m: 'charcoal' },
  { g: 'box', s: [0.5, 0.28, 0.012], p: [0, 0.44, 0.028], m: 'screen' }, // FIX F21: faces the user (+z = chair side), was -z (backwards)
];

export function partsFor(it: Item): Part[] {
  switch (it.type) {
    case 'wsDesk': return [
      { g: 'box', s: [it.w, 0.05, it.d], p: [0, 0.74, 0], m: 'wood' },
      ...legSet(it.w, it.d),
      { g: 'box', s: [0.42, 0.62, 0.75], p: [it.w / 2 - 0.28, 0.31, 0], m: 'woodDark' },
      ...laptopParts(), // employees work on laptops
      { g: 'sph', s: [0.05, 0.03, 0.08], p: [0.3, 0.765, 0.14], m: 'charcoal' }, // mouse
      { g: 'cyl', s: [0.02, 0.3, 0.02], p: [-it.w / 2 + 0.16, 0.89, -0.2], m: 'metal' }, // lamp arm
      { g: 'cyl', s: [0.09, 0.06, 0.09], p: [-it.w / 2 + 0.16, 1.04, -0.24], m: 'lampGlow' },
      { g: 'box', s: [0.34, 0.08, 0.05], p: [0, 0.78, it.d / 2 - 0.04], m: 'dept' }, // name plate
      { g: 'cyl', s: [0.05, 0.1, 0.05], p: [it.w / 2 - 0.12, 0.82, -it.d / 2 + 0.14], m: 'white' }, // mug
      { g: 'cyl', s: [0.03, 0.2, 0.03], p: [it.w / 2 + 0.08, 0.84, 0], m: 'leaf' },
    ];
    case 'leadDesk': return [
      { g: 'box', s: [it.w, 0.06, it.d], p: [0, 0.75, 0], m: 'woodDark' },
      ...legSet(it.w, it.d),
      { g: 'box', s: [it.w, 0.3, 0.08], p: [0, 0.6, it.d / 2 - 0.06], m: 'accent' },
      { g: 'box', s: [0.34, 0.08, 0.05], p: [0, 0.79, it.d / 2 - 0.04], m: 'accent' },
      ...laptopParts(0.015),
    ];
    case 'execDesk': return [
      { g: 'box', s: [it.w, 0.07, it.d], p: [0, 0.75, 0], m: 'woodDark' },
      { g: 'box', s: [it.w, 0.72, 0.1], p: [0, 0.36, -it.d / 2 + 0.06], m: 'woodDark' },
      { g: 'box', s: [0.1, 0.72, it.d], p: [-it.w / 2 + 0.06, 0.36, 0], m: 'woodDark' },
      { g: 'box', s: [0.1, 0.72, it.d], p: [it.w / 2 - 0.06, 0.36, 0], m: 'woodDark' },
      { g: 'box', s: [it.w, 0.08, 0.1], p: [0, 0.72, it.d / 2 - 0.06], m: 'accent' },
      ...laptopParts(0.02),
    ];
    case 'wchair': return chairParts('dept');
    case 'execChair': return chairParts('charcoal');
    case 'visitorChair':
    case 'meetChair':
    case 'mealChair': return chairParts('oat');
    case 'stool': return [
      { g: 'cyl', s: [0.03, 0.62, 0.03], p: [0, 0.31, 0], m: 'metal' },
      { g: 'cyl', s: [0.24, 0.03, 0.24], p: [0, 0.03, 0], m: 'metal' },
      { g: 'cyl', s: [0.2, 0.07, 0.2], p: [0, 0.66, 0], m: 'dept' },
    ];
    case 'monitor': return monitorParts();
    case 'meetTable':
    case 'mealTable': return [
      { g: 'box', s: [it.w, 0.05, it.d], p: [0, 0.74, 0], m: 'wood' },
      { g: 'box', s: [Math.min(0.5, it.w / 3), 0.72, Math.min(0.5, it.d)], p: [0, 0.36, 0], m: 'metal' },
    ];
    case 'counter':
    case 'serveCounter': return [
      { g: 'box', s: [it.w, 0.9, it.d], p: [0, 0.45, 0], m: 'oat' },
      { g: 'box', s: [it.w + 0.08, 0.05, it.d + 0.08], p: [0, 0.93, 0], m: 'wood' },
    ];
    case 'coffeeMachine': return [ // raised 0.78 m: it stands on the counter top, not inside it
      { g: 'box', s: [0.7, 0.55, 0.55], p: [0, 1.23, 0], m: 'charcoal' },
      { g: 'box', s: [0.5, 0.12, 0.3], p: [0, 1.4, 0.1], m: 'accent' },
      { g: 'cyl', s: [0.045, 0.12, 0.045], p: [0, 1.08, 0.12], m: 'steel' },
    ];
    case 'fridge': return [
      { g: 'box', s: [0.85, 1.7, 0.75], p: [0, 0.85, 0], m: 'steel' },
      { g: 'box', s: [0.06, 0.6, 0.05], p: [0.3, 1.0, 0.4], m: 'charcoal' },
    ];
    case 'cooler': return [
      { g: 'box', s: [0.45, 1.1, 0.45], p: [0, 0.55, 0], m: 'white' },
      { g: 'cyl', s: [0.2, 0.4, 0.2], p: [0, 1.3, 0], m: 'skyglass' },
    ];
    case 'stoolTable': return [
      { g: 'cyl', s: [0.55, 0.05, 0.55], p: [0, 0.74, 0], m: 'wood' },
      { g: 'cyl', s: [0.06, 0.72, 0.06], p: [0, 0.36, 0], m: 'metal' },
      { g: 'cyl', s: [0.35, 0.03, 0.35], p: [0, 0.02, 0], m: 'metal' },
    ];
    case 'sofa': {
      const along = it.w > it.d ? 'x' : 'z';
      const L = Math.max(it.w, it.d);
      return [
        { g: 'box', s: along === 'x' ? [L, 0.4, 0.9] : [0.9, 0.4, L], p: [0, 0.2, 0], m: 'sofa' },
        { g: 'box', s: along === 'x' ? [L, 0.55, 0.22] : [0.22, 0.55, L], p: [0, 0.62, along === 'x' ? 0.34 : 0], m: 'sofa' },
        ...(along === 'x' ? [[-L / 2, 0.5, 0], [L / 2, 0.5, 0]] : [[0, 0.5, -L / 2], [0, 0.5, L / 2]])
          .map(([px, py, pz]) => ({ g: 'box' as const, s: [0.2, 0.5, 0.9] as [number, number, number], p: [px, py, pz] as [number, number, number], m: 'sofaDark' })),
      ];
    }
    case 'beanbag': return [
      { g: 'sph', s: [0.45, 0.3, 0.45], p: [0, 0.2, 0], m: 'sofa' },
      { g: 'sph', s: [0.3, 0.18, 0.3], p: [0, 0.38, -0.08], m: 'sofaDark' },
    ];
    case 'rack': return [
      { g: 'box', s: [1.0, 2.1, 0.8], p: [0, 1.05, 0], m: 'charcoal' },
      { g: 'box', s: [0.9, 0.06, 0.05], p: [0, 0.6, 0.41], m: 'steel' },
      { g: 'box', s: [0.9, 0.06, 0.05], p: [0, 1.1, 0.41], m: 'steel' },
      { g: 'box', s: [0.9, 0.06, 0.05], p: [0, 1.6, 0.41], m: 'steel' },
      { g: 'box', s: [0.82, 0.08, 0.02], p: [0, 0.85, 0.42], m: 'led' },
      { g: 'box', s: [0.82, 0.08, 0.02], p: [0, 1.35, 0.42], m: 'led' },
    ];
    case 'serverDesk': return [
      { g: 'box', s: [it.w, 0.05, it.d], p: [0, 0.74, 0], m: 'wood' }, ...legSet(it.w, it.d),
    ];
    case 'receptionDesk': return [
      { g: 'box', s: [it.w, 1.05, it.d], p: [0, 0.52, 0], m: 'oat' },
      { g: 'box', s: [it.w + 0.1, 0.06, it.d + 0.1], p: [0, 1.08, 0], m: 'wood' },
      { g: 'box', s: [it.w, 0.1, 0.06], p: [0, 0.9, -it.d / 2 - 0.02], m: 'accent' },
    ];
    case 'logoWall': return [
      { g: 'box', s: [it.w, 2.6, 0.3], p: [0, 1.3, 0], m: 'charcoal' },
      { g: 'box', s: [it.w - 1.2, 1.1, 0.08], p: [0, 1.5, 0.18], m: 'accent' },
      { g: 'box', s: [it.w - 2.4, 0.16, 0.1], p: [0, 2.05, 0.19], m: 'accent' },
    ];
    case 'whiteboard': return [
      { g: 'box', s: [it.w, 1.4, 0.08], p: [0, 1.5, 0], m: 'white' },
      { g: 'box', s: [it.w, 0.08, 0.1], p: [0, 0.78, 0], m: 'wood' },
    ];
    case 'cabinet': return [
      { g: 'box', s: [it.w, 1.3, it.d], p: [0, 0.65, 0], m: 'oat' },
      { g: 'box', s: [it.w - 0.1, 0.05, 0.02], p: [0, 0.9, it.d / 2], m: 'charcoal' },
    ];
    case 'printer': return [
      { g: 'box', s: [it.w, 0.7, it.d], p: [0, 0.35, 0], m: 'white' },
      { g: 'box', s: [0.35, 0.08, 0.3], p: [0, 0.74, 0], m: 'charcoal' },
    ];
    case 'glassPanel': return [
      { g: 'box', s: [it.w, 1.7, 0.05], p: [0, 0.95, 0], m: 'skyglass' },
      { g: 'box', s: [it.w, 0.05, 0.09], p: [0, 1.82, 0], m: 'dept' },     // department-colored top rail
      { g: 'box', s: [it.w, 0.1, 0.09], p: [0, 0.07, 0], m: 'metal' },      // base rail
      { g: 'box', s: [0.06, 1.8, 0.09], p: [-it.w / 2 + 0.03, 0.95, 0], m: 'metal' },
      { g: 'box', s: [0.06, 1.8, 0.09], p: [it.w / 2 - 0.03, 0.95, 0], m: 'metal' },
    ];
    case 'plant': return plantParts();
    case 'rug': return [{ g: 'box', s: [it.w, 0.02, it.d], p: [0, 0.012, 0], m: 'rug' }];
    case 'clock': return [
      { g: 'cyl', s: [0.3, 0.06, 0.3], p: [0, 2.2, 0], m: 'white', ry: Math.PI / 2 },
      { g: 'box', s: [0.02, 0.22, 0.02], p: [0, 2.3, 0], m: 'charcoal' },
    ];
    case 'art': return [
      { g: 'box', s: [it.w, 1.2, 0.06], p: [0, 1.8, 0], m: 'oat' },
      { g: 'box', s: [it.w - 0.3, 0.9, 0.03], p: [0, 1.8, 0.05], m: 'artInner' },
    ];
    case 'exitSign': return [{ g: 'box', s: [0.6, 0.22, 0.1], p: [0, 2.6, 0], m: 'exitGreen' }];
    case 'serviceBlock': return [
      { g: 'box', s: [it.w, 3, it.d], p: [0, 1.5, 0], m: 'wallSolid' },
      { g: 'box', s: [1.2, 0.5, 0.06], p: [0, 1.9, it.d / 2 + 0.01], m: 'white' },
    ];
    default: return [];
  }
}
