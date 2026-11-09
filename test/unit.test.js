import assert from 'node:assert/strict';
import { FIELD_TYPES as T } from '../src/shared/constants.js';
import { foldText } from '../src/shared/textUtils.js';
import { classifyField, detectDatePart } from '../src/content/fieldRules.js';
import { getDataset } from '../src/locales/index.js';
import { DataGenerator } from '../src/generators/dataGenerator.js';
import { isValidIban, isValidLuhn, isValidTcKimlikNo, isValidVkn } from '../src/generators/identifiers.js';
import { generateFromPattern } from '../src/generators/patternGenerator.js';
import { isMaskPlaceholderValue, matchPreferred } from '../src/generators/inputHandlers.js';
import { createRandom } from '../src/generators/random.js';

console.log('Testing classifier heuristics...');

// Core Turkish fields
assert.equal(classifyField({ tag: 'input', name: 'adiniz', type: 'text' }), T.FIRST_NAME);
assert.equal(classifyField({ tag: 'input', label: 'Adınız Soyadınız', type: 'text' }), T.FULL_NAME);
assert.equal(classifyField({ tag: 'input', name: 'soyad', type: 'text' }), T.LAST_NAME);
assert.equal(classifyField({ tag: 'input', placeholder: 'ornek@eposta.com', type: 'text' }), T.EMAIL);
assert.equal(classifyField({ tag: 'input', label: 'Cep Telefonu', type: 'text' }), T.PHONE);
assert.equal(classifyField({ tag: 'input', label: 'Şifreniz', type: 'password' }), T.PASSWORD);
assert.equal(classifyField({ tag: 'input', label: 'Posta Kodu', type: 'text' }), T.POSTAL_CODE);
assert.equal(classifyField({ tag: 'input', label: 'Şehir / İl', type: 'text' }), T.CITY);
assert.equal(classifyField({ tag: 'select', label: 'İlçe' }), T.DISTRICT);
assert.equal(classifyField({ tag: 'select', label: 'Ülke' }), T.COUNTRY);
assert.equal(classifyField({ tag: 'textarea', label: 'Açıklama / Mesajınız' }), T.TEXT_AREA);
assert.equal(classifyField({ tag: 'input', label: 'Doğum Tarihi', type: 'date' }), T.DATE);
assert.equal(classifyField({ tag: 'input', label: 'Doğum Yeri', type: 'text' }), T.CITY);

// New high-value types (TR / EN / DE)
assert.equal(classifyField({ tag: 'input', label: 'T.C. Kimlik Numarası', type: 'text' }), T.NATIONAL_ID);
assert.equal(classifyField({ tag: 'input', name: 'tckn', type: 'text' }), T.NATIONAL_ID);
assert.equal(classifyField({ tag: 'input', label: 'Vergi Kimlik No (VKN)', type: 'text' }), T.TAX_ID);
assert.equal(classifyField({ tag: 'input', label: 'Vergi Dairesi Adı', type: 'text' }), T.UNKNOWN); // not person name, not tax number
assert.equal(classifyField({ tag: 'input', label: 'IBAN Numarası', type: 'text' }), T.IBAN);
assert.equal(classifyField({ tag: 'input', label: 'Kredi Kartı Numarası', type: 'text' }), T.CREDIT_CARD);
assert.equal(classifyField({ tag: 'input', label: 'Kart Üzerindeki İsim', type: 'text' }), T.FULL_NAME);
assert.equal(classifyField({ tag: 'input', label: 'Son Kullanma Tarihi', placeholder: 'AA/YY', type: 'text' }), T.CARD_EXPIRY);
assert.equal(classifyField({ tag: 'input', label: 'CVV / Güvenlik Kodu', type: 'text' }), T.CVV);
assert.equal(classifyField({ tag: 'select', label: 'Cinsiyet' }), T.GENDER);
assert.equal(classifyField({ tag: 'input', label: 'Meslek / Unvan', type: 'text' }), T.JOB_TITLE);
assert.equal(classifyField({ tag: 'input', label: 'Web Sitesi', type: 'text' }), T.WEBSITE);

