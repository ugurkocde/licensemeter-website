/**
 * An import replaces the whole roster, so a member missing from the paste
 * looks removed. A paste with no invalid rows can still be partial (a filtered
 * view, one page of a paginated table). A partial paste usually drops many
 * members at once, while real offboarding between two imports drops a few.
 * Removal credits are therefore only earned when the paste is fully valid and
 * drops at most max(5 seats, 20% of the previous roster). A larger drop still
 * imports, its findings still resolve, but it earns no realized savings.
 */
export const MAX_TRUSTED_DROP_SEATS = 5;
export const MAX_TRUSTED_DROP_SHARE = 0.2;

export const importEarnsCredits = (input: {
  invalidRows: number;
  previousSeats: number;
  importedSeats: number;
}): boolean => {
  if (input.invalidRows > 0) return false;
  const dropped = Math.max(0, input.previousSeats - input.importedSeats);
  return (
    dropped <=
    Math.max(
      MAX_TRUSTED_DROP_SEATS,
      Math.floor(input.previousSeats * MAX_TRUSTED_DROP_SHARE),
    )
  );
};
