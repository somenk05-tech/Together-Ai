/**
 * Which time zone a birth happened in — derived, or chosen, never guessed.
 *
 * THE DEFECT THIS FILE EXISTS FOR. The birth form carried a hand-written
 * country → zone map: US → America/New_York, CA → America/Toronto,
 * AU → Australia/Sydney, BR → America/Sao_Paulo. Picking "United States" and
 * typing "Los Angeles" therefore computed the whole chart three hours off, in
 * silence, with the field showing "(auto)" beside it. For a birth chart the
 * zone is not a display preference — it is what turns a birth time into a
 * position of the sky, and three hours moves the ascendant by roughly a sign
 * and a half.
 *
 * A wrong ascendant is not a cosmetic error here. It re-points the "Life
 * stone" and the "Fortune stone" the gem marketplace prescribes, which people
 * pay real money for.
 *
 * WHAT REPLACES IT, in the order the answer is looked for:
 *
 *   1. THE COUNTRY, when the country has exactly one zone. 216 of the 247
 *      countries in the tz database do — India among them, which is almost
 *      every citizen of this city. No prompt, no friction, and right by
 *      construction rather than by somebody remembering to add a row.
 *   2. THE BIRTH CITY, when the country has several. Every zone is named after
 *      a city, and CITY_HINTS adds the large cities that are not zone names
 *      (San Francisco, Seattle, Rio de Janeiro, Saint Petersburg…).
 *   3. THE CITIZEN, when neither of those answers. The field becomes a real
 *      question with no default, and saving is blocked until it is answered —
 *      because the alternative, which is what shipped, is a confident wrong
 *      chart.
 *
 * A HINT MAY ONLY PRESELECT. Nothing here is allowed to be the final answer
 * without the citizen seeing it: a miss costs somebody one choice from a list,
 * and a wrong hit that nobody could see would cost them their chart.
 *
 * The table is the IANA zone.tab, which is where the world keeps this. It is
 * generated, so do not hand-edit rows — regenerate it when tzdata moves.
 */

/**
 * country code → its IANA zones, packed to keep 418 zones readable in a diff.
 *
 * IN THE TZ DATABASE'S OWN ORDER, not alphabetical: it lists the principal zone
 * of a country first (US starts at New_York, not at Adak in the Aleutians), and
 * that ordering is a judgement by people who maintain this for a living. It is
 * the order the picker shows.
 */
