
export const GA4_EVENT_REQUIREMENTS = {
  view_item: { required: ['item_id', 'item_name'], optional: ['item_category', 'item_brand', 'value', 'currency'] },
  purchase: { required: ['transaction_id', 'value', 'currency', 'items'], optional: ['affiliation', 'coupon', 'shipping', 'tax'] },
  add_to_cart: { required: ['item_id', 'quantity'], optional: ['item_name', 'item_category', 'value', 'currency'] },
  remove_from_cart: { required: ['item_id', 'quantity'], optional: ['item_name', 'item_category', 'value', 'currency'] },
  begin_checkout: { required: ['value', 'currency', 'items'], optional: ['coupon'] },
  add_payment_info: { required: ['value', 'currency', 'payment_type'], optional: ['items'] },
  add_shipping_info: { required: ['value', 'currency', 'shipping_tier'], optional: ['items'] },
  view_cart: { required: ['value', 'currency', 'items'], optional: [] },
  search: { required: ['search_term'], optional: ['number_of_terms'] },
  login: { required: ['method'], optional: [] },
  sign_up: { required: ['method'], optional: [] },
  share: { required: ['method', 'content_type', 'item_id'], optional: [] }
};
