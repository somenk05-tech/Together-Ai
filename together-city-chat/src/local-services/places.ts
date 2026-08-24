/**
 * WHERE THE CITY'S BUSINESSES ARE — India, state by state, served as one tree
 * the way categories.ts serves the trades (owner, 24 Aug; and later the same
 * day: "lock india… add all states, and add a detailed drop down menu for all
 * areas").
 *
 * LOCKED TO INDIA, at the owner's word. The tree keeps its country root so
 * unlocking later is data, not surgery — but the form renders the one country
 * fixed, and every state and union territory is here so nobody's state is the
 * missing one. Cities still carry a typed escape hatch on the form: a town
 * this file has never heard of must stay listable the minute its owner
 * arrives, and the listing stores what it always stored — `city` and the csv
 * of `areas`.
 *
 * CURATED, NOT SCRAPED. Every locality is a name a person would say, and the
 * list grows by owners asking — one entry, one deploy, like a new trade.
 * `aliases` is how the reverse-geocoder's districts land on the city they
 * mean ("Mumbai Suburban District" → Mumbai, "Bangalore" → Bengaluru).
 */

export interface PlaceCity {
  name: string;
  /** Other names the same city answers to — including what reverse geocoding
   *  calls it. Matching is case-insensitive on name and aliases alike. */
  aliases?: string[];
  areas: string[];
}
export interface PlaceState { name: string; cities: PlaceCity[] }
export interface PlaceCountry { name: string; states: PlaceState[] }

const c = (name: string, areas: string[], aliases?: string[]): PlaceCity =>
  aliases ? { name, aliases, areas } : { name, areas };

