import type { ItemId, PassedReceipt, SoldReceipt } from './contract';
import type { Stage3Scene } from './stage3-contract';
import type { Stage4Command, Stage4View } from './stage4-contract';

export const prologueFrames = ['eviction', 'rain', 'call', 'keys'] as const;
export const jobStations = ['shelf', 'floor', 'recycle'] as const;
export const roomNames = ['home', 'garage', 'market', 'inbox'] as const;

export type Room = typeof roomNames[number];
export type JobStation = typeof jobStations[number];
export type Stage5Command = Stage4Command | { readonly expectedRevision: number } & (
  | { readonly type: 'navigate'; readonly room: Room | 'auctions' }
  | { readonly type: 'toggleCargo' | 'discardItem'; readonly itemId: ItemId }
  | { readonly type: 'finishCargo'; readonly leaveRemaining: boolean }
  | { readonly type: 'publish'; readonly itemId: ItemId; readonly price: number }
  | { readonly type: 'readOffer' | 'acceptOffer'; readonly listingId: string; readonly offerId: string }
  | { readonly type: 'sortItem'; readonly station: JobStation }
  | { readonly type: 'waitForBuyer' | 'claimJob' }
);

export interface GarageItemView {
  readonly id: ItemId;
  readonly name: string;
  readonly size: 1 | 2 | 4;
  readonly position: 'shelf' | 'floor';
  readonly condition: 'good' | 'worn' | 'damaged';
  readonly clue: string;
  readonly estimate: { readonly min: number; readonly max: number };
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
}

export interface ListingView {
  readonly id: string;
  readonly itemId: ItemId;
  readonly price: number;
  readonly offer: MarketOffer | null;
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
  readonly garage: Capacity;
  readonly lastSale: SaleView | null;
  readonly lastDeal: { readonly lotNumber: number; readonly receipt: PassedReceipt | SoldReceipt } | null;
  readonly deals: readonly { readonly lotNumber: number; readonly cost: number; readonly revenue: number }[];
} & { [Name in Room]: { readonly phase: Name } }[Room];

export type Stage5View = Exclude<Stage4View, { phase: 'prologue' | 'reveal' | 'recovery' }> | RoomView
  | (Shared & { readonly phase: 'opening'; readonly frame: typeof prologueFrames[number] })
  | (Shared & {
    readonly phase: 'cargo';
    readonly sceneId: Stage3Scene;
    readonly lotNumber: number;
    readonly purchasePrice: number;
    readonly revenue: number;
    readonly car: Capacity;
    readonly garage: Capacity;
    readonly boxes: readonly { readonly id: string; readonly name: string }[];
    readonly items: readonly (GarageItemView & { readonly selected: boolean; readonly blocked: string | null })[];
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
