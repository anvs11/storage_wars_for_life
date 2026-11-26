import { expect, it } from 'vitest';
import { BACKUP_KEY, SAVE_KEY } from '../platform/save';
import { save as saveStage5 } from '../platform/stage5-save';
import { applySavedCommand, load, save } from '../platform/stage7-save';
import { outingAvailable } from './stage7-calendar';
import { marketOffers } from './market-dialogue';
import { applyCommand, getView, migrateStage5, newGame } from './stage7-engine';
import { newGame as newStage5 } from './stage5-engine';
import type { Stage7Command, Stage7State } from './stage7-engine';
import type { OwnedItem } from './stage5-engine';
import type { LifeChoice } from './life';

type Action<C = Stage7Command> = C extends Stage7Command ? Omit<C, 'expectedRevision'> : never;
const revision = (state: Stage7State) => getView(state).screen.revision;
const send = (state: Stage7State, action: Action) => applyCommand(state, { ...action, expectedRevision: revision(state) });

function play(state: Stage7State, ...actions: Action[]): Stage7State {
  for (const action of actions) {
    const next = send(state, action);
    expect(next, action.type).not.toBe(state);
    state = next;
  }
  return state;
}

function memory() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}

function reload(state: Stage7State): Stage7State {
  const storage = memory();
  expect(save(storage, state)).toEqual({ ok: true });
  const restored = load(storage);
  if (restored.kind !== 'loaded') throw new Error(`Загрузка снимка: ${restored.kind}`);
  expect(restored.state).toEqual(state);
  return restored.state;
}

const starter = () => play(migrateStage5(newStage5(64)), { type: 'skipStory' });

function funded(bank: number, status = 0): Stage7State {
  const state = starter();
  const { base } = state;
  if (base.base.relationshipOpen || base.base.game.phase !== 'hub') throw new Error('Ожидается профиль дома');
  return { ...state, base: { ...base, base: { ...base.base, game: { ...base.base.game, bank, status } } } };
}

const auctions = { type: 'navigate', room: 'auctions' } as const;
const enter = { type: 'enterAuction', tier: 'ordinary' } as const;
const pass = { type: 'pass' } as const;
const homeFromLot = { type: 'nextLot' } as const;
const wait = { type: 'waitUntilNextPeriod' } as const;
const home = { type: 'navigate', room: 'home' } as const;
const closePhoto = { type: 'closeVisitPhoto' } as const;
const neighbor = { type: 'openRelationship' } as const;
const leaveNeighbor = { type: 'returnToHub' } as const;
const lifeChoice = (choice: LifeChoice) => ({ type: 'chooseLife', choice } as const);

it('витрина разрешает перепрыгнуть ступень и сохраняет владение, зачёт и независимые цели', () => {
  const van = { category: 'work', model: 'van' } as const;
  const pickup = { category: 'work', model: 'pickup' } as const;
  const heavy = { category: 'work', model: 'heavy' } as const;
  const mini = { category: 'personal', model: 'mini' } as const;
  const range = { category: 'personal', model: 'range' } as const;
  const start = play(funded(12000000, 48), home);
  expect(getView(start).showroom).toMatchObject({ work: [{}, {}, {}, {}, {}], personal: [{}, {}, {}, {}, {}] });
  expect(send(start, { type: 'buyVehicle', target: van, tradeIn: false })).toBe(start);
  expect(send(start, { type: 'buyVehicle', target: range, tradeIn: false })).toBe(start);
  const opened = play(start, auctions, enter, pass, homeFromLot, auctions, { type: 'spend', offerId: 'cinema' },
    closePhoto, home, { type: 'toggleVehicleGoal', target: range }, { type: 'toggleVehicleGoal', target: heavy });
  const purchased = reload(play(opened, { type: 'buyVehicle', target: van, tradeIn: false },
    { type: 'buyVehicle', target: pickup, tradeIn: false },
    { type: 'activateVehicle', target: van }, { type: 'buyVehicle', target: mini, tradeIn: false }));
  const before = purchased.base.base.game.bank;
  const trades = reload(play(purchased, { type: 'buyVehicle', target: range, tradeIn: true },
    { type: 'buyVehicle', target: heavy, tradeIn: true }));
  expect(trades.base.base.game.bank).toBe(before - 5170000 - 582000);
  expect(trades.fleet).toMatchObject({ work: [{ model: 'scooter' }, { model: 'zhiguli' }, { model: 'pickup' }, { model: 'heavy' }],
    personal: ['range'], personalGoal: 'range', workGoal: 'heavy' });
  expect(send(trades, { type: 'activateVehicle', target: mini })).toBe(trades);
  const alternate = reload(play(trades, { type: 'activateVehicle', target: pickup }));
  expect(getView(alternate)).toMatchObject({ personalCar: 'range', vehicle: { model: 'pickup', capacity: 6 } });
  expect(alternate.base.base.game.bank).toBe(trades.base.base.game.bank);
  expect(alternate.base.base.game.status).toBe(trades.base.base.game.status);
});

it('сохраняет тюнинг и использованный вечерний выезд при смене активной машины', () => {
  const heavy = { category: 'work', model: 'heavy' } as const;
  const scooter = { category: 'work', model: 'scooter' } as const;
  const start = play(funded(2000000), auctions, enter, pass, homeFromLot, { type: 'buyVehicle', target: heavy, tradeIn: false },
    { type: 'navigate', room: 'car' }, { type: 'upgradeTransport', upgrade: 'reinforceSuspension' },
    { type: 'upgradeTransport', upgrade: 'tuneEngine' }, { type: 'upgradeTransport', upgrade: 'highSideTrailer' },
    { type: 'upgradeTransport', upgrade: 'containerTrailer' }, home, wait, wait, auctions, enter, pass, homeFromLot);
  expect(start.bonusAuctionUsed).toBe(true);
  const switched = reload(play(start, { type: 'activateVehicle', target: scooter }));
  expect(getView(switched).vehicle).toMatchObject({ model: 'scooter', capacity: 2 });
  const reactivated = reload(play(switched, { type: 'activateVehicle', target: heavy }));
  expect(getView(reactivated)).toMatchObject({ vehicle: { model: 'heavy', capacity: 16, trailer: 2 },
    calendar: { bonusAuction: 'used' } });
  const hub = play(reactivated, auctions);
  expect(send(hub, enter)).toBe(hub);
});

function lifeProfile(): Stage7State {
  const state = funded(85000, 18);
  const item = state.base.items[0]!;
  const finds: OwnedItem[] = [
    { ...item, id: 'turntable-test', name: 'Проигрыватель', size: 2, value: 4000, estimate: { min: 3000, max: 5000 } },
    { ...item, id: 'camera-test', name: 'Плёночный фотоаппарат', value: 12000, estimate: { min: 9000, max: 15000 } },
    { ...item, id: 'damaged-test', name: 'Электрический чайник', condition: 'damaged' },
  ];
  return { ...state, base: { ...state.base, items: [...state.base.items, ...finds] } };
}

