export const Icon = ({ d, size = 16, sw = 1.8, className }: { d: string; size?: number; sw?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);
export const I = {
  play: 'M6 4l14 8-14 8z',
  pause: 'M8 5v14M16 5v14',
  sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10L5.6 18.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  cube: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10',
  flow: 'M5 17h6a4 4 0 0 0 0-8H8a4 4 0 0 1 0-8h6M19 5v4m0 10v-4',
  code: 'M8 6 3 12l5 6m8-12 5 6-5 6',
  layers: 'M12 2 2 8l10 6 10-6zM2 14l10 6 10-6',
  x: 'M5 5l14 14M19 5 5 19',
  check: 'M20 6L9 17l-5-5',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 4-1.5-.5-.4-1 .8-1.4-1.5-1.5-1.4.8-1-.4L14 6h-2l-.5 1.5-1 .4-1.4-.8L7.6 8.6l.8 1.4-.4 1L6.5 12l-.5.5.5 1 .4 1-.8 1.4 1.5 1.5 1.4-.8 1 .4L12 20h2l.5-1.5 1-.4 1.4.8 1.5-1.5-.8-1.4.4-1z',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 19h16',
  camera: 'M4 7h3l2-2h6l2 2h3v12H4zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3m6 1h4',
  pin: 'M12 3a6 6 0 0 0-6 6c0 4 6 12 6 12s6-8 6-12a6 6 0 0 0-6-6zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m2-5c3 0 6 2 6 5',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  coffee: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h2a2 2 0 1 1 0 4h-2M7 4c0 1 1 1 1 2m3-2c0 1 1 1 1 2',
  chevron: 'M6 9l6 6 6-6',
  chevronUp: 'M18 15l-6-6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  bug: 'M12 7a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0v-3a5 5 0 0 0-5-5zM12 7V4m-8 8H2m20 0h-2M5 6 3.5 4.5M19 6l1.5-1.5M6 17l-2 2m14-2 2 2',
};