export const PLACES: PlaceCountry[] = [
  {
    name: 'India',
    states: [
      {
        name: 'Andhra Pradesh',
        cities: [
          c('Visakhapatnam', ['Dwaraka Nagar', 'MVP Colony', 'Gajuwaka', 'Madhurawada', 'Seethammadhara', 'Rushikonda', 'Anakapalle'], ['Vizag']),
          c('Vijayawada', ['Benz Circle', 'Governorpet', 'Labbipet', 'Patamata', 'Auto Nagar', 'Gollapudi']),
          c('Tirupati', ['Tirumala Bypass', 'Air Bypass Road', 'Renigunta Road', 'Kapila Theertham', 'Alipiri', 'Chandragiri']),
        ],
      },
      {
        name: 'Arunachal Pradesh',
        cities: [c('Itanagar', ['Ganga Market', 'Naharlagun', 'Bank Tinali', 'Chandra Nagar', 'Nirjuli', 'Doimukh'])],
      },
      {
        name: 'Assam',
        cities: [
          c('Guwahati', ['Paltan Bazaar', 'Fancy Bazaar', 'Zoo Road', 'GS Road', 'Beltola', 'Dispur', 'Chandmari', 'Maligaon', 'Six Mile']),
          c('Dibrugarh', ['Thana Chariali', 'New Market', 'Amolapatty', 'Milan Nagar', 'Chowkidinghee', 'Graham Bazaar']),
        ],
      },
      {
        name: 'Bihar',
        cities: [
          c('Patna', ['Boring Road', 'Kankarbagh', 'Patliputra Colony', 'Fraser Road', 'Rajendra Nagar', 'Danapur', 'Bailey Road', 'Gandhi Maidan']),
          c('Gaya', ['Bodh Gaya', 'Station Road', 'AP Colony', 'Delha', 'Chandauti', 'Civil Lines']),
        ],
      },
      {
        name: 'Chhattisgarh',
        cities: [
          c('Raipur', ['Pandri', 'Shankar Nagar', 'Telibandha', 'Devendra Nagar', 'Mowa', 'Amanaka', 'Civil Lines']),
          c('Bhilai', ['Sector 1', 'Sector 6', 'Supela', 'Nehru Nagar', 'Smriti Nagar', 'Power House']),
        ],
      },
      {
        name: 'Goa',
        cities: [
          c('Panaji', ['Miramar', 'Dona Paula', 'Altinho', 'Caranzalem', 'Taleigao', 'Porvorim', 'Ribandar'], ['Panjim']),
          c('Margao', ['Fatorda', 'Comba', 'Aquem', 'Navelim', 'Borda', 'Colva Road'], ['Madgaon']),
          c('Mapusa', ['Anjuna', 'Calangute', 'Candolim', 'Baga', 'Siolim', 'Assagao', 'Vagator']),
        ],
      },
      {
        name: 'Gujarat',
        cities: [
          c('Ahmedabad', ['Navrangpura', 'CG Road', 'Satellite', 'Vastrapur', 'Bodakdev', 'Prahlad Nagar', 'Maninagar', 'Paldi', 'Thaltej', 'SG Highway', 'Bopal', 'Chandkheda', 'Naranpura']),
          c('Surat', ['Adajan', 'Vesu', 'Piplod', 'Athwa', 'Ghod Dod Road', 'Varachha', 'Katargam', 'Ring Road', 'Pal', 'City Light']),
          c('Vadodara', ['Alkapuri', 'Fatehgunj', 'Akota', 'Gotri', 'Manjalpur', 'Karelibaug', 'Sayajigunj', 'Waghodia Road'], ['Baroda']),
          c('Rajkot', ['Kalawad Road', 'University Road', 'Yagnik Road', 'Mavdi', 'Raiya Road', 'Gondal Road', 'Race Course']),
        ],
      },
      {
        name: 'Haryana',
        cities: [
          c('Gurugram', ['DLF Cyber City', 'Golf Course Road', 'MG Road', 'Sohna Road', 'Sector 29', 'Sector 14', 'Sector 56', 'Udyog Vihar', 'Sushant Lok', 'Palam Vihar', 'New Gurugram', 'Golf Course Extension'], ['Gurgaon']),
          c('Faridabad', ['Sector 15', 'Sector 21', 'NIT', 'Old Faridabad', 'Greenfield Colony', 'Ballabhgarh', 'Surajkund']),
          c('Panchkula', ['Sector 5', 'Sector 8', 'Sector 20', 'MDC', 'Pinjore', 'Kalka']),
        ],
      },
      {
        name: 'Himachal Pradesh',
        cities: [
          c('Shimla', ['Mall Road', 'Lakkar Bazaar', 'Sanjauli', 'Chotta Shimla', 'New Shimla', 'Summer Hill', 'Tutikandi']),
          c('Dharamshala', ['McLeod Ganj', 'Kotwali Bazaar', 'Civil Lines', 'Sidhpur', 'Bhagsu', 'Dharamkot']),
        ],
      },
      {
        name: 'Jammu & Kashmir',
        cities: [
          c('Srinagar', ['Lal Chowk', 'Dal Gate', 'Rajbagh', 'Jawahar Nagar', 'Hazratbal', 'Nishat', 'Bemina', 'Hyderpora']),
          c('Jammu', ['Gandhi Nagar', 'Trikuta Nagar', 'Bakshi Nagar', 'Channi Himmat', 'Talab Tillo', 'Satwari']),
        ],
      },
      {
        name: 'Jharkhand',
        cities: [
          c('Ranchi', ['Main Road', 'Lalpur', 'Kanke Road', 'Harmu', 'Doranda', 'Ashok Nagar', 'Morabadi', 'Hinoo']),
          c('Jamshedpur', ['Bistupur', 'Sakchi', 'Sonari', 'Kadma', 'Telco Colony', 'Mango', 'Golmuri'], ['Tatanagar']),
          c('Dhanbad', ['Bank More', 'Hirapur', 'Saraidhela', 'Jharia', 'Steel Gate', 'City Centre']),
        ],
      },
      {
        name: 'Karnataka',
        cities: [
          c('Bengaluru', ['MG Road', 'Indiranagar', 'Koramangala', 'HSR Layout', 'BTM Layout', 'Jayanagar', 'JP Nagar', 'Basavanagudi', 'Malleshwaram', 'Rajajinagar', 'Yelahanka', 'Hebbal', 'Whitefield', 'Marathahalli', 'Bellandur', 'Sarjapur Road', 'Electronic City', 'Banashankari', 'Frazer Town', 'Ulsoor'], ['Bangalore', 'Bengaluru Urban']),
          c('Mysuru', ['Sayyaji Rao Road', 'Gokulam', 'Vijayanagar', 'Kuvempunagar', 'Jayalakshmipuram', 'Hebbal Industrial Area', 'Nazarbad'], ['Mysore']),
          c('Mangaluru', ['Hampankatta', 'Kadri', 'Bejai', 'Lalbagh', 'Kankanady', 'Surathkal', 'Deralakatte'], ['Mangalore']),
          c('Hubballi', ['Vidyanagar', 'Gokul Road', 'Deshpande Nagar', 'Keshwapur', 'Old Hubballi', 'Unkal'], ['Hubli']),
        ],
      },
      {
        name: 'Kerala',
        cities: [
          c('Kochi', ['MG Road', 'Fort Kochi', 'Mattancherry', 'Kakkanad', 'Edappally', 'Palarivattom', 'Kaloor', 'Vyttila', 'Panampilly Nagar', 'Marine Drive', 'Tripunithura'], ['Cochin', 'Ernakulam']),
          c('Thiruvananthapuram', ['MG Road', 'Palayam', 'Kowdiar', 'Pattom', 'Vazhuthacaud', 'Sasthamangalam', 'Kazhakkoottam', 'Technopark'], ['Trivandrum']),
          c('Kozhikode', ['SM Street', 'Mavoor Road', 'Palayam', 'West Hill', 'Nadakkavu', 'Beach Road'], ['Calicut']),
          c('Thrissur', ['Round South', 'Round North', 'Punkunnam', 'Ayyanthole', 'Ollur', 'Kokkalai'], ['Trichur']),
        ],
      },
      {
        name: 'Madhya Pradesh',
        cities: [
          c('Indore', ['Vijay Nagar', 'Palasia', 'New Palasia', 'Rajwada', 'Sapna Sangeeta', 'Bhawarkua', 'Rau', 'MG Road', 'Sudama Nagar', 'Scheme 78']),
          c('Bhopal', ['MP Nagar', 'New Market', 'Arera Colony', 'Kolar Road', 'Hoshangabad Road', 'Bittan Market', 'Shahpura', 'Bairagarh']),
          c('Gwalior', ['Lashkar', 'City Centre', 'Morar', 'Thatipur', 'Hazira', 'Phool Bagh']),
          c('Jabalpur', ['Wright Town', 'Napier Town', 'Sadar', 'Vijay Nagar', 'Madan Mahal', 'Gorakhpur']),
        ],
      },
      {
        name: 'Maharashtra',
        cities: [
          c('Mumbai', [
            // South of the line the names stand alone; on the suburban line a
            // locality is two places — East and West of the tracks — and an
            // owner in Andheri West is NOT in Andheri East (owner, 24 Aug:
            // "add east and west in the area too").
            'Colaba', 'Fort', 'Marine Lines', 'Girgaon', 'Byculla', 'Parel', 'Lower Parel', 'Worli', 'Prabhadevi', 'Matunga', 'Sion', 'Mahim', 'Juhu', 'Versova', 'Powai', 'Chembur', 'Wadala',
            'Dadar East', 'Dadar West', 'Bandra East', 'Bandra West', 'Khar East', 'Khar West', 'Santacruz East', 'Santacruz West', 'Vile Parle East', 'Vile Parle West',
            'Andheri East', 'Andheri West', 'Jogeshwari East', 'Jogeshwari West', 'Goregaon East', 'Goregaon West', 'Malad East', 'Malad West', 'Kandivali East', 'Kandivali West',
            'Borivali East', 'Borivali West', 'Dahisar East', 'Dahisar West', 'Kurla East', 'Kurla West', 'Ghatkopar East', 'Ghatkopar West', 'Vikhroli East', 'Vikhroli West',
            'Bhandup East', 'Bhandup West', 'Mulund East', 'Mulund West',
          ], ['Bombay', 'Mumbai Suburban', 'Mumbai Suburban District', 'Greater Mumbai', 'Mumbai City']),
          c('Navi Mumbai', ['Vashi', 'Nerul', 'Belapur', 'Kharghar', 'Panvel', 'Airoli', 'Ghansoli', 'Kopar Khairane', 'Sanpada', 'Seawoods', 'Ulwe', 'Taloja']),
          c('Thane', ['Naupada', 'Ghodbunder Road', 'Majiwada', 'Vartak Nagar', 'Wagle Estate', 'Kalwa', 'Mumbra', 'Hiranandani Estate', 'Kolshet', 'Manpada']),
          c('Pune', ['Koregaon Park', 'Kalyani Nagar', 'Viman Nagar', 'Kharadi', 'Hadapsar', 'Camp', 'Shivajinagar', 'Deccan', 'Kothrud', 'Baner', 'Aundh', 'Wakad', 'Hinjawadi', 'Magarpatta', 'Katraj', 'Pimpri', 'Chinchwad', 'Bavdhan']),
          c('Nagpur', ['Sitabuldi', 'Dharampeth', 'Sadar', 'Ramdaspeth', 'Civil Lines', 'Wardha Road', 'Manish Nagar', 'Pratap Nagar']),
          c('Nashik', ['College Road', 'Gangapur Road', 'Canada Corner', 'Indira Nagar', 'Panchavati', 'Deolali', 'Satpur']),
          c('Chhatrapati Sambhajinagar', ['CIDCO', 'Osmanpura', 'Jalna Road', 'Garkheda', 'Beed Bypass', 'Waluj'], ['Aurangabad']),
        ],
      },
      {
        name: 'Manipur',
        cities: [c('Imphal', ['Thangal Bazar', 'Paona Bazar', 'Uripok', 'Sagolband', 'Khurai', 'Singjamei', 'Lamphelpat'])],
      },
      {
        name: 'Meghalaya',
        cities: [c('Shillong', ['Police Bazar', 'Laitumkhrah', 'Laban', 'Nongthymmai', 'Mawlai', 'Happy Valley', 'Rynjah'])],
      },
      {
        name: 'Mizoram',
        cities: [c('Aizawl', ['Dawrpui', 'Zarkawt', 'Chanmari', 'Khatla', 'Bawngkawn', 'Vaivakawn'])],
      },
      {
        name: 'Nagaland',
        cities: [
          c('Dimapur', ['City Tower', 'Circular Road', 'Duncan Basti', 'Signal Point', 'Chumukedima', 'Half Nagarjan']),
          c('Kohima', ['Main Town', 'PR Hill', 'New Ministers Hill', 'Midland', 'Lerie', 'Jotsoma']),
        ],
      },
      {
        name: 'Odisha',
        cities: [
          c('Bhubaneswar', ['Saheed Nagar', 'Nayapalli', 'Jaydev Vihar', 'Khandagiri', 'Patia', 'Chandrasekharpur', 'Old Town', 'Rasulgarh']),
          c('Cuttack', ['Buxi Bazaar', 'College Square', 'Badambadi', 'Link Road', 'Chauliaganj', 'Bidanasi']),
          c('Puri', ['Grand Road', 'Swargadwar', 'Chakratirtha Road', 'VIP Road', 'Talabania', 'Baliapanda']),
        ],
      },
      {
        name: 'Punjab',
        cities: [
          c('Ludhiana', ['Sarabha Nagar', 'Model Town', 'Ferozepur Road', 'Pakhowal Road', 'BRS Nagar', 'Civil Lines', 'Dugri']),
          c('Amritsar', ['Hall Bazaar', 'Lawrence Road', 'Ranjit Avenue', 'Green Avenue', 'Majitha Road', 'Chheharta']),
          c('Jalandhar', ['Model Town', 'Civil Lines', 'GT Road', 'Urban Estate', 'Rama Mandi', 'Nakodar Road']),
          c('Mohali', ['Phase 3B2', 'Phase 7', 'Sector 70', 'Sector 82', 'Aerocity', 'Kharar'], ['SAS Nagar', 'Sahibzada Ajit Singh Nagar']),
        ],
      },
      {
        name: 'Rajasthan',
        cities: [
          c('Jaipur', ['C Scheme', 'MI Road', 'Vaishali Nagar', 'Malviya Nagar', 'Mansarovar', 'Raja Park', 'Tonk Road', 'Jagatpura', 'Bani Park', 'Jhotwara', 'Sodala']),
          c('Udaipur', ['Fateh Sagar', 'Hiran Magri', 'Sukhadia Circle', 'City Palace Road', 'Bhuwana', 'Sector 14']),
          c('Jodhpur', ['Sardarpura', 'Ratanada', 'Shastri Nagar', 'Paota', 'Basni', 'Chopasni Road']),
          c('Kota', ['Talwandi', 'Vigyan Nagar', 'Dadabari', 'Mahaveer Nagar', 'Gumanpura', 'Jawahar Nagar']),
        ],
      },
      {
        name: 'Sikkim',
        cities: [c('Gangtok', ['MG Marg', 'Deorali', 'Tadong', 'Development Area', 'Tibet Road', 'Ranipool'])],
      },
      {
        name: 'Tamil Nadu',
        cities: [
          c('Chennai', ['T Nagar', 'Mylapore', 'Adyar', 'Besant Nagar', 'Velachery', 'Anna Nagar', 'Nungambakkam', 'Egmore', 'Alwarpet', 'Guindy', 'Porur', 'OMR', 'Tambaram', 'Chromepet', 'Kilpauk', 'Perambur'], ['Madras']),
          c('Coimbatore', ['RS Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony', 'Race Course', 'Singanallur', 'Saravanampatti'], ['Kovai']),
          c('Madurai', ['Anna Nagar', 'KK Nagar', 'Tallakulam', 'Villapuram', 'Mattuthavani', 'Simmakkal']),
          c('Tiruchirappalli', ['Thillai Nagar', 'Srirangam', 'Cantonment', 'KK Nagar', 'Woraiyur', 'Thiruverumbur'], ['Trichy']),
        ],
      },
      {
        name: 'Telangana',
        cities: [
          c('Hyderabad', ['Banjara Hills', 'Jubilee Hills', 'Madhapur', 'Gachibowli', 'Kondapur', 'HITEC City', 'Kukatpally', 'Begumpet', 'Secunderabad', 'Ameerpet', 'Himayatnagar', 'Charminar', 'Manikonda', 'Miyapur', 'Dilsukhnagar', 'LB Nagar', 'Uppal']),
          c('Warangal', ['Hanamkonda', 'Kazipet', 'Subedari', 'Naim Nagar', 'Fort Road', 'Mulugu Road']),
        ],
      },
      {
        name: 'Tripura',
        cities: [c('Agartala', ['Battala', 'Krishnanagar', 'Banamalipur', 'Ramnagar', 'Abhoynagar', 'Dhaleswar'])],
      },
      {
        name: 'Uttar Pradesh',
        cities: [
          c('Noida', ['Sector 18', 'Sector 62', 'Sector 63', 'Sector 137', 'Sector 15', 'Sector 50', 'Sector 76', 'Greater Noida', 'Noida Extension'], ['Gautam Buddha Nagar']),
          c('Ghaziabad', ['Indirapuram', 'Vaishali', 'Kaushambi', 'Raj Nagar', 'Vasundhara', 'Crossings Republik', 'Mohan Nagar']),
          c('Lucknow', ['Hazratganj', 'Gomti Nagar', 'Aliganj', 'Indira Nagar', 'Aminabad', 'Chowk', 'Alambagh', 'Mahanagar', 'Jankipuram', 'Ashiyana']),
          c('Kanpur', ['Swaroop Nagar', 'Civil Lines', 'Kakadeo', 'Kidwai Nagar', 'Govind Nagar', 'Mall Road', 'Shyam Nagar']),
          c('Varanasi', ['Lanka', 'Sigra', 'Bhelupur', 'Godowlia', 'Mahmoorganj', 'Cantonment', 'Sarnath'], ['Banaras', 'Kashi']),
          c('Agra', ['Sadar Bazaar', 'Sanjay Place', 'Dayalbagh', 'Kamla Nagar', 'Tajganj', 'Sikandra']),
          c('Prayagraj', ['Civil Lines', 'Katra', 'George Town', 'Tagore Town', 'Naini', 'Jhunsi'], ['Allahabad']),
        ],
      },
      {
        name: 'Uttarakhand',
        cities: [
          c('Dehradun', ['Rajpur Road', 'Paltan Bazaar', 'Ballupur', 'Clement Town', 'Sahastradhara Road', 'Prem Nagar', 'Vasant Vihar']),
          c('Haridwar', ['Har Ki Pauri', 'Ranipur More', 'Jwalapur', 'BHEL Township', 'Kankhal', 'Bahadrabad']),
          c('Rishikesh', ['Tapovan', 'Ram Jhula', 'Laxman Jhula', 'Shyampur', 'Muni Ki Reti', 'IDPL Colony']),
        ],
      },
      {
        name: 'West Bengal',
        cities: [
          c('Kolkata', ['Park Street', 'Esplanade', 'Ballygunge', 'Gariahat', 'Bhawanipore', 'Alipore', 'New Alipore', 'Behala', 'Tollygunge', 'Jadavpur', 'Salt Lake', 'New Town', 'Dum Dum', 'Shyambazar', 'College Street', 'Kasba'], ['Calcutta']),
          c('Howrah', ['Shibpur', 'Salkia', 'Liluah', 'Santragachi', 'Belur', 'Kadamtala']),
          c('Siliguri', ['Sevoke Road', 'Hill Cart Road', 'Hakim Para', 'Pradhan Nagar', 'Matigara', 'Salugara']),
          c('Durgapur', ['City Centre', 'Bidhannagar', 'Benachity', 'A-Zone', 'B-Zone', 'Muchipara']),
        ],
      },
      // ── the union territories ─────────────────────────────────────────────
      {
        name: 'Delhi (NCT)',
        cities: [
          c('Delhi', ['Connaught Place', 'Karol Bagh', 'Paharganj', 'Chandni Chowk', 'Hauz Khas', 'Green Park', 'Saket', 'Vasant Kunj', 'Dwarka', 'Janakpuri', 'Rajouri Garden', 'Punjabi Bagh', 'Rohini', 'Pitampura', 'Lajpat Nagar', 'Defence Colony', 'Greater Kailash', 'Mayur Vihar', 'Preet Vihar', 'Laxmi Nagar', 'Shahdara', 'Okhla'], ['New Delhi', 'Delhi NCR', 'National Capital Territory of Delhi']),
        ],
      },
      {
        name: 'Chandigarh (UT)',
        cities: [c('Chandigarh', ['Sector 17', 'Sector 22', 'Sector 35', 'Sector 8', 'Sector 43', 'Industrial Area', 'Manimajra'])],
      },
      {
        name: 'Puducherry (UT)',
        cities: [c('Puducherry', ['White Town', 'Heritage Town', 'Lawspet', 'Muthialpet', 'Reddiarpalayam', 'Auroville Road'], ['Pondicherry', 'Pondy'])],
      },
      {
        name: 'Ladakh (UT)',
        cities: [c('Leh', ['Main Bazaar', 'Changspa', 'Fort Road', 'Skara', 'Choglamsar', 'Shey'])],
      },
      {
        name: 'Andaman & Nicobar (UT)',
        cities: [c('Port Blair', ['Aberdeen Bazaar', 'Phoenix Bay', 'Haddo', 'Junglighat', 'Garacharma', 'Prothrapur'])],
      },
      {
        name: 'Dadra & Nagar Haveli and Daman & Diu (UT)',
        cities: [
          c('Daman', ['Nani Daman', 'Moti Daman', 'Devka', 'Dabhel', 'Somnath', 'Bhimpore']),
          c('Silvassa', ['Char Rasta', 'Amli', 'Dadra', 'Tokarkhada', 'Samarvarni', 'Zanda Chowk']),
        ],
      },
      {
        name: 'Lakshadweep (UT)',
        cities: [c('Kavaratti', ['Jetty Road', 'Hospital Road', 'Settlement Area', 'Beach Road', 'Ujra Junction', 'Helipad Road'])],
      },
    ],
  },
];

/**
 * The canonical city for whatever name arrived — a picker value, an alias, or
 * the reverse-geocoder's district — with the state and country it sits in.
 * Null when the tree has never heard of it, which is an answer, not an error:
 * the form falls back to the typed escape hatch.
 */
export function findCity(name: string): { country: string; state: string; city: PlaceCity } | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const country of PLACES) {
    for (const state of country.states) {
      for (const city of state.cities) {
        if (city.name.toLowerCase() === n || (city.aliases ?? []).some((a) => a.toLowerCase() === n)) {
          return { country: country.name, state: state.name, city };
        }
      }
    }
  }
  return null;
}
