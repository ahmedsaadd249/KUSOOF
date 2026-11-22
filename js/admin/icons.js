/* Admin icon set (stroke = currentColor). */
const svg = (d, { size = 20, stroke = 1.5 } = {}) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ai = {
  dashboard: (o) => svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>', o),
  products: (o) => svg('<circle cx="7" cy="13" r="3.5"/><circle cx="17" cy="13" r="3.5"/><path d="M10.5 12.5c1-.7 2-.7 3 0M3.5 12 5 7.5M20.5 12 19 7.5"/>', o),
  orders: (o) => svg('<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', o),
  customers: (o) => svg('<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.9-3.1 3.3-4.6 6-4.6s5.1 1.5 6 4.6"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6M18.5 14.8c1.4.7 2.3 2.2 2.7 4.7"/>', o),
  mail: (o) => svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>', o),
  settings: (o) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', o),
  logout: (o) => svg('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>', o),
  store: (o) => svg('<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5h16v1a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 13.5a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 10.5z"/><path d="M5.5 13v7h13v-7"/>', o),
  external: (o) => svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', o),
  search: (o) => svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', { size: 17, ...o }),
  plus: (o) => svg('<path d="M12 5v14M5 12h14"/>', o),
  edit: (o) => svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', { size: 17, ...o }),
  trash: (o) => svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>', { size: 17, ...o }),
  eye: (o) => svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>', { size: 17, ...o }),
  upload: (o) => svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>', o),
  image: (o) => svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>', { size: 26, stroke: 1.2, ...o }),
  chevronL: (o) => svg('<path d="m15 6-6 6 6 6"/>', { size: 16, ...o }),
  chevronR: (o) => svg('<path d="m9 6 6 6-6 6"/>', { size: 16, ...o }),
  back: (o) => svg('<path d="M20 12H5m5-5-5 5 5 5"/>', { size: 16, ...o }),
  box: (o) => svg('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>', { size: 17, ...o }),
  alert: (o) => svg('<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>', { size: 17, ...o }),
  coin: (o) => svg('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>', { size: 17, ...o }),
  copy: (o) => svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>', { size: 16, ...o }),
  up: (o) => svg('<path d="M12 19V5M6 11l6-6 6 6"/>', { size: 12, stroke: 2, ...o }),
  down: (o) => svg('<path d="M12 5v14M6 13l6 6 6-6"/>', { size: 12, stroke: 2, ...o }),
  sort: (o) => svg('<path d="m8 10 4-4 4 4M8 14l4 4 4-4"/>', { size: 13, stroke: 1.6, ...o }),
  info: (o) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>', { size: 18, ...o }),
};
