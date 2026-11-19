export type ItemId = string;

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
