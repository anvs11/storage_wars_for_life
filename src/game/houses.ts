export const houses = {
  1: { name: 'Бабушкин дом', price: 0, detail: 'Деревянный дом с отдельным металлическим гаражом.' },
  2: { name: 'Синий деревянный дом', price: 23000, detail: 'Можно поставить проигрыватель в комнате.' },
  3: { name: 'Дом с мастерской', price: 55000, detail: 'В мастерской ремонт находок на 25% дешевле.' },
  4: { name: 'Коттедж с галереей', price: 380000, detail: 'Кирпичный коттедж с двойным гаражом и мастерской.' },
  5: { name: 'Белокаменная усадьба', price: 2800000, detail: 'Загородная усадьба с гаражом на три секции и мастерской.' },
} as const;

export const houseLevels = [1, 2, 3, 4, 5] as const;
export type HouseLevel = typeof houseLevels[number];

export function houseLevel(house: 4 | 5 | undefined, workshop: boolean | undefined, hasHome: boolean): HouseLevel {
  return house ?? (workshop ? 3 : hasHome ? 2 : 1);
}
