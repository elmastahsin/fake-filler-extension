/**
 * English (en, US conventions) mock dataset.
 * See src/locales/index.js for the dataset contract.
 */
import { buildIban } from '../../generators/identifiers.js';

const STREET_NAMES = [
  'Maple', 'Oak', 'Cedar', 'Pine', 'Elm', 'Washington', 'Lincoln', 'Park', 'Lake',
  'Hillside', 'Sunset', 'Highland', 'Riverside', 'Madison', 'Franklin', 'Willow',
];
const STREET_SUFFIXES = ['St', 'Ave', 'Blvd', 'Rd', 'Ln', 'Dr', 'Ct', 'Way'];

export default {
  code: 'en',
  label: 'English',
  englishLabel: 'English',
  flag: '🇺🇸',
  dateFormat: 'MM/DD/YYYY',
  intlLocale: 'en-US',
  country: 'United States',
  countryAliases: ['United States', 'United States of America', 'USA', 'US', 'U.S.', 'America'],
  genders: { female: 'Female', male: 'Male' },

  jobTitles: [
    'Software Engineer', 'Project Manager', 'Sales Representative', 'Accountant',
    'HR Specialist', 'Graphic Designer', 'Marketing Manager', 'Data Analyst',
    'Customer Success Manager', 'Operations Coordinator', 'Product Manager', 'Teacher',
  ],

  firstNames: {
    male: [
      'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Daniel', 'Matthew',
      'Andrew', 'Joshua', 'Ethan', 'Ryan', 'Nathan', 'Tyler', 'Brandon', 'Kevin',
      'Jacob', 'Logan', 'Austin', 'Caleb',
    ],
    female: [
      'Emily', 'Olivia', 'Emma', 'Sophia', 'Ava', 'Isabella', 'Mia', 'Abigail',
      'Madison', 'Elizabeth', 'Chloe', 'Grace', 'Hannah', 'Lily', 'Natalie',
      'Samantha', 'Rachel', 'Lauren', 'Megan', 'Sarah',
    ],
  },

  lastNames: [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson',
    'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Thompson', 'White', 'Harris',
    'Clark', 'Lewis', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott',
    'Green', 'Baker', 'Adams', 'Nelson', 'Carter',
  ],

  emailDomains: ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'hotmail.com', 'aol.com'],

  companies: [
    'Northwind Traders', 'Blue Ridge Analytics', 'Summit Health Partners', 'Brightline Logistics',
    'Evergreen Software LLC', 'Harborview Consulting', 'Pioneer Manufacturing Co.',
    'Redwood Financial Group', 'Lakeside Media Inc.', 'Granite Peak Engineering',
  ],

  /** `zip` = first three ZIP digits, `area` = phone area codes for the city. */
  cities: [
    { name: 'New York', state: 'NY', zip: '100', area: ['212', '646', '917'] },
    { name: 'Los Angeles', state: 'CA', zip: '900', area: ['213', '310', '323'] },
    { name: 'Chicago', state: 'IL', zip: '606', area: ['312', '773'] },
    { name: 'Houston', state: 'TX', zip: '770', area: ['713', '832'] },
    { name: 'Phoenix', state: 'AZ', zip: '850', area: ['602', '480'] },
    { name: 'Philadelphia', state: 'PA', zip: '191', area: ['215', '267'] },
    { name: 'San Diego', state: 'CA', zip: '921', area: ['619', '858'] },
    { name: 'Dallas', state: 'TX', zip: '752', area: ['214', '469'] },
    { name: 'Austin', state: 'TX', zip: '787', area: ['512', '737'] },
    { name: 'Seattle', state: 'WA', zip: '981', area: ['206'] },
    { name: 'Boston', state: 'MA', zip: '021', area: ['617', '857'] },
    { name: 'Denver', state: 'CO', zip: '802', area: ['303', '720'] },
    { name: 'Portland', state: 'OR', zip: '972', area: ['503', '971'] },
    { name: 'Atlanta', state: 'GA', zip: '303', area: ['404', '678'] },
    { name: 'Miami', state: 'FL', zip: '331', area: ['305', '786'] },
  ],

  shortTexts: [
    'Product inquiry', 'Request a quote', 'Schedule a demo', 'Order status', 'Technical support',
    'Partnership proposal', 'Billing question', 'General question', 'Account help', 'Return request',
  ],

  sentences: [
    'Hi, I would like to learn more about your pricing plans.',
    'Could you give me an update on the status of my recent order?',
    'I am usually available on weekdays between 9 AM and 5 PM.',
    'We are interested in a team license for about twenty people.',
    'I submitted a request last week but have not heard back yet.',
    'Please let me know which payment methods you accept.',
    'Overall I am very happy with the service, thank you!',
    'I need to update the billing address on my account.',
    'Would it be possible to move my appointment to next week?',
    'The mobile app occasionally shows an error when I try to sign in.',
    'Feel free to reach out by email if that is more convenient.',
  ],

  formats: {
    /** SSN "AAA-GG-SSSS" avoiding never-issued ranges (000, 666, 9xx, 00, 0000). */
    nationalId(rnd) {
      let area = rnd.int(1, 899);
      if (area === 666) area = 667;
      return `${String(area).padStart(3, '0')}-${String(rnd.int(1, 99)).padStart(2, '0')}-${String(rnd.int(1, 9999)).padStart(4, '0')}`;
    },

    /** EIN "12-3456789". */
    taxId(rnd) {
      return `${rnd.int(10, 99)}-${rnd.digits(7)}`;
    },

    /** The US has no IBAN; a GB IBAN is the most common choice for English forms. */
    iban(rnd) {
      const bank = rnd.pick(['NWBK', 'BARC', 'LOYD', 'HBUK', 'MIDL']);
      return buildIban('GB', `${bank}${rnd.digits(6)}${rnd.digits(8)}`);
    },

    /** "(512) 384-2716" — NANP format; exchange code never starts with 0/1. */
    phone(rnd, city) {
      const area = city ? rnd.pick(city.area) : '555';
      return `(${area}) ${rnd.int(2, 9)}${rnd.digits(2)}-${rnd.digits(4)}`;
    },

    /** "1482 Maple Ave, Apt 4B" / full: "..., Austin, TX 78704". */
    address(rnd, city) {
      const postalCode = `${city.zip}${rnd.digits(2)}`;
      const apt = rnd.bool(0.4) ? `, Apt ${rnd.int(1, 30)}${rnd.pick(['A', 'B', 'C', 'D'])}` : '';
      const line = `${rnd.int(10, 9999)} ${rnd.pick(STREET_NAMES)} ${rnd.pick(STREET_SUFFIXES)}${apt}`;
      return {
        line,
        full: `${line}, ${city.name}, ${city.state} ${postalCode}`,
        district: city.state,
        postalCode,
      };
    },
  },
};
