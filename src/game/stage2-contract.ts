import type { Command, GameView, ItemId } from './contract';

export type Stage2Command = Command | (
  { readonly expectedRevision: number } & (
    | { readonly type: 'storyNext' }
    | { readonly type: 'skipStory' }
    | { readonly type: 'confirmRent' }
    | { readonly type: 'openBox'; readonly boxId: ItemId }
    | { readonly type: 'sellItem'; readonly itemId: ItemId }
    | { readonly type: 'sortGarage' }
  )
);

export type Stage2Dispatch = (command: Stage2Command) => void;
export type Stage2Mount = (root: HTMLElement, view: Stage2View, dispatch: Stage2Dispatch) => void;

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

interface AuctionDetails {
  readonly lotNumber: number;
  readonly sceneId: 'tutorial' | 'workshop' | 'household';
}

type Stage1ViewIn<Phase extends GameView['phase']> = Extract<GameView, { phase: Phase }>;

export type Stage2View = { readonly revision: number; readonly bank: number } & (
  | {
      readonly phase: 'prologue';
      readonly story: StoryStep;
      readonly allowedActions: readonly ('storyNext' | 'skipStory' | 'confirmRent')[];
    }
  | (AuctionDetails & (
      | Stage1ViewIn<'inspection' | 'result'>
      | (Stage1ViewIn<'bidding'> & { readonly leaderName: string })
      | (Omit<Stage1ViewIn<'reveal'>, 'allowedActions'> & {
          readonly allowedActions: readonly ('openBox' | 'sellItem' | 'sellAll')[];
          readonly revenue: number;
          readonly sealedBoxes: readonly { readonly id: ItemId; readonly name: string }[];
        })
    ))
  | {
      readonly phase: 'recovery';
      readonly minimumBid: number;
      readonly reward: number;
      readonly allowedActions: readonly ['sortGarage'];
    }
);

export type Stage2AuctionView = Extract<Stage2View, { phase: 'inspection' | 'bidding' | 'reveal' | 'result' }>;
