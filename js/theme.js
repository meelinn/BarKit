// Theme: saved choice, else follow the system (Bootstrap 5.3 color modes);
// palette (main color): retro green (default), fresh blue or minimal white
(() => {
  let t = null, p = null;
  try { t = localStorage.getItem('barcode-maker-theme'); p = localStorage.getItem('barcode-maker-palette'); } catch {}
  if (p === 'blue' || p === 'white') document.documentElement.dataset.bkPalette = p;
  document.documentElement.dataset.bsTheme =
    t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();

// Holidays: a seasonal accent color and a prop for the mascot, on top of any palette.
// All worked out from today's date, so nothing needs updating each year. Lunar dates are computed
// here (the browser's built-in Chinese calendar is a day off in some years, e.g. 2027 and 2030).
// Preview any of them with ?holiday=newyear | midautumn | halloween | xmas
(() => {
  const rad = Math.PI / 180, sin = x => Math.sin(x * rad);
  // Julian day number of a calendar date, and the China-time (UTC+8) day number of a moment (JD, UT)
  const dayNo = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5) + 2440588;
  const chinaDay = jd => Math.floor(jd + .5 + 8 / 24);

  // Sun's apparent longitude in degrees (Meeus ch. 25, about 0.01°)
  const sunLon = jd => {
    const T = (jd - 2451545) / 36525, M = 357.52911 + 35999.05029 * T - .0001537 * T * T;
    const C = (1.914602 - .004817 * T - .000014 * T * T) * sin(M) + (.019993 - .000101 * T) * sin(2 * M)
      + .000289 * sin(3 * M);
    const L = 280.46646 + 36000.76983 * T + .0003032 * T * T + C - .00569 - .00478 * sin(125.04 - 1934.136 * T);
    return ((L % 360) + 360) % 360;
  };
  // Moment (JD, UT) the sun reaches a longitude, searching from a nearby guess
  const sunAt = (lon, jd) => {
    for (let i = 0; i < 6; i++) jd += ((lon - sunLon(jd) + 540) % 360 - 180) / 360 * 365.2422;
    return jd;
  };
  // Moment (JD, UT) of new moon number k, counted from January 2000: Meeus ch. 49 with only its six
  // largest terms (a few minutes off; checked to give the same festival dates as the full formula
  // for every year 1990–2100), minus about 70 s for Earth's slowing rotation
  const newMoon = k => {
    const T = k / 1236.85, E = 1 - .002516 * T;
    const M = 2.5534 + 29.1053567 * k, Mp = 201.5643 + 385.81693528 * k, F = 160.7108 + 390.67050284 * k;
    return 2451550.09766 + 29.530588861 * k - .4072 * sin(Mp) + .17241 * E * sin(M) + .01608 * sin(2 * Mp)
      + .01039 * sin(2 * F) + .00739 * E * sin(Mp - M) - .00514 * E * sin(Mp + M) - 70 / 864e2;
  };
  // Number k of the new moon that starts the lunar month containing a China day
  const monthStart = day => {
    let k = Math.floor((day - 2451550) / 29.530588861) + 1;
    while (chinaDay(newMoon(k)) > day) k--;
    return k;
  };
  // Lunar months from the 11th month before year y through the next 11th month, labelled by number;
  // the first month with no major solar term (multiple of 30°) in a 13-month span is the leap month
  const lunarYear = y => {
    const winter = yr => chinaDay(sunAt(270, dayNo(yr, 12, 21) - .5));
    const k0 = monthStart(winter(y - 1)), k1 = monthStart(winter(y));
    const starts = [];
    for (let k = k0; k <= k1; k++) starts.push(chinaDay(newMoon(k)));
    const term = d => Math.floor(sunLon(d - .5 - 8 / 24) / 30);   // at the start of a China day
    let needLeap = starts.length === 14, m = 10;
    return starts.slice(0, -1).map((start, i) => {
      const leap = needLeap && i > 0 && term(starts[i + 1]) === term(start);   // keeps the previous number
      if (leap) needLeap = false;
      else m = m % 12 + 1;
      return { start, m, leap };
    });
  };
  // China day of lunar month m, day d, in year y (not a leap month)
  const lunarDay = (y, m, d) => {
    const month = lunarYear(y).find(x => x.m === m && !x.leap);
    return month.start + d - 1;
  };

  const now = new Date(), y = now.getFullYear(), today = dayNo(y, now.getMonth() + 1, now.getDate());
  const near = (day, before, after) => today >= day - before && today <= day + after;
  const HOLIDAYS = {
    halloween: () => near(dayNo(y, 10, 31), 6, 0),                // Oct 25–31
    xmas: () => near(dayNo(y, 12, 25), 5, 1),                     // Dec 20–26
    newyear: () => near(lunarDay(y, 1, 1), 3, 5),                 // two days before New Year's Eve – the 6th
    midautumn: () => near(lunarDay(y, 8, 15), 3, 1),              // three days before – the day after
  };
  const forced = new URLSearchParams(location.search).get('holiday');
  let hit = forced && Object.hasOwn(HOLIDAYS, forced) ? forced : null;
  if (!forced) try { hit = Object.keys(HOLIDAYS).find(id => HOLIDAYS[id]()); } catch {}
  if (hit) document.documentElement.dataset.bkHoliday = hit;
})();