it('отделяет социальный рейтинг от ответа соседке и сохраняет обещание', () => {
  const initial = play(lifeProfile(), auctions, neighbor);
  const introduced = reload(play(initial, lifeChoice('talk')));
  const reservedIntro = reload(play(initial, lifeChoice('leave')));
  expect(introduced.base.base.game.status).toBe(19);
  expect(reservedIntro.base.base.game.status).toBe(19);
  expect(getView(introduced).life.score).toBe(2);
  expect(getView(reservedIntro).life.score).toBe(0);
  const sold = reload(play(introduced, lifeChoice('sell')));
  const repaired = reload(play(introduced, lifeChoice('repair')));
  const promised = reload(play(introduced, lifeChoice('keep')));
  for (const reply of [sold, repaired, promised]) {
    expect(reply.base.base.game.status).toBe(20);
    expect(reply.base.base.game.bank).toBe(85000);
    expect(reply.base.reviews).toEqual(introduced.base.reviews);
  }
  expect(getView(sold).life.score).toBe(2);
  expect(getView(repaired).life.score).toBe(3);
  expect(getView(promised).life.promise).toMatchObject({ kind: 'listening', due: 1, itemId: 'turntable-test' });
  expect(send(promised, lifeChoice('keep'))).toBe(promised);
});

it('меняет только личный показатель после пропуска и позволяет восстановить доверие', () => {
  const before = play(lifeProfile(), auctions, neighbor, lifeChoice('talk'), lifeChoice('keep'), leaveNeighbor, home, wait, wait, wait);
  const missed = reload(play(before, { type: 'sleep' }, { type: 'wakeUp' }));
  expect(missed.base.base.game.status).toBe(before.base.base.game.status);
  expect(getView(missed).life).toMatchObject({ score: 2, last: 'missed' });
  const reconciliation = reload(play(missed, neighbor, lifeChoice('apologize')));
  expect(getView(reconciliation).life.score).toBe(3);
  expect(reconciliation.life?.broken).toBeUndefined();
  expect(send(reconciliation, lifeChoice('apologize'))).toBe(reconciliation);
});

it('сохраняет обещание при публикации и отмечает нарушение при фактической продаже', () => {
  const listed = play(lifeProfile(), auctions, neighbor, lifeChoice('talk'), lifeChoice('keep'), leaveNeighbor,
    { type: 'navigate', room: 'market' }, { type: 'publish', itemId: 'turntable-test', price: 4000 },
    { type: 'navigate', room: 'inbox' });
  expect(listed.life?.promise?.itemId).toBe('turntable-test');
  const listing = listed.base.listings[0]!;
  expect(listing.offer?.price).toBe(4000);
  const sold = reload(play(listed, { type: 'acceptOffer', listingId: listing.id, offerId: listing.offer!.id }));
  expect(sold.base.base.game.status).toBe(20);
  expect(sold.base.base.game.bank).toBe(89000);
  expect(sold.life?.broken).toBe(true);
  expect(sold.life?.last).toBe('soldPromise');
  expect(sold.life?.promise).toBeUndefined();
});

it('предлагает частную продажу через чат и начисляет цену один раз', () => {
  const evening = play(lifeProfile(), auctions, neighbor, lifeChoice('talk'), lifeChoice('keep'), leaveNeighbor, home, wait, wait, wait, neighbor);
  const shared = reload(play(evening, lifeChoice('listen')));
  expect(getView(shared).life.score).toBe(7);
  expect(getView(shared).life.referral).toEqual({ itemName: 'Проигрыватель', price: 4600, day: 7 });
  const inbox = reload(play(shared, { type: 'openReferral' }));
  expect(inbox.base.base.game.bank).toBe(85000);
  const listing = inbox.base.listings[0]!;
  const sale = { type: 'acceptOffer', listingId: listing.id, offerId: listing.offer!.id } as const;
  const sold = reload(play(inbox, sale));
  expect(sold.base.base.game.bank).toBe(89600);
  expect(sold.base.items.some(({ id }) => id === 'turntable-test')).toBe(false);
  expect(send(sold, sale)).toBe(sold);
  const again = play(sold, auctions, neighbor);
  expect(send(again, { type: 'openReferral' })).toBe(again);
  const gift = reload(play(again, lifeChoice('acceptRequest'), lifeChoice('giveCamera')));
  expect(gift.base.base.game.bank).toBe(89600);
  expect(gift.base.items.some(({ id }) => id === 'camera-test')).toBe(false);
  expect(gift.life?.promise).toBeUndefined();
});

it('хранит проигрыватель дома и применяет цену мастерской в карточке и при ремонте', () => {
  const remodeled = play(lifeProfile(), auctions, { type: 'spend', offerId: 'home' }, home);
  expect(getView(remodeled).life.home.level).toBe(2);
  const oldGarage = getView(play(remodeled, { type: 'navigate', room: 'garage' })).screen;
  expect(oldGarage).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({
    id: 'damaged-test', repair: expect.objectContaining({ price: 500 }),
  })]) });
  const workshop = reload(play(remodeled, { type: 'buyWorkshop' }, { type: 'displayTurntable' }));
  expect(getView(workshop).life.home).toMatchObject({ level: 3, display: 'Проигрыватель' });
  expect(workshop.base.base.game.bank).toBe(30000);
  expect(send(workshop, { type: 'buyWorkshop' })).toBe(workshop);
  const garage = play(workshop, { type: 'navigate', room: 'garage' });
  const view = getView(garage).screen;
  if (view.phase !== 'garage') throw new Error('Ожидается гараж');
  expect(view.items.find(({ id }) => id === 'damaged-test')?.repair?.price).toBe(375);
  expect(view.items.some(({ id }) => id === 'turntable-test')).toBe(false);
  expect(send(garage, { type: 'discardItem', itemId: 'turntable-test' })).toBe(garage);
  const repaired = reload(play(garage, { type: 'repairItem', itemId: 'damaged-test' }, home, { type: 'retrieveTurntable' }));
  expect(repaired.base.base.game.bank).toBe(29625);
  expect(getView(repaired).life.home.displayCandidate).toBe('Проигрыватель');
});

it('меняет двор при переезде, а вместимость гаража при покупке стеллажей', () => {
  const start = lifeProfile();
  const rich = { ...start, base: { ...start.base, base: { ...start.base.base, game: { ...start.base.base.game, bank: 4000000 } } } } as Stage7State;
  const renovated = play(rich, auctions, { type: 'spend', offerId: 'home' }, home, { type: 'buyWorkshop' });
  expect(send(renovated, { type: 'buyHouse', level: 5 })).toBe(renovated);
  const estate = reload(play(renovated, { type: 'displayTurntable' }, { type: 'buyHouse', level: 4 }, { type: 'buyHouse', level: 5 }));
  expect(getView(estate)).toMatchObject({ screen: { house: 5, workshop: true, garage: { limit: 8 } },
    life: { home: { level: 5, display: 'Проигрыватель' } } });
  expect(send(estate, { type: 'buyHouse', level: 5 })).toBe(estate);
  expect(send(estate, { type: 'buyCapacity', target: 'garage' })).toBe(estate);
  const garage = play(estate, { type: 'navigate', room: 'garage' });
  expect(send(garage, { type: 'buyCapacity', target: 'shelves' })).toBe(garage);
  const racks = reload(play(garage, { type: 'buyCapacity', target: 'garage' }, { type: 'buyCapacity', target: 'shelves' }));
  expect(getView(racks).screen).toMatchObject({ garage: { limit: 24 } });
  expect(send(racks, { type: 'buyCapacity', target: 'shelves' })).toBe(racks);
});