const PACKED =
  'AD:Europe/Andorra;AE:Asia/Dubai;AF:Asia/Kabul;AG:America/Antigua;AI:America/Anguilla'
  + ';AL:Europe/Tirane;AM:Asia/Yerevan;AO:Africa/Luanda'
  + ';AQ:Antarctica/McMurdo,Antarctica/Casey,Antarctica/Davis,Antarctica/DumontDUrville,Antarctica/Mawson,Antarctica/Palmer,Antarctica/Rothera,Antarctica/Syowa,Antarctica/Troll,Antarctica/Vostok'
  + ';AR:America/Argentina/Buenos_Aires,America/Argentina/Cordoba,America/Argentina/Salta,America/Argentina/Jujuy,America/Argentina/Tucuman,America/Argentina/Catamarca,America/Argentina/La_Rioja,America/Argentina/San_Juan,America/Argentina/Mendoza,America/Argentina/San_Luis,America/Argentina/Rio_Gallegos,America/Argentina/Ushuaia'
  + ';AS:Pacific/Pago_Pago;AT:Europe/Vienna'
  + ';AU:Australia/Lord_Howe,Antarctica/Macquarie,Australia/Hobart,Australia/Melbourne,Australia/Sydney,Australia/Broken_Hill,Australia/Brisbane,Australia/Lindeman,Australia/Adelaide,Australia/Darwin,Australia/Perth,Australia/Eucla'
  + ';AW:America/Aruba;AX:Europe/Mariehamn;AZ:Asia/Baku;BA:Europe/Sarajevo;BB:America/Barbados'
  + ';BD:Asia/Dhaka;BE:Europe/Brussels;BF:Africa/Ouagadougou;BG:Europe/Sofia;BH:Asia/Bahrain'
  + ';BI:Africa/Bujumbura;BJ:Africa/Porto-Novo;BL:America/St_Barthelemy;BM:Atlantic/Bermuda'
  + ';BN:Asia/Brunei;BO:America/La_Paz;BQ:America/Kralendijk'
  + ';BR:America/Noronha,America/Belem,America/Fortaleza,America/Recife,America/Araguaina,America/Maceio,America/Bahia,America/Sao_Paulo,America/Campo_Grande,America/Cuiaba,America/Santarem,America/Porto_Velho,America/Boa_Vista,America/Manaus,America/Eirunepe,America/Rio_Branco'
  + ';BS:America/Nassau;BT:Asia/Thimphu;BW:Africa/Gaborone;BY:Europe/Minsk;BZ:America/Belize'
  + ';CA:America/St_Johns,America/Halifax,America/Glace_Bay,America/Moncton,America/Goose_Bay,America/Blanc-Sablon,America/Toronto,America/Iqaluit,America/Atikokan,America/Winnipeg,America/Resolute,America/Rankin_Inlet,America/Regina,America/Swift_Current,America/Edmonton,America/Cambridge_Bay,America/Inuvik,America/Creston,America/Dawson_Creek,America/Fort_Nelson,America/Whitehorse,America/Dawson,America/Vancouver'
  + ';CC:Indian/Cocos;CD:Africa/Kinshasa,Africa/Lubumbashi;CF:Africa/Bangui;CG:Africa/Brazzaville'
  + ';CH:Europe/Zurich;CI:Africa/Abidjan;CK:Pacific/Rarotonga'
  + ';CL:America/Santiago,America/Coyhaique,America/Punta_Arenas,Pacific/Easter;CM:Africa/Douala'
  + ';CN:Asia/Shanghai,Asia/Urumqi;CO:America/Bogota;CR:America/Costa_Rica;CU:America/Havana'
  + ';CV:Atlantic/Cape_Verde;CW:America/Curacao;CX:Indian/Christmas;CY:Asia/Nicosia,Asia/Famagusta'
  + ';CZ:Europe/Prague;DE:Europe/Berlin,Europe/Busingen;DJ:Africa/Djibouti;DK:Europe/Copenhagen'
  + ';DM:America/Dominica;DO:America/Santo_Domingo;DZ:Africa/Algiers'
  + ';EC:America/Guayaquil,Pacific/Galapagos;EE:Europe/Tallinn;EG:Africa/Cairo;EH:Africa/El_Aaiun'
  + ';ER:Africa/Asmara;ES:Europe/Madrid,Africa/Ceuta,Atlantic/Canary;ET:Africa/Addis_Ababa'
  + ';FI:Europe/Helsinki;FJ:Pacific/Fiji;FK:Atlantic/Stanley'
  + ';FM:Pacific/Chuuk,Pacific/Pohnpei,Pacific/Kosrae;FO:Atlantic/Faroe;FR:Europe/Paris'
  + ';GA:Africa/Libreville;GB:Europe/London;GD:America/Grenada;GE:Asia/Tbilisi;GF:America/Cayenne'
  + ';GG:Europe/Guernsey;GH:Africa/Accra;GI:Europe/Gibraltar'
  + ';GL:America/Nuuk,America/Danmarkshavn,America/Scoresbysund,America/Thule;GM:Africa/Banjul'
  + ';GN:Africa/Conakry;GP:America/Guadeloupe;GQ:Africa/Malabo;GR:Europe/Athens'
  + ';GS:Atlantic/South_Georgia;GT:America/Guatemala;GU:Pacific/Guam;GW:Africa/Bissau'
  + ';GY:America/Guyana;HK:Asia/Hong_Kong;HN:America/Tegucigalpa;HR:Europe/Zagreb'
  + ';HT:America/Port-au-Prince;HU:Europe/Budapest'
  + ';ID:Asia/Jakarta,Asia/Pontianak,Asia/Makassar,Asia/Jayapura;IE:Europe/Dublin;IL:Asia/Jerusalem'
  + ';IM:Europe/Isle_of_Man;IN:Asia/Kolkata;IO:Indian/Chagos;IQ:Asia/Baghdad;IR:Asia/Tehran'
  + ';IS:Atlantic/Reykjavik;IT:Europe/Rome;JE:Europe/Jersey;JM:America/Jamaica;JO:Asia/Amman'
  + ';JP:Asia/Tokyo;KE:Africa/Nairobi;KG:Asia/Bishkek;KH:Asia/Phnom_Penh'
  + ';KI:Pacific/Tarawa,Pacific/Kanton,Pacific/Kiritimati;KM:Indian/Comoro;KN:America/St_Kitts'
  + ';KP:Asia/Pyongyang;KR:Asia/Seoul;KW:Asia/Kuwait;KY:America/Cayman'
  + ';KZ:Asia/Almaty,Asia/Qyzylorda,Asia/Qostanay,Asia/Aqtobe,Asia/Aqtau,Asia/Atyrau,Asia/Oral'
  + ';LA:Asia/Vientiane;LB:Asia/Beirut;LC:America/St_Lucia;LI:Europe/Vaduz;LK:Asia/Colombo'
  + ';LR:Africa/Monrovia;LS:Africa/Maseru;LT:Europe/Vilnius;LU:Europe/Luxembourg;LV:Europe/Riga'
  + ';LY:Africa/Tripoli;MA:Africa/Casablanca;MC:Europe/Monaco;MD:Europe/Chisinau;ME:Europe/Podgorica'
  + ';MF:America/Marigot;MG:Indian/Antananarivo;MH:Pacific/Majuro,Pacific/Kwajalein;MK:Europe/Skopje'
  + ';ML:Africa/Bamako;MM:Asia/Yangon;MN:Asia/Ulaanbaatar,Asia/Hovd;MO:Asia/Macau;MP:Pacific/Saipan'
  + ';MQ:America/Martinique;MR:Africa/Nouakchott;MS:America/Montserrat;MT:Europe/Malta'
  + ';MU:Indian/Mauritius;MV:Indian/Maldives;MW:Africa/Blantyre'
  + ';MX:America/Mexico_City,America/Cancun,America/Merida,America/Monterrey,America/Matamoros,America/Chihuahua,America/Ciudad_Juarez,America/Ojinaga,America/Mazatlan,America/Bahia_Banderas,America/Hermosillo,America/Tijuana'
  + ';MY:Asia/Kuala_Lumpur,Asia/Kuching;MZ:Africa/Maputo;NA:Africa/Windhoek;NC:Pacific/Noumea'
  + ';NE:Africa/Niamey;NF:Pacific/Norfolk;NG:Africa/Lagos;NI:America/Managua;NL:Europe/Amsterdam'
  + ';NO:Europe/Oslo;NP:Asia/Kathmandu;NR:Pacific/Nauru;NU:Pacific/Niue'
  + ';NZ:Pacific/Auckland,Pacific/Chatham;OM:Asia/Muscat;PA:America/Panama;PE:America/Lima'
  + ';PF:Pacific/Tahiti,Pacific/Marquesas,Pacific/Gambier;PG:Pacific/Port_Moresby,Pacific/Bougainville'
  + ';PH:Asia/Manila;PK:Asia/Karachi;PL:Europe/Warsaw;PM:America/Miquelon;PN:Pacific/Pitcairn'
  + ';PR:America/Puerto_Rico;PS:Asia/Gaza,Asia/Hebron'
  + ';PT:Europe/Lisbon,Atlantic/Madeira,Atlantic/Azores;PW:Pacific/Palau;PY:America/Asuncion'
  + ';QA:Asia/Qatar;RE:Indian/Reunion;RO:Europe/Bucharest;RS:Europe/Belgrade'
  + ';RU:Europe/Kaliningrad,Europe/Moscow,Europe/Kirov,Europe/Volgograd,Europe/Astrakhan,Europe/Saratov,Europe/Ulyanovsk,Europe/Samara,Asia/Yekaterinburg,Asia/Omsk,Asia/Novosibirsk,Asia/Barnaul,Asia/Tomsk,Asia/Novokuznetsk,Asia/Krasnoyarsk,Asia/Irkutsk,Asia/Chita,Asia/Yakutsk,Asia/Khandyga,Asia/Vladivostok,Asia/Ust-Nera,Asia/Magadan,Asia/Sakhalin,Asia/Srednekolymsk,Asia/Kamchatka,Asia/Anadyr'
  + ';RW:Africa/Kigali;SA:Asia/Riyadh;SB:Pacific/Guadalcanal;SC:Indian/Mahe;SD:Africa/Khartoum'
  + ';SE:Europe/Stockholm;SG:Asia/Singapore;SH:Atlantic/St_Helena;SI:Europe/Ljubljana'
  + ';SJ:Arctic/Longyearbyen;SK:Europe/Bratislava;SL:Africa/Freetown;SM:Europe/San_Marino'
  + ';SN:Africa/Dakar;SO:Africa/Mogadishu;SR:America/Paramaribo;SS:Africa/Juba;ST:Africa/Sao_Tome'
  + ';SV:America/El_Salvador;SX:America/Lower_Princes;SY:Asia/Damascus;SZ:Africa/Mbabane'
  + ';TC:America/Grand_Turk;TD:Africa/Ndjamena;TF:Indian/Kerguelen;TG:Africa/Lome;TH:Asia/Bangkok'
  + ';TJ:Asia/Dushanbe;TK:Pacific/Fakaofo;TL:Asia/Dili;TM:Asia/Ashgabat;TN:Africa/Tunis'
  + ';TO:Pacific/Tongatapu;TR:Europe/Istanbul;TT:America/Port_of_Spain;TV:Pacific/Funafuti'
  + ';TW:Asia/Taipei;TZ:Africa/Dar_es_Salaam;UA:Europe/Simferopol,Europe/Kyiv;UG:Africa/Kampala'
  + ';UM:Pacific/Midway,Pacific/Wake'
  + ';US:America/New_York,America/Detroit,America/Kentucky/Louisville,America/Kentucky/Monticello,America/Indiana/Indianapolis,America/Indiana/Vincennes,America/Indiana/Winamac,America/Indiana/Marengo,America/Indiana/Petersburg,America/Indiana/Vevay,America/Chicago,America/Indiana/Tell_City,America/Indiana/Knox,America/Menominee,America/North_Dakota/Center,America/North_Dakota/New_Salem,America/North_Dakota/Beulah,America/Denver,America/Boise,America/Phoenix,America/Los_Angeles,America/Anchorage,America/Juneau,America/Sitka,America/Metlakatla,America/Yakutat,America/Nome,America/Adak,Pacific/Honolulu'
  + ';UY:America/Montevideo;UZ:Asia/Samarkand,Asia/Tashkent;VA:Europe/Vatican;VC:America/St_Vincent'
  + ';VE:America/Caracas;VG:America/Tortola;VI:America/St_Thomas;VN:Asia/Ho_Chi_Minh;VU:Pacific/Efate'
  + ';WF:Pacific/Wallis;WS:Pacific/Apia;YE:Asia/Aden;YT:Indian/Mayotte;ZA:Africa/Johannesburg'
  + ';ZM:Africa/Lusaka;ZW:Africa/Harare';

