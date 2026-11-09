/**
 * Turkish (tr) mock dataset.
 *
 * Dataset contract (see src/locales/index.js for the full typedef):
 *  - Plain data pools (names, cities, sentences, ...)
 *  - `formats.*` functions that encapsulate locale-specific formatting rules
 *    (phone numbering plan, postal codes, address layout). Each receives the
 *    shared random helper `rnd` so output stays reproducible with a seed.
 */
import { buildIban, tcKimlikNo, vergiKimlikNo } from '../../generators/identifiers.js';

/** EFT bank codes: Ziraat, Halkbank, Vakıfbank, Akbank, Garanti, İş Bankası, Yapı Kredi. */
const BANK_CODES = ['00010', '00012', '00015', '00046', '00062', '00064', '00067'];

/** Mobile prefixes of Turkcell (53x), Vodafone (54x) and Türk Telekom (50x/55x). */
const MOBILE_PREFIXES = [
  '501', '505', '506', '507',
  '530', '531', '532', '533', '534', '535', '536', '537', '538', '539',
  '541', '542', '543', '544', '545', '546', '547', '548', '549',
  '551', '552', '553', '554', '555', '559',
];

const NEIGHBORHOODS = [
  'Atatürk', 'Cumhuriyet', 'Fatih', 'Bahçelievler', 'Gazi', 'İnönü', 'Mimar Sinan',
  'Barbaros', 'Yıldız', 'Kazım Karabekir', 'Fevzi Çakmak', 'Hürriyet', 'Zafer',
  'Esentepe', 'Merkez', 'Çamlık', 'Yeşiltepe', 'Güzelyalı', 'Kültür', 'Sahrayıcedit',
];

const STREETS = [
  'Atatürk Cad.', 'Cumhuriyet Cad.', 'İstiklal Cad.', 'Bağdat Cad.', 'Gazi Bulvarı',
  'Fevzi Çakmak Cad.', 'Lale Sok.', 'Gül Sok.', 'Menekşe Sok.', 'Akasya Sok.',
  'Çınar Sok.', 'Papatya Sok.', 'Ihlamur Sok.', 'Okul Sok.', 'Değirmen Sok.',
  'Pınar Sok.', 'Karanfil Sok.', 'Zambak Sok.', '1071. Sok.', '1453. Sok.',
];

