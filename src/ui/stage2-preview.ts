import type { Stage2AuctionView, Stage2Command, Stage2View } from '../game/stage2-contract';
import { stage2Views as samples } from '../game/stage2-exampleViews';
import { mountStage2 } from './mount';

type RevealView = Extract<Stage2AuctionView, { phase: 'reveal' }>;

const dialogueLines = [0, 1, 2, 3, 4, 5] as const;
const [bicycle] = samples.revealSealed.revealedFinds;
const [tool] = samples.revealPartial.revealedFinds;
const [box] = samples.revealSealed.sealedBoxes;

// Дополнительные снимки для навигации по вариантам экрана.
// Ни цены, ни правила движка здесь не вычисляются.
const opened = {
  ...samples.revealSealed,
  sealedBoxes: [],
  revealedFinds: [bicycle, tool],
  allowedActions: ['sellItem', 'sellAll'],
} as const satisfies RevealView;

const soldWithBox = {
  ...samples.revealPartial,
  sealedBoxes: [box],
  revealedFinds: [],
  allowedActions: ['openBox'],
} as const satisfies RevealView;

const soldToolFirst = {
  ...opened,
  bank: 80,
  revenue: 10,
  revealedFinds: [bicycle],
} as const satisfies RevealView;

function nextExample(view: Stage2View, command: Stage2Command): Stage2View | undefined {
  const actions: readonly Stage2Command['type'][] = view.allowedActions;
  if (command.expectedRevision !== view.revision || !actions.includes(command.type)) return;

  switch (command.type) {
    case 'storyNext':
      if (view.phase !== 'prologue') return;
      switch (view.story.step) {
        case 'door': return samples.rain;
        case 'rain': return samples.dialogue;
        case 'dialogue': {
          const line = dialogueLines[view.story.line + 1];
          return line === undefined ? samples.rent : { ...samples.dialogue, story: { step: 'dialogue', line } };
        }
        case 'rent': return;
      }
      break;
    case 'skipStory':
    case 'confirmRent':
      return samples.inspection;
    case 'inspect':
      if ((view.phase !== 'inspection' && view.phase !== 'bidding') || command.itemId !== bicycle.id) return;
      return {
        ...view,
        allowedActions: ['bid', 'pass'],
        visibleItems: samples.bidding.visibleItems,
      };
    case 'bid':
      if (view.phase === 'inspection') {
        const inspected = view.visibleItems.some((item) => item.hint !== null);
        return {
          ...samples.bidding,
          lotNumber: view.lotNumber,
          sceneId: view.sceneId,
          bank: view.bank,
          visibleItems: view.visibleItems,
          allowedActions: inspected ? ['bid', 'pass'] : ['inspect', 'bid', 'pass'],
        };
      }
      if (view.phase === 'bidding') {
        return { ...samples.revealSealed, lotNumber: view.lotNumber, sceneId: view.sceneId };
      }
      break;
    case 'pass':
      if (view.phase !== 'inspection' && view.phase !== 'bidding') return;
      return { ...samples.passed, lotNumber: view.lotNumber, sceneId: view.sceneId, bank: view.bank };
    case 'openBox':
      if (view.phase !== 'reveal' || command.boxId !== box.id || view.sealedBoxes.length === 0) return;
      return {
        ...(view.revealedFinds.length > 0 ? opened : samples.revealPartial),
        lotNumber: view.lotNumber,
        sceneId: view.sceneId,
      };
    case 'sellItem':
      if (view.phase !== 'reveal' || !view.revealedFinds.some((item) => item.id === command.itemId)) return;
      if (view.sealedBoxes.length > 0) {
        return { ...soldWithBox, lotNumber: view.lotNumber, sceneId: view.sceneId };
      }
      if (view.revealedFinds.length > 1) {
        const rest = command.itemId === bicycle.id ? samples.revealPartial : soldToolFirst;
        return { ...rest, lotNumber: view.lotNumber, sceneId: view.sceneId };
      }
      return { ...samples.sold, lotNumber: view.lotNumber, sceneId: view.sceneId };
    case 'sellAll':
      if (view.phase !== 'reveal') return;
      return { ...samples.sold, lotNumber: view.lotNumber, sceneId: view.sceneId };
    case 'nextLot':
      if (view.phase !== 'result') return;
      return {
        ...samples.inspection,
        sceneId: view.sceneId === 'tutorial' ? 'workshop' : 'household',
        lotNumber: view.lotNumber + 1,
        bank: view.bank,
      };
    case 'sortGarage':
      return {
        ...samples.inspection,
        sceneId: 'household',
        lotNumber: 3,
        bank: samples.recovery.minimumBid,
      };
  }
}

function initialExample(): Stage2View {
  const options = new URLSearchParams(location.search);
  const requested = options.get('view');
  if (requested && Object.hasOwn(samples, requested)) {
    return samples[requested as keyof typeof samples];
  }
  const scene = options.get('scene');
  if (scene === 'workshop' || scene === 'household' || scene === 'tutorial') {
    return { ...samples.inspection, sceneId: scene };
  }
  return samples.door;
}

function preview(root: HTMLElement): void {
  let view = initialExample();
  function render(): void {
    mountStage2(root, view, (command) => {
      const next = nextExample(view, command);
      if (!next) return;
      view = { ...next, revision: view.revision + 1 };
      render();
    });
  }
  render();
}

const root = document.querySelector<HTMLElement>('#app');
if (root) preview(root);
