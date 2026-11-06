// Курс «ПТЭ» (2.23.0): план всего документа — модули → темы → уроки.
// Документ: Правила технической эксплуатации железных дорог РФ, приказ Минтранса России от 23.06.2022 № 250
// (с приложениями: № 1 — Инструкция по сигнализации, № 2 — Инструкция по организации движения поездов и маневровой работы).
//
// Правила курса (обязательны для каждого, кто добавляет уроки):
// 1. id модулей, тем, уроков и вопросов НИКОГДА не меняются и не используются повторно: по ним хранится прогресс людей.
//    Новые — следующими номерами (pte-m19, pte-t86, pte-l002, pte-q0006 …), даже если встают между старыми.
// 2. Вопросы — свои, только по тексту документа. У каждого вопроса — пункт и дословная цитата (src.ref, src.quote);
//    автотест сверяет цитату с текстом приказа (tests/fixtures/pte-250-2022.txt.gz). Чужие базы и билеты (в том числе ДСП) не берём.
// 3. Каждый вопрос проверяет живой человек с ЖД (поле checked: кто и когда). Урок, где есть непроверенный вопрос, —
//    только с draft: true: людям он не показывается.
// 4. Урок — на 1–2 минуты: 5–7 вопросов. Порядок уроков в теме и тем в модуле — порядок прохождения.
// 5. Вышла новая редакция ПТЭ — поменять ed курса; автотест покажет все вопросы со старой отметкой ed:
//    их сверяют с новым текстом (и обновляют tests/fixtures), затем ставят новую отметку и новую проверку.
// Темы без уроков — план: в «Все модули» видны как «скоро», на дороге — как «путь строится».

const q01 = () => import('./pte-q01.js');
const q02 = () => import('./pte-q02.js');
const q03 = () => import('./pte-q03.js');
const q04 = () => import('./pte-q04.js');
const q05 = () => import('./pte-q05.js');
const q06 = () => import('./pte-q06.js');
const q07 = () => import('./pte-q07.js');
const q08 = () => import('./pte-q08.js');
const q09 = () => import('./pte-q09.js');
const q10 = () => import('./pte-q10.js');
const q11 = () => import('./pte-q11.js');
const q12 = () => import('./pte-q12.js');
const q13 = () => import('./pte-q13.js');
const q14 = () => import('./pte-q14.js');
const q15 = () => import('./pte-q15.js');
const q16 = () => import('./pte-q16.js');
const q17 = () => import('./pte-q17.js');

