import { finishOuting, getCalendarView, outingAvailable } from './stage7-calendar';
import type { CalendarState, CalendarView } from './stage7-calendar';
import { baggageItems, boxVolume, fleaCapacity, fleaEstimate, fleaMorning, initialFlea, packingBlock, returnable, sellAtFlea } from './stage7-flea';
import type { FleaState } from './stage7-flea';
import { isCityVisit, visitActivity } from './stage7-events';
import type { VisitPhoto } from './stage7-events';
import { familyDateAtWake, pendingFamilyDateOn, scheduleFamilyDate } from './stage7-family';
import type { FamilyDate } from './stage7-family';
import { advanceRelationship, canOpenRelationship, getRelationshipGoal } from './relationships';
import type { RelationshipGoal, RelationshipStep } from './stage4-contract';
import type { GarageItemView, Stage5Command, Stage5View, VehicleView } from './stage5-contract';
import { applyCommand as applyStage5, houseLimit, projectedExcess, economyFor, finishCargo, getView as getStage5View, hasTutorialDelivery, listingsWithReplies, newGame as newStage5, settleSales, storageUsage, transportFor, updateStage5, vehicleFor, waitForOffers } from './stage5-engine';
import { hasBonusAuction, requiresLongBed } from './transport';
import { breakPromise, changeLife, initialLife, isTurntable, lifeScene, lifeScore, referralFor, weekOf } from './life';
import { houseLevel } from './houses';
import type { HouseLevel } from './houses';
import { applyPhone, maintainPhone, phoneFor, phoneView, relationshipTier } from './phone';
import type { PhoneCommand, PhoneState } from './phone';
import type { LifeChoice, LifeState } from './life';
import { personalCarOffer } from './personal-cars';
import { marketOffers } from './market-dialogue';
import type { PersonalCar } from './personal-cars';
import type { Stage5State } from './stage5-engine';
import { payForTransport } from './stage5-engine';
import { existingFleet, ownedTrailers, showroomCard, showroomView, trailerCard } from './showroom';
import type { Fleet, ShowroomContext, ShowroomTarget } from './showroom';
import { workModelOffer } from './transport';
import type { Stage4State } from './stage4-engine';

type PurchasedGame = Extract<Stage4State['game'], { phase: 'reveal' }>;
export interface ParkedLot {
  readonly game: PurchasedGame;
  readonly lotEdition: Stage5State['lotEdition'];
  readonly legacyLot: boolean;
}

import { initialRound, offerAt, type OpenRound } from './open-bidding';
import { emptyInventory } from './inventory';

export interface Stage7State {
  readonly round?: OpenRound;
  readonly base: Stage5State;
  readonly calendar: CalendarState;
  readonly flea: FleaState;
  readonly paidVisit: VisitPhoto | null;
  readonly familyDate: FamilyDate | null;
  readonly jobUnlocked?: true;
  readonly parkedLots?: readonly ParkedLot[];
  readonly lastAuctionNumber?: number;
  readonly bonusAuctionUsed?: true;
  readonly life?: LifeState;
  readonly personalCar?: PersonalCar;
  readonly cityVisit?: true;
  readonly fleet?: Fleet;
  readonly phone?: PhoneState;
}

type CalendarAction = 'waitUntilNextPeriod' | 'sleep' | 'wakeUp';
type FleaNavigation = 'openFleaVisit' | 'cancelFleaVisit' | 'confirmFleaVisit' | 'closeFleaReceipt';
type FleaPacking = 'packForFlea' | 'unpackFlea' | 'toggleFleaBaggage';
type PhotoAction = 'openVisitPhoto' | 'closeVisitPhoto';
type SimpleAction = 'startAuction' | 'auctionTick' | 'skipAsk' | CalendarAction | FleaNavigation | PhotoAction | 'giveBirthdayFlowers' | 'authorizeJob' | 'parkLot'
  | 'displayTurntable' | 'retrieveTurntable' | 'openReferral';

type Command = Stage5Command | PhoneCommand | {
  [Action in SimpleAction]: { readonly type: Action; readonly expectedRevision: number };
}[SimpleAction] | {
  [Action in FleaPacking]: { readonly type: Action; readonly expectedRevision: number; readonly itemId: string };
}[FleaPacking] | { readonly type: 'resumeLot'; readonly expectedRevision: number; readonly lotNumber: number }
  | { readonly type: 'chooseLife'; readonly expectedRevision: number; readonly choice: LifeChoice }
  | { readonly type: 'buyPersonalCar'; readonly expectedRevision: number; readonly car: PersonalCar }
  | { readonly type: 'buyVehicle'; readonly expectedRevision: number; readonly target: ShowroomTarget; readonly tradeIn: boolean }
  | { readonly type: 'sellVehicle'; readonly expectedRevision: number; readonly target: Exclude<ShowroomTarget, { category: 'trailers' }> }
  | { readonly type: 'activateVehicle'; readonly expectedRevision: number; readonly target: ShowroomTarget }
  | { readonly type: 'toggleVehicleGoal'; readonly expectedRevision: number; readonly target: ShowroomTarget }
  | { readonly type: 'detachTrailer'; readonly expectedRevision: number; readonly target: Extract<ShowroomTarget, { category: 'trailers' }> };

