export interface OrderStorageNoticeProduct {
  name: Readonly<Partial<Record<"tr" | "en" | "ru", string>>>;
  price: number;
  variants?: ReadonlyArray<{ id?: string; name?: Readonly<Partial<Record<"tr" | "en" | "ru", string>>> }>;
}
export interface OrderStorageNoticeOptions {
  owner?: Element;
  getLanguage?: () => string | undefined;
  getProduct: (id: string) => OrderStorageNoticeProduct | undefined;
  validIds: ReadonlySet<string>;
  onResolved?: () => void | Promise<unknown>;
}
export function createOrderStorageNotice(options: OrderStorageNoticeOptions): { refresh(): void; destroy(): void };
