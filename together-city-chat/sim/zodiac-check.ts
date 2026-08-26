import { zodiacSign } from '../src/dating/astrology';
import { signOf, siderealLon, sunLongitude } from '../src/astrology/astro-engine';
const jdOf = (d: Date) => d.getTime() / 86400000 + 2440587.5;
const vedic = (d: Date) => signOf(siderealLon(sunLongitude(jdOf(d)), jdOf(d)));
let agree = 0, tot = 0; const off: Record<string, number> = {};
for (let y of [1975, 1985, 1995, 2005]) for (let m = 0; m < 12; m++) for (let d = 1; d <= 28; d++) {
  const dt = new Date(Date.UTC(y, m, d, 12));
  const a = zodiacSign(dt).name, b = vedic(dt);
  tot++; if (a === b) agree++; else off[`${a}→${b}`] = (off[`${a}→${b}`] ?? 0) + 1;
}
console.log(`dating tropical sun sign == Astrology Zone Vedic sidereal sun sign on ${agree}/${tot} dates = ${(100*agree/tot).toFixed(1)}%`);
console.log('most common disagreements:', Object.entries(off).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`${k} (${v})`).join(', '));
// element consequence
const EL: Record<string,string> = {Aries:'fire',Leo:'fire',Sagittarius:'fire',Taurus:'earth',Virgo:'earth',Capricorn:'earth',Gemini:'air',Libra:'air',Aquarius:'air',Cancer:'water',Scorpio:'water',Pisces:'water'};
let elemAgree = 0;
for (let y of [1975,1985,1995,2005]) for (let m=0;m<12;m++) for (let d=1;d<=28;d++){
  const dt = new Date(Date.UTC(y,m,d,12));
  if (EL[zodiacSign(dt).name] === EL[vedic(dt)]) elemAgree++;
}
console.log(`ELEMENT (the only thing AFFINITY reads) agrees on ${(100*elemAgree/tot).toFixed(1)}% of dates`);
