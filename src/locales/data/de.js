/**
 * German (de) mock dataset — included to demonstrate how new locales plug in.
 * See src/locales/index.js for the dataset contract.
 */
import { buildIban } from '../../generators/identifiers.js';

const ID_CHARS = 'CFGHJKLMNPRTVWXYZ0123456789';

const MOBILE_PREFIXES = ['0151', '0152', '0157', '0160', '0162', '0170', '0171', '0172', '0173', '0176', '0177', '0178'];
const STREETS = [
  'Hauptstraße', 'Bahnhofstraße', 'Gartenstraße', 'Schulstraße', 'Dorfstraße', 'Bergstraße',
  'Lindenstraße', 'Kirchweg', 'Am Markt', 'Goethestraße', 'Schillerstraße', 'Rosenweg',
];

export default {
  code: 'de',
  label: 'Deutsch',
  englishLabel: 'German',
  flag: '🇩🇪',
  dateFormat: 'DD.MM.YYYY',
  intlLocale: 'de-DE',
  country: 'Deutschland',
  countryAliases: ['Deutschland', 'Germany', 'DE', 'DEU', 'Bundesrepublik Deutschland', 'Almanya'],
  genders: { female: 'Weiblich', male: 'Männlich' },

  jobTitles: [
    'Softwareentwickler', 'Projektleiter', 'Vertriebsmitarbeiter', 'Buchhalter',
    'Personalreferent', 'Grafikdesigner', 'Marketingleiter', 'Datenanalyst',
    'Kundenberater', 'Maschinenbauingenieur', 'Produktmanager', 'Lehrer',
  ],

  firstNames: {
    male: ['Lukas', 'Leon', 'Finn', 'Jonas', 'Paul', 'Felix', 'Maximilian', 'Tim', 'Jan', 'Niklas', 'Moritz', 'Tobias', 'Florian', 'Sebastian'],
    female: ['Anna', 'Lena', 'Hannah', 'Lea', 'Laura', 'Sophie', 'Marie', 'Julia', 'Katharina', 'Johanna', 'Clara', 'Sarah', 'Nina', 'Miriam'],
  },

  lastNames: [
    'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
    'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann',
    'Schwarz', 'Zimmermann', 'Braun', 'Krüger',
  ],

  emailDomains: ['gmail.com', 'web.de', 'gmx.de', 't-online.de', 'outlook.de', 'posteo.de'],

  companies: [
    'Nordlicht Software GmbH', 'Rheinwerk Logistik GmbH', 'Alpenblick Consulting AG',
    'Hansa Medien GmbH & Co. KG', 'Spreewald Energie GmbH', 'Isartal Engineering GmbH',
  ],

  /** `zip` = first two postal-code digits for the city. */
  cities: [
    { name: 'Berlin', zip: ['10', '12', '13'] },
    { name: 'Hamburg', zip: ['20', '22'] },
    { name: 'München', zip: ['80', '81'] },
    { name: 'Köln', zip: ['50', '51'] },
    { name: 'Frankfurt am Main', zip: ['60'] },
    { name: 'Stuttgart', zip: ['70'] },
    { name: 'Düsseldorf', zip: ['40'] },
    { name: 'Leipzig', zip: ['04'] },
    { name: 'Dresden', zip: ['01'] },
    { name: 'Hannover', zip: ['30'] },
  ],

  shortTexts: [
    'Produktanfrage', 'Angebotsanfrage', 'Terminanfrage', 'Bestellstatus', 'Technischer Support',
    'Kooperationsanfrage', 'Frage zur Rechnung', 'Allgemeine Frage', 'Kontoverwaltung', 'Rücksendung',
  ],

  sentences: [
    'Guten Tag, ich hätte gerne weitere Informationen zu Ihren Tarifen.',
    'Können Sie mir bitte den aktuellen Stand meiner Bestellung mitteilen?',
    'Ich bin werktags zwischen 9 und 17 Uhr gut erreichbar.',
    'Wir interessieren uns für eine Lizenz für unser gesamtes Team.',
    'Leider habe ich auf meine Anfrage von letzter Woche noch keine Antwort erhalten.',
    'Welche Zahlungsmethoden bieten Sie an?',
    'Mit Ihrem Service bin ich insgesamt sehr zufrieden, vielen Dank!',
    'Ich möchte meine Rechnungsadresse ändern.',
    'Wäre es möglich, meinen Termin auf nächste Woche zu verschieben?',
    'Eine Rückmeldung per E-Mail wäre für mich am einfachsten.',
  ],

  formats: {
    /** Personalausweis-style document number, e.g. "L01X00T47". */
    nationalId(rnd) {
      return Array.from({ length: 9 }, () => ID_CHARS[rnd.int(0, ID_CHARS.length - 1)]).join('');
    },

    /** Steuer-ID: 11 digits, first digit non-zero. */
    taxId(rnd) {
      return `${rnd.int(1, 9)}${rnd.digits(10)}`;
    },

    /** DE IBAN: 8-digit BLZ + 10-digit account number. */
    iban(rnd) {
      return buildIban('DE', `${rnd.pick(['10070000', '20040000', '37040044', '50010517', '70020270'])}${rnd.digits(10)}`);
    },

    /** "0172 4839201" — German mobile format. */
    phone(rnd) {
      return `${rnd.pick(MOBILE_PREFIXES)} ${rnd.int(1, 9)}${rnd.digits(6)}`;
    },

    /** "Hauptstraße 12" / full: "Hauptstraße 12, 10115 Berlin". */
    address(rnd, city) {
      const postalCode = `${rnd.pick(city.zip)}${rnd.digits(3)}`;
      const line = `${rnd.pick(STREETS)} ${rnd.int(1, 120)}${rnd.bool(0.15) ? rnd.pick(['a', 'b']) : ''}`;
      return { line, full: `${line}, ${postalCode} ${city.name}`, district: null, postalCode };
    },
  },
};
