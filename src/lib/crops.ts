// Справочник культур для движка севооборота (Кыргызстан).
// ВНИМАНИЕ: значения ОЦЕНОЧНЫЕ для прототипа — уточнить у агрономов / Нацстаткома / ФАО.
export type Crop = {
  family: string;      // ботаническое семейство (повтор подряд → болезни)
  water: number;       // потребность в воде за сезон, мм (1 мм = 10 м³/га)
  yield: number;       // урожайность, т/га (для трав — сено)
  price: number;       // цена, сом/кг
  cost: number;        // затраты, сом/га
  soil: number;        // влияние на почву −3…+3
  tsum: number;        // мин. средняя температура июня–августа, °C
  drought: number;     // засухоустойчивость 0…1
  row: boolean;        // пропашная (эрозия на склонах)
  legume: boolean;     // бобовая (азот)
  perennial: boolean;  // многолетняя (блок 3 года)
  gap: number;         // мин. интервал между посевами, лет
};

export const CROPS: Record<string, Crop> = {
  "Пшеница":           { family: "злаковые",   water: 450, yield: 2.5, price: 22,  cost: 45000,  soil: 0,  tsum: 14, drought: 0.6, row: false, legume: false, perennial: false, gap: 1 },
  "Ячмень":            { family: "злаковые",   water: 400, yield: 2.2, price: 20,  cost: 40000,  soil: 0,  tsum: 12, drought: 0.7, row: false, legume: false, perennial: false, gap: 1 },
  "Кукуруза на зерно": { family: "злаковые",   water: 650, yield: 6.5, price: 22,  cost: 90000,  soil: -2, tsum: 19, drought: 0.3, row: true,  legume: false, perennial: false, gap: 1 },
  "Люцерна":           { family: "бобовые",    water: 900, yield: 8,   price: 8,   cost: 40000,  soil: 3,  tsum: 14, drought: 0.5, row: false, legume: true,  perennial: true,  gap: 4 },
  "Эспарцет":          { family: "бобовые",    water: 450, yield: 4,   price: 7,   cost: 25000,  soil: 3,  tsum: 12, drought: 0.8, row: false, legume: true,  perennial: true,  gap: 4 },
  "Фасоль":            { family: "бобовые",    water: 450, yield: 1.8, price: 90,  cost: 80000,  soil: 2,  tsum: 17, drought: 0.4, row: true,  legume: true,  perennial: false, gap: 3 },
  "Соя":               { family: "бобовые",    water: 550, yield: 2.0, price: 40,  cost: 60000,  soil: 2,  tsum: 19, drought: 0.4, row: true,  legume: true,  perennial: false, gap: 3 },
  "Нут":               { family: "бобовые",    water: 300, yield: 1.2, price: 60,  cost: 40000,  soil: 2,  tsum: 17, drought: 0.9, row: false, legume: true,  perennial: false, gap: 3 },
  "Картофель":         { family: "паслёновые", water: 550, yield: 20,  price: 18,  cost: 250000, soil: -2, tsum: 14, drought: 0.2, row: true,  legume: false, perennial: false, gap: 3 },
  "Свекла сахарная":   { family: "маревые",    water: 700, yield: 40,  price: 3.5, cost: 120000, soil: -2, tsum: 16, drought: 0.3, row: true,  legume: false, perennial: false, gap: 3 },
  "Подсолнечник":      { family: "астровые",   water: 500, yield: 1.5, price: 45,  cost: 45000,  soil: -1, tsum: 18, drought: 0.7, row: true,  legume: false, perennial: false, gap: 4 },
  "Хлопок":            { family: "мальвовые",  water: 750, yield: 2.5, price: 50,  cost: 100000, soil: -1, tsum: 24, drought: 0.5, row: true,  legume: false, perennial: false, gap: 2 },
};

export const CROP_ALIAS: Record<string, string | null> = {
  "Свекла": "Свекла сахарная", "Кукуруза на силос": "Кукуруза на зерно", "Клубника": null, "Другое": null,
};

// Коды культур в тайлах fields.pmtiles (порядок = build_web_data.py CODES)
export const CROP_CODES = ["", "Пшеница", "Ячмень", "Кукуруза на зерно", "Люцерна", "Эспарцет", "Фасоль", "Соя", "Нут",
  "Картофель", "Свекла сахарная", "Подсолнечник", "Хлопок", "Другое"];

export const CROP_COLORS: Record<string, string> = {
  "": "#9e9e9e", "Пшеница": "#fbc02d", "Ячмень": "#ffe082", "Кукуруза на зерно": "#ff9800", "Люцерна": "#43a047",
  "Эспарцет": "#81c784", "Фасоль": "#8d6e63", "Соя": "#a1887f", "Нут": "#d7ccc8", "Картофель": "#ab47bc",
  "Свекла сахарная": "#e91e63", "Подсолнечник": "#ffeb3b", "Хлопок": "#ffffff", "Другое": "#26c6da",
};