export const PTE = {
  id: 'pte',
  title: 'ПТЭ',
  name: 'Правила технической эксплуатации',
  full: 'Правила технической эксплуатации железных дорог Российской Федерации',
  edition: 'приказ Минтранса России от 23.06.2022 № 250, действует с 01.08.2022',
  ed: '250-2022', // отметка редакции: у каждого вопроса такая же
  modules: [
    { id: 'pte-m01', title: 'Общие положения', src: 'ПТЭ, разделы I–II', bank: q01, topics: [
      { id: 'pte-t01', title: 'Что такое ПТЭ', src: 'Приказ № 250; ПТЭ, п. 1–5', lessons: [
        { id: 'pte-l001', draft: true, q: ['pte-q0001', 'pte-q0002', 'pte-q0006', 'pte-q0003', 'pte-q0004', 'pte-q0005'] },
      ] },
      { id: 'pte-t02', title: 'Обязанности работников', src: 'ПТЭ, п. 6–8', lessons: [
        { id: 'pte-l002', draft: true, q: ['pte-q0007', 'pte-q0008', 'pte-q0009', 'pte-q0010', 'pte-q0011'] },
      ] },
      { id: 'pte-t03', title: 'Допуск к работе', src: 'ПТЭ, п. 9–11', lessons: [
        { id: 'pte-l003', draft: true, q: ['pte-q0012', 'pte-q0013', 'pte-q0014', 'pte-q0015', 'pte-q0016', 'pte-q0017', 'pte-q0018'] },
      ] },
    ] },
    { id: 'pte-m02', title: 'Сооружения и устройства', src: 'ПТЭ, разделы III–IV', bank: q02, topics: [
      { id: 'pte-t04', title: 'Габариты и междупутья', src: 'ПТЭ, п. 12–17', lessons: [
        { id: 'pte-l004', draft: true, q: ['pte-q0019', 'pte-q0020', 'pte-q0021', 'pte-q0022', 'pte-q0023'] },
        { id: 'pte-l005', draft: true, q: ['pte-q0024', 'pte-q0025', 'pte-q0026', 'pte-q0027', 'pte-q0028'] },
      ] },
      { id: 'pte-t05', title: 'Платформы и грузы у пути', src: 'ПТЭ, п. 18–22', lessons: [] },
      { id: 'pte-t06', title: 'Оснащение станций', src: 'ПТЭ, п. 23–33', lessons: [] },
      { id: 'pte-t07', title: 'Переходы, время, АСУ', src: 'ПТЭ, п. 34–40', lessons: [
        { id: 'pte-l006', draft: true, q: ['pte-q0029', 'pte-q0030', 'pte-q0031', 'pte-q0032', 'pte-q0033'] },
        { id: 'pte-l007', draft: true, q: ['pte-q0034', 'pte-q0035', 'pte-q0036', 'pte-q0037', 'pte-q0038'] },
      ] },
      { id: 'pte-t08', title: 'Обслуживание и осмотры', src: 'ПТЭ, п. 41–44', lessons: [
        { id: 'pte-l008', draft: true, q: ['pte-q0039', 'pte-q0040', 'pte-q0041', 'pte-q0042', 'pte-q0043'] },
      ] },
    ] },
    { id: 'pte-m03', title: 'Путевое хозяйство', src: 'ПТЭ, раздел V', bank: q03, topics: [
      { id: 'pte-t09', title: 'Колея и земляное полотно', src: 'ПТЭ, п. 45–50', lessons: [
        { id: 'pte-l009', draft: true, q: ['pte-q0044', 'pte-q0045', 'pte-q0046', 'pte-q0047', 'pte-q0048', 'pte-q0049'] },
        { id: 'pte-l010', draft: true, q: ['pte-q0050', 'pte-q0051', 'pte-q0052', 'pte-q0053', 'pte-q0054', 'pte-q0055'] },
        { id: 'pte-l011', draft: true, q: ['pte-q0056', 'pte-q0057', 'pte-q0058', 'pte-q0059', 'pte-q0060', 'pte-q0061'] },
      ] },
      { id: 'pte-t10', title: 'Рельсы и стрелочные переводы', src: 'ПТЭ, п. 51–57', lessons: [
        { id: 'pte-l012', draft: true, q: ['pte-q0062', 'pte-q0063', 'pte-q0064', 'pte-q0065', 'pte-q0066', 'pte-q0067'] },
      ] },
      { id: 'pte-t11', title: 'Пересечения и переезды', src: 'ПТЭ, п. 58–63', lessons: [] },
      { id: 'pte-t12', title: 'Верхнее строение пути', src: 'ПТЭ, п. 64–70', lessons: [] },
    ] },
    { id: 'pte-m04', title: 'Автоматика и телемеханика', src: 'ПТЭ, раздел VI', bank: q04, topics: [
      { id: 'pte-t13', title: 'Светофоры и видимость огней', src: 'ПТЭ, п. 71–80', lessons: [] },
      { id: 'pte-t14', title: 'Системы автоматики', src: 'ПТЭ, п. 81–90', lessons: [
        { id: 'pte-l013', draft: true, q: ['pte-q0068', 'pte-q0069', 'pte-q0070', 'pte-q0071', 'pte-q0072'] },
      ] },
      { id: 'pte-t15', title: 'Стрелки и замки', src: 'ПТЭ, п. 91–94', lessons: [
        { id: 'pte-l014', draft: true, q: ['pte-q0073', 'pte-q0074', 'pte-q0075', 'pte-q0076', 'pte-q0077'] },
      ] },
      { id: 'pte-t16', title: 'Обслуживание устройств СЦБ', src: 'ПТЭ, п. 95–101', lessons: [
        { id: 'pte-l015', draft: true, q: ['pte-q0078', 'pte-q0079', 'pte-q0080', 'pte-q0081', 'pte-q0082'] },
      ] },
    ] },
    { id: 'pte-m05', title: 'Связь и электроснабжение', src: 'ПТЭ, разделы VII–VIII', bank: q05, topics: [
      { id: 'pte-t17', title: 'Поездная связь и радиосвязь', src: 'ПТЭ, п. 102–114', lessons: [
        { id: 'pte-l016', draft: true, q: ['pte-q0083', 'pte-q0084', 'pte-q0085', 'pte-q0086', 'pte-q0087'] },
      ] },
      { id: 'pte-t18', title: 'Электроснабжение', src: 'ПТЭ, п. 115–120', lessons: [
        { id: 'pte-l017', draft: true, q: ['pte-q0088', 'pte-q0089', 'pte-q0090', 'pte-q0091', 'pte-q0092'] },
        { id: 'pte-l018', draft: true, q: ['pte-q0093', 'pte-q0094', 'pte-q0095', 'pte-q0096', 'pte-q0097'] },
      ] },
      { id: 'pte-t19', title: 'Контактная сеть', src: 'ПТЭ, п. 121–128', lessons: [
        { id: 'pte-l019', draft: true, q: ['pte-q0098', 'pte-q0099', 'pte-q0100', 'pte-q0101', 'pte-q0102', 'pte-q0103', 'pte-q0104'] },
        { id: 'pte-l020', draft: true, q: ['pte-q0105', 'pte-q0106', 'pte-q0107', 'pte-q0108', 'pte-q0109', 'pte-q0110', 'pte-q0111'] },
        { id: 'pte-l021', draft: true, q: ['pte-q0112', 'pte-q0113', 'pte-q0114', 'pte-q0115', 'pte-q0116', 'pte-q0117', 'pte-q0118'] },
      ] },
    ] },
    { id: 'pte-m06', title: 'Подвижной состав', src: 'ПТЭ, раздел IX', bank: q06, topics: [
      { id: 'pte-t20', title: 'Допуск подвижного состава', src: 'ПТЭ, п. 129–137', lessons: [
        { id: 'pte-l022', draft: true, q: ['pte-q0119', 'pte-q0120', 'pte-q0121', 'pte-q0122', 'pte-q0123', 'pte-q0124', 'pte-q0125'] },
        { id: 'pte-l023', draft: true, q: ['pte-q0126', 'pte-q0127', 'pte-q0128', 'pte-q0129', 'pte-q0130', 'pte-q0131', 'pte-q0132'] },
        { id: 'pte-l024', draft: true, q: ['pte-q0133', 'pte-q0134', 'pte-q0135', 'pte-q0136', 'pte-q0137', 'pte-q0138', 'pte-q0139'] },
      ] },
      { id: 'pte-t21', title: 'Что нельзя ставить в поезд', src: 'ПТЭ, п. 138–146', lessons: [
        { id: 'pte-l025', draft: true, q: ['pte-q0140', 'pte-q0141', 'pte-q0142', 'pte-q0143', 'pte-q0144', 'pte-q0145'] },
        { id: 'pte-l026', draft: true, q: ['pte-q0146', 'pte-q0147', 'pte-q0148', 'pte-q0149', 'pte-q0150', 'pte-q0151'] },
        { id: 'pte-l027', draft: true, q: ['pte-q0152', 'pte-q0153', 'pte-q0154', 'pte-q0155', 'pte-q0156', 'pte-q0157'] },
        { id: 'pte-l028', draft: true, q: ['pte-q0158', 'pte-q0159', 'pte-q0160', 'pte-q0161', 'pte-q0162', 'pte-q0163'] },
        { id: 'pte-l029', draft: true, q: ['pte-q0164', 'pte-q0165', 'pte-q0166', 'pte-q0167', 'pte-q0168'] },
      ] },
      { id: 'pte-t22', title: 'Колёсные пары', src: 'ПТЭ, п. 147–154', lessons: [
        { id: 'pte-l030', draft: true, q: ['pte-q0169', 'pte-q0170', 'pte-q0171', 'pte-q0172', 'pte-q0173', 'pte-q0174', 'pte-q0175'] },
        { id: 'pte-l031', draft: true, q: ['pte-q0176', 'pte-q0177', 'pte-q0178', 'pte-q0179', 'pte-q0180', 'pte-q0181'] },
        { id: 'pte-l032', draft: true, q: ['pte-q0182', 'pte-q0183', 'pte-q0184', 'pte-q0185', 'pte-q0186', 'pte-q0187'] },
        { id: 'pte-l033', draft: true, q: ['pte-q0188', 'pte-q0189', 'pte-q0190', 'pte-q0191', 'pte-q0192', 'pte-q0193'] },
      ] },
      { id: 'pte-t23', title: 'Ползуны и выщербины в пути', src: 'ПТЭ, п. 155–156', lessons: [
        { id: 'pte-l034', draft: true, q: ['pte-q0194', 'pte-q0195', 'pte-q0196', 'pte-q0197', 'pte-q0198', 'pte-q0199'] },
        { id: 'pte-l035', draft: true, q: ['pte-q0200', 'pte-q0201', 'pte-q0202', 'pte-q0203', 'pte-q0204'] },
      ] },
      { id: 'pte-t24', title: 'Автосцепка', src: 'ПТЭ, п. 157–159', lessons: [
        { id: 'pte-l036', draft: true, q: ['pte-q0205', 'pte-q0206', 'pte-q0207', 'pte-q0208', 'pte-q0209', 'pte-q0210'] },
        { id: 'pte-l037', draft: true, q: ['pte-q0211', 'pte-q0212', 'pte-q0213', 'pte-q0214', 'pte-q0215'] },
      ] },
      { id: 'pte-t25', title: 'Оснащение локомотива', src: 'ПТЭ, п. 160–162', lessons: [
        { id: 'pte-l038', draft: true, q: ['pte-q0216', 'pte-q0217', 'pte-q0218', 'pte-q0219', 'pte-q0220'] },
      ] },
      { id: 'pte-t26', title: 'Обслуживание вагонов и депо', src: 'ПТЭ, п. 163–168', lessons: [
        { id: 'pte-l039', draft: true, q: ['pte-q0221', 'pte-q0222', 'pte-q0223', 'pte-q0224', 'pte-q0225'] },
      ] },
    ] },
    { id: 'pte-m07', title: 'Сигналы и светофоры', src: 'Инструкция по сигнализации, главы I–III', bank: q07, topics: [
      { id: 'pte-t27', title: 'Виды сигналов', src: 'ИСИ, п. 1–5', lessons: [
        { id: 'pte-l040', draft: true, q: ['pte-q0226', 'pte-q0227', 'pte-q0228', 'pte-q0229', 'pte-q0230'] },
      ] },
      { id: 'pte-t28', title: 'Типы светофоров', src: 'ИСИ, п. 6–15', lessons: [
        { id: 'pte-l041', draft: true, q: ['pte-q0231', 'pte-q0232', 'pte-q0233', 'pte-q0234', 'pte-q0235', 'pte-q0236'] },
        { id: 'pte-l042', draft: true, q: ['pte-q0237', 'pte-q0238', 'pte-q0239', 'pte-q0240', 'pte-q0241'] },
        { id: 'pte-l043', draft: true, q: ['pte-q0242', 'pte-q0243', 'pte-q0244', 'pte-q0245', 'pte-q0246'] },
      ] },
      { id: 'pte-t29', title: 'Входные светофоры', src: 'ИСИ, п. 16–18', lessons: [
        { id: 'pte-l044', draft: true, q: ['pte-q0247', 'pte-q0248', 'pte-q0249', 'pte-q0250', 'pte-q0251'] },
        { id: 'pte-l045', draft: true, q: ['pte-q0252', 'pte-q0253', 'pte-q0254', 'pte-q0255', 'pte-q0256'] },
      ] },
      { id: 'pte-t30', title: 'Выходные и маршрутные', src: 'ИСИ, п. 19–25', lessons: [
        { id: 'pte-l046', draft: true, q: ['pte-q0257', 'pte-q0258', 'pte-q0259', 'pte-q0260', 'pte-q0261', 'pte-q0262'] },
      ] },
      { id: 'pte-t31', title: 'Проходные светофоры', src: 'ИСИ, п. 26–31', lessons: [
        { id: 'pte-l047', draft: true, q: ['pte-q0263', 'pte-q0264', 'pte-q0265', 'pte-q0266', 'pte-q0267'] },
      ] },
      { id: 'pte-t32', title: 'Заградительные и другие', src: 'ИСИ, п. 32–39', lessons: [
        { id: 'pte-l048', draft: true, q: ['pte-q0268', 'pte-q0269', 'pte-q0270', 'pte-q0271', 'pte-q0272', 'pte-q0273', 'pte-q0274'] },
      ] },
    ] },
    { id: 'pte-m08', title: 'Сигналы ограждения', src: 'Инструкция по сигнализации, глава IV', bank: q08, topics: [
      { id: 'pte-t33', title: 'Сигналы ограждения', src: 'ИСИ, п. 40–43', lessons: [
        { id: 'pte-l049', draft: true, q: ['pte-q0275', 'pte-q0276', 'pte-q0277', 'pte-q0278', 'pte-q0279'] },
        { id: 'pte-l050', draft: true, q: ['pte-q0280', 'pte-q0281', 'pte-q0282', 'pte-q0283', 'pte-q0284'] },
      ] },
      { id: 'pte-t34', title: 'Ограждение препятствий', src: 'ИСИ, п. 44–50', lessons: [] },
      { id: 'pte-t35', title: 'Ограждение на станции', src: 'ИСИ, п. 51–53', lessons: [] },
      { id: 'pte-t36', title: 'Остановка поезда на перегоне', src: 'ИСИ, п. 54–58', lessons: [] },
    ] },
    { id: 'pte-m09', title: 'Ручные сигналы и знаки', src: 'Инструкция по сигнализации, главы V–VI', bank: q09, topics: [
      { id: 'pte-t37', title: 'Ручные сигналы', src: 'ИСИ, п. 59–66', lessons: [
        { id: 'pte-l051', draft: true, q: ['pte-q0285', 'pte-q0286', 'pte-q0287', 'pte-q0288', 'pte-q0289'] },
        { id: 'pte-l052', draft: true, q: ['pte-q0290', 'pte-q0291', 'pte-q0292', 'pte-q0293', 'pte-q0294'] },
      ] },
      { id: 'pte-t38', title: 'Сигнальные указатели', src: 'ИСИ, п. 67–72', lessons: [] },
      { id: 'pte-t39', title: 'Сигнальные знаки', src: 'ИСИ, п. 73–81', lessons: [] },
      { id: 'pte-t40', title: 'Предупредительные знаки', src: 'ИСИ, п. 82–87', lessons: [
        { id: 'pte-l053', draft: true, q: ['pte-q0295', 'pte-q0296', 'pte-q0297', 'pte-q0298', 'pte-q0299'] },
      ] },
    ] },
    { id: 'pte-m10', title: 'Манёвры, поезда и звуки', src: 'Инструкция по сигнализации, главы VII–XI', bank: q10, topics: [
      { id: 'pte-t41', title: 'Сигналы при манёврах', src: 'ИСИ, п. 88–92', lessons: [
        { id: 'pte-l054', draft: true, q: ['pte-q0300', 'pte-q0301', 'pte-q0302', 'pte-q0303', 'pte-q0304'] },
        { id: 'pte-l055', draft: true, q: ['pte-q0305', 'pte-q0306', 'pte-q0307', 'pte-q0308', 'pte-q0309'] },
      ] },
      { id: 'pte-t42', title: 'Обозначение поездов', src: 'ИСИ, п. 93–103', lessons: [
        { id: 'pte-l056', draft: true, q: ['pte-q0310', 'pte-q0311', 'pte-q0312', 'pte-q0313', 'pte-q0314'] },
        { id: 'pte-l057', draft: true, q: ['pte-q0315', 'pte-q0316', 'pte-q0317', 'pte-q0318', 'pte-q0319'] },
      ] },
      { id: 'pte-t43', title: 'Звуковые сигналы', src: 'ИСИ, п. 104–109', lessons: [
        { id: 'pte-l058', draft: true, q: ['pte-q0320', 'pte-q0321', 'pte-q0322', 'pte-q0323', 'pte-q0324'] },
        { id: 'pte-l059', draft: true, q: ['pte-q0325', 'pte-q0326', 'pte-q0327', 'pte-q0328', 'pte-q0329'] },
      ] },
      { id: 'pte-t44', title: 'Сигналы тревоги', src: 'ИСИ, п. 110–117', lessons: [
        { id: 'pte-l060', draft: true, q: ['pte-q0330', 'pte-q0331', 'pte-q0332', 'pte-q0333', 'pte-q0334', 'pte-q0335'] },
      ] },
      { id: 'pte-t45', title: 'Семафоры', src: 'ИСИ, п. 118–128', lessons: [
        { id: 'pte-l061', draft: true, q: ['pte-q0336', 'pte-q0337', 'pte-q0338', 'pte-q0339', 'pte-q0340', 'pte-q0341'] },
      ] },
    ] },
    { id: 'pte-m11', title: 'Движение поездов', src: 'Инструкция по движению поездов, глава I', bank: q11, topics: [
      { id: 'pte-t46', title: 'График и номера поездов', src: 'ИДП, п. 1–6', lessons: [
        { id: 'pte-l062', draft: true, q: ['pte-q0342', 'pte-q0343', 'pte-q0344', 'pte-q0345', 'pte-q0346', 'pte-q0347', 'pte-q0348'] },
      ] },
      { id: 'pte-t47', title: 'Раздельные пункты и пути', src: 'ИДП, п. 7–13', lessons: [
        { id: 'pte-l063', draft: true, q: ['pte-q0349', 'pte-q0350', 'pte-q0351', 'pte-q0352', 'pte-q0353'] },
      ] },
      { id: 'pte-t48', title: 'Стрелки и посты', src: 'ИДП, п. 14–21', lessons: [] },
      { id: 'pte-t49', title: 'Формирование поездов', src: 'ИДП, п. 22–31', lessons: [
        { id: 'pte-l064', draft: true, q: ['pte-q0354', 'pte-q0355', 'pte-q0356', 'pte-q0357', 'pte-q0358'] },
      ] },
      { id: 'pte-t50', title: 'Автосцепка и тормоза', src: 'ИДП, п. 32–39', lessons: [
        { id: 'pte-l065', draft: true, q: ['pte-q0359', 'pte-q0360', 'pte-q0361', 'pte-q0362', 'pte-q0363', 'pte-q0364'] },
        { id: 'pte-l066', draft: true, q: ['pte-q0365', 'pte-q0366', 'pte-q0367', 'pte-q0368', 'pte-q0369', 'pte-q0370'] },
      ] },
      { id: 'pte-t51', title: 'Локомотивы в поезде', src: 'ИДП, п. 40–42', lessons: [] },
      { id: 'pte-t52', title: 'Дежурный по станции', src: 'ИДП, п. 43–50', lessons: [
        { id: 'pte-l067', draft: true, q: ['pte-q0371', 'pte-q0372', 'pte-q0373', 'pte-q0374', 'pte-q0375', 'pte-q0376'] },
      ] },
      { id: 'pte-t53', title: 'Системы и скорости', src: 'ИДП, п. 51–57', lessons: [] },
      { id: 'pte-t54', title: 'Закрытие перегонов', src: 'ИДП, п. 58–61', lessons: [
        { id: 'pte-l068', draft: true, q: ['pte-q0377', 'pte-q0378', 'pte-q0379', 'pte-q0380', 'pte-q0381'] },
      ] },
      { id: 'pte-t55', title: 'Обязанности машиниста', src: 'ИДП, п. 62–68', lessons: [
        { id: 'pte-l069', draft: true, q: ['pte-q0382', 'pte-q0383', 'pte-q0384', 'pte-q0385', 'pte-q0386', 'pte-q0387'] },
        { id: 'pte-l070', draft: true, q: ['pte-q0388', 'pte-q0389', 'pte-q0390', 'pte-q0391', 'pte-q0392'] },
      ] },
    ] },
    { id: 'pte-m12', title: 'Интервальное регулирование', src: 'Инструкция по движению поездов, приложения 1–7', bank: q12, topics: [
      { id: 'pte-t56', title: 'Автоблокировка', src: 'ИДП, приложение 1', lessons: [
        { id: 'pte-l071', draft: true, q: ['pte-q0393', 'pte-q0394', 'pte-q0395', 'pte-q0396', 'pte-q0397', 'pte-q0398', 'pte-q0399'] },
        { id: 'pte-l072', draft: true, q: ['pte-q0400', 'pte-q0401', 'pte-q0402', 'pte-q0403', 'pte-q0404', 'pte-q0405', 'pte-q0406'] },
      ] },
      { id: 'pte-t57', title: 'АЛС без проходных светофоров', src: 'ИДП, приложение 2', lessons: [
        { id: 'pte-l073', draft: true, q: ['pte-q0407', 'pte-q0408', 'pte-q0409', 'pte-q0410', 'pte-q0411', 'pte-q0412'] },
      ] },
      { id: 'pte-t58', title: 'Полуавтоматическая блокировка', src: 'ИДП, приложение 3', lessons: [
        { id: 'pte-l074', draft: true, q: ['pte-q0413', 'pte-q0414', 'pte-q0415', 'pte-q0416', 'pte-q0417'] },
        { id: 'pte-l075', draft: true, q: ['pte-q0418', 'pte-q0419', 'pte-q0420', 'pte-q0421', 'pte-q0422'] },
      ] },
      { id: 'pte-t59', title: 'Электрожезловая система', src: 'ИДП, приложение 4', lessons: [
        { id: 'pte-l076', draft: true, q: ['pte-q0423', 'pte-q0424', 'pte-q0425', 'pte-q0426', 'pte-q0427'] },
        { id: 'pte-l077', draft: true, q: ['pte-q0428', 'pte-q0429', 'pte-q0430', 'pte-q0431', 'pte-q0432'] },
      ] },
      { id: 'pte-t60', title: 'Телефонные средства связи', src: 'ИДП, приложение 5', lessons: [
        { id: 'pte-l078', draft: true, q: ['pte-q0433', 'pte-q0434', 'pte-q0435', 'pte-q0436', 'pte-q0437'] },
        { id: 'pte-l079', draft: true, q: ['pte-q0438', 'pte-q0439', 'pte-q0440', 'pte-q0441', 'pte-q0442'] },
      ] },
      { id: 'pte-t61', title: 'Разграничение временем', src: 'ИДП, приложение 6', lessons: [] },
      { id: 'pte-t62', title: 'Перерыв всех систем и связи', src: 'ИДП, приложение 7', lessons: [
        { id: 'pte-l080', draft: true, q: ['pte-q0443', 'pte-q0444', 'pte-q0445', 'pte-q0446', 'pte-q0447'] },
        { id: 'pte-l081', draft: true, q: ['pte-q0448', 'pte-q0449', 'pte-q0450', 'pte-q0451', 'pte-q0452'] },
      ] },
    ] },
    { id: 'pte-m13', title: 'Нестандартные ситуации', src: 'Инструкция по движению поездов, приложение 8', bank: q13, topics: [
      { id: 'pte-t63', title: 'Восстановительные поезда', src: 'ИДП, прил. 8, п. 1–14', lessons: [
        { id: 'pte-l082', draft: true, q: ['pte-q0453', 'pte-q0454', 'pte-q0455', 'pte-q0456', 'pte-q0457', 'pte-q0458'] },
        { id: 'pte-l083', draft: true, q: ['pte-q0459', 'pte-q0460', 'pte-q0461', 'pte-q0462', 'pte-q0463', 'pte-q0464'] },
        { id: 'pte-l084', draft: true, q: ['pte-q0465', 'pte-q0466', 'pte-q0467', 'pte-q0468', 'pte-q0469', 'pte-q0470'] },
      ] },
      { id: 'pte-t64', title: 'Возвращение на станцию', src: 'ИДП, прил. 8, п. 15–18', lessons: [
        { id: 'pte-l085', draft: true, q: ['pte-q0471', 'pte-q0472', 'pte-q0473', 'pte-q0474', 'pte-q0475'] },
      ] },
      { id: 'pte-t65', title: 'Помощь остановившемуся поезду', src: 'ИДП, прил. 8, п. 19–26', lessons: [] },
    ] },
    { id: 'pte-m14', title: 'Приём и отправление', src: 'Инструкция по движению поездов, приложения 9 и 14', bank: q14, topics: [
      { id: 'pte-t66', title: 'Общий порядок', src: 'ИДП, прил. 9, п. 1–16', lessons: [
        { id: 'pte-l086', draft: true, q: ['pte-q0476', 'pte-q0477', 'pte-q0478', 'pte-q0479', 'pte-q0480'] },
      ] },
      { id: 'pte-t67', title: 'Приём поездов', src: 'ИДП, прил. 9, п. 17–34', lessons: [
        { id: 'pte-l087', draft: true, q: ['pte-q0481', 'pte-q0482', 'pte-q0483', 'pte-q0484', 'pte-q0485'] },
      ] },
      { id: 'pte-t68', title: 'Отправление поездов', src: 'ИДП, прил. 9, п. 35–54', lessons: [
        { id: 'pte-l088', draft: true, q: ['pte-q0486', 'pte-q0487', 'pte-q0488', 'pte-q0489', 'pte-q0490'] },
        { id: 'pte-l089', draft: true, q: ['pte-q0491', 'pte-q0492', 'pte-q0493', 'pte-q0494', 'pte-q0495'] },
      ] },
      { id: 'pte-t69', title: 'При запрещающем входном', src: 'ИДП, прил. 9, п. 55–60', lessons: [
        { id: 'pte-l090', draft: true, q: ['pte-q0496', 'pte-q0497', 'pte-q0498', 'pte-q0499', 'pte-q0500'] },
      ] },
      { id: 'pte-t70', title: 'Неисправности СЦБ на станции', src: 'ИДП, приложение 14', lessons: [
        { id: 'pte-l091', draft: true, q: ['pte-q0501', 'pte-q0502', 'pte-q0503', 'pte-q0504', 'pte-q0505'] },
        { id: 'pte-l092', draft: true, q: ['pte-q0506', 'pte-q0507', 'pte-q0508', 'pte-q0509', 'pte-q0510'] },
      ] },
    ] },
    { id: 'pte-m15', title: 'Маневровая работа', src: 'Инструкция по движению поездов, приложения 10–12', bank: q15, topics: [
      { id: 'pte-t71', title: 'Общие положения манёвров', src: 'ИДП, прил. 10, п. 1–17', lessons: [
        { id: 'pte-l093', draft: true, q: ['pte-q0511', 'pte-q0512', 'pte-q0513', 'pte-q0514', 'pte-q0515', 'pte-q0516', 'pte-q0517'] },
        { id: 'pte-l094', draft: true, q: ['pte-q0518', 'pte-q0519', 'pte-q0520', 'pte-q0521', 'pte-q0522', 'pte-q0523', 'pte-q0524'] },
        { id: 'pte-l095', draft: true, q: ['pte-q0525', 'pte-q0526', 'pte-q0527', 'pte-q0528', 'pte-q0529', 'pte-q0530'] },
      ] },
      { id: 'pte-t72', title: 'Руководитель и участники', src: 'ИДП, прил. 10, п. 18–36', lessons: [
        { id: 'pte-l096', draft: true, q: ['pte-q0531', 'pte-q0532', 'pte-q0533', 'pte-q0534', 'pte-q0535', 'pte-q0536'] },
      ] },
      { id: 'pte-t73', title: 'Скорости при манёврах', src: 'ИДП, прил. 10, п. 37–41', lessons: [
        { id: 'pte-l097', draft: true, q: ['pte-q0537', 'pte-q0538', 'pte-q0539', 'pte-q0540', 'pte-q0541'] },
        { id: 'pte-l098', draft: true, q: ['pte-q0542', 'pte-q0543', 'pte-q0544', 'pte-q0545', 'pte-q0546'] },
      ] },
      { id: 'pte-t74', title: 'Главные пути и горки', src: 'ИДП, прил. 10, п. 42–61', lessons: [
        { id: 'pte-l099', draft: true, q: ['pte-q0547', 'pte-q0548', 'pte-q0549', 'pte-q0550', 'pte-q0551', 'pte-q0552', 'pte-q0553'] },
        { id: 'pte-l100', draft: true, q: ['pte-q0554', 'pte-q0555', 'pte-q0556', 'pte-q0557', 'pte-q0558', 'pte-q0559', 'pte-q0560'] },
      ] },
      { id: 'pte-t75', title: 'Вагоны с взрывчатыми', src: 'ИДП, приложение 11', lessons: [
        { id: 'pte-l101', draft: true, q: ['pte-q0561', 'pte-q0562', 'pte-q0563', 'pte-q0564', 'pte-q0565'] },
        { id: 'pte-l102', draft: true, q: ['pte-q0566', 'pte-q0567', 'pte-q0568', 'pte-q0569', 'pte-q0570'] },
      ] },
      { id: 'pte-t76', title: 'Закрепление составов', src: 'ИДП, приложение 12', lessons: [
        { id: 'pte-l103', draft: true, q: ['pte-q0571', 'pte-q0572', 'pte-q0573', 'pte-q0574', 'pte-q0575', 'pte-q0576'] },
        { id: 'pte-l104', draft: true, q: ['pte-q0577', 'pte-q0578', 'pte-q0579', 'pte-q0580', 'pte-q0581', 'pte-q0582'] },
        { id: 'pte-l105', draft: true, q: ['pte-q0583', 'pte-q0584', 'pte-q0585', 'pte-q0586', 'pte-q0587', 'pte-q0588'] },
        { id: 'pte-l106', draft: true, q: ['pte-q0589', 'pte-q0590', 'pte-q0591', 'pte-q0592', 'pte-q0593', 'pte-q0594'] },
        { id: 'pte-l107', draft: true, q: ['pte-q0595', 'pte-q0596', 'pte-q0597', 'pte-q0598', 'pte-q0599', 'pte-q0600'] },
      ] },
    ] },
    { id: 'pte-m16', title: 'Особые поезда и предупреждения', src: 'Инструкция по движению поездов, приложения 13, 15–18', bank: q16, topics: [
      { id: 'pte-t77', title: 'Хозяйственные поезда', src: 'ИДП, приложение 13', lessons: [
        { id: 'pte-l108', draft: true, q: ['pte-q0601', 'pte-q0602', 'pte-q0603', 'pte-q0604', 'pte-q0605'] },
        { id: 'pte-l109', draft: true, q: ['pte-q0606', 'pte-q0607', 'pte-q0608', 'pte-q0609', 'pte-q0610'] },
      ] },
      { id: 'pte-t78', title: 'Предупреждения', src: 'ИДП, приложение 15', lessons: [
        { id: 'pte-l110', draft: true, q: ['pte-q0611', 'pte-q0612', 'pte-q0613', 'pte-q0614', 'pte-q0615'] },
        { id: 'pte-l111', draft: true, q: ['pte-q0616', 'pte-q0617', 'pte-q0618', 'pte-q0619', 'pte-q0620'] },
      ] },
      { id: 'pte-t79', title: 'Особые грузы', src: 'ИДП, приложение 16', lessons: [
        { id: 'pte-l112', draft: true, q: ['pte-q0621', 'pte-q0622', 'pte-q0623', 'pte-q0624', 'pte-q0625'] },
        { id: 'pte-l113', draft: true, q: ['pte-q0626', 'pte-q0627', 'pte-q0628', 'pte-q0629', 'pte-q0630'] },
      ] },
      { id: 'pte-t80', title: 'СПК и дрезины', src: 'ИДП, приложения 17–18', lessons: [
        { id: 'pte-l114', draft: true, q: ['pte-q0631', 'pte-q0632', 'pte-q0633', 'pte-q0634', 'pte-q0635'] },
        { id: 'pte-l115', draft: true, q: ['pte-q0636', 'pte-q0637', 'pte-q0638', 'pte-q0639', 'pte-q0640'] },
      ] },
    ] },
    { id: 'pte-m17', title: 'Диспетчер и переговоры', src: 'Инструкция по движению поездов, приложения 19–20', bank: q17, topics: [
      { id: 'pte-t81', title: 'Работа диспетчера', src: 'ИДП, приложение 19', lessons: [
        { id: 'pte-l116', draft: true, q: ['pte-q0641', 'pte-q0642', 'pte-q0643', 'pte-q0644', 'pte-q0645'] },
        { id: 'pte-l117', draft: true, q: ['pte-q0646', 'pte-q0647', 'pte-q0648', 'pte-q0649', 'pte-q0650'] },
      ] },
      { id: 'pte-t82', title: 'Регламент переговоров', src: 'ИДП, прил. 20, главы I–IV', lessons: [
        { id: 'pte-l118', draft: true, q: ['pte-q0651', 'pte-q0652', 'pte-q0653', 'pte-q0654', 'pte-q0655', 'pte-q0656', 'pte-q0657'] },
        { id: 'pte-l119', draft: true, q: ['pte-q0658', 'pte-q0659', 'pte-q0660', 'pte-q0661', 'pte-q0662', 'pte-q0663', 'pte-q0664'] },
        { id: 'pte-l120', draft: true, q: ['pte-q0665', 'pte-q0666', 'pte-q0667', 'pte-q0668', 'pte-q0669', 'pte-q0670'] },
      ] },
      { id: 'pte-t83', title: 'Машинист и помощник', src: 'ИДП, прил. 20, глава V', lessons: [] },
    ] },
    { id: 'pte-m18', title: 'ТРА и бланки', src: 'Инструкция по движению поездов, приложения 21–28; ПТЭ, приложение 3', topics: [
      { id: 'pte-t84', title: 'Техническо-распорядительный акт', src: 'ИДП, приложение 21', lessons: [] },
      { id: 'pte-t85', title: 'Бланки и акты', src: 'ИДП, прил. 22–28; ПТЭ, прил. 3', lessons: [] },
    ] },
  ],
};

export const COURSES = [PTE];
export const courseById = (id) => COURSES.find((c) => c.id === id) || null;
