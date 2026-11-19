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

export interface GarageLot {
  readonly sceneId: Stage2AuctionView['sceneId'];
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