export type Stage7Command = Command & { readonly auctionRef?: { readonly lotNumber: number; readonly offerIndex: number } };
export type Stage7Dispatch = (command: Stage7Command) => void;

export interface Stage7View {
  readonly closingCall?: string;
  readonly auction?: { offerIndex: number; running: boolean; ask: number; standing: number; leader: string | undefined; elapsed: number; skipped: boolean;
    participants: readonly { id: string; name: string; out: boolean; amount: number | undefined }[] };
  readonly screen: Stage5View;
  readonly jobUnlocked: boolean;
  readonly parkedLots: readonly { lotNumber: number; purchasePrice: number }[];
  readonly canParkLot: boolean;
  readonly vehicle: VehicleView;
  readonly personalCar?: PersonalCar;
  readonly personalOffer: ReturnType<typeof personalCarOffer>;
  readonly showroom?: ReturnType<typeof showroomView>;
  readonly auctionTransport?: { readonly garageFree: number; readonly tutorialDelivery: boolean; readonly longLoad: string | null };
  readonly calendar: CalendarView;
  readonly flea: FleaView;
  readonly paidVisit: VisitPhoto | null;
  readonly familyDate: FamilyDateView | null;
  readonly life: LifeView;
  readonly phone: ReturnType<typeof phoneView>;
  readonly marketUnread: number;
  readonly sellerReviews: NonNullable<Stage5State['reviews']>;
}

interface LifeView {
  readonly score: number;
  readonly canOpen: boolean;
  readonly last?: LifeChoice;
  readonly scene: (Omit<NonNullable<ReturnType<typeof lifeScene>>, 'item'> & { itemName?: string }) | null;
  readonly promise?: { kind: NonNullable<LifeState['promise']>['kind']; due: number; itemId?: string; itemName?: string };
  readonly referral: { itemName: string; price: number; day: number } | null;
  readonly home: { level: HouseLevel;
    display?: string; displayCandidate?: string };
}

interface FamilyDateView extends FamilyDate {
  readonly affection: -1 | 0 | 1;
  readonly price: number;
  readonly advancesStory: boolean;
  readonly step: RelationshipStep;
  readonly status: number;
  readonly nextGoal: RelationshipGoal | null;
}

export interface FleaView {
  readonly items: readonly (Pick<GarageItemView, 'id' | 'name' | 'size' | 'estimate'> & { readonly canReturn: boolean })[];
  readonly packing: readonly { readonly id: string; readonly blocked: string | null; readonly selected: boolean }[];
  readonly used: number;
  readonly limit: number;
  readonly canVisit: boolean;
  readonly visit: FleaState['visit'];
}

export function migrateStage5(base: Stage5State): Stage7State {
  return { base, calendar: { day: 1, period: 'morning' }, flea: initialFlea(base), paidVisit: null,
    familyDate: base.base.relationshipStep === 'unmet' ? null : scheduleFamilyDate(1) };
}

export function newGame(seed?: number): Stage7State {
  return migrateStage5({ ...newStage5(seed), legacyExcess: 0, transport: { model: 'scooter' } });
}

function canUseBonusAuction(state: Stage7State): boolean {
  return state.calendar.period === 'evening' && !state.bonusAuctionUsed && hasBonusAuction(transportFor(state.base));
}

function confirmFleaVisit(state: Stage7State): Stage7State {
  const { base, calendar, flea } = state;
  if (!fleaMorning(calendar) || base.room !== 'home' || !flea.items.length) return state;
  const { seed, sold, remaining } = sellAtFlea(flea);
  const next = settleSales(base, sold, remaining);
  if (next === base) return state;
  return {
    ...state,
    base: next, calendar: finishOuting(calendar),
    flea: { ...flea, items: remaining, seed, visit: {
      phase: 'receipt', day: calendar.day, bankBefore: base.base.game.bank,
      sold: sold.map(({ item, price }) => ({ id: item.id, name: item.name, size: item.size, price })),
      revenue: sold.reduce((sum, { price }) => sum + price, 0),
    } },
  };
}

function packAtHome(state: Stage7State, command: Extract<Stage7Command, { type: 'packForFlea' | 'unpackFlea' }>): Stage7State {
  const { base, flea } = state;
  if (base.room !== 'garage') return state;
  if (command.type === 'packForFlea') {
    const item = base.items.find(({ id }) => id === command.itemId);
    if (!item || packingBlock(base, boxVolume(flea.items), item)) return state;
    return { ...state, base: updateStage5(base, { items: base.items.filter(({ id }) => id !== item.id) }),
      flea: { ...flea, items: [...flea.items, item] } };
  }
  const item = flea.items.find(({ id }) => id === command.itemId);
  if (!item || !returnable(base, item)) return state;
  return { ...state, base: updateStage5(base, { items: [...base.items, item] }),
    flea: { ...flea, items: flea.items.filter(({ id }) => id !== item.id) } };
}

