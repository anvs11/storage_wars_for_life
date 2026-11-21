import type { ItemId, PassedReceipt, RevealedFind, SoldReceipt, VisibleItem } from './contract';

export type Stage2Command = { readonly expectedRevision: number } & (
  | { readonly type: 'inspect'; readonly itemId: ItemId }
  | { readonly type: 'bid' }
  | { readonly type: 'pass' }
  | { readonly type: 'sellAll' }
  | { readonly type: 'nextLot' }
  | { readonly type: 'storyNext' }
  | { readonly type: 'skipStory' }
  | { readonly type: 'confirmRent' }
  | { readonly type: 'openBox'; readonly boxId: ItemId }
  | { readonly type: 'sellItem'; readonly itemId: ItemId }
  | { readonly type: 'sortGarage' }
);

export type Stage2Dispatch = (command: Stage2Command) => void;
type StoryStep =
  | { readonly step: 'door' }
  | { readonly step: 'rain' }
  | { readonly step: 'dialogue'; readonly line: 0 | 1 | 2 | 3 | 4 | 5 }
  | {
      readonly step: 'rent';
      readonly grant: number;
      readonly rent: number;
      readonly remaining: number;
      readonly rentalWeeks: number;
    };

export type Stage2Scene = 'tutorial' | 'workshop' | 'household';

interface AuctionDetails<Scene extends string> {
  readonly lotNumber: number;
  readonly sceneId: Scene;
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

export type Stage2View<Scene extends string = Stage2Scene> = { readonly revision: number; readonly bank: number } & (
  | {
      readonly phase: 'prologue';
      readonly story: StoryStep;
      readonly allowedActions: readonly ('storyNext' | 'skipStory' | 'confirmRent')[];
    }
  | (AuctionDetails<Scene> & OpenAuctionView & (
      | {
          readonly phase: 'inspection';
          readonly currentPrice: null;
          readonly leadingBidder: null;
          readonly lastPlayerBid: null;
        }
      | {
          readonly phase: 'bidding';
          readonly currentPrice: number;
          readonly leadingBidder: 'opponent';
          readonly leaderName: string;
          readonly lastPlayerBid: number;
        }
    ))
  | (AuctionDetails<Scene> & ClosedAuctionView & (
      | {
          readonly phase: 'reveal';
          readonly allowedActions: readonly ('openBox' | 'sellItem' | 'sellAll')[];
          readonly purchasePrice: number;
          readonly revenue: number;
          readonly sealedBoxes: readonly { readonly id: ItemId; readonly name: string }[];
          readonly revealedFinds: readonly RevealedFind[];
          readonly receipt?: never;
        }
      | {
          readonly phase: 'result';
          readonly allowedActions: readonly ['nextLot'];
          readonly purchasePrice?: never;
          readonly revealedFinds?: never;
          readonly receipt: SoldReceipt | PassedReceipt;
        }
    ))
  | {
      readonly phase: 'recovery';
      readonly minimumBid: number;
      readonly reward: number;
      readonly allowedActions: readonly ['sortGarage'];
    }
);

export type Stage2AuctionView<Scene extends string = Stage2Scene> = Extract<Stage2View<Scene>, { phase: 'inspection' | 'bidding' | 'reveal' | 'result' }>;