it('продаёт личные машины после городского выезда с зачётом прежней, не трогая рабочий транспорт', () => {
  const start = funded(15000000, 48);
  const atHome = play(start, home);
  const mini = { type: 'buyPersonalCar', car: 'mini' } as const;
  expect(send(atHome, mini)).toBe(atHome);
  const afterFilm = play(atHome, auctions, { type: 'spend', offerId: 'cinema' }, { type: 'closeVisitPhoto' }, home);
  const acquired = reload(play(afterFilm, mini));
  expect(acquired.base.base.game.bank).toBe(afterFilm.base.base.game.bank - 550000);
  expect(getView(acquired)).toMatchObject({ personalCar: 'mini', vehicle: { model: 'zhiguli', capacity: 4 },
    personalOffer: { id: 'q3', tradeIn: 330000, total: 820000 } });
  expect(send(acquired, { type: 'buyPersonalCar', car: 'cayenne' })).toBe(acquired);
  const q3 = { type: 'buyPersonalCar', car: 'q3', expectedRevision: revision(acquired) } as const;
  const replaced = reload(applyCommand(acquired, q3));
  expect(replaced.base.base.game.bank).toBe(acquired.base.base.game.bank - 820000);
  expect(applyCommand(replaced, q3)).toBe(replaced);
  const flagship = reload(play(replaced, { type: 'buyPersonalCar', car: 'cayenne' },
    { type: 'buyPersonalCar', car: 'amg' }, { type: 'buyPersonalCar', car: 'range' }));
  expect(getView(flagship)).toMatchObject({ personalCar: 'range', personalOffer: null, vehicle: { model: 'zhiguli' } });
  expect(flagship.base.base.game.status).toBe(afterFilm.base.base.game.status);
});

it('везёт велосипед отдельно от сумки скутера и ремонтирует седан один раз', () => {
  const fresh = play(newGame(64), { type: 'skipStory' });
  const garage = { ...fresh, base: { ...funded(6000).base, transport: fresh.base.transport! } };
  expect(getView(garage).vehicle).toEqual({ model: 'scooter', capacity: 2 });
  const beforeFirstAuction = play(garage, { type: 'navigate', room: 'car' });
  expect(send(beforeFirstAuction, { type: 'upgradeTransport', upgrade: 'restoreZhiguli' })).toBe(beforeFirstAuction);
  const inspection = reload(play(garage, auctions, enter));
  expect(getView(inspection).auctionTransport).toMatchObject({ tutorialDelivery: true, garageFree: 5 });
  const selected = reload(play(inspection, { type: 'bid' }, { type: 'openBox', boxId: 'box' },
    { type: 'toggleCargo', itemId: 'bicycle' }, { type: 'toggleCargo', itemId: 'tool' }));
  expect(getView(selected).screen).toMatchObject({ phase: 'cargo', car: { used: 1, limit: 2 }, garage: { used: 8, limit: 8 },
    items: [{ id: 'bicycle', selected: true, tutorialDelivery: true }, { id: 'tool', selected: true }] });
  const delivered = reload(play(selected, { type: 'finishCargo', leaveRemaining: false }));
  expect(delivered.base.items.map(item => item.id)).toContain('owned-1-bicycle');

  const car = play(delivered, { type: 'navigate', room: 'car' });
  const command = { type: 'upgradeTransport', upgrade: 'restoreZhiguli', expectedRevision: revision(car) } as const;
  const repaired = reload(applyCommand(car, command));
  expect(getView(repaired)).toMatchObject({ vehicle: { model: 'zhiguli', capacity: 4 }, screen: { phase: 'car', bank: 1000 } });
  expect(repaired.base.base.game.status).toBe(5);
  expect(applyCommand(repaired, command)).toBe(repaired);
  expect(send(repaired, { type: 'upgradeTransport', upgrade: 'restoreZhiguli' })).toBe(repaired);
});

it('покупает машины по порядку и открывает один вечерний аукцион независимо от прицепа', () => {
  const fresh = play(newGame(64), { type: 'skipStory' });
  const garage = { ...fresh, base: { ...funded(1600000).base, transport: fresh.base.transport! } };
  let car = play(garage, auctions, enter, pass, homeFromLot, { type: 'navigate', room: 'car' });
  for (const [upgrade, model, capacity] of [
    ['restoreZhiguli', 'zhiguli', 4], ['buyPickup', 'pickup', 6], ['buyVan', 'van', 8], ['buyHeavy', 'heavy', 10],
    ['highSideTrailer', 'heavy', 12], ['containerTrailer', 'heavy', 16],
  ] as const) {
    car = reload(play(car, { type: 'upgradeTransport', upgrade }));
    expect(getView(car).vehicle).toMatchObject({ model, capacity });
  }
  expect(car.base.base.game.status).toBe(5);
  const evening = reload(play(car, auctions, enter, pass, homeFromLot, auctions, enter, pass, homeFromLot));
  expect(getView(evening).calendar).toMatchObject({ period: 'evening', remainingOutings: 0 });
  const closedHub = play(evening, auctions);
  expect(send(closedHub, enter)).toBe(closedHub);
  const tuned = reload(play(evening, { type: 'navigate', room: 'car' },
    { type: 'upgradeTransport', upgrade: 'reinforceSuspension' }, { type: 'upgradeTransport', upgrade: 'tuneEngine' }));
  expect(getView(tuned)).toMatchObject({ vehicle: { capacity: 16, trailer: 2 }, calendar: { bonusAuction: 'available' } });
  const fourth = reload(play(tuned, auctions, enter));
  expect(getView(fourth)).toMatchObject({ screen: { phase: 'inspection', lotNumber: 4 }, calendar: { bonusAuction: 'used' } });
  const closed = reload(play(fourth, pass, homeFromLot, auctions));
  expect(send(closed, enter)).toBe(closed);
  expect(send(closed, { type: 'spend', offerId: 'cinema' })).toBe(closed);
  const morning = reload(play(closed, home, { type: 'sleep' }, { type: 'wakeUp' }));
  expect(morning.bonusAuctionUsed).toBeUndefined();
  expect(getView(morning).calendar).toMatchObject({ day: 2, remainingOutings: 3 });
  const nextEvening = play(morning, wait, wait, wait);
  expect(getView(nextEvening).calendar.bonusAuction).toBe('available');
});