/** Parsed once. 247 countries, so the cost is one pass at module load. */
const BY_COUNTRY: ReadonlyMap<string, readonly string[]> = new Map(
  PACKED.split(';').map((row) => {
    const [cc, list] = row.split(':');
    return [cc, list.split(',')] as [string, string[]];
  }),
);

/**
 * Cities that are not zone names, for the countries where the question is real.
 *
 * NOT A GAZETTEER, and it must not grow into one: it is a shortcut past a
 * question the citizen can always answer themselves. Keys must be written
 * already folded (see `fold()` below) — lowercase, unaccented, single-spaced.
 *
 * Exported for birth-zone.spec, which checks every row points at a zone the
 * country actually has. A hint that does not is not a wrong chart — the lookup
 * below refuses to return it — but it is a shortcut that silently stopped
 * working, and those are worth failing a build over.
 */
export const CITY_HINTS: Record<string, Record<string, string>> = {
  US: {
    'san francisco': 'America/Los_Angeles', 'san jose': 'America/Los_Angeles',
    'san diego': 'America/Los_Angeles', 'seattle': 'America/Los_Angeles',
    'portland': 'America/Los_Angeles', 'sacramento': 'America/Los_Angeles',
    'las vegas': 'America/Los_Angeles', 'oakland': 'America/Los_Angeles',
    'fresno': 'America/Los_Angeles', 'long beach': 'America/Los_Angeles',
    'austin': 'America/Chicago', 'dallas': 'America/Chicago', 'houston': 'America/Chicago',
    'san antonio': 'America/Chicago', 'fort worth': 'America/Chicago', 'el paso': 'America/Denver',
    'minneapolis': 'America/Chicago', 'saint paul': 'America/Chicago', 'st paul': 'America/Chicago',
    'kansas city': 'America/Chicago', 'saint louis': 'America/Chicago', 'st louis': 'America/Chicago',
    'milwaukee': 'America/Chicago', 'new orleans': 'America/Chicago', 'memphis': 'America/Chicago',
    'nashville': 'America/Chicago', 'oklahoma city': 'America/Chicago', 'tulsa': 'America/Chicago',
    'omaha': 'America/Chicago', 'madison': 'America/Chicago', 'des moines': 'America/Chicago',
    'boston': 'America/New_York', 'philadelphia': 'America/New_York', 'washington': 'America/New_York',
    'atlanta': 'America/New_York', 'miami': 'America/New_York', 'orlando': 'America/New_York',
    'tampa': 'America/New_York', 'charlotte': 'America/New_York', 'raleigh': 'America/New_York',
    'pittsburgh': 'America/New_York', 'cleveland': 'America/New_York', 'columbus': 'America/New_York',
    'cincinnati': 'America/New_York', 'baltimore': 'America/New_York', 'buffalo': 'America/New_York',
    'jacksonville': 'America/New_York', 'newark': 'America/New_York', 'brooklyn': 'America/New_York',
    'queens': 'America/New_York', 'manhattan': 'America/New_York', 'bronx': 'America/New_York',
    'jersey city': 'America/New_York', 'richmond': 'America/New_York', 'hartford': 'America/New_York',
    'providence': 'America/New_York', 'albany': 'America/New_York', 'syracuse': 'America/New_York',
    'salt lake city': 'America/Denver', 'albuquerque': 'America/Denver',
    'colorado springs': 'America/Denver', 'tucson': 'America/Phoenix', 'mesa': 'America/Phoenix',
    'scottsdale': 'America/Phoenix', 'chandler': 'America/Phoenix',
  },
  CA: {
    'montreal': 'America/Toronto', 'ottawa': 'America/Toronto', 'quebec': 'America/Toronto',
    'quebec city': 'America/Toronto', 'hamilton': 'America/Toronto', 'mississauga': 'America/Toronto',
    'brampton': 'America/Toronto', 'london': 'America/Toronto', 'kitchener': 'America/Toronto',
    'windsor': 'America/Toronto', 'markham': 'America/Toronto', 'laval': 'America/Toronto',
    'calgary': 'America/Edmonton', 'red deer': 'America/Edmonton', 'lethbridge': 'America/Edmonton',
    'victoria': 'America/Vancouver', 'surrey': 'America/Vancouver', 'burnaby': 'America/Vancouver',
    'richmond': 'America/Vancouver', 'kelowna': 'America/Vancouver',
    'saskatoon': 'America/Regina', 'saint john': 'America/Halifax', 'st johns': 'America/St_Johns',
  },
  AU: {
    'canberra': 'Australia/Sydney', 'newcastle': 'Australia/Sydney',
    'wollongong': 'Australia/Sydney', 'parramatta': 'Australia/Sydney',
    'gold coast': 'Australia/Brisbane', 'cairns': 'Australia/Brisbane',
    'townsville': 'Australia/Brisbane', 'toowoomba': 'Australia/Brisbane',
    'geelong': 'Australia/Melbourne', 'ballarat': 'Australia/Melbourne',
    'fremantle': 'Australia/Perth', 'launceston': 'Australia/Hobart',
  },
  BR: {
    'rio de janeiro': 'America/Sao_Paulo', 'belo horizonte': 'America/Sao_Paulo',
    'brasilia': 'America/Sao_Paulo', 'curitiba': 'America/Sao_Paulo',
    'porto alegre': 'America/Sao_Paulo', 'campinas': 'America/Sao_Paulo',
    'florianopolis': 'America/Sao_Paulo', 'goiania': 'America/Sao_Paulo',
    'salvador': 'America/Bahia', 'natal': 'America/Fortaleza', 'joao pessoa': 'America/Fortaleza',
    'teresina': 'America/Fortaleza', 'sao luis': 'America/Fortaleza',
  },
  MX: {
    'guadalajara': 'America/Mexico_City', 'puebla': 'America/Mexico_City',
    'toluca': 'America/Mexico_City', 'leon': 'America/Mexico_City',
    'queretaro': 'America/Mexico_City', 'acapulco': 'America/Mexico_City',
    'veracruz': 'America/Mexico_City', 'culiacan': 'America/Mazatlan',
    'playa del carmen': 'America/Cancun', 'cozumel': 'America/Cancun',
  },
  RU: {
    'saint petersburg': 'Europe/Moscow', 'st petersburg': 'Europe/Moscow',
    'kazan': 'Europe/Moscow', 'nizhny novgorod': 'Europe/Moscow', 'rostov': 'Europe/Moscow',
    'sochi': 'Europe/Moscow', 'ufa': 'Asia/Yekaterinburg', 'chelyabinsk': 'Asia/Yekaterinburg',
    'perm': 'Asia/Yekaterinburg', 'tyumen': 'Asia/Yekaterinburg',
  },
  ID: {
    'surabaya': 'Asia/Jakarta', 'bandung': 'Asia/Jakarta', 'medan': 'Asia/Jakarta',
    'semarang': 'Asia/Jakarta', 'palembang': 'Asia/Jakarta', 'tangerang': 'Asia/Jakarta',
    'depok': 'Asia/Jakarta', 'bekasi': 'Asia/Jakarta',
    'denpasar': 'Asia/Makassar', 'bali': 'Asia/Makassar', 'balikpapan': 'Asia/Makassar',
  },
  CN: {
    'beijing': 'Asia/Shanghai', 'guangzhou': 'Asia/Shanghai', 'shenzhen': 'Asia/Shanghai',
    'chengdu': 'Asia/Shanghai', 'wuhan': 'Asia/Shanghai', 'xian': 'Asia/Shanghai',
    'hangzhou': 'Asia/Shanghai', 'nanjing': 'Asia/Shanghai', 'tianjin': 'Asia/Shanghai',
    'kashgar': 'Asia/Urumqi',
  },
  ES: {
    'barcelona': 'Europe/Madrid', 'valencia': 'Europe/Madrid', 'seville': 'Europe/Madrid',
    'sevilla': 'Europe/Madrid', 'bilbao': 'Europe/Madrid', 'malaga': 'Europe/Madrid',
    'zaragoza': 'Europe/Madrid', 'granada': 'Europe/Madrid', 'palma': 'Europe/Madrid',
    'las palmas': 'Atlantic/Canary', 'tenerife': 'Atlantic/Canary',
    'santa cruz de tenerife': 'Atlantic/Canary',
  },
  PT: {
    'lisbon': 'Europe/Lisbon', 'lisboa': 'Europe/Lisbon', 'porto': 'Europe/Lisbon',
    'braga': 'Europe/Lisbon', 'coimbra': 'Europe/Lisbon', 'faro': 'Europe/Lisbon',
    'funchal': 'Atlantic/Madeira', 'ponta delgada': 'Atlantic/Azores',
  },
  NZ: {
    'wellington': 'Pacific/Auckland', 'christchurch': 'Pacific/Auckland',
    'hamilton': 'Pacific/Auckland', 'dunedin': 'Pacific/Auckland', 'tauranga': 'Pacific/Auckland',
  },
  MY: {
    'penang': 'Asia/Kuala_Lumpur', 'george town': 'Asia/Kuala_Lumpur',
    'johor bahru': 'Asia/Kuala_Lumpur', 'ipoh': 'Asia/Kuala_Lumpur',
    'shah alam': 'Asia/Kuala_Lumpur', 'malacca': 'Asia/Kuala_Lumpur',
    'kota kinabalu': 'Asia/Kuching', 'sandakan': 'Asia/Kuching', 'miri': 'Asia/Kuching',
  },
  KZ: {
    'astana': 'Asia/Almaty', 'nur sultan': 'Asia/Almaty', 'shymkent': 'Asia/Almaty',
    'karaganda': 'Asia/Almaty', 'aktobe': 'Asia/Aqtobe',
  },
  DE: {
    'munich': 'Europe/Berlin', 'muenchen': 'Europe/Berlin', 'hamburg': 'Europe/Berlin',
    'frankfurt': 'Europe/Berlin', 'cologne': 'Europe/Berlin', 'koln': 'Europe/Berlin',
    'stuttgart': 'Europe/Berlin', 'dusseldorf': 'Europe/Berlin', 'dortmund': 'Europe/Berlin',
    'essen': 'Europe/Berlin', 'leipzig': 'Europe/Berlin', 'dresden': 'Europe/Berlin',
    'hanover': 'Europe/Berlin', 'hannover': 'Europe/Berlin', 'nuremberg': 'Europe/Berlin',
    'bremen': 'Europe/Berlin', 'bonn': 'Europe/Berlin', 'mannheim': 'Europe/Berlin',
  },
  CL: { 'santiago': 'America/Santiago', 'valparaiso': 'America/Santiago', 'concepcion': 'America/Santiago' },
  EC: { 'quito': 'America/Guayaquil', 'cuenca': 'America/Guayaquil' },
  PF: { 'papeete': 'Pacific/Tahiti', 'bora bora': 'Pacific/Tahiti' },
};