// English & autocomplete
assert.equal(classifyField({ tag: 'input', autocomplete: 'family-name', type: 'text' }), T.LAST_NAME);
assert.equal(classifyField({ tag: 'input', autocomplete: 'cc-number', type: 'text' }), T.CREDIT_CARD);
assert.equal(classifyField({ tag: 'input', placeholder: 'Enter your email', type: 'text' }), T.EMAIL);
assert.equal(classifyField({ tag: 'input', name: 'company_name', type: 'text' }), T.COMPANY);
assert.equal(classifyField({ tag: 'input', label: 'Şehir Adı', type: 'text' }), T.CITY);

// Date parts
assert.equal(detectDatePart({ autocomplete: 'bday-month' }), 'month');
assert.equal(detectDatePart({ hint: 'dogum yili' }), 'year');

console.log('Testing checksums & Turkish data generator...');
const trGen = new DataGenerator(getDataset('tr'), { seed: 42 });
const p = trGen.persona;

assert.ok(p.firstName && p.lastName);
assert.ok(p.phone.startsWith('05'), 'Turkish phone starts with 05');
assert.ok(p.email.includes('@'), 'Valid email format');
assert.ok(p.address.line.includes('Mah.'), 'Turkish address formatting');
assert.equal(trGen.generate(T.PASSWORD), p.password);
assert.ok(isValidTcKimlikNo(trGen.generate(T.NATIONAL_ID)), 'TC Kimlik passes checksum');
assert.ok(isValidVkn(trGen.generate(T.TAX_ID)), 'VKN passes checksum');
assert.ok(isValidIban(trGen.generate(T.IBAN)), 'TR IBAN passes mod-97');
assert.ok(isValidLuhn(trGen.generate(T.CREDIT_CARD)), 'Card number passes Luhn');
assert.match(trGen.generate(T.CARD_EXPIRY), /^\d{2}\/\d{2}$/);
assert.match(trGen.generate(T.CVV), /^\d{3}$/);

// Experience years must be realistic, not birth year (e.g. 1991)
const expYears = Number(trGen.generate(T.NUMBER, { hint: 'deneyim yili' }));
assert.ok(expYears >= 1 && expYears <= 45, `Experience years (${expYears}) is realistic`);

// Gender matching ("Female" must not match "male")
assert.ok(trGen.matchesGender(p.gender === 'female' ? 'Kadın' : 'Erkek'));
assert.ok(!trGen.matchesGender(p.gender === 'female' ? 'Erkek' : 'Kadın'));
assert.ok(!trGen.matchesGender(p.gender === 'male' ? 'Female' : 'Male'));

console.log('Testing English & German generators...');
const enGen = new DataGenerator(getDataset('en'), { seed: 99 });
assert.ok(enGen.persona.phone.startsWith('('), 'US phone format');
assert.ok(isValidIban(enGen.generate(T.IBAN)), 'EN IBAN passes mod-97');

const deGen = new DataGenerator(getDataset('de'), { seed: 7 });
assert.ok(isValidIban(deGen.generate(T.IBAN)), 'DE IBAN passes mod-97');

console.log('Testing pattern generator & helpers...');
const rnd = createRandom(123);
for (const pat of ['05[0-9]{9}', '[A-Z]{2}-[0-9]{4}', '\\d{3}\\.\\d{2}', '(TR|DE)\\d{4}']) {
  const value = generateFromPattern(pat, rnd);
  assert.ok(value && new RegExp(`^(?:${pat})$`).test(value), `Pattern ${pat} -> ${value}`);
}

assert.ok(isMaskPlaceholderValue('(___) ___ __ __'));
assert.ok(!isMaskPlaceholderValue('0532 418 27 90'));

const opts = [{ text: '34 - İstanbul', value: '34' }, { text: '06 - Ankara', value: '06' }];
assert.equal(matchPreferred(opts, ['İstanbul'], foldText)?.value, '34');

console.log('All unit tests passed successfully!');
