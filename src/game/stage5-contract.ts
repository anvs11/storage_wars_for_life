import type { ItemId, PassedReceipt, SoldReceipt } from './contract';
import type { Stage3Scene } from './stage3-contract';
import type { Stage4Command, Stage4View } from './stage4-contract';
import type { TransportModel, TransportUpgrade } from './transport';
import type { PersonalCar } from './personal-cars';

export const prologueFrames = ['eviction', 'rain', 'call', 'keys'] as const;
export const jobStations = ['shelf', 'floor', 'recycle'] as const;
export const roomNames = ['home', 'garage', 'market', 'inbox', 'car'] as const;

export type Room = typeof roomNames[number];
export type JobStation = typeof jobStations[number];
export type Stage5Command = Stage4Command | { readonly expectedRevision: number } & (
  | { readonly type: 'navigate'; readonly room: Room | 'auctions' }
  | { readonly type: 'toggleCargo' | 'discardItem'; readonly itemId: ItemId }
  | { readonly type: 'finishCargo'; readonly leaveRemaining: boolean }
  | { readonly type: 'publish'; readonly itemId: ItemId; readonly price: number }
  | { readonly type: 'readOffer' | 'acceptOffer'; readonly listingId: string; readonly offerId: string }
  | { readonly type: 'sortItem'; readonly station: JobStation }
  | { readonly type: 'buyCapacity'; readonly target: 'garage' | 'car' | 'shelves' }
  | { readonly type: 'buyHouse'; readonly level: 4 | 5 }
  | { readonly type: 'upgradeTransport'; readonly upgrade: TransportUpgrade }
  | { readonly type: 'repairItem'; readonly itemId: ItemId }
  | { readonly type: 'counterOffer'; readonly listingId: string; readonly offerId: string; readonly price: number }
  | { readonly type: 'messageBuyer'; readonly listingId: string; readonly offerId: string; readonly text: string }
  | { readonly type: 'cancelListing'; readonly listingId: string }
  | { readonly type: 'receiveBaggage' }
  | { readonly type: 'waitForBuyer' | 'claimJob' }
);

export interface GarageItemView {
  readonly id: ItemId;
  readonly name: string;
  readonly size: 1 | 2 | 4;
  readonly position: 'shelf' | 'floor' | 'jewelryBox';
  readonly condition: 'good' | 'worn' | 'damaged';
  readonly clue: string;
  readonly estimate: { readonly min: number; readonly max: number };
  readonly repair?: { readonly price: number; readonly estimate: { readonly min: number; readonly max: number }; readonly available: boolean };
}

export interface Capacity {
  readonly used: number;
  readonly limit: number;
}

export interface MarketOffer {
  readonly id: string;
  readonly buyer: string;
  readonly price: number;
  readonly unread: boolean;
  readonly delivery?: boolean;
  readonly countered?: boolean;
  readonly ceiling?: number;
  readonly closed?: boolean;
  readonly messages?: readonly { readonly side: 'player' | 'buyer'; readonly text: string }[];
}

export interface ListingView {
  readonly id: string;
  readonly itemId: ItemId;
  readonly price: number;
  readonly offer: MarketOffer | null;
  readonly otherOffers?: readonly MarketOffer[];
}

export interface SellerReview {
  readonly buyer: string;
  readonly item: string;
  readonly stars: 1 | 2 | 3 | 4 | 5;
  readonly text: string;
}

export interface SaleView {
  readonly name: string;
  readonly price: number;
}

type Shared = { readonly bank: number; readonly revision: number };
type RoomView = Shared & {
  readonly items: readonly GarageItemView[];
  readonly listings: readonly ListingView[];
  readonly unread: number;
  readonly reviews?: readonly SellerReview[];
  readonly garage: Capacity;
  readonly vehicle?: VehicleView;
  readonly transportOffers?: readonly TransportOfferView[];
  readonly homeImproved?: boolean;
  readonly workshop?: true;
  readonly house?: 4 | 5;
  readonly personalCar?: PersonalCar;
  readonly jewelry?: Capacity;
  readonly upgrades?: readonly { readonly target: 'garage' | 'car' | 'shelves'; readonly price: number; readonly current: number; readonly next: number; readonly available: boolean }[];
  readonly lastSale: SaleView | null;
  readonly lastDeal: { readonly lotNumber: number | null; readonly repairCost?: number; readonly receipt: PassedReceipt | SoldReceipt } | null;
  readonly deals: readonly { readonly lotNumber: number | null; readonly cost: number; readonly revenue: number; readonly repairCost?: number }[];
} & { [Name in Room]: { readonly phase: Name } }[Room];

export interface VehicleView {
  readonly model: TransportModel;
  readonly capacity: number;
  readonly trailer?: 0 | 1 | 2;
}

export interface TransportOfferView {
  readonly id: TransportUpgrade;
  readonly label: string;
  readonly price: number;
  readonly capacity: number;
  readonly auctions: 3 | 4;
  readonly blocked: string | null;
}

export type Stage5View = Exclude<Stage4View, { phase: 'prologue' | 'reveal' | 'recovery' }> | RoomView
  | (Shared & { readonly phase: 'opening'; readonly frame: typeof prologueFrames[number]; readonly vehicle?: VehicleView })
  | (Shared & { readonly phase: 'baggageArrival' })
  | (Shared & {
    readonly phase: 'cargo';
    readonly sceneId: Stage3Scene;
    readonly lotNumber: number;
    readonly baggage?: boolean;
    readonly floor?: 'boards' | 'stone' | 'parquet';
    readonly purchasePrice: number;
    readonly revenue: number;
    readonly car: Capacity;
    readonly vehicle?: VehicleView;
    readonly garage: Capacity;
    readonly jewelry?: Capacity;
    readonly boxes: readonly { readonly id: string; readonly name: string }[];
    readonly items: readonly (GarageItemView & { readonly selected: boolean; readonly blocked: string | null; readonly tutorialDelivery?: true })[];
  })
  | (Shared & {
    readonly phase: 'job';
    readonly minimumBid: number;
    readonly reward: number;
    readonly task: string | null;
    readonly completed: number;
    readonly total: number;
    readonly incorrect: boolean;
  });

export type Stage5Dispatch = (command: Stage5Command) => void;
export type Stage5Mount = (root: HTMLElement, view: Stage5View, dispatch: Stage5Dispatch) => void;