function toggleBaggageBox(state: Stage7State, itemId: string): Stage7State {
  const { base, flea } = state;
  const items = baggageItems(base);
  const item = items.find(({ id }) => id === itemId);
  if (!item) return state;
  const selection = flea.baggageSelection;
  if (selection.includes(itemId)) {
    return { ...state, base: updateStage5(base, {}), flea: { ...flea, baggageSelection: selection.filter((id) => id !== itemId) } };
  }
  const used = boxVolume(flea.items) + boxVolume(items.filter(({ id }) => selection.includes(id)));
  if (packingBlock(base, used, item)) return state;
  return { ...state, base: updateStage5(base, {}), flea: { ...flea, baggageSelection: [...selection, itemId] } };
}

function giveBirthdayFlowers(state: Stage7State): Stage7State {
  const { base, calendar } = state;
  const profile = base.base;
  const familyDate = pendingFamilyDateOn(state.familyDate, calendar.day);
  if (!familyDate || profile.game.phase !== 'hub' ||
      (base.room !== 'home' && !profile.relationshipOpen)) return state;
  const economy = economyFor(base);
  if (profile.game.bank < economy.flowerPrice) return state;

  const celebrated: FamilyDate = { ...familyDate, outcome: 'celebrated' };
  if (profile.relationshipStep === 'met') {
    const advanced = advanceRelationship(profile.game, profile.relationshipStep, 'buyFlowers', economy);
    if (!advanced) return state;
    return { ...state, base: { ...base, base: { ...profile, ...advanced } }, familyDate: celebrated };
  }
  return { ...state, base: updateStage5(base, {}, profile.game.bank - economy.flowerPrice), familyDate: celebrated };
}

const lifeFor = (state: Stage7State) => state.life ?? initialLife(state.base.base.relationshipStep);
const hasCityVisit = (state: Stage7State) => state.cityVisit === true || isCityVisit(state.paidVisit?.record.venue);
function showroomContext(state: Stage7State): ShowroomContext {
  const game = state.base.base.game;
  const work = transportFor(state.base);
  return { work, ...(state.personalCar ? { personal: state.personalCar } : {}),
    fleet: state.fleet ?? existingFleet(work, state.personalCar), bank: game.bank, status: game.status,
    cityVisit: hasCityVisit(state), firstAuctionDone: 'lotNumber' in game && game.lotNumber > 0 };
}

type ShowroomCommand = Extract<Stage7Command, { target: ShowroomTarget }>;

function updateShowroom(state: Stage7State, command: ShowroomCommand): Stage7State {
  const { base } = state;
  if (command.type === 'sellVehicle') {
    if (base.room !== 'market' || base.base.game.phase !== 'hub' || base.base.relationshipOpen) return state;
    const context = showroomContext(state);
    const card = showroomCard(context, command.target);
    if (!card.owned || card.saleBlock || !card.resale) return state;
    const { fleet } = context;
    const bank = context.bank + card.resale;
    const target = command.target;
    if (target.category === 'work') {
      const work = fleet.work.filter(entry => entry.model !== target.model);
      return { ...state, fleet: { ...fleet, work }, base: updateStage5(base, card.active ? { transport: work[0]! } : {}, bank) };
    }
    const personal = fleet.personal.filter(id => id !== target.model);
    const { personalCar, ...rest } = state;
    const active = card.active ? personal[0] : personalCar;
    return { ...rest, ...(active ? { personalCar: active } : {}), fleet: { ...fleet, personal }, base: updateStage5(base, {}, bank) };
  }
  if ((base.room !== 'home' && base.room !== 'car') || base.base.game.phase !== 'hub' || base.base.relationshipOpen) return state;
  const context = showroomContext(state);
  const { fleet } = context;
  const { target } = command;
  if (target.category === 'trailers') {
    const card = trailerCard(context, target.model);
    if (!card) return state;
    if (command.type === 'toggleVehicleGoal') {
      const { trailerGoal, ...rest } = fleet;
      return { ...state, fleet: trailerGoal === target.model ? rest : { ...rest, trailerGoal: target.model }, base: updateStage5(base, {}) };
    }
    const truck = fleet.work.find(entry => entry.model === 'heavy');
    if (!truck) return state;
    const buying = command.type === 'buyVehicle';
    const detaching = command.type === 'detachTrailer';
    if (buying ? command.tradeIn || card.owned || card.fullMissing : detaching ? !card.active : !card.owned || card.active) return state;

    const heavy = { ...truck, trailer: detaching ? null : target.model };
    const trailers = ownedTrailers(fleet);
    return { ...state, fleet: { ...fleet, work: fleet.work.map(entry => entry.model === 'heavy' ? heavy : entry),
      trailers: buying ? [...trailers, target.model] : trailers },
      base: updateStage5(base, context.work.model === 'heavy' ? { transport: heavy } : {},
        context.bank - (buying ? card.price : 0)) };
  }
  const card = showroomCard(context, target);
  if (!card.name) return state;
  if (command.type === 'toggleVehicleGoal') {
    if (target.category === 'work') {
      const { workGoal, ...rest } = fleet;
      return { ...state, fleet: workGoal === target.model ? rest : { ...rest, workGoal: target.model }, base: updateStage5(base, {}) };
    }
    const { personalGoal, ...rest } = fleet;
    return { ...state, fleet: personalGoal === target.model ? rest : { ...rest, personalGoal: target.model }, base: updateStage5(base, {}) };
  }
  if (command.type === 'activateVehicle') {
    if (!card.owned || card.active) return state;
    if (target.category === 'personal') return { ...state, fleet, personalCar: target.model, base: updateStage5(base, {}) };
    const work = fleet.work.find(entry => entry.model === target.model);
    return work ? { ...state, fleet, base: updateStage5(base, { transport: work }) } : state;
  }
  if (command.type !== 'buyVehicle' || card.owned || card.blocked.length ||
      (command.tradeIn ? !card.tradeIn || card.tradeMissing : card.fullMissing)) return state;
  const price = card.price - (command.tradeIn ? card.tradeIn : 0);
  if (target.category === 'personal') {
    const kept = fleet.personal.filter(id => !command.tradeIn || id !== context.personal);
    return { ...state, personalCar: target.model, cityVisit: true, fleet: { ...fleet, personal: [...kept, target.model] },
      base: updateStage5(base, {}, context.bank - price) };
  }
  const offer = workModelOffer(target.model);
  const next = offer?.next ?? (target.model === 'scooter' ? { model: 'scooter' } as const : null);
  if (!next) return state;
  const kept = fleet.work.filter(entry => !command.tradeIn || entry.model !== context.work.model);
  return { ...state, fleet: { ...fleet, work: [...kept, next] }, base: payForTransport(base, next, price) };
}
const displayCandidate = (base: Stage5State) => base.items.find(item => isTurntable(item) && item.condition !== 'damaged' &&
  !base.listings.some(({ itemId }) => itemId === item.id));

