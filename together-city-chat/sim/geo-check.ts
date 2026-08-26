import { cityCoords, countryKey } from '../src/shared/geo';
const T: [string, string, string, string][] = [
  ['Fargo','North Dakota','United States','46.88,-96.79'],
  ['Salem','Oregon','United States','44.94,-123.04'],
  ['Jerusalem','Jerusalem','Israel','31.77,35.21'],
  ['London','Ontario','Canada','42.98,-81.25'],
  ['London','England','United Kingdom','51.51,-0.13'],
  ['London','England','','51.51,-0.13'],
  ['Kochi','Kochi','Japan','33.56,133.53'],
  ['Kochi','Kerala','India','9.93,76.27'],
  ['Hyderabad','Sindh','Pakistan','25.4,68.37'],
  ['Hyderabad','Telangana','India','17.38,78.49'],
  ['Sao Paulo','Sao Paulo','Brazil','-23.55,-46.63'],
  ['Lagos','Lagos','Nigeria','6.52,3.38'],
  ['Berlin','Berlin','Germany','52.52,13.4'],
  ['Seoul','Seoul','South Korea','37.57,126.98'],
  ['Nairobi','Nairobi','Kenya','-1.29,36.82'],
  ['Mexico City','CDMX','Mexico','19.43,-99.13'],
  ['Manila','Metro Manila','Philippines','14.6,120.98'],
  ['Riyadh','Riyadh','Saudi Arabia','24.71,46.68'],
  ['Melbourne','Victoria','Australia','-37.81,144.96'],
  ['Bagalkot','Karnataka','India','null'],
  ['Patna','Bihar','India','25.59,85.14'],
  ['Patna','BR','','25.59,85.14'],
  ['Chandigarh','CH','','30.73,76.78'],
  ['Bengaluru','Karnataka','India','12.97,77.59'],
  ['Bangalore','Karnataka','','12.97,77.59'],
  ['Gurgaon','Haryana','India','28.46,77.03'],
  ['Dubai','Dubai','United Arab Emirates','25.2,55.27'],
  ['Springfield','Illinois','United States','39.78,-89.65'],
];
let bad = 0;
for (const [c, st, co, want] of T) {
  const r = cityCoords(c, st, co);
  const got = r ? `${r.lat},${r.lng}` : 'null';
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${(c + ', ' + st + ', ' + co).padEnd(46)} → ${got.padEnd(16)} ${ok ? '' : 'want ' + want}`);
}
console.log(`\n${bad === 0 ? 'ALL PASS' : bad + ' FAILURES'}   countryKey('CH' as state) = ${countryKey(null,'CH')}  countryKey('BR' as state) = ${countryKey(null,'BR')}`);
