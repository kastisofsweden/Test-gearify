/** Back-office wording for barcode save failures raised by the barcode collision trigger. */
export function barcodeSaveError(message: string): string {
  const match = /barcode_in_use:(\S+)/.exec(message);
  if (match)
    return `Barcode ${match[1]} is already used by another product or unit (current, old or alias code). Choose a different value.`;
  if (message.includes("stock_items_barcode_key"))
    return "That barcode is already used by another unit. Choose a different value.";
  return message;
}