function chooseLife(state: Stage7State, choice: LifeChoice): Stage7State {
  const { base, calendar } = state;
  if (!base.base.relationshipOpen) return state;
  let life = lifeFor(state);
  const scene = lifeScene(life, base, calendar.day, calendar.period === 'evening');
  if (!scene || !scene.choices.includes(choice)) return state;
  const { id, item } = scene;
  const day = calendar.day;
  let nextBase = base;
  if (id === 'intro') {
    nextBase = applyStage5(base, { type: 'meetNeighbor', expectedRevision: base.base.game.revision }, state.flea.items);
    if (nextBase === base) return state;
  }
  if (choice === 'giveCamera' && item) nextBase = settleSales(base, [{ item, price: null }], state.flea.items);
  if (choice === 'reschedule') {
    if (!life.promise) return state;
    return { ...state, base: updateStage5(base, {}), life: { ...life, last: choice, promise: { ...life.promise, due: day + 1 } } };
  }
  if (choice === 'talk') life = changeLife(life, { trust: 1, interest: 1 });
  if (choice === 'repair' || choice === 'keep') life = changeLife(life, { interest: 1 });
  if (choice === 'listen') life = changeLife(life, { trust: 2, reliability: 1, memories: 1 });
  if (choice === 'giveCamera') life = changeLife(life, { trust: 1, reliability: 1 });
  if (choice === 'apologize') life = changeLife(life, { trust: 1 });

  const { promise, broken, ...history } = life;
  const gain = life.seen.includes(id) ? 0 : 1;
  life = { ...history, last: choice, seen: gain ? [...life.seen, id] : life.seen };
  if (broken && choice !== 'apologize') life = { ...life, broken };
  if (choice === 'keep' && item) life = { ...life, promise: { kind: 'listening', itemId: item.id, due: day } };
  else if (choice === 'acceptRequest') life = { ...life, promise: { kind: 'camera', due: day + 3 } };
  else if (promise && choice !== 'listen' && choice !== 'giveCamera') life = { ...life, promise };

  const current = nextBase.base.game;
  const status = current.status + gain;
  if (!Number.isSafeInteger(status)) return state;
  const next = nextBase === base ? updateStage5(base, {}, current.bank, status) :
    { ...nextBase, base: { ...nextBase.base, game: { ...current, status } } } as Stage5State;
  return { ...state, base: next, life, familyDate: id === 'intro' ? scheduleFamilyDate(day) : state.familyDate };
}

function maintainLife(state: Stage7State, next: Stage7State): Stage7State {
  if (state === next || !next.life) return next;
  const life = next.life;
  if (next.base.base.relationshipStep !== 'unmet' && !life.seen.includes('intro')) {
    return { ...next, life: { ...life, ...initialLife(next.base.base.relationshipStep) } };
  }
  if (life.promise && next.calendar.day > life.promise.due) return { ...next, life: breakPromise(life, 'missed') };
  const promised = life.promise?.itemId;
  if (promised && !next.base.items.some(({ id }) => id === promised)) return { ...next, life: breakPromise(life, 'soldPromise') };
  return next;
}

export function applyCommand(state: Stage7State, command: Stage7Command): Stage7State {
  const next = maintainPhone(state, maintainLife(state, reduce(state, command)), command);
  if (next === state || next.base.legacyExcess === undefined) return next;
  const excess = projectedExcess(next.base);
  if (excess > next.base.legacyExcess) return state;
  return excess === next.base.legacyExcess ? next : { ...next, base: { ...next.base, legacyExcess: excess } };
}

