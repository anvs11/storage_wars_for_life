import type { InspectionHint, ItemId, RevealedFind } from './contract';
import type { Stage2AuctionView } from './stage2-contract';

type Condition = 'good' | 'worn' | 'damaged';
type ConditionDetails = readonly [price: number, clue: string];
type CatalogItem = {
  readonly name: string;
} & Readonly<Record<Condition, ConditionDetails>>;

const catalog = {
  bicycle: {
    name: 'Велосипед',
    good: [60, 'Рама ровная, колёса вращаются свободно.'],
    worn: [35, 'Рама потёрта. Если колёса ровные, велосипед ещё можно продать.'],
    damaged: [12, 'Заднее колесо погнуто, цепь заржавела.'],
  },
  tool: {
    name: 'Инструмент из коробки',
    good: [15, 'Комплект полный, рукоятки без трещин.'],
    worn: [10, 'На рукоятках потёртости, комплект выглядит рабочим.'],
    damaged: [3, 'Часть насадок отсутствует, на металле ржавчина.'],
  },
  drill: {
    name: 'Дрель',
    good: [30, 'Патрон вращается ровно, провод цел.'],
    worn: [18, 'Рукоятка потёрта, патрон свободно закрывается.'],
    damaged: [4, 'Вилка срезана, у патрона заметен люфт.'],
  },
  vise: {
    name: 'Тиски',
    good: [26, 'Губки сходятся ровно, ход винта плавный.'],
    worn: [14, 'На губках задиры, винт вращается.'],
    damaged: [3, 'На основании глубокая трещина.'],
  },
  extension: {
    name: 'Удлинитель',
    good: [12, 'Все розетки на месте, изоляция цела.'],
    worn: [7, 'Корпус потёрт, провод без разрывов.'],
    damaged: [2, 'Провод надрезан у корпуса.'],
  },
  level: {
    name: 'Строительный уровень',
    good: [16, 'Профиль ровный, обе колбы целы.'],
    worn: [9, 'На профиле царапины, пузырьки читаются.'],
    damaged: [2, 'Одна колба лопнула.'],
  },
  wrench: {
    name: 'Разводной ключ',
    good: [14, 'Губки ровные, червячный винт работает.'],
    worn: [8, 'На металле налёт, размер регулируется.'],
    damaged: [1, 'Винт заклинило, губки перекошены.'],
  },
  radio: {
    name: 'Радиоприёмник',
    good: [28, 'Антенна цела, крышка батарейного отсека на месте.'],
    worn: [16, 'На корпусе потёртости, антенна выдвигается.'],
    damaged: [2, 'Антенна обломана, в отсеке следы от батареек.'],
  },
  kettle: {
    name: 'Чайник',
    good: [19, 'Шнур и подставка целы, крышка фиксируется.'],
    worn: [11, 'На стенках накипь, кнопка цела.'],
    damaged: [2, 'Ручка треснула, подставка отсутствует.'],
  },
  lamp: {
    name: 'Настольная лампа',
    good: [20, 'Плафон и выключатель целы, стойка держит положение.'],
    worn: [10, 'На плафоне царапины, шарнир держится.'],
    damaged: [1, 'Плафон разбит, стойка не держится.'],
  },
  scales: {
    name: 'Кухонные весы',
    good: [14, 'Кнопки целы, батарейный отсек чист.'],
    worn: [8, 'Площадка в царапинах, экран цел.'],
    damaged: [1, 'Под стеклом экрана видна трещина.'],
  },
  vase: {
    name: 'Керамическая ваза',
    good: [16, 'Горлышко ровное, сколов нет.'],
    worn: [9, 'На донышке потёртости, стенки целы.'],
    damaged: [1, 'Горлышко сколото, на боку трещина.'],
  },
} as const satisfies Record<string, CatalogItem>;

type CatalogId = keyof typeof catalog;

export interface LotFind extends RevealedFind {
  readonly condition: Condition;
  readonly hint: InspectionHint;
}

export interface GarageLot<Scene extends string = Stage2AuctionView['sceneId']> {
  readonly sceneId: Scene;
  readonly openingBid: number;
  readonly bidIncrement: number;
  readonly visibleFinds: readonly LotFind[];
  readonly boxes: readonly {
    readonly id: ItemId;
    readonly name: string;
    readonly contents: readonly LotFind[];
  }[];
  readonly opponents: readonly {
    readonly id: string;
    readonly name: string;
    readonly limit: number;
  }[];
}