it('покупает два гаража за день и разбирает их после перезагрузки без повторного расхода выезда', () => {
  function buy(state: Stage7State): Stage7State {
    let current = play(state, enter);
    for (let turn = 0; turn < 20 && current.base.base.game.phase !== 'reveal'; turn += 1) {
      current = play(current, { type: 'bid' });
    }
    expect(current.base.base.game.phase).toBe('reveal');
    return current;
  }
  let state = play(funded(50000), auctions);
  state = reload(play(buy(state), { type: 'parkLot' }));
  expect(getView(state).parkedLots.map(lot => lot.lotNumber)).toEqual([1]);
  state = reload(play(buy(state), { type: 'parkLot' }));
  const bank = state.base.base.game.bank;
  expect(getView(state).parkedLots.map(lot => lot.lotNumber)).toEqual([1, 2]);
  const evening = play(state, home, wait);
  const opened = reload(play(evening, { type: 'resumeLot', lotNumber: 1 }, { type: 'openBox', boxId: 'box' },
    { type: 'toggleCargo', itemId: 'tool' }));
  const packed = reload(play(opened, { type: 'finishCargo', leaveRemaining: true }));
  expect(getView(packed)).toMatchObject({ screen: { phase: 'garage', bank }, calendar: { remainingOutings: 0 },
    parkedLots: [{ lotNumber: 2 }] });
  const second = reload(play(packed, { type: 'resumeLot', lotNumber: 2 }, { type: 'finishCargo', leaveRemaining: true }));
  expect(getView(second)).toMatchObject({ screen: { phase: 'garage', bank }, parkedLots: [], calendar: { remainingOutings: 0 } });
});

it('сохраняет параллельные чаты, даёт сторговаться, закрывает грубый чат и начисляет один отзыв', () => {
  const open = play(starter(), { type: 'navigate', room: 'market' },
    { type: 'publish', itemId: 'home-kettle', price: 2300 },
    { type: 'publish', itemId: 'home-lamp', price: 750 }, { type: 'navigate', room: 'inbox' });
  const [first, second] = open.base.listings;
  if (!first || !second) throw new Error('Нужны два объявления');
  const [offer, rude] = marketOffers(first);
  if (!offer || !rude) throw new Error('Нужны два покупателя на чайник');
  expect(new Set(open.base.listings.flatMap(marketOffers).map(thread => thread.buyer)).size).toBe(3);
  const answered = reload(play(open, { type: 'messageBuyer', listingId: first.id, offerId: offer.id, text: 'Можете дать 2 100?' },
    { type: 'messageBuyer', listingId: first.id, offerId: rude.id, text: 'Ты идиот.' }));
  const [agreed, closed] = marketOffers(answered.base.listings[0]!);
  expect(agreed).toMatchObject({ price: 2100, closed: false });
  expect(closed).toMatchObject({ closed: true });
  expect(send(answered, { type: 'acceptOffer', listingId: first.id, offerId: closed!.id })).toBe(answered);
  const sale = { type: 'acceptOffer', listingId: first.id, offerId: agreed!.id } as const;
  const sold = reload(play(answered, sale));
  expect(getView(sold)).toMatchObject({ screen: { bank: 2100, reviews: [{ stars: 5 }] } });
  expect(sold.base.listings).toEqual([second]);
  expect(send(sold, sale)).toBe(sold);
});

it('завершает три выезда при возвращении и отклоняет четвёртый вечером', () => {
  const inspection = play(funded(3350), auctions, enter);
  expect(getView(inspection).calendar).toMatchObject({ day: 1, weekday: 'Понедельник', outing: 'утренний выезд', remainingOutings: 3 });
  const passed = reload(play(inspection, pass));
  expect(getView(passed).calendar.period).toBe('morning');
  const afternoon = play(passed, homeFromLot);
  expect(getView(afternoon)).toMatchObject({ screen: { phase: 'home', bank: 3350 }, calendar: { period: 'afternoon', remainingOutings: 2 } });
  expect(applyCommand(afternoon, { ...homeFromLot, expectedRevision: revision(passed) })).toBe(afternoon);
  const late = reload(play(afternoon, auctions, enter, pass, homeFromLot));
  expect(getView(late).calendar).toMatchObject({ period: 'lateAfternoon', remainingOutings: 1 });
  const evening = play(late, auctions, enter, pass, homeFromLot, auctions);
  expect(getView(evening)).toMatchObject({ screen: { phase: 'hub', bank: 3350 }, calendar: { period: 'evening', remainingOutings: 0 } });
  expect(send(evening, enter)).toBe(evening);
});

it('сохраняет купленный лот и тратит утро после подтверждения частичного вывоза', () => {
  const bought = play(funded(3350), auctions, enter, { type: 'bid' }, { type: 'bid' });
  const selected = reload(play(bought, { type: 'openBox', boxId: 'box' }, { type: 'toggleCargo', itemId: 'bicycle' }));
  expect(getView(selected)).toMatchObject({ screen: { phase: 'cargo', bank: 350, car: { used: 4 } }, calendar: { period: 'morning' } });
  expect(send(selected, { type: 'finishCargo', leaveRemaining: false })).toBe(selected);
  const delivered = reload(play(selected, { type: 'finishCargo', leaveRemaining: true }));
  expect(getView(delivered)).toMatchObject({
    screen: { phase: 'garage', bank: 350, items: expect.arrayContaining([{ id: 'owned-1-bicycle', name: 'Велосипед',
      size: 4, position: 'floor', condition: 'worn', clue: expect.any(String), estimate: expect.any(Object) }]) },
    calendar: { period: 'afternoon', remainingOutings: 2 },
  });
  expect(delivered.base.items.some(({ id }) => id === 'owned-1-tool')).toBe(false);
  expect(send(delivered, { type: 'finishCargo', leaveRemaining: true })).toBe(delivered);
});

it('проводит с понедельника до следующей субботы и восстанавливает сон после загрузки', () => {
  let state = play(starter(), home);
  expect(getView(state).calendar.nextMarket).toEqual({ weekday: 'Суббота', daysAway: 5 });
  for (let day = 1; day <= 12; day++) {
    expect(getView(state).calendar).toMatchObject({ day, period: 'morning', remainingOutings: 3 });
    if (day === 6) expect(getView(state).calendar).toMatchObject({ weekday: 'Суббота', nextMarket: { daysAway: 0 } });
    if (day === 7) expect(getView(state).calendar).toMatchObject({ weekday: 'Воскресенье', nextMarket: { daysAway: 0 } });
    if (day === 8) expect(getView(state).calendar).toMatchObject({ weekday: 'Понедельник', nextMarket: { daysAway: 5 } });
    const evening = play(state, wait, wait, wait);
    expect(getView(evening).calendar).toMatchObject({ day, period: 'evening', remainingOutings: 0 });
    expect(send(evening, wait)).toBe(evening);
    const night = reload(play(evening, { type: 'sleep' }));
    expect(getView(night).calendar).toMatchObject({ day, period: 'night', remainingOutings: 0 });
    expect(send(night, auctions)).toBe(night);
    state = play(night, { type: 'wakeUp' });
    expect(send(state, { type: 'wakeUp' })).toBe(state);
  }
  expect(getView(state).calendar).toMatchObject({ day: 13, weekday: 'Суббота', period: 'morning' });
});