function reduce(state: Stage7State, command: Stage7Command): Stage7State {
  const { base, calendar, flea, paidVisit, familyDate } = state;
  const profile = base.base;
  if (profile.game.revision !== command.expectedRevision) return state;
  const game = profile.game;
  if (command.auctionRef && (game.phase !== 'inspection' || base.lotEdition !== 12 ||
    game.lotNumber !== command.auctionRef.lotNumber || (state.round?.bids.length ?? 0) !== command.auctionRef.offerIndex)) return state;
  if (base.lotEdition === 12 && game.phase === 'inspection') {
    const round = state.round ?? initialRound;
    const offer = offerAt(game.lot, game.lotSeed ?? 0, round, economyFor(base).advancePrice);
    const record = (next: OpenRound) => ({ ...state, round: next, base: updateStage5(base, {}) });
    const bid = (id: string) => record({ ...initialRound, bids: [...round.bids, id] });
    if (command.type === 'startAuction') return state.round ? state : record(initialRound);
    if (command.type === 'bid') return !round.skipped && offer.ask <= game.bank && offer.leader !== 'player' ? bid('player') : state;
    if (command.type === 'skipAsk') return !round.skipped && offer.leader !== 'player' ? record({ ...round, skipped: true }) : state;
    if (command.type === 'pass' && offer.leader === 'player') return state;
    if (command.type === 'auctionTick') {
      if (!state.round) return state;
      const elapsed = round.elapsed + 1;
      if (offer.next && elapsed >= offer.next.delay) return bid(offer.next.id);
      if (elapsed < 10) return record({ ...round, elapsed });
      if (offer.leader === 'player') {
        const bought = { ...game, ...emptyInventory, revision: game.revision + 1, phase: 'reveal' as const,
          activeOpponentIds: [], bank: game.bank - offer.standing, purchasePrice: offer.standing };
        const { round: _closed, ...rest } = state;
        return { ...rest, base: { ...base, base: { ...profile, relationshipOpen: false, game: bought } } };
      }
      const closed = reduce(state, { type: 'pass', expectedRevision: game.revision });
      return { ...closed, round };
    }
    if (command.type === 'pass' && state.round) {
      const { round: _closed, ...rest } = state;
      return reduce(rest, command);
    }
  }
  if (command.type === 'auctionTick' || command.type === 'startAuction' || command.type === 'skipAsk') return state;
  if (game.phase === 'result' && state.round && command.type === 'nextLot') {
    const { round: _closed, ...rest } = state;
    return reduce(rest, command);
  }
  if (command.type === 'phone') return applyPhone(state, command);
  if (command.type === 'confirmMoveIn' && relationshipTier(phoneFor(state)) !== 'Близкие отношения') return state;
  if (command.type === 'authorizeJob') {
    return profile.game.phase === 'recovery' && !state.jobUnlocked
      ? { ...state, jobUnlocked: true, base: updateStage5(base, {}) } : state;
  }
  if ((command.type === 'sortItem' || command.type === 'claimJob') && !state.jobUnlocked) return state;

  if (paidVisit?.open) {
    if (command.type !== 'closeVisitPhoto') return state;
    return { ...state, base: updateStage5(base, {}), paidVisit: { ...paidVisit, open: false } };
  }

  if (flea.visit) {
    if (flea.visit.phase === 'offer' && command.type === 'confirmFleaVisit') return confirmFleaVisit(state);
    if ((flea.visit.phase === 'offer' && command.type === 'cancelFleaVisit') ||
        (flea.visit.phase === 'receipt' && command.type === 'closeFleaReceipt')) {
      return { ...state, base: updateStage5(base, {}), flea: { ...flea, visit: null } };
    }
    return state;
  }

  if (command.type === 'sleep' || command.type === 'wakeUp' || command.type === 'waitUntilNextPeriod') {
    if (base.room !== 'home' || base.opening !== null || profile.relationshipOpen || profile.game.phase !== 'hub') return state;
    if (command.type === 'waitUntilNextPeriod') {
      return outingAvailable(calendar.period)
        ? { ...state, base: waitForOffers(base), calendar: finishOuting(calendar) } : state;
    }
    if (command.type === 'sleep' && calendar.period !== 'evening') return state;
    if (command.type === 'wakeUp' && (calendar.period !== 'night' || calendar.day >= Number.MAX_SAFE_INTEGER)) return state;
    const awake = command.type === 'wakeUp';
    const day = awake ? calendar.day + 1 : calendar.day;
    const { bonusAuctionUsed, ...rest } = state;
    return {
      ...rest,
      ...(!awake && bonusAuctionUsed ? { bonusAuctionUsed } : {}),
      base: updateStage5(base, {}),
      calendar: { day, period: awake ? 'morning' : 'night' },
      familyDate: awake ? familyDateAtWake(familyDate, day) : familyDate,
    };
  }

  if (calendar.period === 'night') return state;
  if (command.type === 'sellVehicle' || command.type === 'buyVehicle' || command.type === 'activateVehicle' || command.type === 'toggleVehicleGoal' || command.type === 'detachTrailer') {
    return updateShowroom(state, command);
  }
  if (state.fleet && (command.type === 'buyPersonalCar' || command.type === 'buyCapacity' && command.target === 'car' ||
      command.type === 'upgradeTransport' && (transportFor(base).model !== 'heavy' ||
        command.upgrade === 'highSideTrailer' || command.upgrade === 'containerTrailer'))) return state;
  if (command.type === 'buyPersonalCar') {
    if (base.room !== 'home') return state;
    const game = profile.game;
    const offer = personalCarOffer(state.personalCar, game.status, game.bank, hasCityVisit(state));
    if (!offer || offer.id !== command.car || offer.blocked) return state;
    return { ...state, personalCar: offer.id, cityVisit: true, base: updateStage5(base, {}, game.bank - offer.total) };
  }
  if (command.type === 'chooseLife') return chooseLife(state, command.choice);
  if (command.type === 'spend' && command.offerId === 'home') return state;
  if (command.type === 'displayTurntable' || command.type === 'retrieveTurntable') {
    if (base.room !== 'home' || !profile.game.assets.includes('home')) return state;
    const { displayId, ...rest } = lifeFor(state);
    const item = displayCandidate(base);
    if (command.type === 'retrieveTurntable') return displayId ? { ...state, base: updateStage5(base, {}), life: rest } : state;
    return !displayId && item ? { ...state, base: updateStage5(base, {}), life: { ...rest, displayId: item.id } } : state;
  }
  if (command.type === 'openReferral') {
    if (!profile.relationshipOpen || state.phone?.order || state.phone?.orderWeek === weekOf(calendar.day)) return state;
    const life = lifeFor(state);
    const referral = referralFor(life, base, calendar.day);
    if (!referral) return state;
    const id = `listing-${profile.game.revision + 1}`;
    const { item, price } = referral;
    const listing = { id, itemId: item.id, price, offer: {
      id: `offer-${id}-referral`, buyer: 'Лера · по рекомендации', price, ceiling: price, unread: true,
      messages: [{ side: 'buyer' as const, text: 'Привет! Мне посоветовала тебя подруга. Ищу такую вещь в рабочем состоянии для своей коллекции. Готова забрать по указанной цене.' }],
    } };
    const inbox = updateStage5(base, { room: 'inbox', listings: [...base.listings, listing] });
    return { ...state, base: { ...inbox, base: { ...inbox.base, relationshipOpen: false } },
      life: { ...life, recommendedWeek: weekOf(calendar.day) } };
  }
  if ((command.type === 'discardItem' || command.type === 'packForFlea' || command.type === 'publish') &&
      state.life?.displayId === command.itemId) return state;
  const parkedLots = state.parkedLots ?? [];
  if (command.type === 'parkLot') {
    const game = profile.game;
    if (game.phase !== 'reveal' || base.cargo.length || (!outingAvailable(calendar.period) && !state.bonusAuctionUsed) ||
      state.lastAuctionNumber !== undefined) return state;
    const { bank, revision, status, lotNumber, assets, nextSeed, offerSeeds } = game;
    return {
      ...state, calendar: finishOuting(calendar),
      parkedLots: [...parkedLots, { game, lotEdition: base.lotEdition, legacyLot: base.legacyLot }],
      base: { ...base, room: null, legacyLot: false, listings: listingsWithReplies(base), base: { ...profile, game: {
        phase: 'hub', bank, revision: revision + 1, status, lotNumber, assets, nextSeed, offerSeeds,
      } } },
    };
  }
  if (command.type === 'resumeLot') {
    const game = profile.game;
    const parked = parkedLots.find(entry => entry.game.lotNumber === command.lotNumber);
    if (!parked || game.phase !== 'hub' || profile.relationshipOpen) return state;
    const { bank, revision, status, lotNumber, assets, offerSeeds, nextSeed } = game;
    return { ...state, lastAuctionNumber: lotNumber, parkedLots: parkedLots.filter(entry => entry !== parked),
      base: { ...base, room: null, lotEdition: parked.lotEdition, legacyLot: parked.legacyLot, base: {
        ...profile, game: { ...parked.game, bank, revision: revision + 1, status, assets, offerSeeds, nextSeed },
      } } };
  }
  switch (command.type) {
    case 'giveBirthdayFlowers':
      return giveBirthdayFlowers(state);
    case 'buyFlowers':
      if (profile.relationshipOpen && profile.relationshipStep === 'met' && pendingFamilyDateOn(familyDate, calendar.day)) {
        return giveBirthdayFlowers(state);
      }
      break;
    case 'openVisitPhoto':
      if (base.room !== 'home' || !paidVisit) return state;
      return { ...state, base: updateStage5(base, {}), paidVisit: { ...paidVisit, open: true } };
    case 'closeVisitPhoto':
      return state;
    case 'openFleaVisit':
      if (base.room !== 'home' || !fleaMorning(calendar) || !flea.items.length) return state;
      return { ...state, base: updateStage5(base, {}), flea: { ...flea, visit: { phase: 'offer' } } };
    case 'cancelFleaVisit':
    case 'confirmFleaVisit':
    case 'closeFleaReceipt':
      return state;
    case 'packForFlea':
    case 'unpackFlea':
      return packAtHome(state, command);
    case 'toggleFleaBaggage':
      return toggleBaggageBox(state, command.itemId);
    case 'toggleCargo':
      if (flea.baggageSelection.includes(command.itemId)) return state;
      break;
    case 'finishCargo':
      if (flea.baggageSelection.length) {
        const delivery = finishCargo(base, command.leaveRemaining, flea.items, flea.baggageSelection);
        if (!delivery) return state;
        return { ...state, base: delivery.base,
          flea: { ...flea, items: [...flea.items, ...delivery.packed], baggageSelection: [] } };
      }
      break;
  }
  const visit = visitActivity(command);
  const waits = command.type === 'waitForBuyer';
  const bonusEntry = command.type === 'enterAuction' && canUseBonusAuction(state);
  if ((command.type === 'enterAuction' || visit || waits) && !outingAvailable(calendar.period) && !bonusEntry) return state;
  const source = command.type === 'openRelationship' && base.room === 'home' ? { ...base, room: null } : base;
  const next = applyStage5(source, command, flea.items);
  if (next === source) return state;
  if (command.type === 'upgradeTransport' && state.fleet && next.transport) {
    const transport = next.transport;
    return { ...state, base: next, fleet: { ...state.fleet,
      work: state.fleet.work.map(entry => entry.model === transport.model ? transport : entry) } };
  }
  const bonus = (bonusEntry || command.type === 'claimJob' && canUseBonusAuction(state)) && next.base.game.phase === 'inspection'
    ? { bonusAuctionUsed: true } as const : {};

  if (visit && outingAvailable(calendar.period)) {
    const game = next.base.game;
    return {
      ...state, base: next, calendar: finishOuting(calendar),
      ...(hasCityVisit(state) || isCityVisit(visit.venue) ? { cityVisit: true } as const : {}),
      paidVisit: { open: true, record: {
        ...visit, day: calendar.day, outing: calendar.period, revision: game.revision,
        spent: profile.game.bank - game.bank, statusGain: game.status - profile.game.status,
      } },
    };
  }

  if (command.type === 'finishCargo' && state.lastAuctionNumber !== undefined && next.base.game.phase === 'hub') {
    const { lastAuctionNumber, ...rest } = state;
    return { ...rest, base: { ...next, base: { ...next.base, game: { ...next.base.game, lotNumber: lastAuctionNumber } } } };
  }
  const auctionFinished = (command.type === 'nextLot' && profile.game.phase === 'result') ||
    (command.type === 'finishCargo' && profile.game.phase === 'reveal');
  const nextWithReplies = auctionFinished ? { ...next, listings: listingsWithReplies(next) } : next;
  if (state.jobUnlocked && next.base.game.phase !== 'recovery') {
    const { jobUnlocked: _unused, ...rest } = state;
    return { ...rest, ...bonus, base: nextWithReplies };
  }
  return {
    ...state, base: nextWithReplies, calendar: waits || auctionFinished ? finishOuting(calendar) : calendar,
    ...bonus,
    familyDate: command.type === 'meetNeighbor' ? scheduleFamilyDate(calendar.day) : familyDate,
  };
}