export default {
  code: 'tr',
  label: 'Türkçe',
  englishLabel: 'Turkish',
  flag: '🇹🇷',
  dateFormat: 'DD.MM.YYYY',
  intlLocale: 'tr-TR',
  country: 'Türkiye',
  /** Labels a country <select> might use for this locale's country. */
  countryAliases: ['Türkiye', 'Turkey', 'Turkiye', 'Türkiye Cumhuriyeti', 'TR', 'TUR', 'Türkei'],
  genders: { female: 'Kadın', male: 'Erkek' },

  jobTitles: [
    'Yazılım Geliştirici', 'Proje Yöneticisi', 'Satış Temsilcisi', 'Muhasebe Uzmanı',
    'İnsan Kaynakları Uzmanı', 'Grafik Tasarımcı', 'Pazarlama Müdürü', 'Mali Müşavir',
    'Makine Mühendisi', 'Müşteri Temsilcisi', 'İş Analisti', 'Öğretmen',
  ],

  firstNames: {
    male: [
      'Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Murat',
      'Emre', 'Burak', 'Can', 'Cem', 'Kerem', 'Oğuz', 'Serkan', 'Yusuf', 'Ömer',
      'Enes', 'Eren', 'Barış', 'Tolga', 'Onur', 'Kaan', 'Arda', 'Baran', 'Efe',
      'Volkan', 'Uğur', 'Selim', 'Doruk',
    ],
    female: [
      'Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Emine', 'Merve', 'Esra', 'Büşra', 'Selin',
      'Ece', 'Defne', 'Ceren', 'Gizem', 'Derya', 'Hande', 'İrem', 'Nur', 'Özlem',
      'Seda', 'Sibel', 'Tuğba', 'Yasemin', 'Gül', 'Melis', 'Aslı', 'Damla', 'Ebru',
      'Pınar', 'Şule', 'Çağla',
    ],
  },

  lastNames: [
    'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk',
    'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara',
    'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Korkmaz', 'Güneş', 'Aksoy',
    'Bulut', 'Tekin', 'Ünal', 'Acar', 'Karaca', 'Çakır', 'Erdem', 'Uçar',
    'Tuncer', 'Avcı', 'Keskin', 'Başaran', 'Gündoğdu', 'Sarı',
  ],

  emailDomains: ['gmail.com', 'hotmail.com', 'outlook.com', 'yandex.com', 'icloud.com', 'yahoo.com'],

  companies: [
    'Anadolu Yazılım A.Ş.', 'Boğaziçi Danışmanlık Ltd. Şti.', 'Ege Lojistik A.Ş.',
    'Kuzey Bilişim Teknolojileri A.Ş.', 'Marmara Gıda San. ve Tic. A.Ş.', 'Toros Enerji A.Ş.',
    'Kapadokya Turizm Ltd. Şti.', 'Karadeniz İnşaat A.Ş.', 'Akdeniz Medya Ltd. Şti.',
    'Yıldız Tekstil San. A.Ş.', 'Mavi Bulut Yazılım Ltd. Şti.', 'Pera Mimarlık Ltd. Şti.',
  ],

  /** `plate` doubles as the first two digits of the 5-digit postal code. */
  cities: [
    { name: 'İstanbul', plate: '34', districts: ['Kadıköy', 'Beşiktaş', 'Üsküdar', 'Şişli', 'Bakırköy', 'Ataşehir', 'Maltepe', 'Sarıyer', 'Beyoğlu', 'Fatih'] },
    { name: 'Ankara', plate: '06', districts: ['Çankaya', 'Keçiören', 'Yenimahalle', 'Mamak', 'Etimesgut', 'Altındağ'] },
    { name: 'İzmir', plate: '35', districts: ['Karşıyaka', 'Bornova', 'Konak', 'Buca', 'Çiğli', 'Bayraklı'] },
    { name: 'Bursa', plate: '16', districts: ['Nilüfer', 'Osmangazi', 'Yıldırım', 'Mudanya'] },
    { name: 'Antalya', plate: '07', districts: ['Muratpaşa', 'Konyaaltı', 'Kepez', 'Alanya'] },
    { name: 'Adana', plate: '01', districts: ['Seyhan', 'Çukurova', 'Yüreğir'] },
    { name: 'Konya', plate: '42', districts: ['Selçuklu', 'Meram', 'Karatay'] },
    { name: 'Eskişehir', plate: '26', districts: ['Odunpazarı', 'Tepebaşı'] },
    { name: 'Gaziantep', plate: '27', districts: ['Şahinbey', 'Şehitkamil'] },
    { name: 'Kocaeli', plate: '41', districts: ['İzmit', 'Gebze', 'Gölcük'] },
    { name: 'Trabzon', plate: '61', districts: ['Ortahisar', 'Akçaabat'] },
    { name: 'Samsun', plate: '55', districts: ['Atakum', 'İlkadım'] },
    { name: 'Kayseri', plate: '38', districts: ['Melikgazi', 'Kocasinan'] },
    { name: 'Mersin', plate: '33', districts: ['Yenişehir', 'Mezitli'] },
  ],

  /** Short, realistic phrases for unclassified text inputs (subject, title, ...). */
  shortTexts: [
    'Bilgi talebi', 'Teklif isteği', 'Randevu talebi', 'Sipariş durumu', 'Teknik destek',
    'İş birliği önerisi', 'Fatura bilgisi', 'Genel soru', 'Üyelik işlemleri', 'İade talebi',
  ],

  /** Natural sentences used to compose textarea content. */
  sentences: [
    'Merhaba, ürünleriniz hakkında detaylı bilgi almak istiyorum.',
    'Siparişimin kargo durumu hakkında bilgi verebilir misiniz?',
    'Hafta içi 09:00–18:00 saatleri arasında bana ulaşabilirsiniz.',
    'Kurumsal teklif için sizinle görüşmek isterim.',
    'Geçen hafta oluşturduğum talebe henüz dönüş alamadım.',
    'Ödeme seçenekleriniz ve taksit imkânları hakkında bilgi rica ederim.',
    'Hizmetinizden genel olarak çok memnunum, teşekkür ederim.',
    'Fatura adresimi güncellemem gerekiyor, yardımcı olabilir misiniz?',
    'Randevu tarihimi bir sonraki haftaya ertelemek istiyorum.',
    'Mobil uygulamada giriş yaparken zaman zaman hata alıyorum.',
    'Toplantı için uygun olduğunuz bir zamanı paylaşırsanız sevinirim.',
    'Konuyla ilgili e-posta yoluyla dönüş yapmanız benim için daha uygun olur.',
  ],

  formats: {
    /** 11-digit TC Kimlik No that passes the official checksum. */
    nationalId: (rnd) => tcKimlikNo(rnd),

    /** 10-digit Vergi Kimlik No (VKN) with a valid check digit. */
    taxId: (rnd) => vergiKimlikNo(rnd),

    /** TR IBAN: 5-digit bank code + reserve digit "0" + 16-digit account. */
    iban(rnd) {
      return buildIban('TR', `${rnd.pick(BANK_CODES)}0${rnd.digits(16)}`);
    },

    /** "0532 418 27 90" — national format with trunk prefix 0. */
    phone(rnd) {
      const prefix = rnd.pick(MOBILE_PREFIXES);
      return `0${prefix} ${rnd.int(1, 9)}${rnd.digits(2)} ${rnd.digits(2)} ${rnd.digits(2)}`;
    },

    /**
     * Builds a Turkish address: "Moda Mah. Bahariye Cad. No: 45 D: 7".
     * Turkish postal codes are 5 digits; the first two equal the city plate code.
     */
    address(rnd, city) {
      const district = rnd.pick(city.districts);
      const postalCode = `${city.plate}${String(rnd.int(0, 999)).padStart(3, '0')}`;
      const line = `${rnd.pick(NEIGHBORHOODS)} Mah. ${rnd.pick(STREETS)} No: ${rnd.int(1, 180)} D: ${rnd.int(1, 24)}`;
      return {
        line,
        full: `${line}, ${postalCode} ${district}/${city.name}`,
        district,
        postalCode,
      };
    },
  },
};
