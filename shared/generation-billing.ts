export interface GenerationBillingSync {
  checked: number;
  reported: number;
  notes: { request_id: string; message: string }[];
}