it.each(['market', 'home'] as const)('выдаёт гарантированный первый отклик после одного ожидания в %s', (room) => {
  const posted = play(starter(), { type: 'navigate', room: 'market' },
    { type: 'publish', itemId: 'home-kettle', price: 2000 });
  const origin = room === 'home' ? play(posted, home) : posted;
  const command = { type: room === 'home' ? 'waitUntilNextPeriod' : 'waitForBuyer', expectedRevision: revision(origin) } as const;
  const next = applyCommand(origin, command);
  expect(revision(next)).toBe(revision(origin) + 1);
  expect(next.calendar.period).toBe('afternoon');
  expect(applyCommand(next, command)).toBe(next);
  const listing = next.base.listings[0]!;
  expect(listing.offer?.price).toBe(2000);
  const sold = play(next, { type: 'navigate', room: 'inbox' },
    { type: 'acceptOffer', listingId: listing.id, offerId: listing.offer!.id });
  expect(getView(sold)).toMatchObject({ screen: { bank: 2000 }, calendar: { period: 'afternoon', remainingOutings: 2 } });
});

it('позволяет восстановить нулевой банк и продолжить тот же выезд', () => {
  const job = play(starter(), auctions, enter);
  expect(getView(job)).toMatchObject({ screen: { phase: 'job', bank: 0, reward: 2000 }, calendar: { period: 'morning' } });
  expect(send(job, { type: 'sortItem', station: 'floor' })).toBe(job);
  const authorized = reload(play(job, { type: 'authorizeJob' }));
  expect(send(authorized, { type: 'authorizeJob' })).toBe(authorized);
  const inspection = play(authorized, { type: 'sortItem', station: 'floor' }, { type: 'sortItem', station: 'shelf' },
    { type: 'sortItem', station: 'recycle' }, { type: 'claimJob' });
  expect(getView(inspection)).toMatchObject({ screen: { phase: 'inspection', bank: 2000 }, calendar: { period: 'morning' } });
  expect(play(inspection, pass, homeFromLot).calendar.period).toBe('afternoon');
});

it('списывает выезд за кино и ужин, сохраняет бесплатные шаги и разбор чемодана в текущем периоде', () => {
  const ready = play(funded(12000, 18), auctions, { type: 'openRelationship' }, { type: 'meetNeighbor' }, { type: 'buyFlowers' });
  expect(ready.calendar.period).toBe('morning');
  const cinema = reload(play(ready, { type: 'inviteToCinema' }));
  expect(getView(cinema)).toMatchObject({ screen: { bank: 10250, status: 20, step: 'cinemaVisited' }, calendar: { period: 'afternoon' } });
  const dinner = play(cinema, closePhoto, { type: 'inviteToDinner' });
  expect(getView(dinner)).toMatchObject({ screen: { bank: 7650, status: 24, step: 'dinnerVisited' }, calendar: { period: 'lateAfternoon' } });
  const hub = play(dinner, closePhoto, { type: 'returnToHub' });
  const baggage = reload(play(hub, { type: 'callAirport' }, { type: 'buyBaggage' }, { type: 'receiveBaggage' },
    { type: 'openBox', boxId: 'suitcase' }, { type: 'toggleCargo', itemId: 'suitcase-find' }, { type: 'finishCargo', leaveRemaining: false }));
  expect(getView(baggage)).toMatchObject({ screen: { phase: 'garage', bank: 5250 }, calendar: { period: 'lateAfternoon' } });
});

it('подтверждает время вместе с оплатой и оставляет его прежним при отказе записи и нехватке денег', () => {
  const initial = play(funded(3000, 18), auctions);
  const storage = memory();
  expect(save(storage, initial)).toEqual({ ok: true });
  const command = { type: 'spend', offerId: 'restaurant', expectedRevision: revision(initial) } as const;
  const locked = { ...storage, setItem: (key: string, value: string) => {
    if (key === SAVE_KEY) throw new Error('Запись заблокирована');
    storage.setItem(key, value);
  } };
  expect(applySavedCommand(locked, initial, command)).toMatchObject({ kind: 'failed', state: initial });
  expect(load(storage)).toEqual({ kind: 'loaded', state: initial });
  const advanced = applySavedCommand(storage, initial, command);
  expect(advanced.kind).toBe('saved');
  expect(getView(advanced.state)).toMatchObject({ screen: { bank: 400, status: 22 }, calendar: { period: 'afternoon' },
    paidVisit: { open: true, record: { venue: 'restaurant', together: false, day: 1, outing: 'morning', spent: 2600, statusGain: 4 } } });
  expect(load(storage)).toEqual({ kind: 'loaded', state: advanced.state });
  expect(applySavedCommand(storage, advanced.state, command).kind).toBe('ignored');
  const poor = play(funded(2599, 18), auctions);
  expect(send(poor, command)).toBe(poor);
});

it.each([2599, 3000])('совместный ужин при банке %i сохраняет итог ровно один раз', (bank) => {
  const ready = play(funded(bank + 1750, 16), auctions, { type: 'openRelationship' }, { type: 'meetNeighbor' },
    { type: 'buyFlowers' }, { type: 'inviteToCinema' }, closePhoto);
  expect(getView(ready)).toMatchObject({ screen: { bank, status: 18, step: 'cinemaVisited' }, calendar: { period: 'afternoon' } });
  const command = { type: 'inviteToDinner', expectedRevision: revision(ready) } as const;
  const dinner = applyCommand(ready, command);
  if (bank === 2599) {
    expect(dinner).toBe(ready);
    return;
  }
  const confirmed = reload(dinner);
  expect(getView(confirmed)).toMatchObject({ screen: { bank: 400, status: 22, step: 'dinnerVisited' },
    calendar: { period: 'lateAfternoon', remainingOutings: 1 }, paidVisit: { open: true, record: {
      venue: 'restaurant', together: true, spent: 2600, statusGain: 4, outing: 'afternoon',
    } } });
  expect(applyCommand(confirmed, command)).toBe(confirmed);
  expect(send(confirmed, { type: 'inviteToDinner' })).toBe(confirmed);
  const returned = play(confirmed, closePhoto, { type: 'returnToHub' }, home);
  const reopened = reload(play(returned, { type: 'openVisitPhoto' }));
  expect(reopened.paidVisit).toEqual(confirmed.paidVisit);
  expect(reopened.calendar).toEqual(confirmed.calendar);
  expect(getView(reopened).screen.bank).toBe(400);
  const closed = play(reopened, closePhoto);
  expect(closed.base.base.game.status).toBe(22);
  expect(closed.base.base.relationshipStep).toBe('dinnerVisited');
});

it('читает снимок v6 с барахолкой и восстанавливает резерв при повреждённой фотографии', () => {
  const storage = memory();
  const state = play(funded(3000, 18), auctions);
  const { paidVisit: _missing, ...old } = state;
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: old }));
  expect(load(storage)).toEqual({ kind: 'loaded', state });
  const visited = play(state, { type: 'spend', offerId: 'restaurant' });
  expect(save(storage, visited)).toEqual({ ok: true });
  const photo = visited.paidVisit!;
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: { ...visited,
    paidVisit: { ...photo, record: { ...photo.record, statusGain: 50 } },
  } }));
  expect(load(storage)).toMatchObject({ kind: 'recovered', state });
});