const conditions: readonly Condition[] = ['damaged', 'worn', 'good'];

function find(id: CatalogId, condition: Condition): LotFind {
  const item = catalog[id];
  const [salePrice, text] = item[condition];
  const estimate = Math.floor(salePrice / 5) * 5;
  return {
    id,
    name: item.name,
    condition,
    salePrice,
    hint: {
      text,
      estimatedSalePrice: { min: Math.max(0, estimate - 10), max: estimate + 5 },
    },
  };
}

function box(contents: readonly LotFind[]): GarageLot['boxes'][number] {
  return { id: 'box', name: 'Закрытая коробка', contents };
}

export type Rarity = 'common' | 'unusual' | 'rare';
type PriceRange = readonly [min: number, max: number];
interface RepeatCatalogItem {
  readonly name: string;
  readonly rarity: Rarity;
  readonly conditions: Readonly<Record<Condition, { readonly range: PriceRange; readonly clue: string }>>;
}

function repeatItem(
  name: string, rarity: Rarity, ranges: readonly [PriceRange, PriceRange, PriceRange],
  clues: readonly [string, string, string],
): RepeatCatalogItem {
  return {
    name, rarity,
    conditions: {
      damaged: { range: ranges[0], clue: clues[0] },
      worn: { range: ranges[1], clue: clues[1] },
      good: { range: ranges[2], clue: clues[2] },
    },
  };
}

