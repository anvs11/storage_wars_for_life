export type ItemId = string;

export type Command = { readonly expectedRevision: number } & (
  | { readonly type: 'inspect'; readonly itemId: ItemId }
  | { readonly type: 'bid' }
  | { readonly type: 'pass' }
  | { readonly type: 'sellAll' }
  | { readonly type: 'nextLot' }
);

export type Dispatch = (command: Command) => void;
export type Mount = (root: HTMLElement, view: GameView, dispatch: Dispatch) => void;

export interface InspectionHint {
  readonly text: string;
  readonly estimatedSalePrice: {
    readonly min: number;
    readonly max: number;
  } | null;
}

export interface VisibleItem {
  readonly id: ItemId;
  readonly name: string;
  readonly hint: InspectionHint | null;
  readonly canInspect: boolean;
}

export interface RevealedFind {
  readonly id: ItemId;
  readonly name: string;
  readonly salePrice: number;
}

export interface SoldReceipt {
  readonly outcome: 'sold';
  readonly purchasePrice: number;
  readonly revenue: number;
  readonly profit: number;
}

export interface PassedReceipt {
  readonly outcome: 'passed';
  readonly purchasePrice: 0;
  readonly revenue: 0;
  readonly profit: 0;
}

interface ViewBase {
  readonly revision: number;
  readonly bank: number;
  readonly visibleItems: readonly VisibleItem[];
}

interface OpenAuctionView {
  readonly nextBidAmount: number;
  readonly allowedActions: readonly ('inspect' | 'bid' | 'pass')[];
  readonly purchasePrice?: never;
  readonly revealedFinds?: never;
  readonly receipt?: never;
}

interface ClosedAuctionView {
  readonly currentPrice: null;
  readonly leadingBidder: null;
  readonly lastPlayerBid: null;
  readonly nextBidAmount: null;
}

export type GameView = ViewBase & (
  | (OpenAuctionView & {
      readonly phase: 'inspection';
      readonly currentPrice: null;
      readonly leadingBidder: null;
      readonly lastPlayerBid: null;
    })
  | (OpenAuctionView & {
      readonly phase: 'bidding';
      readonly currentPrice: number;
      readonly leadingBidder: 'opponent';
      readonly lastPlayerBid: number;
    })
  | (ClosedAuctionView & {
      readonly phase: 'reveal';
      readonly allowedActions: readonly ['sellAll'];
      readonly purchasePrice: number;
      readonly revealedFinds: readonly RevealedFind[];
      readonly receipt?: never;
    })
  | (ClosedAuctionView & {
      readonly phase: 'result';
      readonly allowedActions: readonly ['nextLot'];
      readonly purchasePrice?: never;
      readonly revealedFinds?: never;
      readonly receipt: SoldReceipt | PassedReceipt;
    })
);

// Полное состояние для движка. UI получает только GameView.
interface AuctionLot {
  readonly openingBid: number;
  readonly bidIncrement: number;
  readonly opponentLimit: number;
  readonly items: readonly {
    readonly id: ItemId;
    readonly name: string;
    readonly hint: InspectionHint | null;
  }[];
  readonly finds: readonly RevealedFind[];
}

interface StateBase {
  readonly revision: number;
  readonly bank: number;
  readonly lotNumber: number;
  readonly lot: AuctionLot;
  readonly inspectedItemIds: readonly ItemId[];
}

export type GameState = StateBase & (
  | { readonly phase: 'inspection' }
  | {
      readonly phase: 'bidding';
      readonly opponentBid: number;
      readonly lastPlayerBid: number;
    }
  | { readonly phase: 'reveal'; readonly purchasePrice: number }
  | { readonly phase: 'result'; readonly receipt: SoldReceipt | PassedReceipt }
);