it('сохраняет открытую фотографию v6 вечером и оплачивает поездку в третий выезд', () => {
  const state = play(funded(10000, 18), home, wait, auctions);
  const secondVisit = play(state, { type: 'spend', offerId: 'restaurant' });
  const legacy = { ...secondVisit, calendar: { day: 1, period: 'evening' } };
  const storage = memory();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: legacy }));
  const restored = load(storage);
  expect(restored).toMatchObject({ kind: 'loaded', state: legacy });
  if (restored.kind !== 'loaded') throw new Error('Ожидается сохранение v6');
  expect(getView(play(restored.state, closePhoto, home)).calendar.remainingOutings).toBe(0);

  const lastVisit = reload(play(secondVisit, closePhoto, { type: 'spend', offerId: 'restaurant' }));
  expect(getView(lastVisit)).toMatchObject({ screen: { bank: 4800 }, calendar: { period: 'evening', remainingOutings: 0 },
    paidVisit: { open: true, record: { outing: 'lateAfternoon', spent: 2600 } } });
});

it('переносит незавершённые торги v5 в утро и восстанавливает резерв при испорченном календаре', () => {
  const bidding = reload(play(funded(3350), auctions, enter, { type: 'bid' }));
  const storage = memory();
  expect(saveStage5(storage, bidding.base)).toEqual({ ok: true });
  const migrated = migrateStage5(bidding.base);
  expect(load(storage)).toEqual({ kind: 'loaded', state: migrated });
  const expectedRevision = revision(migrated);
  expect(applySavedCommand(storage, migrated, { type: 'pass', expectedRevision }).kind).toBe('saved');
  expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(7);
  expect(JSON.parse(storage.getItem(BACKUP_KEY)!).version).toBe(5);
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: { ...bidding, calendar: { day: 1, period: 'evening' } } }));
  expect(load(storage)).toMatchObject({ kind: 'recovered', state: migrated });
  expect(play(bidding, pass, homeFromLot).calendar).toEqual({ day: 1, period: 'afternoon' });
});

const openFlea = { type: 'openFleaVisit' } as const;
const confirmFlea = { type: 'confirmFleaVisit' } as const;
const closeFlea = { type: 'closeFleaReceipt' } as const;
const kitchenItems = ['home-kettle', 'home-lamp', 'home-tools'] as const;
const pack = (itemId: string) => ({ type: 'packForFlea', itemId } as const);

function reachMorning(state: Stage7State, day: number): Stage7State {
  if (state.base.room !== 'home') state = play(state, home);
  while (state.calendar.day < day) {
    while (outingAvailable(state.calendar.period)) state = play(state, wait);
    state = play(state, { type: 'sleep' }, { type: 'wakeUp' });
  }
  return state;
}

const meetNeighbor = { type: 'meetNeighbor' } as const;
const openStory = { type: 'openRelationship' } as const;
const leaveStory = { type: 'returnToHub' } as const;
const gift = { type: 'giveBirthdayFlowers' } as const;

it.each([[1, 7], [5, 7], [6, 14], [7, 14]])('после знакомства в день %i назначает дату %i с полным днём для напоминания', (day, birthday) => {
  const before = reachMorning(funded(2000, 12), day);
  expect(before.familyDate).toBeNull();
  expect(send(before, gift)).toBe(before);
  const met = reload(play(before, openStory, meetNeighbor));
  expect(getView(met)).toMatchObject({ familyDate: { day: birthday, outcome: 'pending', affection: 0, price: 850 },
    screen: { bank: 2000, step: 'met' } });
});

it('от одной субботы сохраняет поздравление с одним букетом или пропуск с одним изменением отношения', () => {
  const met = play(funded(1800, 12), home, openStory, meetNeighbor, leaveStory);
  const saturday = reload(reachMorning(met, 6));
  expect(getView(saturday)).toMatchObject({ calendar: { day: 6, weekday: 'Суббота' },
    familyDate: { day: 7, affection: 0, price: 850, advancesStory: true } });
  expect(send(saturday, gift)).toBe(saturday);
  const sunday = reload(reachMorning(saturday, 7));
  const command = { ...gift, expectedRevision: revision(sunday) };
  const celebrated = reload(play(sunday, gift));
  expect(getView(celebrated)).toMatchObject({ screen: { bank: 950, phase: 'home' },
    calendar: { day: 7, period: 'morning', remainingOutings: 3 },
    familyDate: { outcome: 'celebrated', affection: 1, status: 12, step: 'flowersGiven', nextGoal: { action: 'inviteToCinema' } } });
  expect(applyCommand(celebrated, command)).toBe(celebrated);
  expect(send(celebrated, gift)).toBe(celebrated);
  const storyGift = reload(play(sunday, openStory, { type: 'buyFlowers' }));
  expect(getView(storyGift)).toMatchObject({ screen: { bank: 950, status: 12, step: 'flowersGiven' },
    familyDate: { outcome: 'celebrated', affection: 1 } });
  expect(send(storyGift, { type: 'buyFlowers' })).toBe(storyGift);
  expect(reload(reachMorning(celebrated, 8)).familyDate).toEqual(celebrated.familyDate);

  const night = reload(play(sunday, wait, wait, wait, { type: 'sleep' }));
  expect(night.familyDate).toEqual(sunday.familyDate);
  expect(send(night, gift)).toBe(night);
  const wake = { type: 'wakeUp', expectedRevision: revision(night) } as const;
  const monday = reload(play(night, wake));
  expect(getView(monday)).toMatchObject({ screen: { bank: 1800 }, calendar: { day: 8, weekday: 'Понедельник' },
    familyDate: { outcome: 'missed', affection: -1, status: 12, step: 'met', nextGoal: { action: 'buyFlowers' } } });
  expect(applyCommand(monday, wake)).toBe(monday);
  const later = play(monday, openStory, { type: 'buyFlowers' });
  expect(getView(later)).toMatchObject({ screen: { bank: 950, step: 'flowersGiven' }, familyDate: { outcome: 'missed', affection: -1 } });
  expect(reload(reachMorning(play(later, leaveStory), 14)).familyDate).toEqual(monday.familyDate);
});

it('проверяет нехватку рубля и отдельно поздравляет после сюжетного букета', () => {
  const met = play(funded(849, 12), home, openStory, meetNeighbor, leaveStory);
  const poor = reachMorning(met, 7);
  expect(send(poor, gift)).toBe(poor);
  const poorStory = play(poor, openStory);
  expect(send(poorStory, { type: 'buyFlowers' })).toBe(poorStory);

  const flowers = play(funded(1700, 12), home, openStory, meetNeighbor, { type: 'buyFlowers' }, leaveStory);
  const birthday = reachMorning(flowers, 7);
  expect(getView(birthday).familyDate).toMatchObject({ advancesStory: false, affection: 0 });
  const paid = play(birthday, gift);
  expect(getView(paid)).toMatchObject({ screen: { bank: 0 }, familyDate: { step: 'flowersGiven', affection: 1, status: 12 } });
});