export function getView(state: Stage7State): Stage7View {
  const { base, calendar, flea, familyDate } = state;
  const candidates = base.room === 'garage' ? base.items : baggageItems(base);
  const used = boxVolume(flea.items) + boxVolume(candidates.filter(({ id }) => flea.baggageSelection.includes(id)));
  const { game, relationshipStep: step } = base.base;
  const economy = economyFor(base);
  const vehicle = vehicleFor(base);
  const life = lifeFor(state);
  const event = base.base.relationshipOpen ? lifeScene(life, base, calendar.day, calendar.period === 'evening') : null;
  const referral = base.base.relationshipOpen && !state.phone?.order && state.phone?.orderWeek !== weekOf(calendar.day)
    ? referralFor(life, base, calendar.day) : null;
  const homeImproved = game.assets.includes('home');
  const displayed = base.items.find(({ id }) => id === life.displayId);
  const candidate = homeImproved && !displayed ? displayCandidate(base) : null;
  const promised = base.items.find(({ id }) => id === life.promise?.itemId);
  const stage5 = getStage5View(base);
  const screen = stage5.phase === 'hub' ? { ...stage5, offers: stage5.offers.filter(({ id }) => id !== 'home') }
    : stage5.phase === 'relationship' && relationshipTier(phoneFor(state)) !== 'Близкие отношения'
      ? { ...stage5, allowedActions: stage5.allowedActions.filter(action => action !== 'confirmMoveIn') } : stage5;
  const homeScreen = screen.phase === 'home' && state.personalCar ? { ...screen, personalCar: state.personalCar } : screen;
  let auction: Stage7View['auction'];
  let closingCall: string | undefined;
  if (base.lotEdition === 12 && game.phase === 'inspection') {
    const round = state.round ?? initialRound;
    const offer = offerAt(game.lot, game.lotSeed ?? 0, round, economy.advancePrice);
    const bidders = [...game.lot.opponents, { id: 'player', name: 'Вы', limit: game.bank }];
    auction = { ...round, offerIndex: round.bids.length, running: state.round !== undefined, ask: offer.ask, standing: offer.standing, leader: offer.leader,
      participants: bidders.map(({ id, name, limit }) => ({ id, name, amount: offer.amounts.get(id),
        out: state.round !== undefined && id !== offer.leader && limit < offer.ask })) };
  } else if (game.phase === 'result' && state.round) {
    const offer = offerAt(game.lot, game.lotSeed ?? 0, state.round, economy.advancePrice);
    const winner = game.lot.opponents.find(opponent => opponent.id === offer.leader);
    closingCall = winner ? `Победитель — ${winner.name}. Цена ${offer.standing.toLocaleString('ru-RU')} ₽.` : 'Ставок нет. Лот остался непроданным.';
  }
  const auctionScreen = auction && homeScreen.phase === 'inspection' ? {
    ...homeScreen, nextBidAmount: auction.ask,
    allowedActions: homeScreen.allowedActions.filter(action => {
      if (action === 'pass') return auction.leader !== 'player';
      if (action === 'bid') return auction.ask <= homeScreen.bank && auction.leader !== 'player' && !auction.skipped;
      return true;
    }),
  } : homeScreen;
  return {
    ...(auction ? { auction } : {}), ...(closingCall ? { closingCall } : {}),
    screen: displayed && (screen.phase === 'garage' || screen.phase === 'market')
      ? { ...screen, items: screen.items.filter(({ id }) => id !== displayed.id) } : auctionScreen,
    vehicle, phone: phoneView(state), jobUnlocked: state.jobUnlocked === true,
    marketUnread: base.listings.flatMap(marketOffers).filter(({ unread, closed }) => unread && !closed).length,
    sellerReviews: base.reviews ?? [],
    ...(state.personalCar ? { personalCar: state.personalCar } : {}),
    personalOffer: personalCarOffer(state.personalCar, game.status, game.bank, hasCityVisit(state)),
    ...(calendar.period !== 'night' && !state.paidVisit?.open && !flea.visit && (base.room === 'home' || base.room === 'car' || base.room === 'market')
      ? { showroom: showroomView(showroomContext(state)) } : {}),
    life: {
      score: lifeScore(life), canOpen: canOpenRelationship(game.status), ...(life.last ? { last: life.last } : {}),
      scene: event ? { id: event.id, title: event.title, line: event.line, choices: event.choices,
        ...(event.item ? { itemName: event.item.name } : {}) } : null,
      ...(life.promise ? { promise: { kind: life.promise.kind, due: life.promise.due,
        ...(promised ? { itemId: promised.id, itemName: promised.name } : {}) } } : {}),
      referral: referral ? { itemName: referral.item.name, price: referral.price, day: referral.day } : null,
      home: { level: houseLevel(base.house, base.workshop, homeImproved),
        ...(displayed ? { display: displayed.name } : {}), ...(candidate ? { displayCandidate: candidate.name } : {}) },
    },
    ...(game.phase === 'inspection' || game.phase === 'bidding' ? { auctionTransport: {
      garageFree: Math.max(0, houseLimit(base) - storageUsage(base.items, false, base.legacyExcess !== undefined)),
      tutorialDelivery: hasTutorialDelivery(vehicle.model, game),
      longLoad: base.transport && (vehicle.model === 'scooter' || vehicle.model === 'zhiguli')
        ? game.lot.visibleFinds.find(({ name }) => requiresLongBed(name))?.name ?? null : null,
    } } : {}),
    parkedLots: (state.parkedLots ?? []).map(({ game }) => ({ lotNumber: game.lotNumber, purchasePrice: game.purchasePrice })),
    canParkLot: base.base.game.phase === 'reveal' && !base.cargo.length && state.lastAuctionNumber === undefined
      && (outingAvailable(calendar.period) || state.bonusAuctionUsed === true),
    calendar: {
      ...getCalendarView(calendar),
      ...(calendar.period === 'evening' && hasBonusAuction(transportFor(base))
        ? { bonusAuction: state.bonusAuctionUsed ? 'used' as const : 'available' as const } : {}),
    }, paidVisit: state.paidVisit,
    familyDate: familyDate && {
      ...familyDate, affection: familyDate.outcome === 'celebrated' ? 1 : familyDate.outcome === 'missed' ? -1 : 0,
      price: economy.flowerPrice, advancesStory: step === 'met', step, status: game.status,
      nextGoal: getRelationshipGoal(game, step, economy),
    },
    flea: {
      items: flea.items.map((item) => ({ id: item.id, name: item.name, size: item.size, estimate: fleaEstimate(item),
        canReturn: returnable(base, item) })),
      packing: candidates.map((item) => ({ id: item.id, selected: flea.baggageSelection.includes(item.id),
        blocked: flea.baggageSelection.includes(item.id) ? null : packingBlock(base, used, item) })),
      used, limit: fleaCapacity, canVisit: base.room === 'home' && fleaMorning(calendar) && flea.items.length > 0,
      visit: flea.visit,
    },
  };
}
