export interface StripeWebhookDto {
  id: string;
  object: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
}