// Диапазон берётся по состоянию и видимой примете, цена продажи выбирается внутри него.
export const repeatCatalog = {
  drill: repeatItem('Дрель', 'common', [[2, 7], [12, 21], [24, 36]], [
    catalog.drill.damaged[1], catalog.drill.worn[1], catalog.drill.good[1],
  ]),
  vise: repeatItem('Тиски', 'common', [[1, 6], [8, 18], [19, 29]], [
    catalog.vise.damaged[1], catalog.vise.worn[1], catalog.vise.good[1],
  ]),
  level: repeatItem('Строительный уровень', 'unusual', [[2, 8], [9, 18], [17, 28]], [
    catalog.level.damaged[1], catalog.level.worn[1], catalog.level.good[1],
  ]),
  wrench: repeatItem('Старый разводной ключ', 'rare', [[8, 16], [19, 32], [32, 49]], [
    'Заклинивший винт и старое клеймо.', 'Клеймо читается, на губках мелкие задиры.', 'Чёткое старое клеймо, механизм цел.',
  ]),
  kettle: repeatItem('Чайник', 'common', [[1, 5], [6, 14], [14, 24]], [
    catalog.kettle.damaged[1], catalog.kettle.worn[1], catalog.kettle.good[1],
  ]),
  lamp: repeatItem('Настольная лампа', 'common', [[1, 7], [7, 16], [16, 29]], [
    catalog.lamp.damaged[1], catalog.lamp.worn[1], catalog.lamp.good[1],
  ]),
  radio: repeatItem('Радиоприёмник', 'unusual', [[3, 10], [11, 22], [21, 34]], [
    catalog.radio.damaged[1], catalog.radio.worn[1], catalog.radio.good[1],
  ]),
  camera: repeatItem('Плёночный фотоаппарат', 'rare', [[8, 18], [19, 33], [35, 56]], [
    'Затвор заедает, на объективе царапины.', 'Затвор работает, корпус потёрт.', 'Оптика чистая, кольца вращаются плавно.',
  ]),
  speaker: repeatItem('Акустическая колонка', 'common', [[4, 13], [14, 30], [30, 48]], [
    'Диффузор порван.', 'Корпус потёрт, подвес цел.', 'Пара динамиков цела, шильдик читается.',
  ]),
  amplifier: repeatItem('Усилитель', 'unusual', [[8, 20], [23, 47], [46, 70]], [
    'Разъёмы выломаны, шнура нет.', 'Регуляторы на месте, на корпусе царапины.', 'Разъёмы целы, ручки вращаются ровно.',
  ]),
  turntable: repeatItem('Проигрыватель', 'rare', [[12, 25], [35, 61], [66, 105]], [
    'Тонарм согнут, крышка треснула.', 'Диск вращается, игла изношена.', 'Тонарм свободен, картридж и крышка целы.',
  ]),
  floorLamp: repeatItem('Напольный светильник', 'common', [[3, 12], [15, 28], [29, 47]], [
    'Плафон разбит, патрон шатается.', 'Скол на плафоне, выключатель цел.', 'Плафон и провод целы, основание устойчиво.',
  ]),
  sewingMachine: repeatItem('Швейная машина', 'unusual', [[9, 22], [24, 45], [44, 68]], [
    'Маховик заклинило.', 'Маховик крутится, коробка с лапками неполная.', 'Механизм движется ровно, комплект на месте.',
  ]),
  trunk: repeatItem('Дорожный сундук', 'rare', [[10, 26], [35, 64], [60, 97]], [
    'Дно отсырело, замок вырван.', 'На углах потёртости, замки на месте.', 'Кожа цела, замки и ключ на месте.',
  ]),
  replica: repeatItem('Керамическая ваза', 'common', [[4, 12], [8, 21], [18, 35]], [
    'По трещине виден литой шов.', 'Ровный шов формы и потёртое печатное клеймо.', 'Под глазурью виден литой шов, клеймо напечатано.',
  ]),
  porcelain: repeatItem('Расписная керамика', 'unusual', [[11, 25], [24, 48], [42, 74]], [
    'Роспись выцвела, по краю сколы.', 'Ручная роспись сохранилась, есть мелкий скол.', 'Роспись нанесена вручную, глазурь цела.',
  ]),
  stampedVase: repeatItem('Керамическая ваза', 'rare', [[19, 39], [45, 75], [74, 130]], [
    'Под глазурью видно клеймо, горлышко треснуло.', 'Чёткое клеймо под глазурью, на горлышке мелкий скол.', 'Чёткое клеймо под глазурью, сколов и швов нет.',
  ]),
  clock: repeatItem('Каминные часы', 'common', [[4, 13], [13, 29], [26, 46]], [
    'Циферблат треснул, механизма не видно.', 'Корпус потёрт, на механизме нет маркировки.', 'Современный механизм в целом старом корпусе.',
  ]),
  bronze: repeatItem('Бронзовый подсвечник', 'unusual', [[12, 28], [24, 49], [42, 77]], [
    'Основание погнуто, на бронзе глубокая вмятина.', 'На бронзе патина, основание ровное.', 'Рисунок отлит чётко, крепления целы.',
  ]),
  signedClock: repeatItem('Каминные часы', 'rare', [[20, 42], [43, 78], [77, 130]], [
    'На механизме клеймо мастера, стекло разбито.', 'Клеймо мастера читается, маятник в комплекте.', 'Серийный номер и подпись мастера, маятник и ключ целы.',
  ]),
} as const satisfies Record<string, RepeatCatalogItem>;

export function createLot(lotNumber: number): GarageLot {
  if (lotNumber === 1) {
    return {
      sceneId: 'tutorial',
      openingBid: 20,
      bidIncrement: 5,
      visibleFinds: [find('bicycle', 'worn')],
      boxes: [box([find('tool', 'worn')])],
      opponents: [{ id: 'viktor', name: 'Виктор', limit: 25 }],
    };
  }

  const cycle = Math.floor((lotNumber - 2) / 2);
  const condition = conditions[cycle % conditions.length] ?? 'damaged';
  if (lotNumber % 2 === 0) {
    return {
      sceneId: 'workshop',
      openingBid: 20,
      bidIncrement: 5,
      visibleFinds: [find('drill', condition), find('vise', condition), find('extension', condition)],
      boxes: [box([find('level', condition), find('wrench', condition)])],
      opponents: [
        { id: 'marina', name: 'Марина', limit: cycle === 0 ? 50 : 20 },
        { id: 'oleg', name: 'Олег', limit: cycle === 0 ? 55 : 20 },
      ],
    };
  }
  return {
    sceneId: 'household',
    openingBid: 25,
    bidIncrement: 5,
    visibleFinds: [find('radio', condition), find('kettle', condition), find('lamp', condition)],
    boxes: [box([find('scales', condition), find('vase', condition)])],
    opponents: [{ id: 'victoria', name: 'Виктория', limit: cycle === 0 ? 60 : 35 }],
  };
}
