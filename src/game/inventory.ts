import type { ItemId, RevealedFind, SoldReceipt } from './contract';
import type { Stage2Command } from './stage2-contract';

export interface InventoryContents {
  readonly visibleFinds: readonly RevealedFind[];
  readonly boxes: readonly {
    readonly id: ItemId;
    readonly name: string;
    readonly contents: readonly RevealedFind[];
  }[];
}

export interface InventoryProgress {
  readonly openedBoxIds: readonly ItemId[];
  readonly soldItemIds: readonly ItemId[];
}

interface PurchasedInventory extends InventoryProgress {
  readonly purchasePrice: number;
}

type InventoryCommand = Extract<Stage2Command, { type: 'openBox' | 'sellItem' | 'sellAll' }>;

export const emptyInventory = { openedBoxIds: [], soldItemIds: [] } as const;

export function openFinds(contents: InventoryContents, openedBoxIds: readonly ItemId[]): readonly RevealedFind[] {
  return [
    ...contents.visibleFinds,
    ...contents.boxes.filter(({ id }) => openedBoxIds.includes(id)).flatMap(({ contents }) => contents),
  ];
}

function totalPrice(finds: readonly RevealedFind[]): number {
  return finds.reduce((sum, { salePrice }) => sum + salePrice, 0);
}

export function inventorySnapshot(contents: InventoryContents, progress: InventoryProgress) {
  const sealedBoxes = contents.boxes.filter(({ id }) => !progress.openedBoxIds.includes(id));
  const finds = openFinds(contents, progress.openedBoxIds);
  const available = finds.filter(({ id }) => !progress.soldItemIds.includes(id));
  const revenue = totalPrice(finds.filter(({ id }) => progress.soldItemIds.includes(id)));
  return { sealedBoxes, available, revenue };
}

export function inventoryView(contents: InventoryContents, state: PurchasedInventory) {
  const { sealedBoxes, available, revenue } = inventorySnapshot(contents, state);
  const allowedActions: InventoryCommand['type'][] = [];
  if (sealedBoxes.length > 0) allowedActions.push('openBox');
  if (available.length > 0) {
    allowedActions.push('sellItem');
    if (sealedBoxes.length === 0) allowedActions.push('sellAll');
  }
  return {
    purchasePrice: state.purchasePrice,
    revenue,
    sealedBoxes: sealedBoxes.map(({ id, name }) => ({ id, name })),
    revealedFinds: available.map(({ id, name, salePrice }) => ({ id, name, salePrice })),
    allowedActions,
  };
}

export function interactWithInventory(
  contents: InventoryContents, state: PurchasedInventory, command: InventoryCommand,
): { inventory: InventoryProgress; proceeds: number; receipt?: SoldReceipt } | null {
  const { sealedBoxes, available, revenue } = inventorySnapshot(contents, state);
  if (command.type === 'openBox') {
    if (!sealedBoxes.some(({ id }) => id === command.boxId)) return null;
    return {
      inventory: { openedBoxIds: [...state.openedBoxIds, command.boxId], soldItemIds: state.soldItemIds },
      proceeds: 0,
    };
  }
  if (command.type === 'sellAll' && sealedBoxes.length > 0) return null;
  const sales = command.type === 'sellAll' ? available : available.filter(({ id }) => id === command.itemId);
  if (sales.length === 0) return null;

  const proceeds = totalPrice(sales);
  const inventory = { openedBoxIds: state.openedBoxIds, soldItemIds: [...state.soldItemIds, ...sales.map(({ id }) => id)] };
  if (sealedBoxes.length > 0 || sales.length < available.length) return { inventory, proceeds };

  const finalRevenue = revenue + proceeds;
  return {
    inventory,
    proceeds,
    receipt: { outcome: 'sold', purchasePrice: state.purchasePrice, revenue: finalRevenue, profit: finalRevenue - state.purchasePrice },
  };
}
