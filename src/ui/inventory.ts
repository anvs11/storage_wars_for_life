import type { PassedReceipt, SoldReceipt } from '../game/contract';
import type { Stage2AuctionView, Stage2Command } from '../game/stage2-contract';
import { addFact, dollars, element } from './dom';

type SaleView = Extract<Stage2AuctionView, { phase: 'reveal' }>;
type InventoryView = Pick<SaleView, 'revision' | 'sealedBoxes' | 'revealedFinds' | 'allowedActions'>;
type InventoryButton = (
  label: string, command: Stage2Command, key: string, className: string,
) => HTMLButtonElement;

export function inventoryFor(view: InventoryView, button: InventoryButton): HTMLUListElement {
  const inventory = element('ul', 'garage__inventory');
  const { revision, allowedActions } = view;
  for (const box of view.sealedBoxes) {
    const card = element('li', 'garage__inventory-item');
    card.append(element('strong', '', box.name));
    if (allowedActions.includes('openBox')) {
      const open = button('Открыть', { type: 'openBox', boxId: box.id, expectedRevision: revision },
        `box:${box.id}`, 'garage__button');
      open.setAttribute('aria-label', `Открыть: ${box.name}`);
      card.append(open);
    }
    inventory.append(card);
  }
  for (const find of view.revealedFinds) {
    const card = element('li', 'garage__inventory-item');
    const description = element('div', 'garage__inventory-description');
    description.append(element('strong', '', find.name), element('span', '', dollars(find.salePrice)));
    card.append(description);
    if (allowedActions.includes('sellItem')) {
      const sell = button('Продать', { type: 'sellItem', itemId: find.id, expectedRevision: revision },
        `find:${find.id}`, 'garage__button');
      sell.setAttribute('aria-label', `Продать: ${find.name}`);
      card.append(sell);
    }
    inventory.append(card);
  }
  return inventory;
}

export function saleFacts(view: Pick<SaleView, 'purchasePrice' | 'revenue'>): HTMLDListElement {
  const facts = element('dl', 'garage__facts');
  addFact(facts, 'Цена покупки', dollars(view.purchasePrice));
  addFact(facts, 'Получено от продаж', dollars(view.revenue));
  return facts;
}

export function receiptFacts(receipt: SoldReceipt | PassedReceipt, bank: number): HTMLDListElement {
  const facts = element('dl', 'garage__facts');
  if (receipt.outcome === 'passed') {
    addFact(facts, 'Списано', dollars(receipt.purchasePrice));
    return facts;
  }
  addFact(facts, 'Покупка', dollars(receipt.purchasePrice));
  addFact(facts, 'Выручка', dollars(receipt.revenue));
  const label = receipt.profit === 0 ? 'Без прибыли и убытка' : receipt.profit < 0 ? 'Убыток' : 'Прибыль';
  addFact(facts, label, (receipt.profit > 0 ? '+' : '') + dollars(receipt.profit));
  addFact(facts, 'Банк', dollars(bank));
  return facts;
}
