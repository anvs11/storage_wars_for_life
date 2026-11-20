import type { ItemId, SoldReceipt } from './contract';
import type { Stage2AuctionView, Stage2Command, Stage2View } from './stage2-contract';

export type AuctionTier = 'ordinary' | 'selected' | 'antique';
export type OfferId = 'diner' | 'dinerWithTip' | 'cinema' | 'restaurant' | 'theater' | 'home' | 'car';

export type Stage3Command = Stage2Command | (
  { readonly expectedRevision: number } & (
    | { readonly type: 'enterAuction'; readonly tier: AuctionTier }
    | { readonly type: 'spend'; readonly offerId: OfferId }
    | { readonly type: 'callAirport' }
    | { readonly type: 'buyBaggage' }
    | { readonly type: 'returnToHub' }
  )
);

export type Stage3Dispatch = (command: Stage3Command) => void;
export type Stage3Mount = (root: HTMLElement, view: Stage3View, dispatch: Stage3Dispatch) => void;

type AuctionPhase = Stage2AuctionView['phase'];
type Stage3Scene = Stage2AuctionView['sceneId'] | 'selected' | 'antiques';

export type Stage3AuctionView = {
  [Phase in AuctionPhase]: Omit<Extract<Stage2AuctionView, { phase: Phase }>, 'sceneId'> & {
    readonly tier: AuctionTier;
    readonly sceneId: Stage3Scene;
  };
}[AuctionPhase];

interface HubAuction {
  readonly tier: AuctionTier;
  readonly title: string;
  readonly requiredStatus: number;
  readonly openingBid: number;
  readonly availability: 'ready' | 'statusLocked' | 'fundsLocked' | 'recovery';
}

interface HubOffer {
  readonly id: OfferId;
  readonly title: string;
  readonly price: number;
  readonly statusGain: number;
  readonly requiredStatus: number;
  readonly availability: 'ready' | 'statusLocked' | 'fundsLocked' | 'owned';
}

type GarageInventory = Extract<Stage2AuctionView, { phase: 'reveal' }>;

export type Stage3View = { readonly revision: number; readonly bank: number } & (
  | Extract<Stage2View, { phase: 'prologue' | 'recovery' }>
  | Stage3AuctionView
  | {
      readonly phase: 'hub';
      readonly status: number;
      readonly nextUnlock: { readonly title: string; readonly requiredStatus: number } | null;
      readonly auctions: readonly HubAuction[];
      readonly offers: readonly HubOffer[];
      readonly baggagePrice: number;
      readonly allowedActions: readonly ('enterAuction' | 'spend' | 'callAirport')[];
    }
  | {
      readonly phase: 'airportOffer';
      readonly price: number;
      readonly canAfford: boolean;
      readonly allowedActions: readonly ('buyBaggage' | 'returnToHub')[];
    }
  | (Pick<GarageInventory, 'purchasePrice' | 'revenue' | 'sealedBoxes' | 'revealedFinds' | 'allowedActions'> & {
      readonly phase: 'baggageInventory';
    })
  | {
      readonly phase: 'baggageResult';
      readonly receipt: SoldReceipt;
      readonly allowedActions: readonly ['returnToHub'];
    }
);