/** Accents, punctuation and spacing folded away, so 'São  Paulo!' matches 'sao paulo'. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The city a zone is named after, as a person would write it. */
export function zoneCity(tz: string): string {
  const tail = tz.split('/').pop() ?? tz;
  return tail.replace(/_/g, ' ');
}

/** Every zone the tz database gives this country, in the order it lists them. */
export function zonesForCountry(code: string): readonly string[] {
  return BY_COUNTRY.get((code || '').toUpperCase()) ?? [];
}

/**
 * The zone a birth place implies, or null when the citizen has to say.
 *
 * Null is a real answer here and the point of the whole file: it is what turns
 * the field into a question instead of a default.
 */
export function zoneForBirthPlace(countryCode: string, city: string): string | null {
  const zones = zonesForCountry(countryCode);
  if (zones.length === 1) return zones[0];
  if (!zones.length || !city.trim()) return null;
  const want = fold(city);
  if (!want) return null;
  const hinted = CITY_HINTS[(countryCode || '').toUpperCase()]?.[want];
  if (hinted && zones.includes(hinted)) return hinted;
  return zones.find((z) => fold(zoneCity(z)) === want) ?? null;
}

/**
 * Does this runtime know the zone?
 *
 * NOT a membership test against `Intl.supportedValuesOf('timeZone')`, which
 * lists only canonical names: profiles already saved in this city carry
 * 'Asia/Calcutta', a perfectly valid alias that such a check would reject,
 * locking those citizens out of their own form. Asking the engine to format a
 * date in the zone accepts aliases and rejects nonsense, which is the actual
 * question.
 */
export function isKnownZone(tz: string): boolean {
  if (!tz || !tz.includes('/')) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every zone worth offering, for the manual-entry list.
 *
 * `Intl.supportedValuesOf` when the engine has it (it is newer than our table
 * and therefore truer); the table when it does not.
 */
export function allKnownZones(): readonly string[] {
  const table = [...BY_COUNTRY.values()].flat();
  const sv = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  let engine: string[] = [];
  if (typeof sv === 'function') {
    try { engine = sv.call(Intl, 'timeZone'); } catch { /* the table alone will do */ }
  }
  // BOTH, because the two disagree about spelling and each is right. The engine
  // lists canonical names, and WHICH name is canonical is an ICU decision that
  // moves: the runtime this was written on calls India 'Asia/Calcutta' and
  // Ukraine 'Europe/Kiev'. The table says Asia/Kolkata, which is what the
  // country picker offers, so somebody typing by hand has to find it here too.
  return [...new Set([...engine, ...table])].sort();
}
