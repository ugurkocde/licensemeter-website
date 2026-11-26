const normalizeVendor = (vendor: string) => {
  const normalized = vendor.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(microsoft(?: ?365| office(?: ?365)?)?|office ?365|m ?365|o ?365)$/.test(
    normalized,
  )
    ? "microsoft"
    : normalized;
};

export const sameRenewalVendor = (left: string, right: string) =>
  normalizeVendor(left) === normalizeVendor(right);
