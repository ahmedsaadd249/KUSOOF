/* Inline SVG icons (stroke = currentColor). */
const svg = (d, { size = 20, stroke = 1.3, cls = '' } = {}) =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const icons = {
  bag: (o) => svg('<path d="M5.5 8.5h13l-1.1 12h-10.8z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>', { stroke: 1.25, ...o }),
  user: (o) => svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c1.2-3.4 4-5 7.2-5s6 1.6 7.2 5"/>', o),
  arrow: (o) => svg('<path d="M4 12h15m-5-5 5 5-5 5"/>', { size: 15, stroke: 1.4, cls: 'btn__arrow', ...o }),
  back: (o) => svg('<path d="M20 12H5m5-5-5 5 5 5"/>', { size: 15, stroke: 1.4, cls: 'flip-rtl', ...o }),
  check: (o) => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', { size: 14, stroke: 1.6, ...o }),
  close: (o) => svg('<path d="m6 6 12 12M18 6 6 18"/>', { size: 18, ...o }),
  mail: (o) => svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>', o),
  shield: (o) => svg('<path d="M12 3 5 6v5.5c0 4.2 2.9 7.8 7 9.5 4.1-1.7 7-5.3 7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>', o),
  search: (o) => svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', o),
  pin: (o) => svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>', o),
  plus: (o) => svg('<path d="M12 5v14M5 12h14"/>', o),
  minus: (o) => svg('<path d="M5 12h14"/>', o),
  zoom: (o) => svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/>', o),
  target: (o) => svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>', o),
  chevron: (o) => svg('<path d="m9 6 6 6-6 6"/>', { cls: 'flip-rtl', ...o }),
  chevronBack: (o) => svg('<path d="m15 6-6 6 6 6"/>', { cls: 'flip-rtl', ...o }),
  copy: (o) => svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>', o),
  refresh: (o) => svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>', o),
  sparkle: (o) => svg('<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5"/>', o),
};
