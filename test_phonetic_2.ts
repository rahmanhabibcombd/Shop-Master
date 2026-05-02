import { isPhoneticMatch, toPhonetic, standardizeBn } from './src/utils/voiceUtils';

const searchTerm = '6171777261092';
const p = {
  name: 'মোমবাতি',
  barcode: '5107598964429',
  serialNumber: 1714571987654,
  category: 'নিত্য প্রয়োজনীয়'
};

console.log('Match Name:', isPhoneticMatch(p.name, searchTerm));
console.log('Match Category:', isPhoneticMatch(p.category, searchTerm));
