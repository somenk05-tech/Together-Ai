/**
 * WHERE THE CITY'S BUSINESSES ARE — country → state → city → areas, served as
 * one tree the way categories.ts serves the trades (owner, 24 Aug: "give a
 * drop down menu of the city and then the areas… also add the state… give
 * country options too").
 *
 * IT IS AN ENTRY AID, NOT A CAGE. The listing stores what it always stored —
 * `city` and a csv of `areas` the owner names — and the form keeps a typed
 * escape hatch at every level, because a business in a town this file has
 * never heard of must stay listable the minute its owner arrives. The tree
 * exists so the common case is two taps instead of two spellings, and so the
 * reverse-geocoder's "Mumbai Suburban District" can be recognised as Mumbai
 * (that is what `aliases` is for).
 *
 * CURATED, NOT SCRAPED. Every locality here is a name a person would say —
 * the localities people actually order from and work in — and the list grows
 * by owners asking, one deploy per addition, exactly like a new trade.
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

export const PLACES: PlaceCountry[] = [
  {
    name: 'India',
    states: [
      {
        name: 'Maharashtra',
        cities: [
          {
            name: 'Mumbai',
            aliases: ['Bombay', 'Mumbai Suburban', 'Mumbai Suburban District', 'Greater Mumbai', 'Mumbai City'],
            areas: [
              'Colaba', 'Fort', 'Marine Lines', 'Girgaon', 'Byculla', 'Parel', 'Lower Parel', 'Worli',
              'Prabhadevi', 'Dadar', 'Matunga', 'Sion', 'Mahim', 'Bandra', 'Khar', 'Santacruz',
              'Vile Parle', 'Juhu', 'Andheri', 'Versova', 'Jogeshwari', 'Goregaon', 'Malad', 'Kandivali',
              'Borivali', 'Dahisar', 'Kurla', 'Ghatkopar', 'Vikhroli', 'Bhandup', 'Mulund', 'Powai',
              'Chembur', 'Wadala',
            ],
          },
          {
            name: 'Navi Mumbai',
            areas: ['Vashi', 'Nerul', 'Belapur', 'Kharghar', 'Panvel', 'Airoli', 'Ghansoli', 'Kopar Khairane', 'Sanpada', 'Seawoods', 'Ulwe'],
          },
          {
            name: 'Thane',
            areas: ['Naupada', 'Ghodbunder Road', 'Majiwada', 'Vartak Nagar', 'Wagle Estate', 'Kalwa', 'Mumbra', 'Hiranandani Estate', 'Kolshet'],
          },
          {
            name: 'Pune',
            areas: ['Koregaon Park', 'Kalyani Nagar', 'Viman Nagar', 'Kharadi', 'Hadapsar', 'Camp', 'Shivajinagar', 'Deccan', 'Kothrud', 'Baner', 'Aundh', 'Wakad', 'Hinjawadi', 'Magarpatta'],
          },
        ],
      },
      {
        name: 'Delhi (NCT)',
        cities: [
          {
            name: 'Delhi',
            aliases: ['New Delhi', 'Delhi NCR', 'National Capital Territory of Delhi'],
            areas: ['Connaught Place', 'Karol Bagh', 'Paharganj', 'Chandni Chowk', 'Hauz Khas', 'Green Park', 'Saket', 'Vasant Kunj', 'Dwarka', 'Janakpuri', 'Rajouri Garden', 'Punjabi Bagh', 'Rohini', 'Pitampura', 'Lajpat Nagar', 'Defence Colony', 'Greater Kailash', 'Mayur Vihar', 'Preet Vihar'],
          },
        ],
      },
      {
        name: 'Karnataka',
        cities: [
          {
            name: 'Bengaluru',
            aliases: ['Bangalore', 'Bengaluru Urban'],
            areas: ['MG Road', 'Indiranagar', 'Koramangala', 'HSR Layout', 'BTM Layout', 'Jayanagar', 'JP Nagar', 'Basavanagudi', 'Malleshwaram', 'Rajajinagar', 'Yelahanka', 'Hebbal', 'Whitefield', 'Marathahalli', 'Bellandur', 'Sarjapur Road', 'Electronic City', 'Banashankari'],
          },
        ],
      },
      {
        name: 'Telangana',
        cities: [
          {
            name: 'Hyderabad',
            areas: ['Banjara Hills', 'Jubilee Hills', 'Madhapur', 'Gachibowli', 'Kondapur', 'HITEC City', 'Kukatpally', 'Begumpet', 'Secunderabad', 'Ameerpet', 'Himayatnagar', 'Charminar', 'Manikonda', 'Miyapur'],
          },
        ],
      },
      {
        name: 'Tamil Nadu',
        cities: [
          {
            name: 'Chennai',
            aliases: ['Madras'],
            areas: ['T Nagar', 'Mylapore', 'Adyar', 'Besant Nagar', 'Velachery', 'Anna Nagar', 'Nungambakkam', 'Egmore', 'Alwarpet', 'Guindy', 'Porur', 'OMR', 'Tambaram', 'Chromepet'],
          },
        ],
      },
      {
        name: 'West Bengal',
        cities: [
          {
            name: 'Kolkata',
            aliases: ['Calcutta'],
            areas: ['Park Street', 'Esplanade', 'Ballygunge', 'Gariahat', 'Bhawanipore', 'Alipore', 'New Alipore', 'Behala', 'Tollygunge', 'Jadavpur', 'Salt Lake', 'New Town', 'Howrah', 'Dum Dum'],
          },
        ],
      },
      {
        name: 'Gujarat',
        cities: [
          {
            name: 'Ahmedabad',
            areas: ['Navrangpura', 'CG Road', 'Satellite', 'Vastrapur', 'Bodakdev', 'Prahlad Nagar', 'Maninagar', 'Paldi', 'Thaltej', 'SG Highway', 'Bopal'],
          },
          {
            name: 'Surat',
            areas: ['Adajan', 'Vesu', 'Piplod', 'Athwa', 'Ghod Dod Road', 'Varachha', 'Katargam', 'Ring Road'],
          },
        ],
      },
      {
        name: 'Haryana',
        cities: [
          {
            name: 'Gurugram',
            aliases: ['Gurgaon'],
            areas: ['DLF Cyber City', 'Golf Course Road', 'MG Road', 'Sohna Road', 'Sector 29', 'Sector 14', 'Udyog Vihar', 'Sushant Lok', 'Palam Vihar', 'New Gurugram'],
          },
        ],
      },
      {
        name: 'Uttar Pradesh',
        cities: [
          {
            name: 'Noida',
            aliases: ['Gautam Buddha Nagar'],
            areas: ['Sector 18', 'Sector 62', 'Sector 63', 'Sector 137', 'Sector 15', 'Sector 50', 'Greater Noida', 'Noida Extension'],
          },
          {
            name: 'Lucknow',
            areas: ['Hazratganj', 'Gomti Nagar', 'Aliganj', 'Indira Nagar', 'Aminabad', 'Chowk', 'Alambagh', 'Mahanagar'],
          },
        ],
      },
      {
        name: 'Rajasthan',
        cities: [
          {
            name: 'Jaipur',
            areas: ['C Scheme', 'MI Road', 'Vaishali Nagar', 'Malviya Nagar', 'Mansarovar', 'Raja Park', 'Tonk Road', 'Jagatpura', 'Bani Park'],
          },
        ],
      },
      {
        name: 'Kerala',
        cities: [
          {
            name: 'Kochi',
            aliases: ['Cochin', 'Ernakulam'],
            areas: ['MG Road', 'Fort Kochi', 'Mattancherry', 'Kakkanad', 'Edappally', 'Palarivattom', 'Kaloor', 'Vyttila', 'Panampilly Nagar'],
          },
        ],
      },
      {
        name: 'Madhya Pradesh',
        cities: [
          {
            name: 'Indore',
            areas: ['Vijay Nagar', 'Palasia', 'New Palasia', 'Rajwada', 'Sapna Sangeeta', 'Bhawarkua', 'Rau', 'MG Road'],
          },
        ],
      },
      {
        name: 'Chandigarh (UT)',
        cities: [
          {
            name: 'Chandigarh',
            areas: ['Sector 17', 'Sector 22', 'Sector 35', 'Sector 8', 'Industrial Area', 'Manimajra', 'Panchkula', 'Mohali'],
          },
        ],
      },
    ],
  },
  {
    name: 'United Arab Emirates',
    states: [
      {
        name: 'Dubai',
        cities: [
          {
            name: 'Dubai',
            areas: ['Deira', 'Bur Dubai', 'Karama', 'Al Barsha', 'Jumeirah', 'JLT', 'Dubai Marina', 'Business Bay', 'Downtown Dubai', 'International City', 'Al Qusais', 'Mirdif'],
          },
        ],
      },
      {
        name: 'Abu Dhabi',
        cities: [
          {
            name: 'Abu Dhabi',
            areas: ['Corniche', 'Al Khalidiyah', 'Al Zahiyah', 'Mussafah', 'Khalifa City', 'Al Reem Island', 'Madinat Zayed'],
          },
        ],
      },
    ],
  },
  {
    name: 'Singapore',
    states: [
      {
        name: 'Singapore',
        cities: [
          {
            name: 'Singapore',
            areas: ['Orchard', 'Bugis', 'Chinatown', 'Little India', 'Tanjong Pagar', 'Jurong East', 'Tampines', 'Bedok', 'Woodlands', 'Serangoon', 'Punggol', 'Clementi'],
          },
        ],
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