it('добавляет дату к сохранённому эпилогу v5 и прежнему v6 с сохранением текущей недели', () => {
  const finale = play(funded(50000, 18), auctions, { type: 'spend', offerId: 'home' }, { type: 'spend', offerId: 'car' },
    openStory, meetNeighbor, { type: 'buyFlowers' }, { type: 'inviteToCinema' }, closePhoto,
    { type: 'inviteToDinner' }, closePhoto, { type: 'confirmMoveIn' }, leaveStory, home);
  const storage = memory();
  expect(saveStage5(storage, finale.base)).toEqual({ ok: true });
  const migrated = load(storage);
  if (migrated.kind !== 'loaded') throw new Error('Ожидается профиль с эпилогом');
  expect(getView(migrated.state)).toMatchObject({ familyDate: { day: 7, affection: 0, step: 'movedIn' } });
  expect(getView(play(migrated.state, openStory)).screen).toMatchObject({ phase: 'relationship', step: 'movedIn' });

  const { familyDate: _missing, ...old } = reachMorning(finale, 6);
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: old }));
  expect(load(storage)).toMatchObject({ kind: 'loaded', state: { calendar: { day: 6 }, familyDate: { day: 14, outcome: 'pending' } } });
});

it('продаёт две вещи из трёх на seed 64 и сохраняет выручку, остаток, исход торгов и дневной выезд', () => {
  const packed = play(funded(3350), ...kitchenItems.map(pack), home);
  expect(send(packed, openFlea)).toBe(packed);
  const saturday = reachMorning(packed, 6);
  expect(saturday.flea.seed).toBe(1434197262);
  const offered = reload(play(saturday, openFlea));
  expect(getView(offered).flea.items[0]?.estimate).toEqual({ min: 980, max: 2280 });
  expect(send(offered, wait)).toBe(offered);
  const cancelled = play(offered, { type: 'cancelFleaVisit' });
  expect(cancelled.calendar).toEqual(saturday.calendar);
  expect(cancelled.flea).toEqual(saturday.flea);
  expect(cancelled.base.base.game.bank).toBe(3350);

  const retry = play(cancelled, openFlea);
  const storage = memory();
  expect(save(storage, retry)).toEqual({ ok: true });
  const command = { ...confirmFlea, expectedRevision: revision(retry) };
  const locked = { ...storage, setItem(key: string, value: string) {
    if (key === SAVE_KEY) throw new Error('Отказ записи');
    storage.setItem(key, value);
  } };
  expect(applySavedCommand(locked, retry, command)).toMatchObject({ kind: 'failed', state: retry });
  expect(load(storage)).toEqual({ kind: 'loaded', state: retry });
  const committed = applySavedCommand(storage, retry, command);
  expect(committed.kind).toBe('saved');
  expect(committed.state).toEqual(play(retry, confirmFlea));
  expect(load(storage)).toEqual({ kind: 'loaded', state: committed.state });
  const sold = committed.state;
  expect(getView(sold)).toMatchObject({ screen: { bank: 5346 }, calendar: { day: 6, period: 'afternoon', remainingOutings: 2 },
    flea: { items: [{ id: 'home-lamp' }], visit: { phase: 'receipt', revenue: 1996,
      sold: [{ id: 'home-kettle', price: 1480 }, { id: 'home-tools', price: 516 }] } } });
  expect(applySavedCommand(storage, sold, command).kind).toBe('ignored');
  const returned = play(sold, closeFlea);
  expect(send(returned, openFlea)).toBe(returned);
  const afterMarket = play(returned, auctions, enter);
  const withoutMarket = play(saturday, wait, auctions, enter);
  const playedLot = afterMarket.base.base.game;
  const baselineLot = withoutMarket.base.base.game;
  if (playedLot.phase !== 'inspection' || baselineLot.phase !== 'inspection') throw new Error('Ожидается дневной осмотр');
  expect(playedLot.lot).toEqual(baselineLot.lot);
  expect(playedLot.offerSeeds).toEqual(baselineLot.offerSeeds);
});

it.each([[21, 0, 0], [1, 3, 2637]])('на seed %i фиксирует %i продаж на воскресной барахолке', (seed, count, revenue) => {
  const start = play(newGame(seed), { type: 'skipStory' }, home);
  const empty = reachMorning(start, 7);
  expect(send(empty, openFlea)).toBe(empty);
  const garage = play(empty, { type: 'navigate', room: 'garage' }, ...kitchenItems.map(pack), home);
  const receipt = reload(play(garage, openFlea, confirmFlea));
  expect(getView(receipt)).toMatchObject({ screen: { bank: revenue }, calendar: { weekday: 'Воскресенье', remainingOutings: 2 },
    flea: { visit: { phase: 'receipt', revenue } } });
  expect(receipt.flea.visit?.phase === 'receipt' && receipt.flea.visit.sold.length).toBe(count);
  expect(receipt.flea.items).toHaveLength(kitchenItems.length - count);
});

it('соблюдает объём коробки и гаража и сохраняет ID при возврате вещи', () => {
  const cargo = play(funded(3350), auctions, enter, { type: 'bid' }, { type: 'bid' }, { type: 'toggleCargo', itemId: 'bicycle' });
  expect(send(cargo, { type: 'toggleFleaBaggage', itemId: 'bicycle' })).toBe(cargo);
  const garage = play(cargo, { type: 'finishCargo', leaveRemaining: true });
  const bike = garage.base.items.find(({ id }) => id === 'owned-1-bicycle')!;
  const packed = reload(play(garage, pack(bike.id)));
  expect(packed.flea.items).toEqual([bike]);
  expect(getView(packed).flea.used).toBe(4);
  expect(getView(play(packed, pack('home-kettle'))).flea.used).toBe(5);
  const extra = Array.from({ length: 5 }, (_, index) => ({ ...packed.base.items[0]!, id: `extra-${index}` }));
  const full = reload({ ...packed, base: { ...packed.base, items: [...packed.base.items, ...extra] } });
  const unpack = { type: 'unpackFlea', itemId: bike.id } as const;
  expect(send(full, unpack)).toBe(full);
  const unpacked = reload(play(packed, unpack));
  expect(unpacked.base.items.at(-1)).toEqual(bike);
  expect(unpacked.flea.items).toHaveLength(0);
});

it('сохраняет 15 занятых мест в коробке, отказывает шестнадцатой вещи и выдаёт квитанцию', () => {
  const upgraded = play(funded(11000), { type: 'buyCapacity', target: 'garage' });
  const extra = Array.from({ length: 13 }, (_, index) => ({
    ...upgraded.base.items[0]!, id: `flea-spare-${index}`,
  }));
  const stocked: Stage7State = { ...upgraded, base: { ...upgraded.base, items: [...upgraded.base.items, ...extra] } };
  const firstBatch = reload(play(stocked, ...stocked.base.items.slice(0, 8).map(({ id }) => pack(id))));
  const full = reload(play(firstBatch, ...firstBatch.base.items.slice(0, 7).map(({ id }) => pack(id))));
  const spare = full.base.items[0]!;
  expect(getView(full).flea).toMatchObject({ limit: 15, used: 15,
    packing: [{ id: spare.id, blocked: 'В коробке не хватает места.' }],
  });
  expect(send(full, pack(spare.id))).toBe(full);
  const paid = reload(play(reachMorning(full, 6), openFlea, confirmFlea));
  const receipt = paid.flea.visit;
  if (receipt?.phase !== 'receipt') throw new Error('Нужна квитанция барахолки');
  expect(receipt.sold.length + paid.flea.items.length).toBe(15);
  expect(getView(paid).screen.bank).toBe(receipt.revenue);
});

it('открывает отдельный экран Жигулей и сохраняет купленный фургон', () => {
  const car = reload(play(funded(24000), { type: 'navigate', room: 'home' }, { type: 'navigate', room: 'car' }));
  expect(getView(car)).toMatchObject({ screen: { phase: 'car', vehicle: { model: 'zhiguli', capacity: 4 } } });
  expect(send(car, { type: 'buyCapacity', target: 'garage' })).toBe(car);
  const replace = { type: 'buyCapacity', target: 'car' } as const;
  const purchased = reload(play(car, replace));
  expect(getView(purchased)).toMatchObject({ screen: { phase: 'car', bank: 6000 },
    vehicle: { model: 'van', capacity: 8 } });
  expect(send(purchased, replace)).toBe(purchased);
  const loaded = play(purchased, auctions, enter, { type: 'bid' }, { type: 'bid' });
  expect(getView(loaded).screen).toMatchObject({ phase: 'cargo', car: { limit: 8 } });
});

it('упаковывает находку из чемодана даже при полном гараже и сохраняет её себестоимость', () => {
  const start = funded(5000);
  const extra = Array.from({ length: 5 }, (_, index) => ({ ...start.base.items[0]!, id: `spare-${index}` }));
  const full = { ...start, base: { ...start.base, items: [...start.base.items, ...extra] } };
  const bag = play(full, auctions, { type: 'callAirport' }, { type: 'buyBaggage' }, { type: 'receiveBaggage' },
    { type: 'openBox', boxId: 'suitcase' });
  const garageSelection = { type: 'toggleCargo', itemId: 'suitcase-find' } as const;
  const boxSelection = { type: 'toggleFleaBaggage', itemId: 'suitcase-find' } as const;
  expect(send(bag, garageSelection)).toBe(bag);
  const selected = reload(play(bag, boxSelection));
  expect(selected.flea.baggageSelection).toEqual(['suitcase-find']);
  expect(send(selected, garageSelection)).toBe(selected);
  const packed = reload(play(selected, { type: 'finishCargo', leaveRemaining: false }));
  expect(packed.base.items).toEqual(full.base.items);
  expect(packed.calendar.period).toBe('morning');
  expect(packed.flea.baggageSelection).toHaveLength(0);
  const item = packed.flea.items[0]!;
  expect(item.id).toMatch(/suitcase-find$/);
  expect(packed.base.deals).toMatchObject([{ baggageId: item.baggageId, cost: 2400, revenue: 0 }]);
});

it('отзывает старый отклик и закрывает лот после объявления и барахолки с одной выплатой рейтинга', () => {
  const garage = play(funded(25000), { type: 'buyCapacity', target: 'car' }, auctions, enter, { type: 'bid' }, { type: 'bid' },
    { type: 'openBox', boxId: 'box' }, { type: 'toggleCargo', itemId: 'bicycle' }, { type: 'toggleCargo', itemId: 'tool' },
    { type: 'finishCargo', leaveRemaining: false });
  const tool = 'owned-1-tool';
  const bike = 'owned-1-bicycle';
  const market = play(garage, { type: 'navigate', room: 'market' }, { type: 'publish', itemId: tool, price: 550 });
  const blocked = play(market, { type: 'navigate', room: 'garage' });
  expect(send(blocked, pack(tool))).toBe(blocked);
  const waiting = play(blocked, { type: 'navigate', room: 'market' }, { type: 'waitForBuyer' });
  const listing = waiting.base.listings[0]!;
  if (!listing.offer) throw new Error('Ожидается отклик на инструмент');
  const updated = play(waiting, { type: 'cancelListing', listingId: listing.id }, { type: 'navigate', room: 'garage' }, pack(tool),
    { type: 'navigate', room: 'inbox' });
  expect(send(updated, { type: 'acceptOffer', listingId: listing.id, offerId: listing.offer.id })).toBe(updated);
  let listed = play(updated, { type: 'navigate', room: 'market' }, { type: 'publish', itemId: bike, price: 3500 });
  for (let day = 2; !listed.base.listings[0]?.offer && day <= 5; day++) {
    listed = play(reachMorning(listed, day), { type: 'navigate', room: 'market' }, { type: 'waitForBuyer' });
  }
  const bikeListing = listed.base.listings[0]!;
  const bikeOffer = bikeListing.offer!;
  const partial = reload(play(listed, { type: 'navigate', room: 'inbox' },
    { type: 'acceptOffer', listingId: bikeListing.id, offerId: bikeOffer.id }));
  expect(partial.base.deals).toEqual([{ lotNumber: 1, cost: 3000, revenue: bikeOffer.price }]);
  expect(partial.base.base.game.status).toBe(0);
  const saturday = reachMorning(partial, 6);
  const received = reload(play(saturday, openFlea, confirmFlea));
  expect(received.flea.items).toHaveLength(0);
  const visit = received.flea.visit;
  if (visit?.phase !== 'receipt') throw new Error('Ожидается квитанция');
  expect(visit.sold[0]?.id).toBe(tool);
  expect(received.base.deals).toHaveLength(0);
  expect(received.base.lastDeal).toMatchObject({ lotNumber: 1, receipt: { revenue: bikeOffer.price + visit.revenue, purchasePrice: 3000 } });
  expect(received.base.base.game.status).toBe(2);
});

it('читает v6 с одним календарём и отклоняет повтор одного ID в двух местах', () => {
  const current = reachMorning(starter(), 6);
  const storage = memory();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: { base: current.base, calendar: current.calendar } }));
  expect(load(storage)).toEqual({ kind: 'loaded', state: current });
  const duplicated = { ...current, flea: { ...current.flea, items: [current.base.items[0]!] } };
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: duplicated }));
  expect(load(storage).kind).toBe('damaged');
});

it('сохраняет состояние и затраты на ремонт при упаковке и продаже', () => {
  const initial = funded(5000);
  const game = initial.base.base.game;
  if (game.phase !== 'hub' || initial.base.base.relationshipOpen) throw new Error('Ожидается гараж');
  const kettle = { ...initial.base.items[0]!, lotNumber: 1, value: 300,
    estimate: { min: 150, max: 400 }, condition: 'damaged' as const };
  const damaged: Stage7State = { ...initial, base: {
    ...initial.base, base: { ...initial.base.base, game: { ...game, lotNumber: 1 } }, items: [kettle],
    deals: [{ lotNumber: 1, cost: 1000, revenue: 0 }],
  } };
  const repaired = play(damaged, { type: 'repairItem', itemId: kettle.id });
  const packed = reload(play(repaired, pack(kettle.id)));
  expect(packed.flea.items).toEqual(repaired.base.items);
  expect(packed.flea.items[0]).toMatchObject({ condition: 'good', value: 4300 });
  const receipt = reload(play(reachMorning(packed, 6), openFlea, confirmFlea));
  expect(receipt.base.lastDeal).toMatchObject({ repairCost: 500, receipt: { purchasePrice: 1500, revenue: 3182, profit: 1682 } });
});
